/** ===========================================================================
 * SWIPEABLE MESSAGE — shared swipe-to-reply gesture wrapper
 * ============================================================================
 * Single consolidated source for the swipe-to-reply gesture wrapper that
 * used to be duplicated identically in GroupChat.jsx and DirectMessages.jsx.
 * Straight de-duplication — the touch-drag math, thresholds, and reply-icon
 * reveal behavior are unchanged from both prior copies.
 *
 * Wraps a single message row. Dragging left reveals a reply icon that fades
 * in past -20px; releasing past -40px fires onSwipe (start a reply); any
 * other release snaps back to 0. Dragging right, or past +0px, is a no-op
 * (translateX is clamped so it never goes positive).
 *
 * Dependencies: React
 * ============================================================================ */

import React, { useRef, useState } from 'react';

// ============================================================================
// 1. INLINE SVG VECTOR (reply arrow, revealed during the swipe)
// ============================================================================
const ReplyActionIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

// ============================================================================
// 2. MAIN EXPORT
// ============================================================================

/**
 * SwipeableMessage
 * @param {React.ReactNode} children - the message row content to wrap
 * @param {function} onSwipe - called when the drag is released past the
 *   dismiss threshold (-40px)
 * @param {boolean} disabled - when true, all touch handlers are no-ops
 *   (used while searching or while messages are selected)
 */
export default function SwipeableMessage({ children, onSwipe, disabled }) {
  const [translateX, setTranslateX] = useState(0);
  const touchStartX = useRef(null);

  const handleTouchStart = (e) => {
    if (disabled) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    if (disabled || touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;
    if (diff < 0 && diff > -70) setTranslateX(diff);
  };

  const handleTouchEnd = () => {
    if (disabled) return;
    if (translateX <= -40) onSwipe();
    setTranslateX(0);
    touchStartX.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${translateX}px)`,
        transition: translateX === 0 ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
        width: '100%',
        position: 'relative',
        touchAction: 'pan-y',
        willChange: 'transform',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: -40,
          transform: 'translateY(-50%)',
          opacity: translateX < -20 ? 1 : 0,
          transition: 'opacity 0.2s',
          color: 'var(--dim)',
        }}
      >
        {ReplyActionIcon}
      </div>
      {children}
    </div>
  );
}