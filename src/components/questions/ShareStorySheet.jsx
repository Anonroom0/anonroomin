/** ===========================================================================
 * SHARE STORY SHEET (v5)
 * ============================================================================
 * <ShareStorySheet open onClose mode question reply /> — a GlassPanel sheet
 * that turns either a question ('mode="question"', the original behavior)
 * or a single reply someone received ('mode="reply"', new — see
 * QuestionThread.jsx's per-bubble share button) into a shareable 1080x1920
 * story image.
 *
 * v5 splits the controls again, based on direct feedback on v4:
 *   - Background and Shape are back to being inline, horizontally
 *     scrollable strips directly under the preview (tap — or scroll to —
 *     a thumbnail and it applies immediately), instead of opening a modal.
 *   - Colour is its own control now (previously baked into each v4
 *     "Theme"), shown as a single circular swatch of the current color;
 *     tapping it opens a color-wheel picker — every ACCENT_COLORS entry
 *     arranged in a literal circle — instead of a grid. Any Background can
 *     pair with any Colour; storyImageGenerator.js's buildThemeRuntime
 *     derives both the badge color and the background's actual fill/accent
 *     from that one picked color, so there's no way to land on a clashing
 *     pair even though the two are picked independently.
 *   - Size stays the compact dropdown v4 introduced.
 * Every pick still drives the same live canvas preview.
 *
 * `question` needs an `id` (for the reply link) plus its text/type fields.
 * `reply` (mode="reply" only) needs its own reply text. Column-name guesses
 * are centralized just below — flip them if the real schema differs.
 * ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GlassPanel, { useGlassPanelClose } from '../shared/GlassPanel';
import StoryTutorial, { shouldShowStoryTutorial } from '../shared/StoryTutorial';
import {
  generateStoryImage,
  shareStoryImage,
  LINK_ZONE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../../lib/storyImageGenerator';
import { BACKGROUND_STRUCTURES, ACCENT_COLORS, BODY_SHAPES, BODY_SCALES, getPresetById } from '../../lib/storyStylePresets';
import { buildQuestionPath } from '../../lib/subdomain';
import { showToast, friendlyDbError } from '../../lib/toast';
import { hapticSelect, hapticImpact, hapticTap, hapticSheet } from '../../lib/haptics';
import { playTap, playSend, playOpen, playClose } from '../../lib/soundManager';

// See the file banner above — flip these if the real column names differ.
const QUESTION_TEXT_FIELD = 'text';
const QUESTION_TYPE_FIELD = 'type';
const REPLY_TEXT_FIELD = 'reply_text';

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

const ChevronIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
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

function BackgroundCarousel({ selectedId, onChange }) {
  const current = getPresetById(BACKGROUND_STRUCTURES, selectedId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>Background</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <div className="custom-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 2px 8px', WebkitOverflowScrolling: 'touch' }}>
        {BACKGROUND_STRUCTURES.map((bg) => {
          const selected = bg.id === selectedId;
          return (
            <button
              key={bg.id}
              type="button"
              aria-pressed={selected}
              onClick={() => { if (!selected) { hapticSelect(); playTap(); onChange(bg.id); } }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  border: selected ? '3px solid var(--ember)' : '1px solid var(--glass-border)',
                  boxShadow: selected ? '0 0 0 2px rgba(255,107,53,0.25)' : 'none',
                  transform: selected ? 'scale(1.06)' : 'scale(1)',
                  transition: 'transform 120ms ease',
                  ...structureSwatchStyle(bg),
                }}
              />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: selected ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.15 }}>{bg.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shape carousel — same cheap CSS-approximation swatch used before, still
// scoped to a single card thumbnail rather than a full canvas render.
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
  const current = getPresetById(BODY_SHAPES, selectedId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>Shape</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <div className="custom-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 2px 8px', WebkitOverflowScrolling: 'touch' }}>
        {BODY_SHAPES.map((shape) => {
          const selected = shape.id === selectedId;
          return (
            <button
              key={shape.id}
              type="button"
              aria-pressed={selected}
              onClick={() => { if (!selected) { hapticSelect(); playTap(); onChange(shape.id); } }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
            >
              <div style={{ outline: selected ? '2.5px solid var(--ember)' : 'none', outlineOffset: 2, transform: selected ? 'scale(1.05)' : 'scale(1)', transition: 'transform 120ms ease', borderRadius: Math.min(20, shape.radius / 2.4) }}>
                <ShapePreviewGlyph shape={shape} scale={scale} size={64} />
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: selected ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.15 }}>{shape.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour — a single circular swatch of the current pick; tapping opens a
// color-wheel modal with every ACCENT_COLORS entry arranged in a circle.
// ---------------------------------------------------------------------------
function ColourField({ color, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, padding: '10px 12px', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', cursor: 'pointer', minWidth: 0 }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: color.hex, border: '2px solid var(--glass-border)', flexShrink: 0, boxShadow: '0 0 0 2px var(--ink) inset' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--dim)' }}>Colour</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{color.name}</span>
      </div>
    </button>
  );
}

const WHEEL_SIZE = 260;
const WHEEL_RADIUS = 104;
const WHEEL_SWATCH = 32;

function ColorWheelModal({ selectedId, onPick, onClose }) {
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
      aria-label="Colour"
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
          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--paper)' }}>Colour</span>
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

export default function ShareStorySheet({ open, onClose, mode = 'question', question, reply }) {
  if (!open) return null;
  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <ShareStorySheetContent mode={mode} question={question} reply={reply} />
    </GlassPanel>
  );
}

function ShareStorySheetContent({ mode, question, reply }) {
  const requestClose = useGlassPanelClose();

  const [backgroundId, setBackgroundId] = useState(BACKGROUND_STRUCTURES[0].id);
  const [colorId, setColorId] = useState(ACCENT_COLORS[0].id);
  const [shapeId, setShapeId] = useState(BODY_SHAPES[0].id);
  const [scaleId, setScaleId] = useState('bold');

  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const previewUrlRef = useRef(null);
  const renderTokenRef = useRef(null);

  const color = getPresetById(ACCENT_COLORS, colorId);
  const scale = getPresetById(BODY_SCALES, scaleId);

  const questionText = question?.[QUESTION_TEXT_FIELD] || '';
  const questionType = question?.[QUESTION_TYPE_FIELD];
  const replyText = reply?.[REPLY_TEXT_FIELD] || '';
  const replyUrl = buildReplyUrl(question?.id);

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
      backgroundId,
      colorId,
      shapeId,
      scaleId,
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
  }, [mode, questionText, replyText, questionType, backgroundId, colorId, shapeId, scaleId]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function handleShare() {
    if (!previewBlob || isSharing) return;
    setIsSharing(true);
    hapticImpact();
    playSend();
    try {
      await shareStoryImage(previewBlob, { title: mode === 'reply' ? 'A reply I got on Anonroom' : 'Answer this anonymously' });
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
        <button
          type="button"
          onClick={() => { hapticTap(); setTutorialOpen(true); }}
          style={{ fontSize: 13, fontWeight: 800, color: 'var(--ember)', background: 'transparent', border: 'none', padding: '6px 4px' }}
        >
          See tutorial
        </button>
      </div>

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
              the export leaves empty. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: `${LINK_ZONE_FRACTION.top * 100}%`,
              left: `${LINK_ZONE_FRACTION.left * 100}%`,
              width: `${LINK_ZONE_FRACTION.width * 100}%`,
              height: `${LINK_ZONE_FRACTION.height * 100}%`,
              border: '2px dashed rgba(255,255,255,0.45)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.75)', textAlign: 'center', padding: '0 4px', lineHeight: 1.2 }}>
              Link goes here
            </span>
          </div>
        </div>
      </div>

      {/* Selection strips sit directly below the preview — scroll/tap a
          thumbnail and it applies immediately, no modal for either. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
        <BackgroundCarousel selectedId={backgroundId} onChange={setBackgroundId} />
        <ShapeCarousel selectedId={shapeId} onChange={setShapeId} scale={scale} />
        <div style={{ display: 'flex', gap: 10 }}>
          <ColourField color={color} onOpen={() => { hapticTap(); setColorPickerOpen(true); }} />
          <SizeField scaleId={scaleId} onChange={setScaleId} />
        </div>
      </div>

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

      <StoryTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}
