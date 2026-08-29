/**
 * ============================================================================
 * SEND BUTTON — shared composer send control
 * ============================================================================
 * Single consolidated source for the send button that used to be duplicated
 * in GroupChat.jsx and DirectMessages.jsx. Motion is driven entirely by the
 * shared classes in src/styles/animations.css — this file owns no new
 * @keyframes, per the motion spec's rule that animations.css is the single
 * owner of the app's physics.
 *
 * States:
 *   - idle (canSend, not sending, no cooldown): flat --ember fill, no
 *     shadow bloom.
 *   - tap: on click, .send-btn-tap plays the compress→spring→settle
 *     (260ms total) on the button itself.
 *   - success: on the same click, the arrow icon crossfades to a checkmark
 *     via .send-btn-success-morph (150ms fade-in), holds for 600ms while
 *     the caller's new message bubble appears elsewhere, then the
 *     checkmark fades back out and the arrow returns for the next message.
 *   - disabled (canSend=false): opacity drops to 0.35 instantly — no
 *     animation class, just a direct style change.
 *   - cooldown (cooldownPercent > 0): existing circular countdown ring,
 *     unchanged from both prior implementations.
 *
 * Dependencies: React, src/styles/animations.css (imported once from
 * src/main.jsx, per that file's own header — not re-imported here)
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';

// ============================================================================
// 1. INLINE SVG VECTORS
// ============================================================================
const Vectors = {
  Send: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

// Success sequence timing: crossfade in (matches .send-btn-success-morph's
// own 150ms duration), then hold, then fade out.
const SUCCESS_MORPH_MS = 150;
const SUCCESS_HOLD_MS = 600;

// ============================================================================
// 2. MAIN EXPORT
// ============================================================================

/**
 * SendButton
 * @param {boolean} canSend - whether there's anything to send right now
 * @param {boolean} sending - true while an in-flight send request is pending
 * @param {number} cooldownPercent - 0-100; > 0 shows the countdown ring and
 *   blocks interaction, matching both prior implementations' rate-limit UI
 * @param {function} onClick - called on a valid tap (canSend && !sending &&
 *   cooldownPercent === 0); triggering this also plays the tap + success
 *   icon sequence
 */
export default function SendButton({ canSend, sending, cooldownPercent = 0, onClick }) {
  const [isTapping, setIsTapping] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successFadingOut, setSuccessFadingOut] = useState(false);

  const tapTimerRef = useRef(null);
  const successHoldTimerRef = useRef(null);
  const successFadeTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(tapTimerRef.current);
      clearTimeout(successHoldTimerRef.current);
      clearTimeout(successFadeTimerRef.current);
    };
  }, []);

  const isCoolingDown = cooldownPercent > 0;
  const isInteractive = canSend && !sending && !isCoolingDown;

  function handleClick() {
    if (!isInteractive) return;

    onClick?.();

    // Tap: compress → spring → settle, 260ms total (.send-btn-tap owns the
    // keyframe; this just toggles the class for one run).
    clearTimeout(tapTimerRef.current);
    setIsTapping(false);
    // Force a reflow-free re-trigger if tapped again before the class was
    // removed, by flipping off then on across a microtask.
    requestAnimationFrame(() => setIsTapping(true));
    tapTimerRef.current = setTimeout(() => setIsTapping(false), 260);

    // Success: crossfade arrow -> checkmark, hold while the bubble appears,
    // then fade the checkmark back out.
    clearTimeout(successHoldTimerRef.current);
    clearTimeout(successFadeTimerRef.current);
    setSuccessFadingOut(false);
    setShowSuccess(true);

    successHoldTimerRef.current = setTimeout(() => {
      setSuccessFadingOut(true);
      successFadeTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
        setSuccessFadingOut(false);
      }, SUCCESS_MORPH_MS);
    }, SUCCESS_MORPH_MS + SUCCESS_HOLD_MS);
  }

  const ringSize = 44;
  const strokeWidth = 3;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - cooldownPercent / 100);

  // Idle = flat --ember fill, no shadow bloom. Disabled drops opacity to
  // 0.35 instantly (no animation class involved). Cooldown keeps its own
  // muted glass background so the ring reads clearly against it.
  const background = isCoolingDown ? 'var(--glass-white)' : 'var(--ember)';
  const iconColor = isCoolingDown ? 'var(--dim)' : '#fff';
  const opacity = canSend ? 1 : 0.35;

  return (
    <button
      type="submit"
      onClick={handleClick}
      disabled={!isInteractive}
      className={isTapping ? 'send-btn-tap' : ''}
      style={{
        position: 'relative',
        width: ringSize,
        height: ringSize,
        borderRadius: '50%',
        border: 'none',
        flexShrink: 0,
        background,
        color: iconColor,
        opacity,
        boxShadow: 'none',
        cursor: isInteractive ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {isCoolingDown && (
        <svg
          width={ringSize}
          height={ringSize}
          style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="var(--glass-border)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="var(--ember)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.2s linear' }}
          />
        </svg>
      )}

      {isCoolingDown ? (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ember)' }} />
      ) : (
        <span style={{ position: 'relative', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Arrow: always in the DOM at rest; hidden while the checkmark is showing. */}
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: showSuccess ? 0 : 1,
            }}
          >
            {Vectors.Send}
          </span>

          {/* Checkmark: mounted only during the success sequence. Fades in
              via .send-btn-success-morph; the fade-out reuses the same
              class run in reverse via animation-direction. */}
          {showSuccess && (
            <span
              className="send-btn-success-morph"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animationDirection: successFadingOut ? 'reverse' : 'normal',
              }}
            >
              {Vectors.Check}
            </span>
          )}
        </span>
      )}
    </button>
  );
}