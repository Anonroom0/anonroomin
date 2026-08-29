/** ===========================================================================
 * STORY TUTORIAL
 * ============================================================================
 * <StoryTutorial open onClose /> — a 4-step walkthrough for attaching the
 * Anonroom link sticker inside Instagram once someone has shared a story
 * image there (see LINK_ZONE in storyImageGenerator.js — this is the
 * "here's how" companion to that reserved empty band).
 *
 * Steps: (1) tap the sticker button, (2) tap the link sticker, (3) paste
 * your link, (4) frame it over the reserved area. Each step card shows a
 * guide image from /profile/step1.jpg … step4.jpg — swap those in the
 * public/profile folder; if one hasn't been added yet the card just shows
 * a bold numbered placeholder instead of a broken image.
 *
 * `shouldShowStoryTutorial()` is the localStorage-backed check callers
 * (ShareStorySheet.jsx) use to decide whether to auto-open this the first
 * time someone reaches the share sheet — the toggle inside writes to the
 * same key immediately, not just on close, so it takes effect right away.
 * ========================================================================= */

import { useState } from 'react';
import GlassPanel, { useGlassPanelClose } from './GlassPanel';

const DISMISSED_KEY = 'anonroom_story_tutorial_dismissed';

export function shouldShowStoryTutorial() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== 'true';
  } catch {
    return false;
  }
}

function setDontShowAgain(value) {
  try {
    if (value) window.localStorage.setItem(DISMISSED_KEY, 'true');
    else window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Private-browsing / storage-disabled
  }
}

const STEPS = [
  { title: 'Tap the sticker button', body: 'Once your story photo is open in Instagram, tap the sticker icon along the top toolbar.', image: '/profile/step1.jpg' },
  { title: 'Tap the link sticker', body: 'Find "Link" in the sticker tray and tap it to add a tappable link sticker to your story.', image: '/profile/step2.jpg' },
  { title: 'Paste your link', body: 'Paste the Anonroom link you copied, then tap Done to drop the sticker onto your photo.', image: '/profile/step3.jpg' },
  { title: 'Frame the link', body: 'Drag the link sticker into the empty space near the bottom of the photo, then share.', image: '/profile/step4.jpg' },
];

function StepImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '9 / 16',
          maxHeight: 400,
          borderRadius: 20,
          background: 'var(--ink-2)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--dim)',
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'center',
          padding: 16,
        }}
      >
        Add a guide image at {src}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{
        width: '100%',
        height: 'auto',
        maxHeight: '55vh',            // Allows the image to scale naturally but sets a safe cap
        objectFit: 'contain',         // Ensures the image fully loads without cutting off edges
        borderRadius: 20,
        border: '1px solid var(--glass-border)',
        background: 'var(--ink-2)',   // Provides a background if the aspect ratio causes letterboxing
        display: 'block',
      }}
    />
  );
}

export default function StoryTutorial({ open, onClose }) {
  if (!open) return null;
  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <StoryTutorialContent onClose={onClose} />
    </GlassPanel>
  );
}

function StoryTutorialContent({ onClose }) {
  const requestClose = useGlassPanelClose();
  const [stepIndex, setStepIndex] = useState(0);
  const [dontShow, setDontShow] = useState(!shouldShowStoryTutorial());

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function handleToggle() {
    const next = !dontShow;
    setDontShow(next);
    setDontShowAgain(next);
  }

  function handleNext() {
    if (isLast) {
      requestClose ? requestClose() : onClose?.();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
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
      WebkitOverflowScrolling: 'touch'  // Smooth momentum scrolling on iOS
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--paper)' }}>Adding your link</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>{stepIndex + 1} / {STEPS.length}</div>
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= stepIndex ? 'var(--ember)' : 'var(--glass-border)',
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </div>

      <div style={{ flexShrink: 0 }}>
        <StepImage src={step.image} alt={step.title} />
      </div>

      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--paper)', marginBottom: 6 }}>{step.title}</div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--dim)' }}>{step.body}</p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
        <span
          role="checkbox"
          aria-checked={dontShow}
          onClick={handleToggle}
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            flexShrink: 0,
            border: `2px solid ${dontShow ? 'var(--ember)' : 'var(--glass-border)'}`,
            background: dontShow ? 'var(--ember)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          {dontShow ? '✓' : ''}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--paper)' }}>Don't show this again</span>
      </label>

      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
            style={{ flex: '0 0 auto', padding: '14px 20px', borderRadius: 20, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--paper)', fontSize: 15, fontWeight: 800 }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          style={{ flex: 1, padding: '14px 0', borderRadius: 20, border: 'none', background: 'var(--ember)', color: 'var(--ink)', fontSize: 16, fontWeight: 900 }}
        >
          {isLast ? 'Got it' : 'Next'}
        </button>
      </div>
    </div>
  );
}
