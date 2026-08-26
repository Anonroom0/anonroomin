/** ===========================================================================
 * ADMIN-NOTIFY EDGE FUNCTION
 * ============================================================================
 * supabase/functions/admin-notify/index.ts
 *
 * POST only. Body: { title, body, url? }.
 *
 * Bare backend endpoint — no UI calls this yet; a future admin panel prompt
 * wires a button to it.
 *
 * 1. Verifies the caller's Supabase JWT (Authorization header) against
 *    Supabase Auth, then checks the matching profiles row has
 *    is_admin = true. Rejects with 403 otherwise.
 * 2. On success, server-to-server fetch()es the deployed send-push
 *    function with a service-role bearer header and
 *    { target_type: 'admin', title, body, url }, reusing send-push's
 *    'admin' fan-out (every push_subscriptions row whose user has
 *    promotional_enabled = true) instead of duplicating that logic here.
 * ========================================================================= */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Judgment call: the deployed send-push function's own URL isn't passed in
 * via any request the trigger makes to this function, so it's resolved the
 * same way migration 0002's notify_on_relevant_insert() is documented to
 * (an env-configurable value), rather than hardcoding a project ref. Set
 * SEND_PUSH_URL explicitly per environment; falling back to Supabase's
 * standard <ref>.functions.supabase.co host derived from SUPABASE_URL keeps
 * this working out of the box on a normal project.
 */
function resolveSendPushUrl() {
  const override = Deno.env.get('SEND_PUSH_URL');
  if (override) return override;
  const functionsHost = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');
  return `${functionsHost}/send-push`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return jsonResponse({ error: 'unauthorized' }, 403);
  }

  // Verify the JWT through Supabase Auth itself (signature + expiry +
  // revocation) rather than decoding it by hand — a client scoped to the
  // caller's own token, using the anon key, resolves the `sub` claim to a
  // trustworthy user id.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'unauthorized' }, 403);
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileErr || profile?.is_admin !== true) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400);
  }

  const { title, body, url } = payload ?? {};
  if (!title || !body) {
    return jsonResponse({ error: 'title and body are required' }, 400);
  }

  let sendPushResponse;
  try {
    sendPushResponse = await fetch(resolveSendPushUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ target_type: 'admin', title, body, url }),
    });
  } catch (err) {
    console.error('admin-notify: failed to reach send-push', err);
    return jsonResponse({ error: 'failed to reach send-push' }, 502);
  }

  const result = await sendPushResponse.json().catch(() => ({}));
  if (!sendPushResponse.ok) {
    return jsonResponse({ error: 'send-push failed', detail: result }, 502);
  }

  return jsonResponse(result);
});
