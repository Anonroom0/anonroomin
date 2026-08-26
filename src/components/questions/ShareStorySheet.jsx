/** ===========================================================================
 * SHARE STORY SHEET
 * ============================================================================
 * <ShareStorySheet open onClose question /> — a GlassPanel "sheet" that lets
 * someone turn a question page into a shareable 1080x1920 story image. Shows
 * a live, scaled-down preview of the PNG that storyImageGenerator.js would
 * produce, a horizontal template picker to swipe/tap through TEMPLATES, a
 * "Share to Story" button, and a plain "Copy Link" row.
 *
 * `open` gates mounting at the call site (this component owns no visibility
 * state of its own beyond that) — GlassPanel's own enter/exit choreography
 * and drag-to-dismiss handle the rest once mounted.
 *
 * `question` is expected to carry the fields storyImageGenerator.js's
 * generateQuestionStoryImage() needs: an `id` (for the reply link) plus the
 * question's text and type. The `questions` table backs this component, and
 * since its exact column names aren't attached to this prompt, `text` and
 * `type` are the reasonable guesses kept in one place below — update
 * QUESTION_TEXT_FIELD/QUESTION_TYPE_FIELD if the real columns differ.
 * ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import GlassPanel, { useGlassPanelClose } from '../GlassPanel';
import {
  generateQuestionStoryImage,
  shareStoryImage,
  TEMPLATES,
} from '../../lib/storyImageGenerator';
import { buildQuestionPath } from '../../lib/subdomain';
import { showToast, friendlyDbError } from '../../lib/toast';

// See the file banner above — flip these if the `questions` table's real
// column names differ from this guess.
const QUESTION_TEXT_FIELD = 'text';
const QUESTION_TYPE_FIELD = 'type';

// Human-readable labels for the template picker. Keys must match TEMPLATES
// exactly; this is presentation-only and never sent anywhere.
const TEMPLATE_LABELS = {
  'bold-center': 'Bold',
  'sticky-note': 'Sticky Note',
  'gradient-card': 'Gradient',
};

// The preview <img> is scaled down from the real 1080x1920 render rather
// than re-implemented as a separate DOM layout, so what someone sees here
// is pixel-identical to what actually gets shared.
const PREVIEW_ASPECT_RATIO = 1080 / 1920;

function buildReplyUrl(questionId) {
  return `https://anonroom.in${buildQuestionPath(questionId)}`;
}

export default function ShareStorySheet({ open, onClose, question }) {
  if (!open) return null;

  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <ShareStorySheetContent question={question} />
    </GlassPanel>
  );
}

function ShareStorySheetContent({ question }) {
  const requestClose = useGlassPanelClose();

  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [isSharing, setIsSharing] = useState(false);

  // Tracks the most recent object URL so it can be revoked on the next
  // render / unmount without racing a stale async render finishing late.
  const previewUrlRef = useRef(null);
  const renderTokenRef = useRef(0);

  const questionText = question?.[QUESTION_TEXT_FIELD] || '';
  const questionType = question?.[QUESTION_TYPE_FIELD];
  const replyUrl = buildReplyUrl(question?.id);

  useEffect(() => {
    const token = ++renderTokenRef.current;
    setIsRendering(true);

    generateQuestionStoryImage({ questionText, questionType, replyUrl, template })
      .then((blob) => {
        // A newer render started while this one was in flight — drop it.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- questionText/questionType/replyUrl are derived from `question`, which is the real dependency
  }, [question, template]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function handleShare() {
    if (!previewBlob || isSharing) return;
    setIsSharing(true);
    try {
      await shareStoryImage(previewBlob, { title: 'Answer this anonymously' });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 20px 28px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--paper)' }}>Share to Story</div>

      <div
        style={{
          width: '100%',
          maxWidth: 240,
          margin: '0 auto',
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
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // Fade the previous frame while a new template renders, rather
              // than flashing to empty, since generation is async.
              opacity: isRendering ? 0.5 : 1,
              transition: 'opacity 150ms ease',
            }}
          />
        )}
        {isRendering && !previewUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dim)',
              fontSize: 14,
            }}
          >
            Rendering…
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '2px 2px 4px',
          scrollSnapType: 'x mandatory',
        }}
      >
        {TEMPLATES.map((id) => {
          const isActive = id === template;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTemplate(id)}
              style={{
                flex: '0 0 auto',
                scrollSnapAlign: 'start',
                padding: '10px 18px',
                borderRadius: 20,
                border: `1px solid ${isActive ? 'var(--ember)' : 'var(--glass-border)'}`,
                background: isActive ? 'var(--ember)' : 'var(--glass-white)',
                color: isActive ? 'var(--ink)' : 'var(--paper)',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {TEMPLATE_LABELS[id] || id}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={!previewBlob || isSharing}
        style={{
          width: '100%',
          padding: '16px 0',
          borderRadius: 20,
          border: 'none',
          background: 'var(--ember)',
          color: 'var(--ink)',
          fontSize: 16,
          fontWeight: 700,
          opacity: !previewBlob || isSharing ? 0.6 : 1,
        }}
      >
        {isSharing ? 'Sharing…' : 'Share to Story'}
      </button>

      <button
        type="button"
        onClick={handleCopyLink}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 20,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-white)',
          color: 'var(--paper)',
          fontSize: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Copy Link</span>
        <span style={{ color: 'var(--dim)', fontSize: 13 }}>{replyUrl}</span>
      </button>

      <button
        type="button"
        onClick={requestClose}
        style={{
          width: '100%',
          padding: '14px 0',
          borderRadius: 20,
          border: 'none',
          background: 'transparent',
          color: 'var(--dim)',
          fontSize: 15,
        }}
      >
        Cancel
      </button>
    </div>
  );
}
