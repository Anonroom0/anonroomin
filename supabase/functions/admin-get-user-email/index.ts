/** ===========================================================================
 * ADMIN-GET-USER-EMAIL EDGE FUNCTION
 * ============================================================================
 * supabase/functions/admin-get-user-email/index.ts
 *
 * POST only. Body: { userId }.
 *
 * The client-side Supabase SDK has no way to read auth.users.email (that
 * table isn't exposed to PostgREST/RLS) — only a service-role key can, via
 * the Auth Admin API. This function is the same "verify caller is admin,
 * then act with the service role" pattern as admin-notify/index.ts:
 *
 * 1. Verifies the caller's Supabase JWT against Supabase Auth, then checks
 *    the matching profiles row has is_admin = true. Rejects with 403
 *    otherwise.
 * 2. On success, looks up the target user by id via the Auth Admin API
 *    (service role) and returns just their email.
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

  const { userId } = payload ?? {};
  if (!userId) {
    return jsonResponse({ error: 'userId is required' }, 400);
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return jsonResponse({ error: 'user not found' }, 404);
  }

  return jsonResponse({ email: data.user.email ?? null });
});
