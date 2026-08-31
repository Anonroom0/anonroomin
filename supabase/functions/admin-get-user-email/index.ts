/** ===========================================================================
 * ADMIN-GET-USER-EMAIL EDGE FUNCTION
 * ============================================================================
 * supabase/functions/admin-get-user-email/index.ts
 *
 * POST only. Body: { userId } OR { userIds: string[] } (batch — used by
 * AdminPanel.jsx's Users tab "Table view", which shows every visible user's
 * email at once instead of one lazy fetch per detail-panel visit).
 *
 * The client-side Supabase SDK has no way to read auth.users.email (that
 * table isn't exposed to PostgREST/RLS) — only a service-role key can, via
 * the Auth Admin API. This function is the same "verify caller is admin,
 * then act with the service role" pattern as admin-notify/index.ts:
 *
 * 1. Verifies the caller's Supabase JWT against Supabase Auth, then checks
 *    the matching profiles row has is_admin = true. Rejects with 403
 *    otherwise.
 * 2. On success:
 *    - { userId } -> looks up that one user via the Auth Admin API
 *      (service role) and returns { email }.
 *    - { userIds } -> looks up each id (best-effort — a single missing user
 *      doesn't fail the whole batch) and returns { emails: { [userId]: email
 *      | null } }.
 * ========================================================================= */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Called directly from the browser (AdminPanel.jsx's UserDetailPanel), so
// this needs the same CORS treatment as admin-notify — without it the
// browser blocks the preflight/response before any JS sees it.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return jsonResponse({ error: 'unauthorized' }, 403);
  }

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

  const { userId, userIds } = payload ?? {};

  if (Array.isArray(userIds)) {
    // Capped so one careless client-side call can't fan this out into
    // hundreds of Auth Admin API requests — the Users tab table view only
    // ever needs one page's worth (see USERS_PAGE_SIZE in AdminPanel.jsx).
    const capped = userIds.slice(0, 100);
    const entries = await Promise.all(
      capped.map(async (id) => {
        try {
          const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
          if (error || !data?.user) return [id, null];
          return [id, data.user.email ?? null];
        } catch {
          return [id, null];
        }
      }),
    );
    return jsonResponse({ emails: Object.fromEntries(entries) });
  }

  if (!userId) {
    return jsonResponse({ error: 'userId or userIds is required' }, 400);
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return jsonResponse({ error: 'user not found' }, 404);
  }

  return jsonResponse({ email: data.user.email ?? null });
});
