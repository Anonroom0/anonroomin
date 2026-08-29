/** ===========================================================================
 * Migration: confessions, questions, question_replies, reactions,
 * notification_settings — plus the group_messages -> confessions sync
 * trigger, the cross-table push-notification trigger, and RLS for all five
 * new tables.
 *
 * Idempotent: safe to re-run. Uses CREATE TABLE IF NOT EXISTS, CREATE OR
 * REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER, and
 * DROP POLICY IF EXISTS + CREATE POLICY throughout.
 * ========================================================================= */

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- Needed for net.http_post() in notify_on_relevant_insert(). Supabase
-- projects usually already have this enabled; IF NOT EXISTS keeps the
-- migration idempotent either way.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.confessions (
  id                 uuid primary key default gen_random_uuid(),
  author_id          uuid null references public.profiles(id),
  is_anon            boolean not null default true,
  text               text,
  photo_url          text null,
  group_id           uuid null references public.groups(id),
  -- Set only when this row was auto-synced from a group_messages row with
  -- is_confession = true (see sync_group_confession_to_confessions below).
  source_message_id  uuid null references public.group_messages(id),
  visibility         text not null check (visibility in ('public', 'group')),
  created_at         timestamptz not null default now()
);

create index if not exists confessions_group_created_idx
  on public.confessions (group_id, created_at desc);

-- Partial index backing the public feed query (group_id is null).
create index if not exists confessions_public_feed_idx
  on public.confessions (created_at desc)
  where group_id is null;

create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id),
  question_type  text not null check (question_type in ('personal', 'general')),
  text           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists questions_author_created_idx
  on public.questions (author_id, created_at desc);

create table if not exists public.question_replies (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions(id) on delete cascade,
  replier_id   uuid null references public.profiles(id),
  -- Cookie-based anon identity for unauthenticated repliers. Abuse
  -- mitigation only — never surfaced in the UI.
  visitor_id   text null,
  reply_text   text not null,
  is_anon      boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists question_replies_question_created_idx
  on public.question_replies (question_id, created_at);

create table if not exists public.reactions (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('group_message', 'dm_message', 'confession')),
  target_id    uuid not null,
  user_id      uuid not null references public.profiles(id),
  emoji        text not null,
  created_at   timestamptz not null default now(),
  -- A user changes their reaction by UPDATEing this row, not inserting a
  -- second one; deleting the row removes their reaction.
  unique (target_type, target_id, user_id)
);

create index if not exists reactions_target_idx
  on public.reactions (target_type, target_id);

create table if not exists public.notification_settings (
  user_id                uuid primary key references public.profiles(id),
  dm_enabled             boolean not null default true,
  groups_enabled         boolean not null default true,
  mentions_enabled       boolean not null default true,
  confessions_enabled    boolean not null default true,
  promotional_enabled    boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trigger function: mirror group confessions into public.confessions
-- ---------------------------------------------------------------------------

create or replace function public.sync_group_confession_to_confessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.confessions (
    group_id, source_message_id, author_id, is_anon, text, photo_url, visibility
  ) values (
    new.group_id,
    new.id,
    case when new.is_anon then null else new.sender_id end,
    new.is_anon,
    new.text,
    new.media_url,
    'group'
  );
  return new;
end;
$$;

drop trigger if exists trg_sync_group_confession on public.group_messages;
create trigger trg_sync_group_confession
  after insert on public.group_messages
  for each row
  when (new.is_confession = true)
  execute function public.sync_group_confession_to_confessions();

-- ---------------------------------------------------------------------------
-- Trigger function: fire push notifications on new group/dm messages and
-- new confessions
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_relevant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type  text;
  v_actor_id     uuid;
  v_edge_url     text;
  v_service_key  text;
begin
  -- The three source tables don't share a column name for "who sent this",
  -- so branch on the firing table to normalize target_type + actor_id.
  if tg_table_name = 'group_messages' then
    v_target_type := 'group_message';
    v_actor_id := new.user_id;
  elsif tg_table_name = 'dm_messages' then
    v_target_type := 'dm_message';
    v_actor_id := new.sender_id;
  elsif tg_table_name = 'confessions' then
    v_target_type := 'confession';
    v_actor_id := new.author_id;
  end if;

  v_edge_url := current_setting('app.settings.edge_function_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- If the environment hasn't configured these settings yet (e.g. a fresh
  -- local db), skip the push call rather than failing the insert that
  -- triggered this.
  if v_edge_url is null or v_service_key is null then
    return new;
  end if;

  perform net.http_post(
    url := v_edge_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'target_type', v_target_type,
      'target_id', new.id,
      'actor_id', v_actor_id
    )
  );

  return new;
end;
$$;

-- One-time, per-environment setup (run manually via the SQL editor or CLI —
-- deliberately NOT part of this migration, since the values are
-- environment-specific secrets, not schema):
--
--   alter database postgres set app.settings.edge_function_url =
--     'https://<project-ref>.functions.supabase.co';
--   alter database postgres set app.settings.service_role_key =
--     '<service-role-jwt>';

drop trigger if exists trg_notify_group_messages on public.group_messages;
create trigger trg_notify_group_messages
  after insert on public.group_messages
  for each row
  execute function public.notify_on_relevant_insert();

drop trigger if exists trg_notify_dm_messages on public.dm_messages;
create trigger trg_notify_dm_messages
  after insert on public.dm_messages
  for each row
  execute function public.notify_on_relevant_insert();

drop trigger if exists trg_notify_confessions on public.confessions;
create trigger trg_notify_confessions
  after insert on public.confessions
  for each row
  execute function public.notify_on_relevant_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.confessions enable row level security;
alter table public.questions enable row level security;
alter table public.question_replies enable row level security;
alter table public.reactions enable row level security;
alter table public.notification_settings enable row level security;

-- confessions ----------------------------------------------------------------

drop policy if exists "confessions_select_public" on public.confessions;
create policy "confessions_select_public"
  on public.confessions
  for select
  to anon, authenticated
  using (visibility = 'public' and group_id is null);
  -- Public feed: no auth required, matches the app's anonymous-by-default posture.

drop policy if exists "confessions_select_group" on public.confessions;
create policy "confessions_select_group"
  on public.confessions
  for select
  to anon, authenticated
  using (
    visibility = 'group'
    and group_id is not null
  );
  -- Groups are always publicly readable, including for unauthenticated
  -- (anon) visitors — there's no group_members join table in the provided
  -- schema, and group access in this app is subdomain-based, not gated by
  -- a separate membership list. This mirrors group_messages' read-open
  -- posture for the anon role.

drop policy if exists "confessions_insert_own" on public.confessions;
create policy "confessions_insert_own"
  on public.confessions
  for insert
  to authenticated
  with check (
    (is_anon = true and author_id is null)
    or (is_anon = false and auth.uid() = author_id)
  );
  -- Owner check: a signed-in user may post anonymously (author_id null) or
  -- attributed (author_id must be their own id) — never on someone else's
  -- behalf, and never author_id set while is_anon is true.

drop policy if exists "confessions_update_owner_or_admin" on public.confessions;
create policy "confessions_update_owner_or_admin"
  on public.confessions
  for update
  to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );
  -- Owner-or-admin. Note anonymous confessions (author_id null) can only be
  -- edited by an admin, since there's no non-admin owner to match against.

drop policy if exists "confessions_delete_owner_or_admin" on public.confessions;
create policy "confessions_delete_owner_or_admin"
  on public.confessions
  for delete
  to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- questions --------------------------------------------------------------

drop policy if exists "questions_select_all" on public.questions;
create policy "questions_select_all"
  on public.questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "questions_insert_own" on public.questions;
create policy "questions_insert_own"
  on public.questions
  for insert
  to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "questions_update_owner_or_admin" on public.questions;
create policy "questions_update_owner_or_admin"
  on public.questions
  for update
  to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "questions_delete_owner_or_admin" on public.questions;
create policy "questions_delete_owner_or_admin"
  on public.questions
  for delete
  to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- question_replies --------------------------------------------------------

drop policy if exists "question_replies_select_all" on public.question_replies;
create policy "question_replies_select_all"
  on public.question_replies
  for select
  to anon, authenticated
  using (true);

drop policy if exists "question_replies_insert_authenticated" on public.question_replies;
create policy "question_replies_insert_authenticated"
  on public.question_replies
  for insert
  to authenticated
  with check (
    auth.uid() = replier_id
    or (replier_id is null and is_anon = true)
  );
  -- Signed-in users may reply attributed (replier_id = their id) or
  -- anonymously (replier_id null, is_anon true) — never as someone else.

drop policy if exists "question_replies_insert_anon" on public.question_replies;
create policy "question_replies_insert_anon"
  on public.question_replies
  for insert
  to anon
  with check (
    replier_id is null
    and visitor_id is not null
  );
  -- Unauthenticated repliers are identified only by a cookie-based
  -- visitor_id for abuse mitigation; replier_id must stay null so no
  -- profile linkage is ever exposed through this path.

drop policy if exists "question_replies_update_owner_or_admin" on public.question_replies;
create policy "question_replies_update_owner_or_admin"
  on public.question_replies
  for update
  to authenticated
  using (
    auth.uid() = replier_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = replier_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );
  -- Anon-visitor replies (replier_id null) have no non-admin owner, so only
  -- an admin can edit/delete those — consistent with the confessions policy.

drop policy if exists "question_replies_delete_owner_or_admin" on public.question_replies;
create policy "question_replies_delete_owner_or_admin"
  on public.question_replies
  for delete
  to authenticated
  using (
    auth.uid() = replier_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- reactions ----------------------------------------------------------------

drop policy if exists "reactions_select_visible_target" on public.reactions;
create policy "reactions_select_visible_target"
  on public.reactions
  for select
  to anon, authenticated
  using (
    (target_type = 'group_message' and exists (
      select 1 from public.group_messages gm where gm.id = target_id
    ))
    or (target_type = 'dm_message' and exists (
      select 1
      from public.dm_messages dm
      join public.dm_threads dt on dt.id = dm.thread_id
      where dm.id = target_id
        and auth.uid() in (dt.user_a, dt.user_b)
    ))
    or (target_type = 'confession' and exists (
      select 1 from public.confessions c where c.id = target_id
    ))
  );
  -- "Readable by anyone who could read the target row": the group_message
  -- and confession branches lean on those tables' own SELECT policies above
  -- (this subquery runs as the calling role, so their RLS still applies —
  -- group_messages and group-visibility confessions are both open to anon,
  -- so reactions on them are too). dm_message has no attached SELECT policy
  -- to mirror, so this inlines the obvious rule directly — only the two
  -- participants of the owning thread can see reactions on a DM message.

drop policy if exists "reactions_insert_own" on public.reactions;
create policy "reactions_insert_own"
  on public.reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "reactions_update_owner_or_admin" on public.reactions;
create policy "reactions_update_owner_or_admin"
  on public.reactions
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );
  -- Covers "a user changes their reaction by UPDATEing this row".

drop policy if exists "reactions_delete_owner_or_admin" on public.reactions;
create policy "reactions_delete_owner_or_admin"
  on public.reactions
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- notification_settings -----------------------------------------------------

drop policy if exists "notification_settings_owner_all" on public.notification_settings;
create policy "notification_settings_owner_all"
  on public.notification_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
  -- Judgment call: notification_settings wasn't covered by the SELECT/
  -- INSERT/UPDATE/DELETE bullets in the prompt (those only spec the other
  -- four tables). Treated as strictly private per-user preferences — owner
  -- only, for every operation, with no admin override since there's
  -- nothing here worth moderating and no legitimate reason for anyone else
  -- to read or write another user's notification prefs.

commit;
