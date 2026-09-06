/** ===========================================================================
 * 0007: Unauthenticated confessions also land in the live group chat
 * ============================================================================
 * 0005_confess_group_anon.sql wired /confess/<slug> (see
 * ConfessToGroup.jsx) straight into public.confessions, which is correct
 * for the group's Stories bar (StoriesBar.jsx reads confessions directly)
 * but means the submission never appears inline in the group's actual chat
 * — GroupChat.jsx renders its message list from group_messages, not
 * confessions, so an anon submission that only ever touches confessions is
 * invisible there. The authenticated "New Confession" sheet inside
 * GroupChat.jsx never had this problem because it always inserted into
 * group_messages first and let sync_group_confession_to_confessions()
 * (0001/0003) mirror it into confessions automatically.
 *
 * This migration opens that exact same door — group_messages, not
 * confessions directly — to the `anon` role, under an equally narrow,
 * text-only, confession-shaped RLS policy, plus its own visitor_id column
 * and rate-limit trigger (mirroring 0005's confessions-side ones, since an
 * anon group_messages insert no longer touches confessions.visitor_id at
 * all — the sync trigger doesn't carry it across).
 *
 * ConfessToGroup.jsx now tries this path first and falls back to the old
 * direct-to-confessions insert (0005's policy, left in place untouched)
 * only if the group_messages insert is rejected for any reason — e.g. an
 * unforeseen NOT NULL column on group_messages this migration doesn't know
 * to satisfy, since that table's full definition predates this migration
 * set and isn't visible from here. Either path still ends up as a
 * confessions row for Stories; only the group_messages path also shows up
 * in chat.
 *
 * Idempotent: safe to re-run.
 * ========================================================================= */

begin;

-- Anon confession messages carry no user_id — the same "no session, no
-- account" shape 0005 already established for the confessions table.
-- Harmless no-op if group_messages.user_id was already nullable.
alter table public.group_messages
  alter column user_id drop not null;

alter table public.group_messages
  add column if not exists visitor_id text null;

create index if not exists group_messages_visitor_id_idx
  on public.group_messages (visitor_id, created_at desc)
  where visitor_id is not null;

alter table public.group_messages enable row level security;

drop policy if exists "group_messages_insert_confession_anon" on public.group_messages;
create policy "group_messages_insert_confession_anon"
  on public.group_messages
  for insert
  to anon
  with check (
    user_id is null
    and is_anon = true
    and is_confession = true
    and visitor_id is not null
    and group_id is not null
    -- text-only, exactly like the confessions-direct anon path: no media,
    -- no story customization, no pinning straight out of the gate.
    and media_url is null
    and story_style is null
    and coalesce(is_pinned, false) = false
    and text is not null
    and char_length(btrim(text)) > 0
    and char_length(text) <= 500
    and exists (
      select 1 from public.groups g
      where g.id = group_id
        and coalesce(g.confessions_enabled, true) = true
    )
  );

create or replace function public.enforce_group_message_visitor_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visitor_id is not null then
    if exists (
      select 1 from public.group_messages
      where visitor_id = new.visitor_id
        and created_at > now() - interval '20 seconds'
    ) then
      raise exception 'rate_limited: please wait a moment before posting again';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_group_messages_visitor_rate_limit on public.group_messages;
create trigger trg_group_messages_visitor_rate_limit
  before insert on public.group_messages
  for each row
  execute function public.enforce_group_message_visitor_rate_limit();

commit;
