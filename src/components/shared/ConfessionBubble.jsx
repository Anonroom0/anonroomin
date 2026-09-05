/** ===========================================================================
 * CONFESSION BUBBLE — shared NGL-style confession card
 * ============================================================================
 * <ConfessionBubble
 *   confession={{
 *     id, text, photo_url, is_anon, created_at, group,
 *     kind,          // optional: "confession" | "reply" | "question"
 *     header_label,  // optional: overrides the header strip's label text
 *     header_style,  // optional: { variant, from, to, angle, solid,
 *                     //   patternId, patternColor, base, textColor, fontFamily }
 *   }}
 *   onReply?
 *   size="inline"|"feed"|"story"
 * />
 *
 * One shared component behind three call sites:
 *   - GroupChat.jsx      (size="inline") — a confession/reply/question
 *                          posted into a group thread, rendered inline
 *                          among regular messages
 *   - ConfessionsFeed.jsx (size="feed")   — the public confessions feed
 *   - StoryViewer.jsx     (size="story")  — full-screen story body
 *
 * Always horizontally centered — never left/right-aligned like a normal
 * chat bubble, regardless of size. Structure is fixed across all three
 * sizes: a header strip carries a short bold label (rounded display font,
 * NGL-sticker style) sitting above a rectangular --glass-white body (20px
 * radius) that carries the actual confession TEXT, a reserved 4:5 image
 * area (only rendered when photo_url is present), then a bottom row with
 * a reply affordance on the left and the relative timestamp on the right.
 *
 * Header customization — confession.kind / header_label / header_style:
 *   - kind: "confession" | "reply" | "question" (default "confession")
 *     picks the default label shown in the strip ("Confession" / "Reply"
 *     / "Question") — lets this same card double as a reply/question
 *     bubble in the group thread, not just a confession.
 *   - header_label: a string that fully overrides that default label with
 *     any custom text.
 *   - header_style: { variant, textColor, fontFamily, ... } — controls the
 *     strip's look:
 *       variant: "gradient" (default) → { from, to, angle }
 *       variant: "solid"               → { solid }  (one bold flat color)
 *       variant: "pattern"             → { patternId, patternColor, base }
 *         reuses the same pattern vocabulary as ShareStorySheet's own
 *         Background carousel (storyStylePresets.js), just tiled larger
 *         to fit a full-width strip instead of a small swatch.
 *     The header TEXT itself is always rendered bold — that's fixed, not
 *     part of header_style — only its copy, color, and font vary.
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
import { BACKGROUND_STRUCTURES, getPresetById } from '../../lib/storyStylePresets';

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

// ---------------------------------------------------------------------------
// Header strip customization (see the file banner above for the full
// confession.kind / header_label / header_style contract).
// ---------------------------------------------------------------------------
const DEFAULT_HEADER_STYLE = {
  variant: 'gradient',
  from: '#6a5cf5',
  to: '#3ea6f7',
  angle: 135,
  textColor: '#fff',
};

// Default label per bubble "kind" — falls back to "Confession" for anything
// unrecognized so existing callers that never pass `kind` are unaffected.
const HEADER_KIND_LABELS = {
  confession: 'Confession',
  reply: 'Reply',
  question: 'Question',
};

// Same pattern vocabulary as ShareStorySheet's own structureSwatchStyle,
// just tiled larger (this strip is a lot wider than a small carousel
// thumbnail) and driven by whatever accent/base color header_style
// specifies instead of one fixed neutral tone.
function headerPatternStyle(patternId, accentColor, baseColor) {
  const structure = getPresetById(BACKGROUND_STRUCTURES, patternId) || BACKGROUND_STRUCTURES[0];
  const accent = accentColor || 'rgba(255,255,255,0.55)';
  const base = baseColor || '#4b3f9e';
  switch (structure.type) {
    case 'solid':
      return { background: base };
    case 'linear':
      return { background: `linear-gradient(135deg, ${base}, #14162e)` };
    case 'radial':
      return { background: `radial-gradient(circle at 30% 25%, ${accent}, ${base})` };
    case 'dots':
    case 'halftone':
      return { background: base, backgroundImage: `radial-gradient(${accent} 2.5px, transparent 2.5px)`, backgroundSize: '18px 18px' };
    case 'grid':
    case 'pinstripe':
      return {
        background: base,
        backgroundImage: `linear-gradient(${accent} 1.5px, transparent 1.5px), linear-gradient(90deg, ${accent} 1.5px, transparent 1.5px)`,
        backgroundSize: '16px 16px',
      };
    case 'checker':
      return {
        background: base,
        backgroundImage: `linear-gradient(45deg, ${accent} 25%, transparent 25%, transparent 75%, ${accent} 75%), linear-gradient(45deg, ${accent} 25%, transparent 25%, transparent 75%, ${accent} 75%)`,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 10px 10px',
      };
    case 'stripes':
    case 'crosshatch':
      return { background: base, backgroundImage: `repeating-linear-gradient(-22deg, ${accent} 0 5px, transparent 5px 16px)` };
    case 'confetti':
      return {
        background: base,
        backgroundImage: `radial-gradient(${accent} 2px, transparent 2px), radial-gradient(#fff 1.5px, transparent 1.5px)`,
        backgroundSize: '20px 20px, 14px 14px',
        backgroundPosition: '0 0, 7px 6px',
      };
    case 'waves':
      return { background: base, backgroundImage: `radial-gradient(circle, ${accent} 30%, transparent 31%)`, backgroundSize: '20px 12px' };
    case 'sunburst':
      return { background: `conic-gradient(${accent} 0 10deg, transparent 10deg 20deg)`, backgroundColor: base };
    default:
      return { background: base };
  }
}

// Resolves confession.header_style against DEFAULT_HEADER_STYLE and returns
// the CSS background to apply to the header strip itself.
function buildHeaderBackground(headerStyle) {
  const resolved = { ...DEFAULT_HEADER_STYLE, ...(headerStyle || {}) };
  if (resolved.variant === 'solid') return { background: resolved.solid || DEFAULT_HEADER_STYLE.from };
  if (resolved.variant === 'pattern') return headerPatternStyle(resolved.patternId, resolved.patternColor, resolved.base);
  return { background: `linear-gradient(${resolved.angle ?? 135}deg, ${resolved.from} 0%, ${resolved.to} 100%)` };
}

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

  // Header strip content — see the file banner above for the full
  // kind / header_label / header_style contract. `headerLabel` decides
  // what word shows in the strip; `resolvedHeaderStyle` / `headerBackground`
  // decide how the strip is painted. The label text is always rendered
  // bold regardless of what header_style specifies.
  const headerKind = confession.kind || 'confession';
  const headerLabel = confession.header_label || HEADER_KIND_LABELS[headerKind] || HEADER_KIND_LABELS.confession;
  const resolvedHeaderStyle = { ...DEFAULT_HEADER_STYLE, ...(confession.header_style || {}) };
  const headerBackground = buildHeaderBackground(confession.header_style);

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
        {/* Header strip — label and background are both customizable per
            confession (headerLabel / headerBackground, derived above from
            kind / header_label / header_style). The label text is always
            bold, no matter what header_style specifies. The actual
            confession TEXT is not here — it renders in the greyish body
            below. */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '20px 20px 0 0',
            ...headerBackground,
            border: '1px solid var(--glass-border)',
            borderBottom: 'none',
          }}
        >
          <div
            style={{
              fontFamily: resolvedHeaderStyle.fontFamily || HEADER_FONT_STACK,
              fontSize: preset.headerFontSize,
              fontWeight: 800, // always bold — fixed, not part of header_style
              lineHeight: 1.3,
              color: resolvedHeaderStyle.textColor || '#fff',
              textAlign: 'center',
              textShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            {headerLabel}
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
