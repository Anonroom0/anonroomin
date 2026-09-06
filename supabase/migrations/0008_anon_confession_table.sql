/** ===========================================================================
 * 0008: Dedicated public.anon_confession table + automatic fan-out
 * ============================================================================
 * /confess/<slug> (ConfessToGroup.jsx) previously had to write DIRECTLY into
 * either public.group_messages (0007) or, on failure, public.confessions
 * (0005) — both real, shared, sensitive tables — under narrow anon-role RLS
 * policies. That's fragile: any drift between those policies and the real
 * column constraints on group_messages/confessions (some of which predate
 * this migration set and aren't fully visible from the app) turns into a
 * silently-broken /confess/<slug>, with no record of what the visitor even
 * tried to submit.
 *
 * This migration gives the unauthenticated path its own narrow front door —
 * public.anon_confession — with exactly one exposed capability for `anon`:
 * INSERT a short piece of text tied to a group. A SECURITY DEFINER trigger
 * then does the actual fan-out, server-side, into group_messages (so it
 * shows up in the live chat) and, via the existing
 * sync_group_confession_to_confessions() trigger (0001/0003), from there
 * into confessions (so it shows up as a Story) — automatically, in one
 * transaction, with no client-side fallback juggling required.
 *
 * If the fan-out itself fails for some unforeseen reason (e.g. a NOT NULL
 * column on group_messages this migration doesn't know about), the
 * anon_confession row is kept with status = 'failed' and the error message
 * attached, instead of losing the submission or silently pretending it
 * worked — the anon INSERT that the visitor's browser sees succeed always
 * genuinely succeeded; anything that goes wrong downstream is now visible
 * to admins via this table instead of vanishing.
 *
 * Idempotent: safe to re-run.
 * ========================================================================= */

begin;

-- ---------------------------------------------------------------------------
-- 1. The table itself
-- ---------------------------------------------------------------------------
create table if not exists public.anon_confession (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id),
  text              text not null,
  visitor_id        text not null,
  status            text not null default 'pending'
                      check (status in ('pending', 'processed', 'failed')),
  -- Filled in by process_anon_confession() below once the fan-out succeeds,
  -- so a row here can always be traced forward to the chat message (and,
  -- transitively via source_message_id, to the confessions row) it produced.
  group_message_id  uuid null references public.group_messages(id),
  error_message      text null,
  created_at        timestamptz not null default now(),
  processed_at      timestamptz null
);

create index if not exists anon_confession_group_created_idx
  on public.anon_confession (group_id, created_at desc);

create index if not exists anon_confession_visitor_id_idx
  on public.anon_confession (visitor_id, created_at desc);

-- Lets admins spot silently-failed submissions instead of them going
-- unnoticed forever.
create index if not exists anon_confession_failed_idx
  on public.anon_confession (created_at desc)
  where status = 'failed';

-- ---------------------------------------------------------------------------
-- 2. RLS — anon gets INSERT only. No SELECT, UPDATE, or DELETE for anon or
--    authenticated non-admins: this table is a write-only mailbox from the
--    visitor's side. Admins can read it for moderation/debugging.
-- ---------------------------------------------------------------------------
alter table public.anon_confession enable row level security;

drop policy if exists "anon_confession_insert_anon" on public.anon_confession;
create policy "anon_confession_insert_anon"
  on public.anon_confession
  for insert
  to anon
  with check (
    visitor_id is not null
    and char_length(btrim(visitor_id)) > 0
    and group_id is not null
    and text is not null
    and char_length(btrim(text)) > 0
    and char_length(text) <= 500
    and exists (
      select 1 from public.groups g
      where g.id = group_id
        and coalesce(g.confessions_enabled, true) = true
    )
  );

drop policy if exists "anon_confession_select_admin" on public.anon_confession;
create policy "anon_confession_select_admin"
  on public.anon_confession
  for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---------------------------------------------------------------------------
-- 3. Server-side rate limit — mirrors the visitor_id cooldown used for the
--    other two anon paths (0005, 0007), scoped to this table only.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_anon_confession_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.anon_confession
    where visitor_id = new.visitor_id
      and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'rate_limited: please wait a moment before posting again';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_anon_confession_rate_limit on public.anon_confession;
create trigger trg_anon_confession_rate_limit
  before insert on public.anon_confession
  for each row
  execute function public.enforce_anon_confession_rate_limit();

-- ---------------------------------------------------------------------------
-- 4. The fan-out itself: anon_confession -> group_messages (which then
--    fans out again into confessions via the existing 0001/0003 trigger).
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so this can insert into group_messages regardless of
-- anon's own RLS grants on that table — anon_confession is now the only
-- door anon needs, and this function is the sole thing writing through it.
create or replace function public.process_anon_confession()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_message_id uuid;
begin
  begin
    insert into public.group_messages (
      group_id, user_id, is_anon, is_confession, sender_name, text, visitor_id
    ) values (
      new.group_id, null, true, true, 'Anonymous', new.text, new.visitor_id
    )
    returning id into new_message_id;

    update public.anon_confession
      set status = 'processed',
          group_message_id = new_message_id,
          processed_at = now(),
          error_message = null
      where id = new.id;
  exception when others then
    -- Never let a downstream fan-out failure take down the anon insert
    -- that already succeeded from the visitor's point of view — record it
    -- instead so it's visible to admins via anon_confession_select_admin.
    update public.anon_confession
      set status = 'failed',
          error_message = sqlerrm,
          processed_at = now()
      where id = new.id;
  end;
  return new;
end;
$$;

drop trigger if exists trg_process_anon_confession on public.anon_confession;
create trigger trg_process_anon_confession
  after insert on public.anon_confession
  for each row
  execute function public.process_anon_confession();

-- ---------------------------------------------------------------------------
-- 5. Carry visitor_id across the existing group_messages -> confessions
--    mirror, which previously dropped it (see 0007's comment on this gap).
--    Confessions produced through anon_confession now keep their visitor_id
--    end to end, same as the two older anon paths already did on their own
--    tables.
-- ---------------------------------------------------------------------------
create or replace function public.sync_group_confession_to_confessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.confessions (
    group_id, source_message_id, author_id, is_anon, text, photo_url, visibility, story_style, visitor_id
  ) values (
    new.group_id,
    new.id,
    case when new.is_anon then null else new.user_id end,
    new.is_anon,
    new.text,
    new.media_url,
    'group',
    new.story_style,
    new.visitor_id
  );
  return new;
end;
$$;

commit;
