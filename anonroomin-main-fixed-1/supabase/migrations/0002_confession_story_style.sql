-- ============================================================================
-- 0002: Customized-story metadata for confessions
-- ============================================================================
-- Backs the "Customize" button on the Ask Me tab's confession composer (see
-- CreateConfessionModal.jsx). Instead of rendering a story image up front
-- and uploading a PNG to the `media` storage bucket, the composer stores
-- only the *style choice* here as small JSON — which Background/Colour/
-- Shape/Size preset ids the author picked (see storyStylePresets.js) — and
-- the app renders the actual story image on demand, client-side, from this
-- metadata using the exact same generateStoryImage() pipeline the Share
-- Story sheet already uses (see storyImageGenerator.js).
--
-- Null/absent means "no customization" — the confession renders as a plain
-- text/photo confession bubble in the feed and in the story viewer, exactly
-- as it always has.
-- ============================================================================

alter table public.confessions
  add column if not exists story_style jsonb null;

comment on column public.confessions.story_style is
  'Optional {backgroundId, colorId, shapeId, scaleId} chosen via the Ask Me tab''s "Customize" button. Rendered on demand by generateStoryImage() (see storyImageGenerator.js) — no image is stored in a bucket for this.';
