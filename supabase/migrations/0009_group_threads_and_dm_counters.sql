/** ===========================================================================
 * Migration: realistic, low-query notification counts + "join a channel"
 * ===========================================================================
 * Two things, bundled because they share the same shape of fix:
 *
 * 1. dm_threads gets denormalized counter columns (unread_count_a/b,
 *    mention_a/b, last_message_at/preview/sender_id) maintained by
 *    triggers, so Home.jsx's inbox list is a single `select *` instead of
 *    the old "1 query for receipts + 2 COUNT queries per thread" fan-out.
 *
 * 2. public.group_threads is a NEW table: one row per (user, group) that
 *    now means "this user has joined this channel" AND carries their
 *    last_read_at/unread_count/mention for it — replacing
 *    public.group_read_receipts as the thing GroupChat.jsx reads/writes.
 *    Home.jsx's group list becomes "groups I have a group_threads row
 *    for"; every other group is only visible through Explore, and joining
 *    is just inserting a row here (which GroupChat.jsx already does for
 *    free the moment it marks a group as read — see app-code changes).
 *
 * Backfill: every (user, group) pair backfills as already-joined, so
 * existing users don't lose access to groups they could already see.
 * Only *new* groups created after this migration start out unjoined for
 * everyone, which is what makes Explore actually show something.
 *
 * public.group_read_receipts is left in place, untouched and unused going
 * forward — dropping it isn't necessary for this change and it's harmless
 * to leave as a historical record.
 *
 * Idempotent: safe to re-run.
 * ========================================================================= */

begin;

-- ---------------------------------------------------------------------------
-- 1a. dm_threads: new denormalized columns
-- ---------------------------------------------------------------------------

alter table public.dm_threads
  add column if not exists last_message_at        timestamptz,
  add column if not exists last_message_preview    text,
  add column if not exists last_message_sender_id  uuid,
  add column if not exists unread_count_a          integer not null default 0,
  add column if not exists unread_count_b          integer not null default 0,
  add column if not exists mention_a               boolean not null default false,
  add column if not exists mention_b               boolean not null default false;

create index if not exists dm_threads_last_message_at_idx
  on public.dm_threads (last_message_at desc);

-- ---------------------------------------------------------------------------
-- 1b. dm_threads: backfill from existing dm_messages / dm_read_receipts
-- ---------------------------------------------------------------------------

update public.dm_threads t set
  last_message_at       = m.created_at,
  last_message_preview  = left(
    coalesce(
      nullif(btrim(m.text), ''),
      case when m.media_type is not null then '📎 ' || m.media_type else 'New message' end
    ),
    140
  ),
  last_message_sender_id = m.sender_id
from (
  select distinct on (thread_id) thread_id, created_at, text, media_type, sender_id
  from public.dm_messages
  order by thread_id, created_at desc
) m
where m.thread_id = t.id;

update public.dm_threads t set
  unread_count_a = coalesce((
    select count(*) from public.dm_messages dm
    where dm.thread_id = t.id
      and dm.sender_id is distinct from t.user_a
      and dm.created_at > coalesce(
        (select r.last_read_at from public.dm_read_receipts r where r.thread_id = t.id and r.user_id = t.user_a),
        'epoch'
      )
  ), 0),
  unread_count_b = case when t.user_b is null then 0 else coalesce((
    select count(*) from public.dm_messages dm
    where dm.thread_id = t.id
      and dm.sender_id is distinct from t.user_b
      and dm.created_at > coalesce(
        (select r.last_read_at from public.dm_read_receipts r where r.thread_id = t.id and r.user_id = t.user_b),
        'epoch'
      )
  ), 0) end,
  mention_a = exists (
    select 1 from public.dm_messages dm
    where dm.thread_id = t.id and dm.mentioned_user_ids is not null and t.user_a = any(dm.mentioned_user_ids)
      and dm.created_at > coalesce(
        (select r.last_read_at from public.dm_read_receipts r where r.thread_id = t.id and r.user_id = t.user_a),
        'epoch'
      )
  ),
  mention_b = t.user_b is not null and exists (
    select 1 from public.dm_messages dm
    where dm.thread_id = t.id and dm.mentioned_user_ids is not null and t.user_b = any(dm.mentioned_user_ids)
      and dm.created_at > coalesce(
        (select r.last_read_at from public.dm_read_receipts r where r.thread_id = t.id and r.user_id = t.user_b),
        'epoch'
      )
  );

-- ---------------------------------------------------------------------------
-- 1c. dm_threads: keep the counters live
-- ---------------------------------------------------------------------------

create or replace function public.dm_threads_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
begin
  v_preview := left(
    coalesce(
      nullif(btrim(new.text), ''),
      case when new.media_type is not null then '📎 ' || new.media_type else 'New message' end
    ),
    140
  );

  update public.dm_threads t set
    last_message_at        = new.created_at,
    last_message_preview   = v_preview,
    last_message_sender_id = new.sender_id,
    -- A message counts as unread for a side only if that side didn't send
    -- it. Bot messages (sender_id null) are "distinct from" any real user
    -- id, so they still count as unread for the human side — matching the
    -- old COUNT-query behavior's "sender_id.is.null,sender_id.neq.<user>".
    unread_count_a = case when new.sender_id is distinct from t.user_a then t.unread_count_a + 1 else t.unread_count_a end,
    unread_count_b = case when t.user_b is not null and new.sender_id is distinct from t.user_b then t.unread_count_b + 1 else t.unread_count_b end,
    mention_a = t.mention_a or (new.mentioned_user_ids is not null and t.user_a = any(new.mentioned_user_ids)),
    mention_b = t.mention_b or (t.user_b is not null and new.mentioned_user_ids is not null and t.user_b = any(new.mentioned_user_ids))
  where t.id = new.thread_id;

  return new;
end;
$$;

drop trigger if exists trg_dm_threads_on_message_insert on public.dm_messages;
create trigger trg_dm_threads_on_message_insert
  after insert on public.dm_messages
  for each row
  execute function public.dm_threads_on_message_insert();

-- Marking a thread read (the app's existing dm_read_receipts upsert) zeroes
-- out that side's counters.
create or replace function public.dm_threads_on_read_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads t set
    unread_count_a = case when t.user_a = new.user_id then 0 else t.unread_count_a end,
    unread_count_b = case when t.user_b = new.user_id then 0 else t.unread_count_b end,
    mention_a = case when t.user_a = new.user_id then false else t.mention_a end,
    mention_b = case when t.user_b = new.user_id then false else t.mention_b end
  where t.id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_dm_threads_on_read_receipt on public.dm_read_receipts;
create trigger trg_dm_threads_on_read_receipt
  after insert or update on public.dm_read_receipts
  for each row
  execute function public.dm_threads_on_read_receipt();

-- ---------------------------------------------------------------------------
-- 2a. group_threads: membership + read-state + unread counters, one row
--     per (user, group). Existence of a row = "joined this channel".
-- ---------------------------------------------------------------------------

create table if not exists public.group_threads (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),
  unread_count  integer not null default 0,
  mention       boolean not null default false,
  unique (group_id, user_id)
);

create index if not exists group_threads_user_idx on public.group_threads (user_id);
create index if not exists group_threads_group_idx on public.group_threads (group_id);

alter table public.group_threads enable row level security;

drop policy if exists "group_threads_select_own" on public.group_threads;
create policy "group_threads_select_own"
  on public.group_threads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "group_threads_insert_own" on public.group_threads;
create policy "group_threads_insert_own"
  on public.group_threads
  for insert
  to authenticated
  with check (auth.uid() = user_id);
  -- This is literally "joining a channel" — a signed-in user may only ever
  -- create their own membership row, never someone else's.

drop policy if exists "group_threads_update_own" on public.group_threads;
create policy "group_threads_update_own"
  on public.group_threads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "group_threads_delete_own" on public.group_threads;
create policy "group_threads_delete_own"
  on public.group_threads
  for delete
  to authenticated
  using (auth.uid() = user_id);
  -- Leaving a channel (not wired up in the app yet, but harmless to allow).

-- ---------------------------------------------------------------------------
-- 2b. group_threads: backfill — every existing user is already "joined" to
--     every existing group, so nobody's Home list goes empty post-migration.
--     last_read_at/joined_at seed from group_read_receipts where present.
--     This is a one-time O(profiles × groups) cross join — fine at this
--     app's current scale, but worth knowing if either table ever gets
--     into the hundreds of thousands of rows before this migration runs.
-- ---------------------------------------------------------------------------

insert into public.group_threads (group_id, user_id, joined_at, last_read_at, unread_count, mention)
select
  g.id,
  p.id,
  coalesce(gr.last_read_at, now()),
  coalesce(gr.last_read_at, now()),
  0,
  false
from public.groups g
cross join public.profiles p
left join public.group_read_receipts gr on gr.group_id = g.id and gr.user_id = p.id
on conflict (group_id, user_id) do nothing;

-- Now that last_read_at is seeded, compute real starting unread counts
-- instead of leaving everyone at 0 (which would silently mark everything
-- "read" the moment this migration runs).
update public.group_threads gt set
  unread_count = coalesce((
    select count(*) from public.group_messages gm
    where gm.group_id = gt.group_id
      and gm.created_at > gt.last_read_at
      and gm.user_id is distinct from gt.user_id
  ), 0),
  mention = exists (
    select 1 from public.group_messages gm
    where gm.group_id = gt.group_id
      and gm.created_at > gt.last_read_at
      and gm.mentioned_user_ids is not null
      and gt.user_id = any(gm.mentioned_user_ids)
  );

-- ---------------------------------------------------------------------------
-- 2c. group_threads: keep the counters live
-- ---------------------------------------------------------------------------

-- New group message → bump unread_count/mention for every OTHER joined
-- member. Someone who hasn't joined yet has no row here, so they correctly
-- accrue no unread count until they actually join.
create or replace function public.group_threads_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_threads gt set
    unread_count = gt.unread_count + 1,
    mention = gt.mention or (new.mentioned_user_ids is not null and gt.user_id = any(new.mentioned_user_ids))
  where gt.group_id = new.group_id
    and gt.user_id is distinct from new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_group_threads_on_message_insert on public.group_messages;
create trigger trg_group_threads_on_message_insert
  after insert on public.group_messages
  for each row
  execute function public.group_threads_on_message_insert();

-- Marking a channel read (GroupChat.jsx's group_threads upsert, formerly
-- against group_read_receipts) zeroes that row's counters. Scoped to only
-- fire when last_read_at actually changed, so the increment UPDATE above
-- (which never touches last_read_at) doesn't re-trigger this and wipe out
-- the count it just added.
create or replace function public.group_threads_reset_on_read()
returns trigger
language plpgsql
as $$
begin
  new.unread_count := 0;
  new.mention := false;
  return new;
end;
$$;

drop trigger if exists trg_group_threads_reset_on_read on public.group_threads;
create trigger trg_group_threads_reset_on_read
  before update on public.group_threads
  for each row
  when (new.last_read_at is distinct from old.last_read_at)
  execute function public.group_threads_reset_on_read();

commit;
