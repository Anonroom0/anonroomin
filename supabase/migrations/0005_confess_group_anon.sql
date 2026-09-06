/** ===========================================================================
 * 0005: Unauthenticated "/confess/<slug>" group confessions
 * ============================================================================
 * Backs a brand-new, fully unauthenticated route — anonroom.in/confess/<slug>
 * (see src/pages/ConfessToGroup.jsx) — that lets a visitor with NO account
 * and NO session drop an anonymous confession straight into a specific
 * group, purely by having the link. This is deliberately a different door
 * than the existing "New Confession" sheet inside GroupChat.jsx (which
 * requires sign-in and writes through group_messages, see
 * 0003_group_confession_story_style.sql's sync trigger) — that flow needs a
 * real user_id and shows up inline in the live chat; this one needs NEITHER
 * an account NOR chat access, and writes straight into public.confessions
 * with visibility = 'group', exactly the same row shape the group's Stories
 * bar (see StoriesBar.jsx's `.from('confessions').select(...).in('group_id',
 * ...)` query) already reads. Net effect: a /confess/<slug> submission shows
 * up as a Story for that group, same as any other group confession does,
 * without ever touching group_messages or requiring a session.
 *
 * Idempotent: safe to re-run. Uses ADD COLUMN IF NOT EXISTS, DROP POLICY IF
 * EXISTS + CREATE POLICY, CREATE OR REPLACE FUNCTION, and DROP TRIGGER IF
 * EXISTS + CREATE TRIGGER throughout.
 * ========================================================================= */

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-group kill switch
-- ---------------------------------------------------------------------------
-- Lets a group opt out of the unauthenticated confession inbox entirely
-- (e.g. if it gets abused) without touching the authenticated in-chat
-- confession flow, which is unaffected by this column. Defaults to true so
-- every existing group gets the feature with no extra setup.
alter table public.groups
  add column if not exists confessions_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Anon-visitor identity, mirroring question_replies.visitor_id
-- ---------------------------------------------------------------------------
-- Cookie-based visitor id (see src/lib/visitorId.js's getOrCreateVisitorId)
-- for the unauthenticated path only. Never surfaced in the UI, never joined
-- to a profile — purely abuse mitigation (rate limiting below) and a
-- last-resort moderation trail. Authenticated confession paths never set
-- this column, so it stays null for every row that predates this migration
-- and every row inserted through the existing authenticated flows.
alter table public.confessions
  add column if not exists visitor_id text null;

create index if not exists confessions_visitor_id_idx
  on public.confessions (visitor_id, created_at desc)
  where visitor_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS: let `anon` insert ONLY a narrow, fully-anonymous, text-only,
--    group-scoped confession shape — nothing else about the table opens up.
-- ---------------------------------------------------------------------------
-- confessions_insert_own (0001) already covers every authenticated path;
-- this is purely additive for the `anon` role, which had no INSERT policy
-- on this table at all before now.
drop policy if exists "confessions_insert_group_anon" on public.confessions;
create policy "confessions_insert_group_anon"
  on public.confessions
  for insert
  to anon
  with check (
    author_id is null
    and is_anon = true
    and visibility = 'group'
    and group_id is not null
    and visitor_id is not null
    -- text-only: no media, no story customization, no faked link back to a
    -- group_messages row — those all stay reserved for the authenticated
    -- in-chat flow.
    and photo_url is null
    and story_style is null
    and source_message_id is null
    and text is not null
    and char_length(btrim(text)) > 0
    and char_length(text) <= 500
    -- The target group must exist (enforced anyway by the group_id FK) and
    -- must not have opted out via groups.confessions_enabled.
    and exists (
      select 1 from public.groups g
      where g.id = group_id
        and coalesce(g.confessions_enabled, true) = true
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Real (server-side) rate limit for the anon path
-- ---------------------------------------------------------------------------
-- The cooldown ring in the rest of the app (src/lib/rateLimit.js) is
-- client-side UI only and trivially bypassed by anyone hitting the API
-- directly — fine for authenticated users who are already accountable via
-- their session, not fine for a fully unauthenticated public endpoint. This
-- trigger enforces a real minimum gap between posts from the same
-- visitor_id, independent of anything the client does or doesn't send.
-- Scoped to `visitor_id is not null` so it only ever runs against rows from
-- this new anon path — every existing authenticated insert leaves
-- visitor_id null and is completely unaffected.
create or replace function public.enforce_confession_visitor_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visitor_id is not null then
    if exists (
      select 1 from public.confessions
      where visitor_id = new.visitor_id
        and created_at > now() - interval '20 seconds'
    ) then
      raise exception 'rate_limited: please wait a moment before posting again';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_confessions_visitor_rate_limit on public.confessions;
create trigger trg_confessions_visitor_rate_limit
  before insert on public.confessions
  for each row
  execute function public.enforce_confession_visitor_rate_limit();

-- ---------------------------------------------------------------------------
-- 5. Defensive: make sure `anon` can actually resolve a group by slug
-- ---------------------------------------------------------------------------
-- Every other part of this app already assumes groups are fully
-- world-readable, including for signed-out visitors (see the
-- confessions_select_group comment in 0001_anonroom_v2.sql), so this should
-- already be a no-op in practice. Added anyway, under its own distinctly-
-- named policy, purely as a safety net so /confess/<slug> can never be
-- broken by groups RLS being stricter than assumed elsewhere — additional
-- permissive SELECT policies only ever widen access, never narrow it, so
-- this cannot conflict with whatever policy already exists on this table.
alter table public.groups enable row level security;

drop policy if exists "groups_select_public_confess" on public.groups;
create policy "groups_select_public_confess"
  on public.groups
  for select
  to anon, authenticated
  using (true);

commit;
