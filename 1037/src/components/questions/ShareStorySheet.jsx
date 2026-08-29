/** ===========================================================================
 * SHARE STORY SHEET (v3)
 * ============================================================================
 * <ShareStorySheet open onClose mode question reply /> — a GlassPanel sheet
 * that turns either a question ('mode="question"', the original behavior)
 * or a single reply someone received ('mode="reply"', new — see
 * QuestionThread.jsx's per-bubble share button) into a shareable 1080x1920
 * story image.
 *
 * v3 replaces the old prev/next-arrow pickers with real visual selectors:
 *   - Header Color + Background are tappable color-swatch grids (like the
 *     background-color picker in Instagram's/Snapchat's text/story tools) —
 *     see storyStylePresets.js for the full, now much larger, color +
 *     pattern-background list.
 *   - Body Style is a horizontally scrollable gallery of small preview
 *     thumbnails, one per generated SHAPES x SCALES combination (100+ —
 *     see storyStylePresets.js's BODY_STYLE_PRESETS) — browse-and-tap
 *     instead of stepping one-by-one through a flat list.
 * Every pick still drives the same live canvas preview.
 *
 * `question` needs an `id` (for the reply link) plus its text/type fields.
 * `reply` (mode="reply" only) needs its own reply text. Column-name guesses
 * are centralized just below — flip them if the real schema differs.
 * ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import GlassPanel, { useGlassPanelClose } from '../shared/GlassPanel';
import StoryTutorial, { shouldShowStoryTutorial } from '../shared/StoryTutorial';
import {
  generateStoryImage,
  shareStoryImage,
  LINK_ZONE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../../lib/storyImageGenerator';
import { HEADER_COLOR_PRESETS, BACKGROUND_PRESETS, BODY_STYLE_PRESETS } from '../../lib/storyStylePresets';
import { buildQuestionPath } from '../../lib/subdomain';
import { showToast, friendlyDbError } from '../../lib/toast';
import { hapticSelect, hapticImpact, hapticTap } from '../../lib/haptics';
import { playTap, playSend } from '../../lib/soundManager';

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

// ---------------------------------------------------------------------------
// Small preview background swatch for a BACKGROUND_PRESETS entry — a quick
// CSS approximation of what the pattern/gradient/solid looks like, cheap
// enough to render two dozen of at once in a grid.
// ---------------------------------------------------------------------------
function backgroundSwatchStyle(bg) {
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
// Header Color / Background — tappable color-swatch grids.
// ---------------------------------------------------------------------------
function ColorSwatchGrid({ label, list, index, onChange, kind }) {
  const current = list[index];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <div
        className="custom-scrollbar"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '4px 2px 8px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {list.map((item, i) => {
          const selected = i === index;
          const swatchStyle = kind === 'header' ? { background: item.pillBg } : backgroundSwatchStyle(item);
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              aria-pressed={selected}
              onClick={() => { if (i !== index) { hapticSelect(); playTap(); onChange(i); } }}
              style={{
                width: 46,
                height: 46,
                flexShrink: 0,
                borderRadius: 14,
                border: selected ? '3px solid var(--ember)' : '1px solid var(--glass-border)',
                boxShadow: selected ? '0 0 0 2px rgba(255,107,53,0.25)' : 'none',
                cursor: 'pointer',
                padding: 0,
                transform: selected ? 'scale(1.06)' : 'scale(1)',
                transition: 'transform 120ms ease, box-shadow 120ms ease',
                ...swatchStyle,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body Style — scrollable gallery of small preview cards. Each is a cheap
// CSS approximation of the shape's radius/fill/border + the scale's
// weight/size (no canvas rendering per-thumbnail — 100+ of these render at
// once, so it stays a lightweight div, not 100+ tiny canvases).
// ---------------------------------------------------------------------------
function bodySwatchCardStyle(swatch) {
  const base = { borderRadius: Math.min(20, swatch.radius / 2.4) };
  if (swatch.fill === 'ink-2') return { ...base, background: '#1C1D24' };
  if (swatch.fill === 'paper') return { ...base, background: '#F4F3F0' };
  if (swatch.fill === 'glass') return { ...base, background: 'rgba(255,255,255,0.09)' };
  if (swatch.fill === 'gradient-header') return { ...base, background: 'linear-gradient(160deg, rgba(255,107,53,0.4), #1C1D24)' };
  if (swatch.fill === 'radial-glow') return { ...base, background: 'radial-gradient(circle at 35% 30%, rgba(255,107,53,0.55), #1C1D24)' };
  return { ...base, background: 'transparent' };
}

function bodySwatchBorderStyle(border) {
  if (border === 'glass') return { border: '1px solid rgba(255,255,255,0.16)' };
  if (border === 'ember-thin') return { border: '1.5px solid var(--ember)' };
  if (border === 'ember-thick') return { border: '3px solid var(--ember)' };
  if (border === 'glow') return { border: '1.5px solid var(--ember)', boxShadow: '0 0 8px rgba(255,107,53,0.55)' };
  if (border === 'double') return { border: '1px solid rgba(255,255,255,0.22)', outline: '2px solid var(--ember)', outlineOffset: -5 };
  return { border: '1px solid transparent' };
}

function BodyStyleGallery({ list, index, onChange }) {
  const current = list[index];
  const itemRefs = useRef({});

  // Keep the selected thumbnail scrolled into view when it changes from
  // elsewhere (not strictly needed since selection only happens by tapping
  // a visible thumbnail, but keeps behavior correct if that ever changes).
  useEffect(() => {
    const el = itemRefs.current[current?.id];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>Body Style</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <div
        className="custom-scrollbar"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '4px 2px 8px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {list.map((item, i) => {
          const selected = i === index;
          const { swatch } = item;
          return (
            <button
              key={item.id}
              ref={(el) => { itemRefs.current[item.id] = el; }}
              type="button"
              aria-label={item.name}
              aria-pressed={selected}
              onClick={() => { if (i !== index) { hapticSelect(); playTap(); onChange(i); } }}
              style={{
                width: 68,
                height: 92,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: 0,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: selected ? '2.5px solid var(--ember)' : 'none',
                  outlineOffset: 2,
                  transform: selected ? 'scale(1.04)' : 'scale(1)',
                  transition: 'transform 120ms ease',
                  ...bodySwatchCardStyle(swatch),
                  ...bodySwatchBorderStyle(swatch.border),
                }}
              >
                <span
                  style={{
                    fontFamily: swatch.fontFamily === 'serif' ? 'Georgia, serif' : swatch.fontFamily === 'mono' ? 'ui-monospace, monospace' : 'inherit',
                    fontWeight: swatch.fontWeight,
                    fontSize: 13 + swatch.fontScale * 8,
                    color: swatch.darkText ? '#0C0D10' : '#F4F3F0',
                    textTransform: swatch.uppercase ? 'uppercase' : 'none',
                  }}
                >
                  Aa
                </span>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: selected ? 'var(--paper)' : 'var(--dim)', textAlign: 'center', lineHeight: 1.15 }}>
                {item.shapeName}
                <br />
                {item.scaleName}
              </span>
            </button>
          );
        })}
      </div>
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

  const [headerIndex, setHeaderIndex] = useState(0);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [bodyIndex, setBodyIndex] = useState(0);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const previewUrlRef = useRef(null);
  const renderTokenRef = useRef(0);

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
      headerColorId: HEADER_COLOR_PRESETS[headerIndex].id,
      backgroundId: BACKGROUND_PRESETS[backgroundIndex].id,
      bodyStyleId: BODY_STYLE_PRESETS[bodyIndex].id,
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
  }, [mode, questionText, replyText, questionType, headerIndex, backgroundIndex, bodyIndex]);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
        <ColorSwatchGrid label="Header Color" list={HEADER_COLOR_PRESETS} index={headerIndex} onChange={setHeaderIndex} kind="header" />
        <ColorSwatchGrid label="Background" list={BACKGROUND_PRESETS} index={backgroundIndex} onChange={setBackgroundIndex} kind="background" />
        <BodyStyleGallery list={BODY_STYLE_PRESETS} index={bodyIndex} onChange={setBodyIndex} />
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

      <StoryTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}
