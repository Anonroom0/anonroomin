/** ===========================================================================
 * SEND-PUSH EDGE FUNCTION
 * ============================================================================
 * supabase/functions/send-push/index.ts
 *
 * Invoked by:
 *   - notify_on_relevant_insert() (Postgres trigger, migration 0001) on every
 *     group_messages / dm_messages insert, with a service-role bearer token.
 *   - send_confession_digest() (pg_cron, migration 0006) once an hour, with
 *     target_type 'confession_digest' — confessions no longer notify
 *     per-insert; see that migration for why.
 *   - admin-notify, for a promotional blast.
 *
 * Body: { target_type: 'group_message'|'dm_message'|'confession_digest'|'admin',
 *         target_id?, actor_id?, title?, body?, url? }
 *
 * NOTIFICATION VOLUME RULES (this is the part that changed):
 *   - DM messages: unchanged, one push per message.
 *   - Group messages: an @mention still pushes immediately, one-to-one, to
 *     the mentioned user(s) — that's the one case where losing immediacy
 *     would defeat the point. Everyone else with groups_enabled only gets
 *     notified once every GROUP_MESSAGE_BATCH_SIZE messages, as a single
 *     "N new messages" digest, instead of once per message. A very active
 *     group was otherwise paging every member on every line typed.
 *   - Confessions: no longer push per-confession at all (same problem, worse
 *     — a confession dump could fire dozens of pushes back to back). A
 *     cron-driven hourly digest checks for any new confession in the past
 *     hour and, only if one exists, sends a single "new confessions"
 *     notification instead.
 * ========================================================================= */

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

// A group message notification only actually reaches non-mentioned members
// once every this-many messages, as a single digest. Mentions are exempt —
// see the file header.
const GROUP_MESSAGE_BATCH_SIZE = 200;

// Judgment call: web-push's setVapidDetails() throws synchronously on a
// missing/malformed key or a subject that doesn't start with mailto:/https:.
// That used to run at module load time (outside any request handler), so a
// misconfigured secret crashed the whole isolate for every request with an
// opaque WORKER_ERROR instead of a readable response. Deferring it into a
// lazy, memoized call inside the request handler turns "secrets are wrong"
// into a normal 500 JSON response you can actually see in the client.
let vapidConfigured = false;
let vapidConfigError = null;
function ensureVapidConfigured() {
  if (vapidConfigured || vapidConfigError) return;
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      throw new Error(
        'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set (supabase secrets set ...).'
      );
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    vapidConfigError = err instanceof Error ? err.message : String(err);
  }
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * There's no group_members table in this schema — group access is
 * subdomain-based, not a separate membership list. group_read_receipts is
 * the closest proxy for "who has this group open" (a row is written there
 * per user per group), so it's used here as the membership set for
 * notification fan-out. Swap this for a real membership table if one gets
 * added later.
 */
async function getGroupMemberIds(groupId, excludeUserId) {
  const { data } = await supabase
    .from('group_read_receipts')
    .select('user_id')
    .eq('group_id', groupId);
  return [...new Set((data ?? []).map((r) => r.user_id))].filter(
    (id) => id !== excludeUserId,
  );
}

/**
 * A missing notification_settings row means the user has never opened
 * settings — table defaults (all true except promotional_enabled) apply,
 * so treat a missing row as "on" for every flag except promotional.
 */
function settingValue(settingsRow, column) {
  if (settingsRow) return !!settingsRow[column];
  return column !== 'promotional_enabled';
}

/**
 * Actually sends a Web Push message to every push_subscriptions row for the
 * given recipient user ids, pruning dead subscriptions on 404/410. Pulled
 * out as its own helper because group_message notifications now need to
 * send two DIFFERENT payloads (an immediate one to mentioned users, a
 * digest one to everyone else) out of a single trigger invocation, instead
 * of always sending one payload to one recipient list.
 */
async function sendToRecipients(recipientIds, title, body, url) {
  if (recipientIds.length === 0) return { sent: 0, skipped: 0 };

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', recipientIds);

  let sent = 0;
  let skipped = 0;

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      // Shape must match what public/sw.js reads off event.data.json().
      const payloadJson = JSON.stringify({ title, body, icon: '/vite.svg', url });

      try {
        await webpush.sendNotification(subscription, payloadJson);
        sent += 1;
      } catch (err) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Expired/unsubscribed endpoint — clean it up so future sends
          // don't keep paying for a dead subscription.
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
        skipped += 1;
      }
    }),
  );

  return { sent, skipped };
}

/**
 * Splits a group message's audience into two lists:
 *   - mentionRecipients: @mentioned members with mentions_enabled — always
 *     notified immediately, regardless of message count.
 *   - milestoneRecipients: everyone else with groups_enabled — only
 *     populated (non-empty) when this message happens to be the Nth
 *     (GROUP_MESSAGE_BATCH_SIZE-th) message in the group, so the caller
 *     sends them a single digest instead of a per-message push.
 * A member who is both mentioned AND happens to land on a milestone
 * message only appears in mentionRecipients, so they get one push, not two.
 */
async function resolveGroupMessageRecipients(row, actorId) {
  const empty = { mentionRecipients: [], milestoneRecipients: [], groupName: null, messageCount: 0 };
  if (!row.group_id) return empty;

  const memberIds = await getGroupMemberIds(row.group_id, actorId);
  if (memberIds.length === 0) return empty;

  const [{ data: settingsRows }, { data: profileRows }, { data: groupRow }, { count: messageCount }] =
    await Promise.all([
      supabase
        .from('notification_settings')
        .select('user_id, groups_enabled, mentions_enabled')
        .in('user_id', memberIds),
      supabase.from('profiles').select('id, username').in('id', memberIds),
      supabase.from('groups').select('name').eq('id', row.group_id).maybeSingle(),
      supabase.from('group_messages').select('id', { count: 'exact', head: true }).eq('group_id', row.group_id),
    ]);

  const settingsByUser = new Map((settingsRows ?? []).map((s) => [s.user_id, s]));
  const usernameByUser = new Map((profileRows ?? []).map((p) => [p.id, p.username]));
  const lowerText = (row.text ?? '').toLowerCase();

  const isMilestone = messageCount > 0 && messageCount % GROUP_MESSAGE_BATCH_SIZE === 0;

  const mentionRecipients = [];
  const milestoneCandidates = [];

  for (const id of memberIds) {
    const settings = settingsByUser.get(id);
    const groupsEnabled = settingValue(settings, 'groups_enabled');
    const mentionsEnabled = settingValue(settings, 'mentions_enabled');
    const username = usernameByUser.get(id);
    const mentioned = !!username && lowerText.includes(`@${username.toLowerCase()}`);

    if (mentioned && mentionsEnabled) {
      mentionRecipients.push(id);
    } else if (groupsEnabled) {
      milestoneCandidates.push(id);
    }
  }

  return {
    mentionRecipients,
    milestoneRecipients: isMilestone ? milestoneCandidates : [],
    groupName: groupRow?.name ?? null,
    messageCount: messageCount ?? 0,
  };
}

async function resolveDmRecipient(row, actorId) {
  const { data: thread } = await supabase
    .from('dm_threads')
    .select('user_a, user_b')
    .eq('id', row.thread_id)
    .maybeSingle();
  if (!thread) return { recipients: [] };

  const otherId = thread.user_a === actorId ? thread.user_b : thread.user_a;
  if (!otherId || otherId === actorId) return { recipients: [] };

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('dm_enabled')
    .eq('user_id', otherId)
    .maybeSingle();

  return { recipients: settingValue(settings, 'dm_enabled') ? [otherId] : [] };
}

async function filterByConfessionsEnabled(candidateIds) {
  if (candidateIds.length === 0) return [];
  const { data: settingsRows } = await supabase
    .from('notification_settings')
    .select('user_id, confessions_enabled')
    .in('user_id', candidateIds);
  const settingsByUser = new Map((settingsRows ?? []).map((s) => [s.user_id, s]));
  return candidateIds.filter((id) =>
    settingValue(settingsByUser.get(id), 'confessions_enabled'),
  );
}

/**
 * Hourly digest recipients: every profile (minus the confessions_enabled
 * opt-out) is a candidate — this intentionally doesn't scope to a single
 * group's members the way the old per-confession push did, since "new
 * confessions are up" is a site-wide digest now, not a per-confession,
 * per-group event. See migration 0006 for the cron side of this.
 */
async function resolveConfessionDigestRecipients() {
  const { data: profileRows } = await supabase.from('profiles').select('id');
  const allIds = (profileRows ?? []).map((p) => p.id);
  return { recipients: await filterByConfessionsEnabled(allIds) };
}

async function resolveAdminRecipients() {
  const { data: subRows } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .not('user_id', 'is', null);
  const userIds = [...new Set((subRows ?? []).map((r) => r.user_id))];
  if (userIds.length === 0) return { recipients: [] };

  const { data: settingsRows } = await supabase
    .from('notification_settings')
    .select('user_id')
    .in('user_id', userIds)
    .eq('promotional_enabled', true);

  return { recipients: (settingsRows ?? []).map((s) => s.user_id) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  ensureVapidConfigured();
  if (vapidConfigError) {
    console.error('send-push: VAPID misconfigured:', vapidConfigError);
    return jsonResponse({ error: 'VAPID misconfigured', detail: vapidConfigError }, 500);
  }

  // The DB trigger/cron job calls this with
  // `Authorization: Bearer <service_role_key>`. Require the same key here
  // so this endpoint can't be used to spam arbitrary push notifications by
  // anyone who finds the URL, even with verify_jwt off. .trim() on both
  // sides guards against a trailing newline picked up from a copy-paste
  // into Vault, which is invisible in most SQL result viewers but would
  // otherwise fail this exact-match check.
  const authHeader = (req.headers.get('Authorization') ?? '').trim();
  const expected = `Bearer ${SERVICE_ROLE_KEY.trim()}`;
  if (authHeader !== expected) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400);
  }

  const {
    target_type: targetType,
    target_id: targetId,
    actor_id: actorId,
    title: titleOverride,
    body: bodyOverride,
    url: urlOverride,
  } = payload ?? {};

  if (!targetType) {
    return jsonResponse({ error: 'target_type is required' }, 400);
  }

  const url = urlOverride ?? '/';

  try {
    if (targetType === 'group_message') {
      const { data: row } = await supabase
        .from('group_messages')
        .select('id, group_id, text')
        .eq('id', targetId)
        .maybeSingle();
      if (!row) return jsonResponse({ sent: 0, skipped: 0 });

      const { mentionRecipients, milestoneRecipients, groupName, messageCount } =
        await resolveGroupMessageRecipients(row, actorId);

      let sent = 0;
      let skipped = 0;

      // Mentions: immediate, one-to-one, with the actual message text.
      if (mentionRecipients.length > 0) {
        const r = await sendToRecipients(
          mentionRecipients,
          titleOverride ?? 'You were mentioned',
          bodyOverride ?? truncate(row.text, 120),
          url,
        );
        sent += r.sent;
        skipped += r.skipped;
      }

      // Everyone else: only fires at all on a milestone message, and gets a
      // digest-style notification rather than this message's actual text.
      if (milestoneRecipients.length > 0) {
        const r = await sendToRecipients(
          milestoneRecipients,
          titleOverride ?? `${messageCount} new messages in ${groupName ?? 'a group'}`,
          bodyOverride ?? 'Catch up on the conversation',
          url,
        );
        sent += r.sent;
        skipped += r.skipped;
      }

      return jsonResponse({ sent, skipped });
    }

    if (targetType === 'dm_message') {
      const { data: row } = await supabase
        .from('dm_messages')
        .select('id, thread_id, text')
        .eq('id', targetId)
        .maybeSingle();
      if (!row) return jsonResponse({ sent: 0, skipped: 0 });

      const { recipients } = await resolveDmRecipient(row, actorId);
      const result = await sendToRecipients(
        recipients,
        titleOverride ?? 'New message',
        bodyOverride ?? truncate(row.text, 120),
        url,
      );
      return jsonResponse(result);
    }

    if (targetType === 'confession_digest') {
      // No target_id — this is a scheduled, time-windowed check, not tied
      // to any single confession. See migration 0006's
      // send_confession_digest(), which calls this once an hour.
      const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('confessions')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', sinceIso);

      if (!count) {
        return jsonResponse({ sent: 0, skipped: 0, reason: 'no new confessions in the last hour' });
      }

      const { recipients } = await resolveConfessionDigestRecipients();
      const result = await sendToRecipients(
        recipients,
        titleOverride ?? 'New confessions',
        bodyOverride ?? 'New confessions have been shared — check them out.',
        urlOverride ?? '/confessions',
      );
      return jsonResponse(result);
    }

    if (targetType === 'admin') {
      const { recipients } = await resolveAdminRecipients();
      const result = await sendToRecipients(
        recipients,
        titleOverride ?? 'Anonroom',
        bodyOverride ?? '',
        url,
      );
      return jsonResponse(result);
    }

    return jsonResponse({ error: `unknown target_type: ${targetType}` }, 400);
  } catch (err) {
    console.error('send-push: failed', err);
    return jsonResponse({ error: 'failed to send push' }, 500);
  }
});
