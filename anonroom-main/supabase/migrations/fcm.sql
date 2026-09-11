-- ============================================================================
-- fcm_tokens: FCM device tokens for native Android push (Capacitor app).
-- Parallel to whatever table already backs Web Push subscriptions — this one
-- is read by supabase/functions/send-push's new FCM branch (Step 7).
-- ============================================================================

create table if not exists public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens(user_id);

alter table public.fcm_tokens enable row level security;

-- Users can only see/manage their own device tokens.
create policy "Users can view own fcm tokens"
  on public.fcm_tokens for select
  using (auth.uid() = user_id);

create policy "Users can insert own fcm tokens"
  on public.fcm_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update own fcm tokens"
  on public.fcm_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own fcm tokens"
  on public.fcm_tokens for delete
  using (auth.uid() = user_id);

-- send-push runs with the service role key, which bypasses RLS entirely —
-- so no separate service-role policy is needed for it to read all tokens.