-- ============================================================================
-- 0003: Customized-story metadata for GROUP confessions
-- ============================================================================
-- Mirrors 0002_confession_story_style.sql, but for confessions posted from
-- inside a group (see GroupChat.jsx's "New Confession" sheet) rather than
-- the public Ask Me tab. Group confessions are inserted into
-- group_messages (is_confession = true) first, then mirrored into
-- public.confessions by sync_group_confession_to_confessions() below — so
-- story_style needs to be captured on BOTH the source row and the trigger
-- that copies it over, or it would silently get dropped on the mirror.
--
-- Same null-means-"no customization" contract as 0002: absent renders as a
-- plain text/photo confession bubble, exactly as it always has.
-- ============================================================================

alter table public.group_messages
  add column if not exists story_style jsonb null;

comment on column public.group_messages.story_style is
  'Optional {backgroundId, colorId, shapeId, scaleId} chosen via the group "New Confession" sheet''s Customize button (is_confession = true rows only). Rendered inline, inside the chat bubble, by generateConfessionCardImage() (see storyImageGenerator.js and ConfessionBubble.jsx) — no image is stored in a bucket for this.';

create or replace function public.sync_group_confession_to_confessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.confessions (
    group_id, source_message_id, author_id, is_anon, text, photo_url, visibility, story_style
  ) values (
    new.group_id,
    new.id,
    -- Bug fix: group_messages' "who sent this" column is user_id, not
    -- sender_id (that's dm_messages' column — see notify_on_relevant_insert
    -- in 0001, which already branches on this per-table). The original
    -- 0001 version of this function referenced new.sender_id, which doesn't
    -- exist on group_messages and made every group-confession insert fail
    -- with "record 'new' has no field 'sender_id'" as soon as this trigger
    -- actually ran.
    case when new.is_anon then null else new.user_id end,
    new.is_anon,
    new.text,
    new.media_url,
    'group',
    new.story_style
  );
  return new;
end;
$$;
