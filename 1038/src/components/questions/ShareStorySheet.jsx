/** ===========================================================================
 * SHARE STORY SHEET (v4)
 * ============================================================================
 * <ShareStorySheet open onClose mode question reply /> — a GlassPanel sheet
 * that turns either a question ('mode="question"', the original behavior)
 * or a single reply someone received ('mode="reply"', new — see
 * QuestionThread.jsx's per-bubble share button) into a shareable 1080x1920
 * story image.
 *
 * v4 reworks the pickers again, based on direct feedback that v3's inline
 * swatch grids were messy:
 *   - Header Color + Background are now one linked "Theme" control (see
 *     storyStylePresets.js's STORY_THEMES) — only the current theme's
 *     swatch shows inline; tapping it opens a modal with the full grid so
 *     the main sheet only ever shows one color at a time instead of two
 *     independent grids that could clash.
 *   - Body Style is split into "Shape" (which card design — its own
 *     single-swatch-plus-modal, same pattern as Theme) and "Size" (how
 *     bold/big the text reads — a compact dropdown), instead of one flat
 *     gallery of every shape repeated at every size.
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
import { STORY_THEMES, BODY_SHAPES, BODY_SCALES, getPresetById } from '../../lib/storyStylePresets';
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
// Theme swatch — a small preview combining the background + a chip for the
// header/badge color, so one glance shows both halves of the pairing.
// ---------------------------------------------------------------------------
function themeBackgroundSwatchStyle(bg) {
  if (bg.type === 'solid') return { background: bg.colors[0] };
  if (bg.type === 'linear') return { background: `linear-gradient(135deg, ${bg.colors[0]}, ${bg.colors[1]})` };
  if (bg.type === 'radial') return { background: `radial-gradient(circle at 35% 30%, ${bg.colors[0]}, ${bg.colors[1]})` };
  if (bg.type === 'dots' || bg.type === 'halftone') {
    return {
      background: bg.colors[0],
      backgroundImage: `radial-gradient(${bg.dotColor || 'rgba(255,255,255,0.25)'} 1.5px, transparent 1.5px)`,
      backgroundSize: '8px 8px',
    };
  }
  if (bg.type === 'grid' || bg.type === 'pinstripe') {
    return {
      background: bg.colors[0],
      backgroundImage: `linear-gradient(${bg.dotColor || 'rgba(255,255,255,0.25)'} 1px, transparent 1px), linear-gradient(90deg, ${bg.dotColor || 'rgba(255,255,255,0.25)'} 1px, transparent 1px)`,
      backgroundSize: '7px 7px',
    };
  }
  if (bg.type === 'checker') {
    return {
      background: bg.colors[0],
      backgroundImage: `linear-gradient(45deg, ${bg.colors[1] || 'rgba(255,255,255,0.2)'} 25%, transparent 25%, transparent 75%, ${bg.colors[1] || 'rgba(255,255,255,0.2)'} 75%), linear-gradient(45deg, ${bg.colors[1] || 'rgba(255,255,255,0.2)'} 25%, transparent 25%, transparent 75%, ${bg.colors[1] || 'rgba(255,255,255,0.2)'} 75%)`,
      backgroundSize: '9px 9px',
      backgroundPosition: '0 0, 4.5px 4.5px',
    };
  }
  if (bg.type === 'stripes' || bg.type === 'crosshatch') {
    return {
      background: bg.colors[0],
      backgroundImage: `repeating-linear-gradient(-22deg, ${bg.colors[1] || bg.dotColor || 'rgba(255,255,255,0.2)'} 0 3px, transparent 3px 8px)`,
    };
  }
  if (bg.type === 'confetti') {
    return {
      background: bg.colors[0],
      backgroundImage: 'radial-gradient(#FF6B35 1.4px, transparent 1.4px), radial-gradient(#8B5CF6 1.4px, transparent 1.4px), radial-gradient(#2DD4A7 1.4px, transparent 1.4px)',
      backgroundSize: '9px 9px, 11px 11px, 7px 7px',
      backgroundPosition: '0 0, 3px 5px, 6px 1px',
    };
  }
  if (bg.type === 'waves') {
    return { background: bg.colors[0], backgroundImage: `radial-gradient(circle, ${bg.dotColor || 'rgba(255,255,255,0.2)'} 30%, transparent 31%)`, backgroundSize: '10px 6px' };
  }
  if (bg.type === 'sunburst') {
    return { background: `conic-gradient(${bg.colors[1] || 'rgba(255,255,255,0.18)'} 0 10deg, transparent 10deg 20deg)`, backgroundColor: bg.colors[0] };
  }
  return { background: bg.colors[0] };
}

// ---------------------------------------------------------------------------
// Shape swatch — cheap CSS approximation of the card's radius/fill/border,
// cheap enough to render 30 (heading toward more over time) at once in a grid.
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

// ---------------------------------------------------------------------------
// Picker modal — bottom sheet with a scrollable grid, used for both Theme
// and Shape so there's only ever one color/shape visible on the main sheet
// at a time; everything else lives behind this "tap to change" modal.
// ---------------------------------------------------------------------------
function PickerModal({ title, onClose, children }) {
  useEffect(() => {
    hapticSheet();
    playOpen();
  }, []);

  function handleClose() {
    hapticSheet();
    playClose();
    onClose();
  }

  // Portaled straight to document.body — GlassPanel's sheet wrapper animates
  // via a CSS `transform`, which creates a new containing block for any
  // `position: fixed` descendant. Left un-portaled, this modal would end up
  // positioned/clipped relative to that transformed sheet (and drift during
  // its slide/drag animation) instead of sitting fixed to the real viewport.
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
        alignItems: 'flex-end',
      }}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '76dvh',
          background: 'var(--ink)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          border: '1px solid var(--glass-border)',
          borderBottom: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 10px', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--paper)' }}>{title}</span>
          <button type="button" onClick={handleClose} style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 14, fontWeight: 800, padding: '6px 4px' }}>
            Done
          </button>
        </div>
        <div className="custom-scrollbar" style={{ overflowY: 'auto', padding: '4px 18px 28px', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ThemeGrid({ selectedId, onPick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {STORY_THEMES.map((theme) => {
        const selected = theme.id === selectedId;
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={selected}
            onClick={() => { if (!selected) { hapticSelect(); playTap(); onPick(theme.id); } }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                position: 'relative',
                overflow: 'hidden',
                border: selected ? '3px solid var(--ember)' : '1px solid var(--glass-border)',
                boxShadow: selected ? '0 0 0 2px rgba(255,107,53,0.25)' : 'none',
                transform: selected ? 'scale(1.05)' : 'scale(1)',
                transition: 'transform 120ms ease',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, ...themeBackgroundSwatchStyle(theme.background) }} />
              <div style={{ position: 'absolute', left: 6, top: 6, width: 20, height: 11, borderRadius: 5, background: theme.pillBg }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: selected ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.2 }}>{theme.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ShapeGrid({ selectedId, onPick, scale }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {BODY_SHAPES.map((shape) => {
        const selected = shape.id === selectedId;
        return (
          <button
            key={shape.id}
            type="button"
            aria-pressed={selected}
            onClick={() => { if (!selected) { hapticSelect(); playTap(); onPick(shape.id); } }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
          >
            <div style={{ outline: selected ? '2.5px solid var(--ember)' : 'none', outlineOffset: 2, transform: selected ? 'scale(1.04)' : 'scale(1)', transition: 'transform 120ms ease', borderRadius: Math.min(20, shape.radius / 2.4) }}>
              <ShapePreviewGlyph shape={shape} scale={scale} size={76} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: selected ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.2 }}>{shape.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact "current value + tap to change" rows for the main sheet.
// ---------------------------------------------------------------------------
function ThemeField({ theme, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', cursor: 'pointer' }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 14, position: 'relative', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--glass-border)' }}>
        <div style={{ position: 'absolute', inset: 0, ...themeBackgroundSwatchStyle(theme.background) }} />
        <div style={{ position: 'absolute', left: 5, top: 5, width: 15, height: 9, borderRadius: 4, background: theme.pillBg }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--dim)' }}>Theme</span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--paper)' }}>{theme.name}</span>
      </div>
      <ChevronIcon />
    </button>
  );
}

function ShapeField({ shape, scale, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', cursor: 'pointer' }}
    >
      <div style={{ borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
        <ShapePreviewGlyph shape={shape} scale={scale} size={44} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--dim)' }}>Shape</span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--paper)' }}>{shape.name}</span>
      </div>
      <ChevronIcon />
    </button>
  );
}

function SizeField({ scaleId, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'var(--glass-white)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--dim)' }}>Size</span>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>How bold + big the text reads</span>
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

  const [themeId, setThemeId] = useState(STORY_THEMES[0].id);
  const [shapeId, setShapeId] = useState(BODY_SHAPES[0].id);
  const [scaleId, setScaleId] = useState('bold');

  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [shapePickerOpen, setShapePickerOpen] = useState(false);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const previewUrlRef = useRef(null);
  const renderTokenRef = useRef(0);

  const theme = getPresetById(STORY_THEMES, themeId);
  const shape = getPresetById(BODY_SHAPES, shapeId);
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
    const token = ++renderTokenRef.current;
    setIsRendering(true);

    generateStoryImage({
      kind: mode,
      questionText,
      replyText,
      questionType,
      themeId,
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
  }, [mode, questionText, replyText, questionType, themeId, shapeId, scaleId]);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <ThemeField theme={theme} onOpen={() => { hapticTap(); setThemePickerOpen(true); }} />
        <ShapeField shape={shape} scale={scale} onOpen={() => { hapticTap(); setShapePickerOpen(true); }} />
        <SizeField scaleId={scaleId} onChange={setScaleId} />
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

      {themePickerOpen && (
        <PickerModal title="Theme" onClose={() => setThemePickerOpen(false)}>
          <ThemeGrid selectedId={themeId} onPick={(id) => setThemeId(id)} />
        </PickerModal>
      )}
      {shapePickerOpen && (
        <PickerModal title="Shape" onClose={() => setShapePickerOpen(false)}>
          <ShapeGrid selectedId={shapeId} onPick={(id) => setShapeId(id)} scale={scale} />
        </PickerModal>
      )}

      <StoryTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}
