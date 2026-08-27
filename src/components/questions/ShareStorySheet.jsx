/** ===========================================================================
 * SHARE STORY SHEET (v2)
 * ============================================================================
 * <ShareStorySheet open onClose mode question reply /> — a GlassPanel sheet
 * that turns either a question ('mode="question"', the original behavior)
 * or a single reply someone received ('mode="reply"', new — see
 * QuestionThread.jsx's per-bubble share button) into a shareable 1080x1920
 * story image.
 *
 * The old fixed-layout template picker (bold-center / sticky-note /
 * gradient-card) is gone. In its place: three independent left/right
 * pickers — Header Color, Background, Body Style — each cycling through 10
 * presets from storyStylePresets.js, so the preview updates live as
 * someone dials in a combination rather than jumping between three fixed
 * looks.
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
} from '../../lib/storyImageGenerator';
import { HEADER_COLOR_PRESETS, BACKGROUND_PRESETS, BODY_STYLE_PRESETS } from '../../lib/storyStylePresets';
import { buildQuestionPath } from '../../lib/subdomain';
import { showToast, friendlyDbError } from '../../lib/toast';

// See the file banner above — flip these if the real column names differ.
const QUESTION_TEXT_FIELD = 'text';
const QUESTION_TYPE_FIELD = 'type';
const REPLY_TEXT_FIELD = 'reply_text';

const PREVIEW_ASPECT_RATIO = 1080 / 1920;
// Matches storyImageGenerator.js's LINK_ZONE, expressed as a fraction of
// the canvas so the preview overlay lines up regardless of preview size.
const LINK_ZONE_FRACTION = { top: 1620 / 1920, height: 140 / 1920, left: 140 / 1080, width: (1080 - 280) / 1080 };

function buildReplyUrl(questionId) {
  return `https://anonroom.in${buildQuestionPath(questionId)}`;
}

function cyclePreset(list, index, direction) {
  const len = list.length;
  return (index + direction + len) % len;
}

function PresetPicker({ label, list, index, onChange }) {
  const current = list[index];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 96, flexShrink: 0, fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>{label}</span>
      <button
        type="button"
        aria-label={`Previous ${label}`}
        onClick={() => onChange(cyclePreset(list, index, -1))}
        style={arrowButtonStyle}
      >
        ‹
      </button>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 16,
          border: '1px solid var(--glass-border)',
          background: 'var(--ink-2)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            borderRadius: 8,
            flexShrink: 0,
            background: current.pillBg || (current.colors && current.colors[0]) || 'var(--glass-white)',
            border: '1px solid var(--glass-border)',
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--paper)' }}>{current.name}</span>
      </div>
      <button
        type="button"
        aria-label={`Next ${label}`}
        onClick={() => onChange(cyclePreset(list, index, 1))}
        style={arrowButtonStyle}
      >
        ›
      </button>
    </div>
  );
}

const arrowButtonStyle = {
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: '50%',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-white)',
  color: 'var(--paper)',
  fontSize: 20,
  fontWeight: 900,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

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
      showToast('Link copied', 'success');
    } catch {
      showToast(friendlyDbError('Could not copy the link.'));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 20px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--paper)' }}>Share to Story</div>
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          style={{ fontSize: 13, fontWeight: 800, color: 'var(--ember)', background: 'transparent', border: 'none', padding: '6px 4px' }}
        >
          See tutorial
        </button>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto' }}>
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
              matches storyImageGenerator.js's LINK_ZONE, never baked into
              the exported PNG itself (see that file's banner comment). */}
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
            <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.75)', textAlign: 'center', padding: '0 6px' }}>
              Link sticker goes here
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PresetPicker label="Header" list={HEADER_COLOR_PRESETS} index={headerIndex} onChange={setHeaderIndex} />
        <PresetPicker label="Background" list={BACKGROUND_PRESETS} index={backgroundIndex} onChange={setBackgroundIndex} />
        <PresetPicker label="Body Style" list={BODY_STYLE_PRESETS} index={bodyIndex} onChange={setBodyIndex} />
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={!previewBlob || isSharing}
        style={{ width: '100%', padding: '16px 0', borderRadius: 20, border: 'none', background: 'var(--ember)', color: 'var(--ink)', fontSize: 16, fontWeight: 900, opacity: !previewBlob || isSharing ? 0.6 : 1 }}
      >
        {isSharing ? 'Sharing…' : 'Share to Story'}
      </button>
      <p style={{ margin: '-8px 0 0', fontSize: 12, color: 'var(--dim)', lineHeight: 1.4, textAlign: 'center' }}>
        On iPhone this can open Instagram Stories directly with the photo loaded. Everywhere else, pick Instagram from your share sheet — add the link sticker and music yourself once you're in Instagram.
      </p>

      <button
        type="button"
        onClick={handleCopyLink}
        style={{ width: '100%', padding: '14px 16px', borderRadius: 20, border: '1px solid var(--glass-border)', background: 'var(--glass-white)', color: 'var(--paper)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span style={{ fontWeight: 700 }}>Copy Link</span>
        <span style={{ color: 'var(--dim)', fontSize: 13 }}>{replyUrl}</span>
      </button>

      <button
        type="button"
        onClick={requestClose}
        style={{ width: '100%', padding: '14px 0', borderRadius: 20, border: 'none', background: 'transparent', color: 'var(--dim)', fontSize: 15, fontWeight: 700 }}
      >
        Cancel
      </button>

      <StoryTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}
