/** ===========================================================================
 * SHARE STORY SHEET (v6)
 * ============================================================================
 * <ShareStorySheet open onClose mode question reply message /> — a
 * GlassPanel sheet that turns a question ('mode="question"', the original
 * behavior), a single reply someone received ('mode="reply"' — see
 * QuestionThread.jsx's per-bubble share button), or a chat message/
 * confession ('mode="message"' — see GroupChat.jsx's "Share as Story"
 * action) into a shareable 1080x1920 story image.
 *
 * v6 changes, on top of v5:
 *   - Every style pick (Background, Colour, Shape, Size) starts from a
 *     random preset each time the sheet opens, instead of always landing
 *     on the first item in each list.
 *   - A "Random" button in the header reshuffles all four at any time.
 *   - Background and Shape are no longer tap-to-select strips with a
 *     moving highlight border. They're centre-locked scroll wheels: a
 *     fixed highlight window sits in the middle of the strip and never
 *     moves, and scrolling brings a different item to rest under it,
 *     picker-wheel style. Tapping an item still scrolls it to centre as
 *     a shortcut, but the selection itself is driven by scroll position
 *     (see useWheelCarousel below), not by clicks.
 *   - Colour (colour wheel modal) and Size (dropdown) are unchanged from
 *     v5.
 * Every pick still drives the same live canvas preview.
 *
 * `question` needs an `id` (for the reply link) plus its text/type fields.
 * `reply` (mode="reply" only) needs its own reply text. `message`
 * (mode="message" only) needs an `id` (for the message link — see
 * buildMessageUrl), its text, sender_name, avatar_url, and is_anon —
 * GroupChat.jsx normalizes both group_messages rows and confession rows
 * into this same flat shape before opening the sheet. Column-name guesses
 * are centralized just below — flip them if the real schema differs.
 * ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GlassPanel, { useGlassPanelClose } from '../shared/GlassPanel';
import StoryTutorial, { shouldShowStoryTutorial } from '../shared/StoryTutorial';
import MediaViewer from '../../pages/MediaViewer';
import {
  generateStoryImage,
  shareStoryImage,
  LINK_ZONE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../../lib/storyImageGenerator';
import { BACKGROUND_STRUCTURES, ACCENT_COLORS, BODY_SHAPES, BODY_SCALES, getPresetById } from '../../lib/storyStylePresets';
import { buildQuestionPath, toShortId } from '../../lib/subdomain';
import { showToast, friendlyDbError } from '../../lib/toast';
import { hapticSelect, hapticImpact, hapticTap, hapticSheet } from '../../lib/haptics';
import { playTap, playSend, playOpen, playClose } from '../../lib/soundManager';

// See the file banner above — flip these if the real column names differ.
const QUESTION_TEXT_FIELD = 'text';
const QUESTION_TYPE_FIELD = 'type';
const REPLY_TEXT_FIELD = 'reply_text';
const MESSAGE_TEXT_FIELD = 'text';
const MESSAGE_SENDER_FIELD = 'sender_name';
const MESSAGE_AVATAR_FIELD = 'avatar_url';
const MESSAGE_MEDIA_URL_FIELD = 'media_url';
const MESSAGE_MEDIA_TYPE_FIELD = 'media_type';
const MESSAGE_IS_CONFESSION_FIELD = 'is_confession';

// Same emoji/label vocabulary GroupChat.jsx's own generateReplySnippet uses,
// so an attachment reads the same way here as it does in the chat itself.
function attachmentMeta(mediaType) {
  switch (mediaType) {
    case 'image': return { emoji: '📸', label: 'Photo' };
    case 'video': return { emoji: '🎬', label: 'Video' };
    case 'audio': return { emoji: '🎵', label: 'Voice message' };
    case 'gif': return { emoji: '🎞️', label: 'GIF' };
    case 'sticker': return { emoji: '🏷️', label: 'Sticker' };
    default: return { emoji: '📄', label: 'Attachment' };
  }
}

const PREVIEW_ASPECT_RATIO = 1080 / 1920;
// Derived straight from storyImageGenerator.js's own LINK_ZONE (not
// duplicated by hand here) so the preview guide can never drift out of
// sync with where the actual export leaves empty.
const LINK_ZONE_FRACTION = {
  top: LINK_ZONE.y / CANVAS_HEIGHT,
  height: LINK_ZONE.height / CANVAS_HEIGHT,
  left: LINK_ZONE.x / CANVAS_WIDTH,
  width: LINK_ZONE.width / CANVAS_WIDTH,
};

function buildReplyUrl(questionId) {
  return `https://anonroom.in${buildQuestionPath(questionId)}`;
}

// mode="message" only — a deep link back to the exact chat message, matching
// the `#msg-<shortId>` anchor GroupChat.jsx's own "Share" reaction action
// already copies (see GroupChat.jsx), so both point at the same place.
function buildMessageUrl(messageId) {
  if (typeof window === 'undefined' || !messageId) return '';
  return `${window.location.origin}${window.location.pathname}#msg-${toShortId(messageId)}`;
}

// ---------------------------------------------------------------------------
// Random helpers — used both for the initial pick when the sheet opens and
// for the Random button. Excludes the current id where possible so hitting
// Random always visibly changes something.
// ---------------------------------------------------------------------------
function randomId(list, excludeId) {
  if (!list || list.length === 0) return undefined;
  if (list.length === 1) return list[0].id;
  let pick;
  do {
    pick = list[Math.floor(Math.random() * list.length)].id;
  } while (pick === excludeId);
  return pick;
}

const ChevronIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ShuffleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

// ---------------------------------------------------------------------------
// Background carousel — Background structures no longer carry their own
// fixed colors (see storyStylePresets.js), so every thumbnail here previews
// its pattern in one fixed neutral tone, regardless of whichever accent
// Colour happens to be selected elsewhere. Keeps the strip legible and
// consistent no matter what color is picked.
// ---------------------------------------------------------------------------
const NEUTRAL_BASE = '#1C1D24';
const NEUTRAL_ACCENT = 'rgba(255,107,53,0.5)';

function structureSwatchStyle(bg) {
  switch (bg.type) {
    case 'solid':
      return { background: NEUTRAL_BASE };
    case 'linear':
      return { background: `linear-gradient(135deg, ${NEUTRAL_BASE}, #0C0D10)` };
    case 'radial':
      return { background: `radial-gradient(circle at 35% 30%, #FF6B35, ${NEUTRAL_BASE})` };
    case 'dots':
    case 'halftone':
      return { background: NEUTRAL_BASE, backgroundImage: `radial-gradient(${NEUTRAL_ACCENT} 1.5px, transparent 1.5px)`, backgroundSize: '8px 8px' };
    case 'grid':
    case 'pinstripe':
      return {
        background: NEUTRAL_BASE,
        backgroundImage: `linear-gradient(${NEUTRAL_ACCENT} 1px, transparent 1px), linear-gradient(90deg, ${NEUTRAL_ACCENT} 1px, transparent 1px)`,
        backgroundSize: '7px 7px',
      };
    case 'checker':
      return {
        background: NEUTRAL_BASE,
        backgroundImage: `linear-gradient(45deg, ${NEUTRAL_ACCENT} 25%, transparent 25%, transparent 75%, ${NEUTRAL_ACCENT} 75%), linear-gradient(45deg, ${NEUTRAL_ACCENT} 25%, transparent 25%, transparent 75%, ${NEUTRAL_ACCENT} 75%)`,
        backgroundSize: '9px 9px',
        backgroundPosition: '0 0, 4.5px 4.5px',
      };
    case 'stripes':
    case 'crosshatch':
      return { background: NEUTRAL_BASE, backgroundImage: `repeating-linear-gradient(-22deg, ${NEUTRAL_ACCENT} 0 3px, transparent 3px 8px)` };
    case 'confetti':
      return {
        background: NEUTRAL_BASE,
        backgroundImage: 'radial-gradient(#FF6B35 1.4px, transparent 1.4px), radial-gradient(#8B5CF6 1.4px, transparent 1.4px), radial-gradient(#2DD4A7 1.4px, transparent 1.4px)',
        backgroundSize: '9px 9px, 11px 11px, 7px 7px',
        backgroundPosition: '0 0, 3px 5px, 6px 1px',
      };
    case 'waves':
      return { background: NEUTRAL_BASE, backgroundImage: `radial-gradient(circle, ${NEUTRAL_ACCENT} 30%, transparent 31%)`, backgroundSize: '10px 6px' };
    case 'sunburst':
      return { background: `conic-gradient(${NEUTRAL_ACCENT} 0 10deg, transparent 10deg 20deg)`, backgroundColor: NEUTRAL_BASE };
    default:
      return { background: NEUTRAL_BASE };
  }
}

// ---------------------------------------------------------------------------
// useWheelCarousel — shared engine behind Background & Shape.
//
// The highlight "window" is a fixed overlay centred over the strip; it
// never moves. What moves is the strip itself: scroll-snap brings whichever
// item is nearest to centre to rest exactly under the window. Selection
// commits (calls onChange) only once scrolling settles, after a short
// debounce, so flicking through doesn't fire onChange on every frame.
//
// `liveIndex` updates continuously (via rAF) purely for visual feedback
// (scale/opacity) while the user is still scrolling, so the wheel feels
// alive before the selection actually commits.
//
// When `selectedId` changes from outside (mount with a random pick, or the
// Random button), the strip animates so that item slides under the fixed
// window — again, the window itself stays put.
// ---------------------------------------------------------------------------
function useWheelCarousel({ items, selectedId, onChange, itemWidth }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [liveIndex, setLiveIndex] = useState(() => Math.max(0, items.findIndex((it) => it.id === selectedId)));
  const settleTimeoutRef = useRef(null);
  const rafRef = useRef(null);
  const programmaticRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // `commit`, when true, is a direct tap on an item rather than a settle
  // after free scrolling — that's a selection made right now, not just a
  // scroll-to, so it applies immediately instead of waiting for handleScroll's
  // settle timeout to notice (which it never would: programmaticRef stays
  // true for the whole smooth-scroll animation, and handleScroll bails out
  // early whenever that's set — see below). Without this, tapping an item
  // would slide it to center but never actually select it.
  function scrollToIndex(idx, behavior = 'smooth', commit = false) {
    const el = containerRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTo({ left: idx * itemWidth, behavior });
    setLiveIndex(idx);
    window.clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = window.setTimeout(() => {
      programmaticRef.current = false;
    }, 400);
    if (commit) {
      const item = items[idx];
      if (item && item.id !== selectedId) {
        hapticSelect();
        playTap();
        onChange(item.id);
      }
    }
  }

  useEffect(() => {
    if (containerWidth === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.max(0, items.findIndex((it) => it.id === selectedId));
    const target = idx * itemWidth;
    if (Math.abs(el.scrollLeft - target) > 1) {
      scrollToIndex(idx, el.scrollLeft === 0 ? 'auto' : 'smooth');
    } else {
      setLiveIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, containerWidth]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / itemWidth)));
      setLiveIndex(idx);
    });

    if (programmaticRef.current) return;
    window.clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = window.setTimeout(() => {
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / itemWidth)));
      const item = items[idx];
      el.scrollTo({ left: idx * itemWidth, behavior: 'smooth' });
      if (item && item.id !== selectedId) {
        hapticSelect();
        playTap();
        onChange(item.id);
      }
    }, 130);
  }

  const sidePadding = containerWidth > 0 ? Math.max(0, (containerWidth - itemWidth) / 2) : 0;

  return { containerRef, sidePadding, handleScroll, scrollToIndex, liveIndex };
}

function BackgroundCarousel({ selectedId, onChange }) {
  const ITEM_WIDTH = 74;
  const { containerRef, sidePadding, handleScroll, scrollToIndex, liveIndex } = useWheelCarousel({
    items: BACKGROUND_STRUCTURES,
    selectedId,
    onChange,
    itemWidth: ITEM_WIDTH,
  });
  const current = getPresetById(BACKGROUND_STRUCTURES, selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>Background</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <div style={{ position: 'relative' }}>
        {/* Fixed centre window — never moves. The strip scrolls under it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: 4,
            transform: 'translateX(-50%)',
            width: 58,
            height: 58,
            borderRadius: 16,
            border: '3px solid var(--ember)',
            boxShadow: '0 0 0 2px rgba(255,107,53,0.25)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="custom-scrollbar"
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            padding: `4px ${sidePadding}px 8px`,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {BACKGROUND_STRUCTURES.map((bg, i) => {
            const centered = i === liveIndex;
            return (
              <button
                key={bg.id}
                type="button"
                aria-pressed={centered}
                onClick={() => scrollToIndex(i, 'smooth', true)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  width: ITEM_WIDTH,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  scrollSnapAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    opacity: centered ? 1 : 0.4,
                    transform: centered ? 'scale(1)' : 'scale(0.84)',
                    transition: 'transform 150ms ease, opacity 150ms ease',
                    ...structureSwatchStyle(bg),
                  }}
                />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: centered ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.15 }}>{bg.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shape carousel — same cheap CSS-approximation swatch used before, now on
// the same centre-locked wheel as Background.
// ---------------------------------------------------------------------------
function shapeSwatchCardStyle(shape) {
  const base = { borderRadius: Math.min(20, shape.radius / 2.4) };
  if (shape.fill === 'ink-2') return { ...base, background: '#1C1D24' };
  if (shape.fill === 'paper') return { ...base, background: '#F4F3F0' };
  if (shape.fill === 'glass') return { ...base, background: 'rgba(255,255,255,0.09)' };
  if (shape.fill === 'gradient-header') return { ...base, background: 'linear-gradient(160deg, rgba(255,107,53,0.4), #1C1D24)' };
  if (shape.fill === 'radial-glow') return { ...base, background: 'radial-gradient(circle at 35% 30%, rgba(255,107,53,0.55), #1C1D24)' };
  if (shape.fill === 'split') return { ...base, background: 'linear-gradient(to bottom, rgba(255,107,53,0.5) 36%, #1C1D24 36%)' };
  return { ...base, background: 'transparent' };
}

function shapeSwatchBorderStyle(border) {
  if (border === 'glass') return { border: '1px solid rgba(255,255,255,0.16)' };
  if (border === 'ember-thin') return { border: '1.5px solid var(--ember)' };
  if (border === 'ember-thick') return { border: '3px solid var(--ember)' };
  if (border === 'glow') return { border: '1.5px solid var(--ember)', boxShadow: '0 0 8px rgba(255,107,53,0.55)' };
  if (border === 'double') return { border: '1px solid rgba(255,255,255,0.22)', outline: '2px solid var(--ember)', outlineOffset: -5 };
  if (border === 'dashed') return { border: '2px dashed var(--ember)' };
  if (border === 'ink-thick') return { border: '3px solid #0C0D10' };
  if (border === 'paper-thick') return { border: '3px solid #F4F3F0' };
  return { border: '1px solid transparent' };
}

function ShapePreviewGlyph({ shape, scale, size = 68 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...shapeSwatchCardStyle(shape),
        ...shapeSwatchBorderStyle(shape.border),
      }}
    >
      <span
        style={{
          fontFamily: shape.fontFamily === 'serif' ? 'Georgia, serif' : shape.fontFamily === 'mono' ? 'ui-monospace, monospace' : 'inherit',
          fontWeight: scale.fontWeight,
          fontSize: 12 + scale.fontScale * 7,
          color: shape.darkText ? '#0C0D10' : '#F4F3F0',
          textTransform: scale.uppercase ? 'uppercase' : 'none',
        }}
      >
        Aa
      </span>
    </div>
  );
}

function ShapeCarousel({ selectedId, onChange, scale }) {
  const ITEM_WIDTH = 84;
  const { containerRef, sidePadding, handleScroll, scrollToIndex, liveIndex } = useWheelCarousel({
    items: BODY_SHAPES,
    selectedId,
    onChange,
    itemWidth: ITEM_WIDTH,
  });
  const current = getPresetById(BODY_SHAPES, selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>Shape</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <div style={{ position: 'relative' }}>
        {/* Fixed centre window — never moves. The strip scrolls under it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: 4,
            transform: 'translateX(-50%)',
            width: 70,
            height: 70,
            borderRadius: 18,
            border: '2.5px solid var(--ember)',
            boxShadow: '0 0 8px rgba(255,107,53,0.4)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="custom-scrollbar"
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            padding: `4px ${sidePadding}px 8px`,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {BODY_SHAPES.map((shape, i) => {
            const centered = i === liveIndex;
            return (
              <button
                key={shape.id}
                type="button"
                aria-pressed={centered}
                onClick={() => scrollToIndex(i, 'smooth', true)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  width: ITEM_WIDTH,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  scrollSnapAlign: 'center',
                }}
              >
                <div
                  style={{
                    opacity: centered ? 1 : 0.4,
                    transform: centered ? 'scale(1)' : 'scale(0.84)',
                    transition: 'transform 150ms ease, opacity 150ms ease',
                    borderRadius: Math.min(20, shape.radius / 2.4),
                  }}
                >
                  <ShapePreviewGlyph shape={shape} scale={scale} size={64} />
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: centered ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.15 }}>{shape.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour — a single circular swatch of the current pick; tapping opens a
// color-wheel modal with every ACCENT_COLORS entry arranged in a circle.
// Unchanged from v5.
// ---------------------------------------------------------------------------
function ColourField({ color, onOpen, label = 'Colour' }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, padding: '10px 12px', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', cursor: 'pointer', minWidth: 0 }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: color.hex, border: '2px solid var(--glass-border)', flexShrink: 0, boxShadow: '0 0 0 2px var(--ink) inset' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--dim)' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{color.name}</span>
      </div>
    </button>
  );
}

const WHEEL_SIZE = 260;
const WHEEL_RADIUS = 104;
const WHEEL_SWATCH = 32;

function ColorWheelModal({ selectedId, onPick, onClose, title = 'Colour' }) {
  useEffect(() => {
    hapticSheet();
    playOpen();
  }, []);

  function handleClose() {
    hapticSheet();
    playClose();
    onClose();
  }

  const selectedColor = getPresetById(ACCENT_COLORS, selectedId);
  const center = WHEEL_SIZE / 2;

  // Portaled to document.body — GlassPanel's sheet wrapper animates via a
  // CSS `transform`, which creates a new containing block for `position:
  // fixed` descendants. Left un-portaled, this modal would end up
  // positioned/clipped relative to that transformed sheet instead of the
  // real viewport.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000, // above GlassPanel's own 99999 top layer
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 340,
          background: 'var(--ink)',
          borderRadius: 28,
          border: '1px solid var(--glass-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 16px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--paper)' }}>{title}</span>
          <button type="button" onClick={handleClose} style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 14, fontWeight: 800, padding: '6px 4px' }}>
            Done
          </button>
        </div>

        <div style={{ position: 'relative', width: WHEEL_SIZE, height: WHEEL_SIZE, margin: '8px 0 4px', flexShrink: 0 }}>
          {ACCENT_COLORS.map((c, i) => {
            const angle = (i / ACCENT_COLORS.length) * Math.PI * 2 - Math.PI / 2;
            const x = center + WHEEL_RADIUS * Math.cos(angle) - WHEEL_SWATCH / 2;
            const y = center + WHEEL_RADIUS * Math.sin(angle) - WHEEL_SWATCH / 2;
            const selected = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-pressed={selected}
                onClick={() => { if (!selected) { hapticSelect(); playTap(); onPick(c.id); } }}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: WHEEL_SWATCH,
                  height: WHEEL_SWATCH,
                  borderRadius: '50%',
                  background: c.hex,
                  cursor: 'pointer',
                  padding: 0,
                  border: selected ? '3px solid var(--paper)' : '2px solid rgba(255,255,255,0.14)',
                  boxShadow: selected ? '0 0 0 3px var(--ember)' : '0 2px 6px rgba(0,0,0,0.35)',
                  transform: selected ? 'scale(1.14)' : 'scale(1)',
                  transition: 'transform 120ms ease, box-shadow 120ms ease',
                }}
              />
            );
          })}

          {/* Center preview of whichever color is currently selected */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: center - 42,
              top: center - 42,
              width: 84,
              height: 84,
              borderRadius: '50%',
              background: 'var(--ink-2)',
              border: '1px solid var(--glass-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: selectedColor.hex, border: '2px solid var(--glass-border)' }} />
          </div>
        </div>

        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--paper)', marginTop: 4 }}>{selectedColor.name}</span>
      </div>
    </div>,
    document.body
  );
}

function SizeField({ scaleId, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, padding: '10px 12px', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--dim)' }}>Size</span>
      </div>
      <select
        value={scaleId}
        onChange={(e) => { hapticSelect(); playTap(); onChange(e.target.value); }}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: 'var(--ink-2)',
          color: 'var(--paper)',
          border: '1px solid var(--glass-border)',
          borderRadius: 12,
          padding: '10px 30px 10px 14px',
          fontSize: 14,
          fontWeight: 700,
          backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2718%27 height=%2718%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%238B8B96%27 stroke-width=%272.5%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27><polyline points=%276 9 12 15 18 9%27/></svg>")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
        }}
      >
        {BODY_SCALES.map((s) => (
          <option key={s.id} value={s.id} style={{ background: 'var(--ink-2)', color: 'var(--paper)' }}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

export default function ShareStorySheet({ open, onClose, mode = 'question', question, reply, message, customizable = true, lockedStyle = null }) {
  if (!open) return null;
  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <ShareStorySheetContent mode={mode} question={question} reply={reply} message={message} customizable={customizable} lockedStyle={lockedStyle} />
    </GlassPanel>
  );
}

function ShareStorySheetContent({ mode, question, reply, message, customizable, lockedStyle }) {
  const requestClose = useGlassPanelClose();

  // customizable=false (see StoryViewer's "Share as Story" menu action) skips
  // all of that: it pins the four fields to whatever style is already on the
  // item (lockedStyle, e.g. a confession's saved story_style) and forces the
  // 'basic' template so that style actually renders — or, when the item was
  // never customized in the first place (lockedStyle is null), pins to the
  // fixed 'tweet' ("Standard") template instead. Either way no random pick,
  // no Random button, no customization strips — there is nothing to change.
  const [backgroundId, setBackgroundId] = useState(() => (!customizable && lockedStyle) ? lockedStyle.backgroundId : randomId(BACKGROUND_STRUCTURES));
  const [colorId, setColorId] = useState(() => (!customizable && lockedStyle) ? lockedStyle.colorId : randomId(ACCENT_COLORS));
  const [shapeId, setShapeId] = useState(() => (!customizable && lockedStyle) ? lockedStyle.shapeId : randomId(BODY_SHAPES));
  const [scaleId, setScaleId] = useState(() => (!customizable && lockedStyle) ? lockedStyle.scaleId : randomId(BODY_SCALES));

  // 'basic' = the fully customizable Background/Colour/Shape/Size system
  // above; 'tweet' = a single fixed, professional realistic-post preset
  // (see storyImageGenerator's drawTweetSlide) — no customization strips,
  // just a toggle. Works for all three modes (question/reply/message).
  const [template, setTemplate] = useState(() => (!customizable ? (lockedStyle ? 'basic' : 'tweet') : 'basic'));

  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // ---------------------------------------------------------------------
  // "Card" template — mirrors ConfessionBubble's own header-strip +
  // glass-body look (see ConfessionBubble.jsx) instead of the realistic
  // 'tweet' preset or the fully-custom 'basic' Background/Shape system.
  // cardHeaderLabel defaults per share mode (Question / Reply / Confession
  // for a confession-flagged message, or plain "Message" otherwise) but is
  // freely editable. cardHeaderVariant picks how the header strip itself is
  // painted — gradient / solid bold color / pattern — each starting from a
  // random pick on open, same convention as the 'basic' fields above. The
  // header TEXT is always rendered bold regardless of any of this — that's
  // fixed, never exposed as a toggle here.
  // ---------------------------------------------------------------------
  const [cardHeaderLabel, setCardHeaderLabel] = useState(() => {
    if (mode === 'question') return 'Question';
    if (mode === 'reply') return 'Reply';
    return message?.[MESSAGE_IS_CONFESSION_FIELD] === true ? 'Confession' : 'Message';
  });
  const [cardHeaderVariant, setCardHeaderVariant] = useState(() =>
    randomId([{ id: 'gradient' }, { id: 'solid' }, { id: 'pattern' }])
  );
  const [cardHeaderFromId, setCardHeaderFromId] = useState(() => randomId(ACCENT_COLORS));
  const [cardHeaderToId, setCardHeaderToId] = useState(() => randomId(ACCENT_COLORS, cardHeaderFromId));
  const [cardHeaderSolidId, setCardHeaderSolidId] = useState(() => randomId(ACCENT_COLORS));
  const [cardHeaderPatternId, setCardHeaderPatternId] = useState(() => randomId(BACKGROUND_STRUCTURES));
  const [cardHeaderPatternColorId, setCardHeaderPatternColorId] = useState(() => randomId(ACCENT_COLORS));
  const [cardHeaderTextColor, setCardHeaderTextColor] = useState('light'); // 'light' | 'dark'
  // Which color field the shared ColorWheelModal is currently editing for
  // the Card template: null | 'from' | 'to' | 'solid' | 'pattern'.
  const [cardHeaderPickerTarget, setCardHeaderPickerTarget] = useState(null);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const previewUrlRef = useRef(null);
  const renderTokenRef = useRef(null);

  const color = getPresetById(ACCENT_COLORS, colorId);
  const scale = getPresetById(BODY_SCALES, scaleId);
  const cardHeaderFromColor = getPresetById(ACCENT_COLORS, cardHeaderFromId);
  const cardHeaderToColor = getPresetById(ACCENT_COLORS, cardHeaderToId);
  const cardHeaderSolidColor = getPresetById(ACCENT_COLORS, cardHeaderSolidId);
  const cardHeaderPatternColor = getPresetById(ACCENT_COLORS, cardHeaderPatternColorId);

  const questionText = question?.[QUESTION_TEXT_FIELD] || '';
  const questionType = question?.[QUESTION_TYPE_FIELD];
  const replyText = reply?.[REPLY_TEXT_FIELD] || '';
  const messageText = message?.[MESSAGE_TEXT_FIELD] || '';
  const messageSenderName = message?.is_anon ? 'Anonymous' : (message?.[MESSAGE_SENDER_FIELD] || 'Anonymous');
  const messageAvatarUrl = message?.is_anon ? '' : (message?.[MESSAGE_AVATAR_FIELD] || '');
  // The rendered story card only ever shows text (see storyImageGenerator's
  // drawMessageSlide) — it never embeds the real photo/video/file — so
  // whenever the shared message carries an attachment, surface a direct
  // link to it in the sheet itself, rather than leaving no way to see what
  // you're actually about to share.
  const messageMediaUrl = message?.[MESSAGE_MEDIA_URL_FIELD] || '';
  const messageMediaType = message?.[MESSAGE_MEDIA_TYPE_FIELD] || '';
  // mode="message" only — true for a confession-flagged chat message
  // (see GroupChat.jsx's "Share as Story" action on ConfessionBubble),
  // which gets its own "CONFESSION" badge on the rendered story card.
  const isConfession = mode === 'message' && message?.[MESSAGE_IS_CONFESSION_FIELD] === true;
  const [attachmentViewerOpen, setAttachmentViewerOpen] = useState(false);
  // In place of the question's reply link, mode="message" shows/copies a
  // link straight back to that chat message.
  const replyUrl = mode === 'message' ? buildMessageUrl(message?.id) : buildReplyUrl(question?.id);

  // First time anyone reaches this sheet, lead with the tutorial rather
  // than making them go find a help button — shouldShowStoryTutorial()
  // reads the same localStorage flag its own "don't show again" writes to.
  useEffect(() => {
    if (shouldShowStoryTutorial()) setTutorialOpen(true);
  }, []);

  useEffect(() => {
    const token = (renderTokenRef.current = (renderTokenRef.current || 0) + 1);
    setIsRendering(true);

    generateStoryImage({
      kind: mode,
      questionText,
      replyText,
      questionType,
      messageText,
      senderName: messageSenderName,
      avatarUrl: messageAvatarUrl,
      isConfession,
      backgroundId,
      colorId,
      shapeId,
      scaleId,
      template,
      mediaUrl: messageMediaUrl,
      mediaType: messageMediaType,
      // "Card" template only (see the state block above for what each of
      // these controls) — generateStoryImage needs a matching
      // drawCardSlide (or similar) branch for template === 'card' that
      // paints a header strip using these values, then the same text body
      // treatment as drawTweetSlide/drawMessageSlide below it. Passed
      // through unconditionally; harmless for the other two templates,
      // which simply won't read them.
      cardHeaderLabel,
      cardHeaderVariant,
      cardHeaderFrom: cardHeaderFromColor?.hex,
      cardHeaderTo: cardHeaderToColor?.hex,
      cardHeaderAngle: 135,
      cardHeaderSolid: cardHeaderSolidColor?.hex,
      cardHeaderPatternId,
      cardHeaderPatternColor: cardHeaderPatternColor?.hex,
      cardHeaderTextColor: cardHeaderTextColor === 'dark' ? '#0C0D10' : '#FFFFFF',
    })
      .then((blob) => {
        if (renderTokenRef.current !== token) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewBlob(blob);
        setPreviewUrl(url);
        setIsRendering(false);
      })
      .catch(() => {
        if (renderTokenRef.current !== token) return;
        setIsRendering(false);
        showToast(friendlyDbError('Could not render the preview. Please try again.'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode, questionText, replyText, questionType, messageText, messageSenderName, messageAvatarUrl,
    isConfession, backgroundId, colorId, shapeId, scaleId, template, messageMediaUrl, messageMediaType,
    cardHeaderLabel, cardHeaderVariant, cardHeaderFromId, cardHeaderToId, cardHeaderSolidId,
    cardHeaderPatternId, cardHeaderPatternColorId, cardHeaderTextColor,
  ]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function handleRandomize() {
    hapticImpact();
    playTap();
    if (template === 'card') {
      setCardHeaderVariant((prev) => randomId([{ id: 'gradient' }, { id: 'solid' }, { id: 'pattern' }], prev));
      setCardHeaderFromId((prev) => randomId(ACCENT_COLORS, prev));
      setCardHeaderToId((prev) => randomId(ACCENT_COLORS, prev));
      setCardHeaderSolidId((prev) => randomId(ACCENT_COLORS, prev));
      setCardHeaderPatternId((prev) => randomId(BACKGROUND_STRUCTURES, prev));
      setCardHeaderPatternColorId((prev) => randomId(ACCENT_COLORS, prev));
      return;
    }
    setBackgroundId((prev) => randomId(BACKGROUND_STRUCTURES, prev));
    setColorId((prev) => randomId(ACCENT_COLORS, prev));
    setShapeId((prev) => randomId(BODY_SHAPES, prev));
    setScaleId((prev) => randomId(BODY_SCALES, prev));
  }

  async function handleShare() {
    if (!previewBlob || isSharing) return;
    setIsSharing(true);
    hapticImpact();
    playSend();
    try {
      await shareStoryImage(previewBlob, {
        title: mode === 'reply' ? 'A reply I got on Anonroom' : mode === 'message' ? 'A message from Anonroom' : 'Answer this anonymously',
      });
    } catch {
      showToast(friendlyDbError('Could not share the image. Please try again.'));
    } finally {
      setIsSharing(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(replyUrl);
      hapticSelect();
      playTap();
      showToast('Link copied', 'success');
    } catch {
      showToast(friendlyDbError('Could not copy the link.'));
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      padding: '16px 20px 28px',
      maxHeight: 'calc(100dvh - 80px)', // Keeps the modal completely below the top header
      overflowY: 'auto',                // Enables internal scrolling
      overscrollBehavior: 'contain',    // Prevents the background page from scrolling
      WebkitOverflowScrolling: 'touch'  // Enables smooth momentum scrolling on iOS
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--paper)' }}>Share to Story</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {customizable && (template === 'basic' || template === 'card') && (
            <button
              type="button"
              onClick={handleRandomize}
              aria-label="Randomize style"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 800, color: 'var(--ember)', background: 'transparent', border: 'none', padding: '6px 4px' }}
            >
              <ShuffleIcon />
              Random
            </button>
          )}
          <button
            type="button"
            onClick={() => { hapticTap(); setTutorialOpen(true); }}
            style={{ fontSize: 13, fontWeight: 800, color: 'var(--ember)', background: 'transparent', border: 'none', padding: '6px 4px' }}
          >
            See tutorial
          </button>
        </div>
      </div>

      {/* Standard (fixed realistic-post preset) vs Card (header-strip +
          glass-body, mirrors ConfessionBubble) vs Customization (fully
          custom Background/Shape/Colour/Size) — applies to all three share
          modes. Hidden entirely when customizable=false: the template is
          already pinned (to whichever style the item was created with, or
          Standard if it wasn't customized), so there's nothing to switch
          between. */}
      {customizable && (
        <div
          role="tablist"
          aria-label="Story style"
          style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 16, background: 'var(--glass-white)', border: '1px solid var(--glass-border)', flexShrink: 0 }}
        >
          {[
            { id: 'tweet', label: 'Standard' },
            { id: 'card', label: 'Card' },
            { id: 'basic', label: 'Customization' },
          ].map((opt) => {
            const active = template === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { if (!active) { hapticSelect(); playTap(); setTemplate(opt.id); } }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: active ? 'var(--ember)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--dim)',
                  fontSize: 13.5,
                  fontWeight: 800,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto', flexShrink: 0 }}>
        <div
          style={{
            width: '100%',
            aspectRatio: String(PREVIEW_ASPECT_RATIO),
            borderRadius: 20,
            overflow: 'hidden',
            background: 'var(--glass-white)',
            border: '1px solid var(--glass-border)',
            position: 'relative',
          }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Story preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isRendering ? 0.5 : 1, transition: 'opacity 150ms ease' }}
            />
          )}
          {isRendering && !previewUrl && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14 }}>
              Rendering…
            </div>
          )}

          {/* Preview-only guide for where the manual IG link sticker goes —
              small + centered, matching the real (also shrunk) LINK_ZONE
              the export leaves empty. The Standard/tweet template sits on a
              light backdrop, so this flips to a dark guide there instead of
              the white one made for the dark Customization/Card
              backgrounds — otherwise it's invisible against the light card. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: `${LINK_ZONE_FRACTION.top * 100}%`,
              left: `${LINK_ZONE_FRACTION.left * 100}%`,
              width: `${LINK_ZONE_FRACTION.width * 100}%`,
              height: `${LINK_ZONE_FRACTION.height * 100}%`,
              border: template === 'tweet' ? '2px dashed rgba(15,20,25,0.35)' : '2px dashed rgba(255,255,255,0.45)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, color: template === 'tweet' ? 'rgba(15,20,25,0.6)' : 'rgba(255,255,255,0.75)', textAlign: 'center', padding: '0 4px', lineHeight: 1.2 }}>
              Link goes here
            </span>
          </div>
        </div>
      </div>

      {/* Only ever appears for mode="message" — the actual photo/video/file
          is never drawn into the exported story image (the rendered card
          only carries a small "media attached" notice pill — see
          storyImageGenerator's drawMediaAttachedNotice), so this button is
          the only way to see what's actually being shared before sending
          it. Opens the real attachment in the shared MediaViewer lightbox. */}
      {messageMediaUrl && (
        <button
          type="button"
          onClick={() => { hapticTap(); setAttachmentViewerOpen(true); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexShrink: 0,
            width: '100%',
            padding: '12px 16px',
            borderRadius: 16,
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-white)',
            color: 'var(--paper)',
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          <span>{attachmentMeta(messageMediaType).emoji}</span>
          View {attachmentMeta(messageMediaType).label.toLowerCase()}
        </button>
      )}

      {/* Selection strips sit directly below the preview — both are
          centre-locked scroll wheels now: the highlight window is fixed,
          the strip scrolls under it. Only shown for the 'basic' template —
          'tweet' is a single fixed preset with nothing to customize, and
          'card' gets its own header-focused panel just below. Hidden
          entirely when customizable=false — the style is already fixed
          (either the item's own saved style, or Standard), so there's
          nothing here to show or change. */}
      {customizable && template === 'basic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <BackgroundCarousel selectedId={backgroundId} onChange={setBackgroundId} />
          <ShapeCarousel selectedId={shapeId} onChange={setShapeId} scale={scale} />
          <div style={{ display: 'flex', gap: 10 }}>
            <ColourField color={color} onOpen={() => { hapticTap(); setColorPickerOpen(true); }} />
            <SizeField scaleId={scaleId} onChange={setScaleId} />
          </div>
        </div>
      )}

      {customizable && template === 'tweet' && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)', textAlign: 'center', lineHeight: 1.4, flexShrink: 0 }}>
          A fixed, professional realistic-post style — nothing to customize here.
        </p>
      )}

      {/* Card template's own customization panel — header label text plus
          a gradient / bold solid color / pattern background picker for the
          header strip. The header text is always bold no matter what's
          picked here (see the note at the bottom of this panel). */}
      {customizable && template === 'card' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>Header label</span>
            <input
              type="text"
              value={cardHeaderLabel}
              onChange={(e) => setCardHeaderLabel(e.target.value.slice(0, 24))}
              placeholder="Confession"
              maxLength={24}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-white)',
                color: 'var(--paper)',
                fontSize: 14,
                fontWeight: 800,
              }}
            />
          </div>

          <div
            role="tablist"
            aria-label="Header background style"
            style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 16, background: 'var(--glass-white)', border: '1px solid var(--glass-border)' }}
          >
            {[
              { id: 'gradient', label: 'Gradient' },
              { id: 'solid', label: 'Bold color' },
              { id: 'pattern', label: 'Pattern' },
            ].map((opt) => {
              const active = cardHeaderVariant === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => { if (!active) { hapticSelect(); playTap(); setCardHeaderVariant(opt.id); } }}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 12,
                    border: 'none',
                    background: active ? 'var(--ember)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--dim)',
                    fontSize: 12.5,
                    fontWeight: 800,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {cardHeaderVariant === 'gradient' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <ColourField label="From" color={cardHeaderFromColor} onOpen={() => { hapticTap(); setCardHeaderPickerTarget('from'); }} />
              <ColourField label="To" color={cardHeaderToColor} onOpen={() => { hapticTap(); setCardHeaderPickerTarget('to'); }} />
            </div>
          )}

          {cardHeaderVariant === 'solid' && (
            <ColourField label="Colour" color={cardHeaderSolidColor} onOpen={() => { hapticTap(); setCardHeaderPickerTarget('solid'); }} />
          )}

          {cardHeaderVariant === 'pattern' && (
            <>
              <BackgroundCarousel selectedId={cardHeaderPatternId} onChange={setCardHeaderPatternId} />
              <ColourField label="Accent" color={cardHeaderPatternColor} onOpen={() => { hapticTap(); setCardHeaderPickerTarget('pattern'); }} />
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {[{ id: 'light', label: 'White text' }, { id: 'dark', label: 'Dark text' }].map((opt) => {
              const active = cardHeaderTextColor === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { if (!active) { hapticSelect(); playTap(); setCardHeaderTextColor(opt.id); } }}
                  style={{
                    flex: 1,
                    padding: '11px 0',
                    borderRadius: 14,
                    border: '1px solid var(--glass-border)',
                    background: active ? 'var(--ember)' : 'var(--glass-white)',
                    color: active ? 'var(--ink)' : 'var(--paper)',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)', textAlign: 'center' }}>
            Header text is always bold.
          </p>
        </div>
      )}

      <div style={{ flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleShare}
          disabled={!previewBlob || isSharing}
          style={{ width: '100%', padding: '16px 0', borderRadius: 20, border: 'none', background: 'var(--ember)', color: 'var(--ink)', fontSize: 16, fontWeight: 900, opacity: !previewBlob || isSharing ? 0.6 : 1 }}
        >
          {isSharing ? 'Sharing…' : 'Share to Story'}
        </button>
        <p style={{ margin: '8px 0 16px', fontSize: 12, color: 'var(--dim)', lineHeight: 1.4, textAlign: 'center' }}>
          On iPhone this can open Instagram Stories directly with the photo loaded. Everywhere else, pick Instagram from your share sheet — add the link sticker and music yourself once you're in Instagram.
        </p>

        <button
          type="button"
          onClick={handleCopyLink}
          style={{ width: '100%', marginBottom: 10, padding: '14px 16px', borderRadius: 20, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', color: 'var(--paper)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span style={{ fontWeight: 700 }}>Copy Link</span>
          <span style={{ color: 'var(--dim)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{replyUrl}</span>
        </button>

        <button
          type="button"
          onClick={() => { hapticTap(); requestClose(); }}
          style={{ width: '100%', padding: '14px 0', borderRadius: 20, border: 'none', background: 'transparent', color: 'var(--dim)', fontSize: 15, fontWeight: 700 }}
        >
          Cancel
        </button>
      </div>

      {colorPickerOpen && (
        <ColorWheelModal selectedId={colorId} onPick={(id) => setColorId(id)} onClose={() => setColorPickerOpen(false)} />
      )}

      {cardHeaderPickerTarget && (
        <ColorWheelModal
          title={
            cardHeaderPickerTarget === 'from' ? 'From colour'
            : cardHeaderPickerTarget === 'to' ? 'To colour'
            : cardHeaderPickerTarget === 'solid' ? 'Header colour'
            : 'Accent colour'
          }
          selectedId={
            cardHeaderPickerTarget === 'from' ? cardHeaderFromId
            : cardHeaderPickerTarget === 'to' ? cardHeaderToId
            : cardHeaderPickerTarget === 'solid' ? cardHeaderSolidId
            : cardHeaderPatternColorId
          }
          onPick={(id) => {
            if (cardHeaderPickerTarget === 'from') setCardHeaderFromId(id);
            else if (cardHeaderPickerTarget === 'to') setCardHeaderToId(id);
            else if (cardHeaderPickerTarget === 'solid') setCardHeaderSolidId(id);
            else setCardHeaderPatternColorId(id);
          }}
          onClose={() => setCardHeaderPickerTarget(null)}
        />
      )}

      <StoryTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      {messageMediaUrl && (
        <MediaViewer
          mediaUrl={messageMediaUrl}
          mediaType={messageMediaType}
          open={attachmentViewerOpen}
          onClose={() => setAttachmentViewerOpen(false)}
        />
      )}
    </div>
  );
}
