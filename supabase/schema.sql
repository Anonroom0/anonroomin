-- =============================================================================
-- anonroom.in — Supabase schema
-- Run this in the Supabase SQL editor (or via the CLI) on a fresh project.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Table: profiles
-- -----------------------------------------------------------------------------
create table if not exists profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  username           text unique not null,
  avatar_url         text,
  is_admin           boolean not null default false,
  accepted_terms     boolean not null default false,
  ip_address         text,
  city               text,
  region             text,
  country            text,
  isp                text,
  user_agent         text,
  device_type        text,
  browser            text,
  os                 text,
  language            text,
  timezone           text,
  screen_resolution  text,
  referrer           text,
  created_at         timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are publicly readable"
  on profiles for select
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a bare profile row whenever a new auth.users row is inserted.
-- Pulls username / accepted_terms out of the signup call's raw_user_meta_data,
-- e.g. supabase.auth.signUp({ ..., options: { data: { username, accepted_terms } } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, accepted_terms)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce((new.raw_user_meta_data ->> 'accepted_terms')::boolean, false)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Table: groups
-- -----------------------------------------------------------------------------
create table if not exists groups (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null,
  description  text,
  cover_url    text,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table groups enable row level security;

create policy "groups are publicly readable"
  on groups for select
  using (true);

create policy "only admins can create groups"
  on groups for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- -----------------------------------------------------------------------------
-- Table: group_messages
-- -----------------------------------------------------------------------------
create table if not exists group_messages (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  sender_name  text not null,
  text         text,
  media_url    text,
  media_type   text,
  created_at   timestamptz not null default now()
);

alter table group_messages enable row level security;

create policy "group messages are publicly readable"
  on group_messages for select
  using (true);

create policy "users can send group messages as themselves"
  on group_messages for insert
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Table: dm_threads
-- -----------------------------------------------------------------------------
create table if not exists dm_threads (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references profiles (id) on delete cascade,
  user_b      uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table dm_threads enable row level security;

create policy "participants can read their dm threads"
  on dm_threads for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "participants can create dm threads"
  on dm_threads for insert
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- -----------------------------------------------------------------------------
-- Table: dm_messages
-- -----------------------------------------------------------------------------
create table if not exists dm_messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references dm_threads (id) on delete cascade,
  sender_id         uuid not null references profiles (id) on delete cascade,
  text              text,
  media_url         text,
  media_type        text,
  is_group_request  boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table dm_messages enable row level security;

create policy "participants can read dm messages"
  on dm_messages for select
  using (
    exists (
      select 1 from dm_threads
      where dm_threads.id = dm_messages.thread_id
        and (dm_threads.user_a = auth.uid() or dm_threads.user_b = auth.uid())
    )
  );

create policy "participants can send dm messages as themselves"
  on dm_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from dm_threads
      where dm_threads.id = dm_messages.thread_id
        and (dm_threads.user_a = auth.uid() or dm_threads.user_b = auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Rate limiting: 5 seconds between messages per sender, per group / per thread.
-- Real enforcement lives here; rateLimit.js on the client only mirrors this
-- for UX (disabling the composer / showing a countdown).
-- -----------------------------------------------------------------------------
create or replace function public.enforce_group_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_sent timestamptz;
begin
  select created_at into last_sent
  from group_messages
  where group_id = new.group_id
    and user_id = new.user_id
  order by created_at desc
  limit 1;

  if last_sent is not null and new.created_at - last_sent < interval '5 seconds' then
    raise exception 'RATE_LIMIT: wait a few seconds before sending another message';
  end if;

  return new;
end;
$$;

drop trigger if exists group_messages_rate_limit on group_messages;
create trigger group_messages_rate_limit
  before insert on group_messages
  for each row execute function public.enforce_group_message_rate_limit();

create or replace function public.enforce_dm_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_sent timestamptz;
begin
  select created_at into last_sent
  from dm_messages
  where thread_id = new.thread_id
    and sender_id = new.sender_id
  order by created_at desc
  limit 1;

  if last_sent is not null and new.created_at - last_sent < interval '5 seconds' then
    raise exception 'RATE_LIMIT: wait a few seconds before sending another message';
  end if;

  return new;
end;
$$;

drop trigger if exists dm_messages_rate_limit on dm_messages;
create trigger dm_messages_rate_limit
  before insert on dm_messages
  for each row execute function public.enforce_dm_message_rate_limit();

-- -----------------------------------------------------------------------------
-- Realtime: expose message tables for live subscriptions.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table group_messages;
alter publication supabase_realtime add table dm_messages;

-- -----------------------------------------------------------------------------
-- Storage: `media` bucket (create via Dashboard → Storage, not SQL, since
-- bucket creation isn't reliably scriptable across projects). After creating
-- a PUBLIC bucket named `media`, add these policies on storage.objects:
--
--   create policy "media is publicly readable"
--     on storage.objects for select
--     using (bucket_id = 'media');
--
--   create policy "authenticated users can upload media"
--     on storage.objects for insert
--     with check (bucket_id = 'media' and auth.role() = 'authenticated');
--
-- Upload path convention (enforced client-side, not by policy):
--   {user_id}/{timestamp}-{filename}
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- One-time manual step: after vansh signs up normally through the app's OTP
-- flow, run this by hand to grant admin rights. Do NOT run automatically.
--
-- update profiles set is_admin = true where id = (
--   select id from auth.users where email = 'akvnshkur1@gmail.com'
-- );
-- -----------------------------------------------------------------------------
