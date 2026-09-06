/** ===========================================================================
 * 0006: Group message pinning
 * ============================================================================
 * Backs GroupChat.jsx's new "Pin"/"Unpin" action (in the admin multi-select
 * toolbar, offered only when exactly one message is selected) and the
 * "Pinned" nav button next to "Previous Confession"/"Post Confession" in the
 * chat's confession strip, which cycles through every pinned message the
 * same way "Previous Confession" already cycles through confessions.
 *
 * Idempotent: safe to re-run.
 * ========================================================================= */

begin;

alter table public.group_messages
  add column if not exists is_pinned boolean not null default false;

-- Lets the "Pinned" nav button and any future "jump to latest pin" feature
-- find pinned messages for a group without a full table scan.
create index if not exists group_messages_pinned_idx
  on public.group_messages (group_id, created_at desc)
  where is_pinned = true;

alter table public.group_messages enable row level security;

-- Pinning is treated the same as message deletion elsewhere in this app —
-- gated purely by the global `profiles.is_admin` flag (this app has no
-- per-group admin role; see the identical pattern throughout
-- 0001_anonroom_v2.sql's other policies). Note this technically permits an
-- admin account to update any column on a message they can see, not only
-- is_pinned — Postgres RLS doesn't restrict access to specific columns —
-- but that's an already-accepted tradeoff here: an is_admin=true account
-- can already unilaterally delete any message in any group, so being able
-- to edit one is a strictly smaller capability than what already exists.
drop policy if exists "group_messages_update_pin_admin" on public.group_messages;
create policy "group_messages_update_pin_admin"
  on public.group_messages
  for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

commit;
