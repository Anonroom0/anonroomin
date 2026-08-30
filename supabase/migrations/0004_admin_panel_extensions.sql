/** ===========================================================================
 * Migration: admin panel extensions
 * ============================================================================
 * 1. groups.cover_url — the frontend (GroupCard.jsx, GroupChat.jsx, Home.jsx)
 *    already reads/renders group.cover_url as the group's display picture,
 *    but no tracked migration ever created the column (it predates this
 *    migrations folder). Added here, idempotently, so the admin panel's new
 *    "group cover" upload/URL field has somewhere to write.
 * 2. confessions.is_anon — already created by 0001_anonroom_v2.sql; restated
 *    here with add-column-if-not-exists so this migration is a safe no-op on
 *    a project that already has it, and self-healing on one that doesn't.
 *
 * Idempotent: safe to re-run.
 * ========================================================================= */

begin;

alter table public.groups
  add column if not exists cover_url text null;

alter table public.confessions
  add column if not exists is_anon boolean not null default true;

commit;
