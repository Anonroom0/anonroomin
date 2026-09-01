/** ===========================================================================
 * CONFESSION BUBBLE — shared NGL-style confession card
 * ============================================================================
 * <ConfessionBubble
 *   confession={{ id, text, photo_url, is_anon, created_at, group }}
 *   onReply?
 *   size="inline"|"feed"|"story"
 * />
 *
 * One shared component behind three call sites:
 *   - GroupChat.jsx      (size="inline") — a confession posted into a group
 *                          thread, rendered inline among regular messages
 *   - ConfessionsFeed.jsx (size="feed")   — the public confessions feed
 *   - StoryViewer.jsx     (size="story")  — full-screen story body
 *
 * Always horizontally centered — never left/right-aligned like a normal
 * chat bubble, regardless of size. Structure is fixed across all three
 * sizes: a gradient header strip carries the confession TEXT itself (bold
 * rounded display font, NGL-sticker style — no "Confession" label, no
 * timestamp here) sitting above a rectangular --glass-white body (20px
 * radius) with a reserved 4:5 image area (only rendered when photo_url is
 * present), then a bottom row with a reply affordance on the left and the
 * relative timestamp on the right.
 * (Reactions were previously shown here via an embedded ReactionBar, but
 * that has been removed from this component — callers that still want a
 * reaction bar for a confession render their own ReactionBar externally,
 * e.g. GroupChat.jsx and StoryViewer.jsx already do.)
 *
 * size="story" fills more of the screen and auto-hides the reply chrome
 * until the viewer taps once — the IG/NGL story convention StoryViewer.jsx
 * relies on. Tapping again (or the caller re-mounting on story change) can
 * re-hide it; this component only owns the show/hide state itself, keyed
 * off its own tap handler.
 *
 * This preserves the same underlying content GroupChat.jsx already rendered
 * inline for is_confession messages (a labeled, gradient-tinted bubble with
 * the confession text and a reply affordance) — restyled to the gradient-
 * header + glass-body structure specified here, now with reactions and an
 * optional photo/video, shared verbatim across all three surfaces instead of
 * being reimplemented per-page.
 *
 * Dependencies: React, src/components/shared/ReactionBar.jsx, MediaViewer.jsx
 * ========================================================================= */

import React, { useEffect, useRef, useState } from 'react';
import MediaViewer from '../../pages/MediaViewer';
import { generateConfessionCardImage } from '../../lib/storyImageGenerator';

const SIZE_PRESETS = {
  inline: {
    maxWidth: 300,
    bodyPadding: '16px 18px',
    textSize: 15.5,
    headerTextSize: 11.5,
    headerFontSize: 18,
  },
  feed: {
    maxWidth: 380,
    bodyPadding: '18px 20px',
    textSize: 16.5,
    headerTextSize: 12,
    headerFontSize: 20,
  },
  story: {
    maxWidth: 340,
    bodyPadding: '22px 22px',
    textSize: 19,
    headerTextSize: 12.5,
    headerFontSize: 22,
  },
};

// Bold, rounded display font stack — matches the chunky comic-style
// lettering used on the gradient sticker in the reference screenshot
// (Fredoka / Baloo-style rounded sans, falling back to a system rounded
// sans, then generic sans-serif).
const HEADER_FONT_STACK =
  "'Fredoka', 'Baloo 2', 'Poppins', 'SF Pro Rounded', 'Segoe UI', sans-serif";

function relativeTime(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function detectMediaType(url, explicitType) {
  if (explicitType === 'video' || explicitType === 'audio') return explicitType;
  if (!url) return 'image';
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v|mkv|3gp|quicktime)$/i.test(cleanUrl)) {
    return 'video';
  }
  if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(cleanUrl)) {
    return 'audio';
  }
  return explicitType || 'image';
}

export default function ConfessionBubble({ confession, onReply, onPhotoClick, size = 'inline' }) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.inline;
  const isStory = size === 'story';

  const [storyChromeVisible, setStoryChromeVisible] = useState(false);
  const [localMediaOpen, setLocalMediaOpen] = useState(false);

  const showChrome = !isStory || storyChromeVisible;

  // Customized confessions (group "New Confession" sheet's Customize button
  // — see GroupChat.jsx's ConfessionModal) carry a {backgroundId, colorId,
  // shapeId, scaleId} style choice instead of rendering as the plain
  // header+glass-body card below. When present, the chosen Shape+Background
  // is rendered inline via generateConfessionCardImage — no header strip,
  // just the body shape sitting on its background, exactly like the shape
  // would look inside the customization story flow.
  const storyStyle = confession.story_style || null;
  const [styledCardUrl, setStyledCardUrl] = useState(null);
  const [styledCardLoading, setStyledCardLoading] = useState(Boolean(storyStyle));
  const styledCardUrlRef = useRef(null);

  useEffect(() => {
    if (!storyStyle || !confession.text) {
      if (styledCardUrlRef.current) { URL.revokeObjectURL(styledCardUrlRef.current); styledCardUrlRef.current = null; }
      setStyledCardUrl(null);
      setStyledCardLoading(false);
      return undefined;
    }
    let cancelled = false;
    setStyledCardLoading(true);
    generateConfessionCardImage({
      text: confession.text,
      backgroundId: storyStyle.backgroundId,
      colorId: storyStyle.colorId,
      shapeId: storyStyle.shapeId,
      scaleId: storyStyle.scaleId,
    })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (styledCardUrlRef.current) URL.revokeObjectURL(styledCardUrlRef.current);
        styledCardUrlRef.current = url;
        setStyledCardUrl(url);
        setStyledCardLoading(false);
      })
      .catch(() => { if (!cancelled) setStyledCardLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyStyle?.backgroundId, storyStyle?.colorId, storyStyle?.shapeId, storyStyle?.scaleId, confession.text]);

  useEffect(() => () => { if (styledCardUrlRef.current) URL.revokeObjectURL(styledCardUrlRef.current); }, []);

  // Not-anonymous confessions overlay the poster's name + avatar on top of
  // the card, NGL/IG-story style. Callers pass this through either as a
  // flat author_username/author_avatar_url pair (GroupChat.jsx, which
  // already has sender_name/profiles.avatar_url on hand) or as a joined
  // `profiles` object (ConfessionsFeed.jsx/StoryViewer.jsx, which select
  // `*, profiles(username, avatar_url)`) — either shape works here. Always
  // gated on is_anon, regardless of what's present in author_id underneath
  // (see 0005_confessions_author_id_always.sql for why author_id is always
  // recorded now even for anonymous posts).
  const authorUsername = !confession.is_anon ? (confession.profiles?.username || confession.author_username || null) : null;
  const authorAvatarUrl = !confession.is_anon ? (confession.profiles?.avatar_url || confession.author_avatar_url || null) : null;
  const showAuthorOverlay = Boolean(authorUsername || authorAvatarUrl);

  const mediaUrl = confession.photo_url || confession.media_url;
  const mediaType = detectMediaType(mediaUrl, confession.media_type);
  const isVideo = mediaType === 'video';
  const isImage = mediaType === 'image';
  // Anything that isn't an image/video (voice notes, generic files) can't be
  // rendered into the 4:5 photo frame below — it was previously falling
  // through to the <img> branch and showing up as a broken image icon.
  const isOtherAttachment = Boolean(mediaUrl) && !isVideo && !isImage;
  const attachmentMeta =
    mediaType === 'audio'
      ? { emoji: '🎵', label: 'Voice message' }
      : { emoji: '📄', label: 'Attachment' };

  function handleBodyTap() {
    if (isStory) setStoryChromeVisible((v) => !v);
  }

  // Small IG/NGL-style "posted by" chip, absolutely positioned over the
  // top-left corner of a card. Only ever rendered when showAuthorOverlay is
  // true, i.e. is_anon === false and we actually have a name/avatar to show.
  function AuthorOverlay() {
    if (!showAuthorOverlay) return null;
    return (
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px 3px 3px',
          borderRadius: 999,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {authorAvatarUrl ? (
          <img src={authorAvatarUrl} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {(authorUsername || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {authorUsername ? `@${authorUsername}` : 'Someone'}
        </span>
      </div>
    );
  }

  // Bottom row shared by both the standard card and the customized-style
  // card: Reply affordance on the left, relative timestamp on the right.
  function BottomRow() {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: `10px ${preset.bodyPadding.split(' ')[1]} 14px`,
          borderTop: '1px solid var(--glass-border)',
        }}
      >
        {onReply ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReply(confession);
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--dim)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            Reply
          </button>
        ) : <span />}

        <span style={{ fontSize: preset.headerTextSize, color: 'var(--dim)' }}>
          {relativeTime(confession.created_at)}
        </span>
      </div>
    );
  }

  // --- Customized rendering: no header strip at all (text is baked into
  // the rendered Shape+Background image), with the same bottom row
  // underneath as the standard card. ---
  if (storyStyle && confession.text) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '70%', margin: isStory ? 0 : '16px 0' }}>
        <div style={{ width: '100%', maxWidth: preset.maxWidth, position: 'relative' }}>
          <AuthorOverlay />
          <div
            onClick={handleBodyTap}
            style={{
              background: 'var(--ink-2)',
              borderRadius: 20,
              overflow: 'hidden',
              cursor: isStory ? 'pointer' : 'default',
              minHeight: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {styledCardUrl ? (
              <img src={styledCardUrl} alt="Confession" style={{ width: '100%', display: 'block' }} />
            ) : (
              <div style={{ padding: '40px 0', color: 'var(--dim)', fontSize: preset.headerTextSize }}>
                {styledCardLoading ? 'Rendering…' : ''}
              </div>
            )}
          </div>

          {showChrome && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '10px 4px 0' }}>
              {onReply ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReply(confession); }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 17 4 12 9 7" />
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                  Reply
                </button>
              ) : <span />}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* The generated styled card above only ever bakes in the
                    confession's text — an attached photo/video is never part
                    of that image (and was previously not reachable at all
                    when a confession had both a custom style and media) — so
                    this is the only way to actually see it. */}
                {mediaUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPhotoClick) {
                        onPhotoClick({ ...confession, photo_url: mediaUrl, media_url: mediaUrl, media_type: mediaType });
                      } else {
                        setLocalMediaOpen(true);
                      }
                    }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    View attachment
                  </button>
                )}
                <span style={{ fontSize: preset.headerTextSize, color: 'var(--dim)' }}>
                  {relativeTime(confession.created_at)}
                </span>
              </div>
            </div>
          )}
        </div>

        <MediaViewer
          mediaUrl={mediaUrl}
          mediaType={isVideo ? 'video' : 'image'}
          open={localMediaOpen}
          onClose={() => setLocalMediaOpen(false)}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '70%',
        margin: isStory ? 0 : '16px 0',
      }}
    >
      <div style={{ width: '100%', maxWidth: preset.maxWidth }}>
        {/* Header strip — hardcoded "Confession" label, bold rounded
            display font, gradient sticker style. The actual confession
            TEXT is not here — it renders in the greyish body below. */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '20px 20px 0 0',
            background: 'linear-gradient(135deg, #6a5cf5 0%, #3ea6f7 100%)',
            border: '1px solid var(--glass-border)',
            borderBottom: 'none',
          }}
        >
          <div
            style={{
              fontFamily: HEADER_FONT_STACK,
              fontSize: preset.headerFontSize,
              fontWeight: 700,
              lineHeight: 1.3,
              color: '#fff',
              textAlign: 'center',
              textShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            Confession
          </div>
        </div>

        {/* Body */}
        <div
          onClick={handleBodyTap}
          style={{
            background: 'var(--glass-white)',
            border: '1px solid var(--glass-border)',
            borderTop: 'none',
            borderRadius: '0 0 20px 20px',
            overflow: 'hidden',
            cursor: isStory ? 'pointer' : 'default',
            position: 'relative',
          }}
        >
          <AuthorOverlay />
          {mediaUrl && (isVideo || isImage) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (onPhotoClick) {
                  onPhotoClick({
                    ...confession,
                    photo_url: mediaUrl,
                    media_url: mediaUrl,
                    media_type: mediaType,
                  });
                } else {
                  setLocalMediaOpen(true);
                }
              }}
              style={{
                width: '100%',
                aspectRatio: '4 / 5',
                background: 'var(--ink-2)',
                cursor: isStory || onPhotoClick ? 'pointer' : 'zoom-in',
                position: 'relative',
              }}
            >
              {isVideo ? (
                <video
                  src={mediaUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  muted
                  playsInline
                  loop
                  autoPlay
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Confession attachment"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}

              {isVideo && (
                <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.45)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* Voice notes / generic files — not photo-frameable, so instead
              of the 4:5 image area this is a compact row with a direct
              "View attachment" link out to the file. */}
          {isOtherAttachment && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 18px',
                background: 'var(--ink-2)',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 18 }}>{attachmentMeta.emoji}</span>
              <span style={{ color: 'var(--paper)', fontSize: preset.textSize - 1.5, fontWeight: 700 }}>{attachmentMeta.label}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--ember)', fontSize: 12.5, fontWeight: 800 }}>View attachment</span>
            </a>
          )}

          {confession.text && (
            <div
              style={{
                padding: preset.bodyPadding,
                fontSize: preset.textSize,
                color: 'var(--paper)',
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                textAlign: 'center',
              }}
            >
              {confession.text}
            </div>
          )}

          {showChrome && <BottomRow />}
        </div>
      </div>

      {/* Local fallback MediaViewer */}
      <MediaViewer
        mediaUrl={mediaUrl}
        mediaType={isVideo ? 'video' : 'image'}
        open={localMediaOpen}
        onClose={() => setLocalMediaOpen(false)}
      />
    </div>
  );
}
