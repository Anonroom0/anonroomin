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
 * sizes: an --ember, low-opacity header strip ("Confession" + relative
 * timestamp) sits above a rectangular --glass-white body (20px radius)
 * with a reserved 4:5 image area (only rendered when photo_url is present),
 * then the confession text, then a bottom row with a reply affordance.
 * (Reactions were previously shown here via an embedded ReactionBar, but
 * that has been removed from this component — callers that still want a
 * reaction bar for a confession render their own ReactionBar externally,
 * e.g. GroupChat.jsx and StoryViewer.jsx already do.)
 *
 * size="story" fills more of the screen and auto-hides the reply/react
 * chrome until the viewer taps once — the IG/NGL story convention
 * StoryViewer.jsx relies on. Tapping again (or the caller re-mounting on
 * story change) can re-hide it; this component only owns the show/hide
 * state itself, keyed off its own tap handler.
 *
 * This preserves the same underlying content GroupChat.jsx already rendered
 * inline for is_confession messages (a labeled, gradient-tinted bubble with
 * the confession text and a reply affordance) — restyled to the header-
 * strip + glass-body structure specified here, now with reactions and an
 * optional photo/video, shared verbatim across all three surfaces instead of
 * being reimplemented per-page.
 *
 * Dependencies: React, src/components/shared/ReactionBar.jsx, MediaViewer.jsx
 * ========================================================================= */
/** ===========================================================================
 * CONFESSION BUBBLE — shared NGL-style confession card
 * ============================================================================
 */

import React, { useState } from 'react';
import MediaViewer from '../../pages/MediaViewer';

const SIZE_PRESETS = {
  inline: {
    maxWidth: 300,
    bodyPadding: '16px 18px',
    textSize: 15.5,
    headerTextSize: 11.5,
  },
  feed: {
    maxWidth: 380,
    bodyPadding: '18px 20px',
    textSize: 16.5,
    headerTextSize: 12,
  },
  story: {
    maxWidth: 340,
    bodyPadding: '22px 22px',
    textSize: 19,
    headerTextSize: 12.5,
  },
};

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

  const mediaUrl = confession.photo_url || confession.media_url;
  const mediaType = detectMediaType(mediaUrl, confession.media_type);
  const isVideo = mediaType === 'video';

  function handleBodyTap() {
    if (isStory) setStoryChromeVisible((v) => !v);
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
        {/* Header strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: '16px 16px 0 0',
            background: 'color-mix(in srgb, var(--ember) 16%, transparent)',
            border: '1px solid var(--glass-border)',
            borderBottom: 'none',
          }}
        >
          <span
            style={{
              fontSize: preset.headerTextSize,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: 'var(--ember)',
            }}
          >
            Confession
          </span>
          <span style={{ fontSize: preset.headerTextSize, color: 'var(--dim)' }}>·</span>
          <span style={{ fontSize: preset.headerTextSize, color: 'var(--dim)' }}>
            {relativeTime(confession.created_at)}
          </span>
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
          }}
        >
          {mediaUrl && (
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

          {showChrome && onReply && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 10,
                padding: `10px ${preset.bodyPadding.split(' ')[1]} 14px`,
                borderTop: confession.text || mediaUrl ? '1px solid var(--glass-border)' : 'none',
              }}
            >
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
            </div>
          )}
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
