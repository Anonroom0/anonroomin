/** ===========================================================================
 * CONFESSION BUBBLE — shared NGL-style confession card
 * ============================================================================
 * <ConfessionBubble
 *   confession={{ id, text, photo_url, is_anon, created_at, group }}
 *   onReply?
 *   size="inline"|"feed"|"story"
 *   userId
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
 * then the confession text, then a bottom row with a reply affordance and
 * an embedded ReactionBar scoped to targetType="confession".
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
 * optional photo, shared verbatim across all three surfaces instead of
 * being reimplemented per-page.
 *
 * Dependencies: React, src/components/shared/ReactionBar.jsx
 * ========================================================================= */

import React, { useState } from 'react';
import ReactionBar from './ReactionBar';

// ============================================================================
// 1. SIZE PRESETS
// ============================================================================
// Each size only varies width/padding/text-scale — the structural shape
// (header strip -> glass body -> image -> text -> bottom row) is identical.
const SIZE_PRESETS = {
  inline: {
    maxWidth: 340,
    bodyPadding: '14px 16px',
    textSize: 15,
    headerTextSize: 12,
  },
  feed: {
    maxWidth: 420,
    bodyPadding: '16px 18px',
    textSize: 16,
    headerTextSize: 12.5,
  },
  story: {
    maxWidth: 480,
    bodyPadding: '20px 20px',
    textSize: 18,
    headerTextSize: 13,
  },
};

// ============================================================================
// 2. UTILITY
// ============================================================================

/**
 * Relative timestamp for the header strip — matches the same rough
 * granularity (today/yesterday-style buckets collapse to hours/days) other
 * relative-time helpers in the app use, kept local since this is the only
 * place ConfessionBubble needs it.
 */
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

// ============================================================================
// 3. MAIN EXPORT
// ============================================================================

export default function ConfessionBubble({ confession, onReply, onPhotoClick, size = 'inline', userId, showReactions = true }) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.inline;
  const isStory = size === 'story';

  // Story mode starts with chrome hidden and reveals it on a single tap —
  // the IG/NGL convention. Other sizes always show their chrome.
  const [storyChromeVisible, setStoryChromeVisible] = useState(false);
  const showChrome = !isStory || storyChromeVisible;

  function handleBodyTap() {
    if (isStory) setStoryChromeVisible((v) => !v);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center', // always centered — never left/right aligned
        width: '100%',
        margin: isStory ? 0 : '16px 0',
      }}
    >
      <div style={{ width: '100%', maxWidth: preset.maxWidth }}>
        {/* Header strip: --ember at low opacity, label + relative timestamp */}
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

        {/* Body: rectangular --glass-white, 20px radius (header strip already
            rounds the top corners, so the body only rounds the bottom two
            here to read as one continuous card). */}
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
          {confession.photo_url && (
            <div
              onClick={(e) => {
                // The photo has its own tap target: everywhere else on the
                // card (background, text, reply/react row) tapping toggles
                // the reaction tray via the caller's outer onClick, but
                // tapping the photo itself should always open it full-screen
                // in the media viewer instead — so this stops that outer
                // handler from ever seeing the click.
                e.stopPropagation();
                if (isStory) { handleBodyTap(); return; }
                if (onPhotoClick) onPhotoClick(confession);
              }}
              style={{
                width: '100%',
                aspectRatio: '4 / 5',
                background: 'var(--ink-2)',
                cursor: isStory || onPhotoClick ? 'pointer' : 'default',
              }}
            >
              <img
                src={confession.photo_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
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

          {/* Bottom row: reply affordance + reactions. In story mode this
              stays hidden until the chrome is revealed by a tap. */}
          {showChrome && (onReply || showReactions) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: `10px ${preset.bodyPadding.split(' ')[1]} 14px`,
                borderTop: confession.text || confession.photo_url ? '1px solid var(--glass-border)' : 'none',
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
              ) : (
                <span />
              )}

              {showReactions ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <ReactionBar targetType="confession" targetId={confession.id} userId={userId} />
                </div>
              ) : (
                <span />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}