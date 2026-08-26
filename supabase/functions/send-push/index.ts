/** ===========================================================================
 * SEND-PUSH EDGE FUNCTION
 * ============================================================================
 * supabase/functions/send-push/index.ts
 *
 * Invoked either by the notify_on_relevant_insert() Postgres trigger (see
 * migration 0002_confessions_questions_reactions.sql — it posts here with a
 * service-role bearer token on every group_messages / dm_messages /
 * confessions insert) or directly by an admin action for a promotional
 * blast.
 *
 * Body: { target_type: 'group_message'|'dm_message'|'confession'|'admin',
 *         target_id, actor_id, title?, body?, url? }
 *
 * Looks up the source row with the service-role client, resolves the
 * recipient list per notification_settings, sends a Web Push message to
 * every push_subscriptions row for each recipient, prunes dead
 * subscriptions on 404/410, and returns { sent, skipped }.
 * ========================================================================= */

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

async function resolveGroupMessageRecipients(row, actorId) {
  if (!row.group_id) return { recipients: [], groupName: null };

  const memberIds = await getGroupMemberIds(row.group_id, actorId);
  if (memberIds.length === 0) return { recipients: [], groupName: null };

  const [{ data: settingsRows }, { data: profileRows }, { data: groupRow }] =
    await Promise.all([
      supabase
        .from('notification_settings')
        .select('user_id, groups_enabled, mentions_enabled')
        .in('user_id', memberIds),
      supabase.from('profiles').select('id, username').in('id', memberIds),
      supabase.from('groups').select('name').eq('id', row.group_id).maybeSingle(),
    ]);

  const settingsByUser = new Map((settingsRows ?? []).map((s) => [s.user_id, s]));
  const usernameByUser = new Map((profileRows ?? []).map((p) => [p.id, p.username]));
  const lowerText = (row.text ?? '').toLowerCase();

  const recipients = memberIds.filter((id) => {
    const settings = settingsByUser.get(id);
    const groupsEnabled = settingValue(settings, 'groups_enabled');
    const mentionsEnabled = settingValue(settings, 'mentions_enabled');
    const username = usernameByUser.get(id);
    const mentioned = !!username && lowerText.includes(`@${username.toLowerCase()}`);
    return groupsEnabled || (mentioned && mentionsEnabled);
  });

  return { recipients, groupName: groupRow?.name ?? null };
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

async function resolveConfessionRecipients(row, actorId) {
  if (row.group_id) {
    const memberIds = await getGroupMemberIds(row.group_id, actorId);
    return { recipients: await filterByConfessionsEnabled(memberIds) };
  }

  // Public confession: every profile except the actor (author_id is null
  // for anonymous confessions, so actorId may itself be null/undefined —
  // .neq with a null value matches nothing usefully in Postgres, so guard it).
  let query = supabase.from('profiles').select('id');
  if (actorId) query = query.neq('id', actorId);
  const { data: profileRows } = await query;
  const candidateIds = (profileRows ?? []).map((p) => p.id);
  return { recipients: await filterByConfessionsEnabled(candidateIds) };
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

  // The DB trigger calls this with `Authorization: Bearer <service_role_key>`
  // (see migration 0002's notify_on_relevant_insert()). Require the same
  // key here so this endpoint can't be used to spam arbitrary push
  // notifications by anyone who finds the URL, even with verify_jwt off.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
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

  let recipients = [];
  let title = titleOverride;
  let body = bodyOverride;
  const url = urlOverride ?? '/';

  try {
    if (targetType === 'group_message') {
      const { data: row } = await supabase
        .from('group_messages')
        .select('id, group_id, text')
        .eq('id', targetId)
        .maybeSingle();
      if (!row) return jsonResponse({ sent: 0, skipped: 0 });

      const { recipients: r, groupName } = await resolveGroupMessageRecipients(row, actorId);
      recipients = r;
      title = title ?? `New message in ${groupName ?? 'a group'}`;
      body = body ?? truncate(row.text, 120);
    } else if (targetType === 'dm_message') {
      const { data: row } = await supabase
        .from('dm_messages')
        .select('id, thread_id, text')
        .eq('id', targetId)
        .maybeSingle();
      if (!row) return jsonResponse({ sent: 0, skipped: 0 });

      const { recipients: r } = await resolveDmRecipient(row, actorId);
      recipients = r;
      title = title ?? 'New message';
      body = body ?? truncate(row.text, 120);
    } else if (targetType === 'confession') {
      const { data: row } = await supabase
        .from('confessions')
        .select('id, group_id, text')
        .eq('id', targetId)
        .maybeSingle();
      if (!row) return jsonResponse({ sent: 0, skipped: 0 });

      const { recipients: r } = await resolveConfessionRecipients(row, actorId);
      recipients = r;
      title = title ?? 'New confession';
      body = body ?? truncate(row.text, 120);
    } else if (targetType === 'admin') {
      const { recipients: r } = await resolveAdminRecipients();
      recipients = r;
      title = title ?? 'Anonroom';
      body = body ?? '';
    } else {
      return jsonResponse({ error: `unknown target_type: ${targetType}` }, 400);
    }
  } catch (err) {
    console.error('send-push: failed resolving recipients', err);
    return jsonResponse({ error: 'failed to resolve recipients' }, 500);
  }

  if (recipients.length === 0) {
    return jsonResponse({ sent: 0, skipped: 0 });
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', recipients);

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

  return jsonResponse({ sent, skipped });
});
