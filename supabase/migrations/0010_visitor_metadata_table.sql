/** ===========================================================================
 * 0010: Standardize public.visitor_metadata around visitor_id
 * ============================================================================
 * public.visitor_metadata had NO migration anywhere in this repo — it only
 * ever showed up as a bare `supabase.from('visitor_metadata').insert(...)`
 * call inside App.jsx's LocationBanner, fired ONLY when a visitor granted
 * location AND only the very first time getOrCreateVisitorId() ever ran for
 * them. Every other consumer of visitor_id — ConfessToGroup.jsx's
 * anon_confession insert, QuestionThread.jsx's question_replies insert — is
 * a totally separate creation path that never touches visitor_metadata at
 * all. Net effect: most visitor_ids that show up in confessions/replies have
 * NO matching visitor_metadata row (a visitor who never granted location),
 * and a visitor who confesses/replies first and only grants location later
 * would ALSO never get one (the old code's "only insert once, first time"
 * gate had already fired against the wrong flow). The two were never the
 * same identity lifecycle, just the same string by coincidence when things
 * happened to line up.
 *
 * This migration makes visitor_id the actual primary key of the table so it
 * can be upserted from multiple call sites without racing to create
 * duplicate rows. See src/lib/visitorId.js's getOrCreateVisitorId(), which
 * now seeds a bare row here the moment a visitor_id is FIRST minted —
 * before any confession, reply, or location grant ever happens — so every
 * visitor_id used anywhere in the app is guaranteed a visitor_metadata row
 * from birth. App.jsx's LocationBanner then just enriches that same row
 * (upsert on visitor_id) with lat/long/device info if and when location is
 * ever granted, instead of racing a plain insert against it.
 *
 * Idempotent: safe to re-run.
 * ========================================================================= */

begin;

-- ---------------------------------------------------------------------------
-- 1. The table itself — created fresh if this project never had it, or
--    just gets its constraints tightened up if it already exists from an
--    untracked dashboard-created table.
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_metadata (
  visitor_id   text primary key,
  latitude     double precision null,
  longitude    double precision null,
  accuracy_m   double precision null,
  device_type  text null,
  browser      text null,
  os           text null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- In case this runs against a pre-existing, untracked visitor_metadata
-- table that didn't already have visitor_id as its primary key.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.visitor_metadata'::regclass
      and contype = 'p'
  ) then
    alter table public.visitor_metadata
      add primary key (visitor_id);
  end if;
end $$;

alter table public.visitor_metadata
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Keep updated_at honest across the upserts from both call sites (the
--    bare seed insert in visitorId.js and the location-enrichment upsert in
--    App.jsx's LocationBanner).
-- ---------------------------------------------------------------------------
create or replace function public.touch_visitor_metadata_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_visitor_metadata_touch on public.visitor_metadata;
create trigger trg_visitor_metadata_touch
  before update on public.visitor_metadata
  for each row
  execute function public.touch_visitor_metadata_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — anon needs to both seed the bare row (getOrCreateVisitorId) and
--    later enrich it with location (LocationBanner), from the SAME visitor,
--    so anon gets INSERT + UPDATE, narrowly scoped to just its own
--    visitor_id column being non-empty. No SELECT/DELETE for anon — this is
--    a write-only identity table from the visitor's side, same posture as
--    anon_confession (0008). Admins can read it for abuse investigation.
-- ---------------------------------------------------------------------------
alter table public.visitor_metadata enable row level security;

drop policy if exists "visitor_metadata_insert_anon" on public.visitor_metadata;
create policy "visitor_metadata_insert_anon"
  on public.visitor_metadata
  for insert
  to anon
  with check (
    visitor_id is not null
    and char_length(btrim(visitor_id)) > 0
  );

drop policy if exists "visitor_metadata_update_anon" on public.visitor_metadata;
create policy "visitor_metadata_update_anon"
  on public.visitor_metadata
  for update
  to anon
  using (visitor_id is not null)
  with check (visitor_id is not null);

drop policy if exists "visitor_metadata_select_admin" on public.visitor_metadata;
create policy "visitor_metadata_select_admin"
  on public.visitor_metadata
  for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

commit;
