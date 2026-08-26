/** ===========================================================================
 * GLASS PANEL — shared card/sheet wrapper
 * ============================================================================
 * The base visual + motion wrapper every modal and sheet in the app builds
 * on: NotificationSettingsPanel, ShareStorySheet, CreateQuestionModal,
 * EditProfile, AuthModal, GroupCard, ProfileCard, MediaViewer,
 * EmojiGifPicker, and anything added after them.
 *
 *   <GlassPanel variant="card"> ... </GlassPanel>
 *     Renders a plain .glass-panel surface. No backdrop, no enter/exit
 *     choreography, no drag. For inline cards embedded in a layout (e.g. a
 *     profile summary block), not full-screen overlays.
 *
 *   <GlassPanel variant="sheet" onClose={fn}> ... </GlassPanel>
 *     Renders a .backdrop-fade behind a bottom sheet that plays .sheet-enter
 *     on mount and .sheet-exit before calling onClose. If onClose is
 *     provided, the sheet also supports 1:1 drag-to-dismiss: while dragging,
 *     translateY tracks the pointer exactly (no easing, no transition) —
 *     easing only ever applies once the finger lifts, to either spring the
 *     sheet back open or carry it the rest of the way closed, chosen by
 *     release distance/velocity. That's a deliberate difference from the
 *     .sheet-enter/.sheet-exit keyframes animations.css already owns: those
 *     are fixed-duration, fixed-path animations, but a drag's end position
 *     is different every time, so it structurally can't be expressed as a
 *     static keyframe — this is the one motion in this file that has to be
 *     driven by an inline transition rather than reusing an existing class.
 *
 * Buttons inside `children` (a sheet's own Cancel/Close) that want the same
 * animated exit — rather than an instant unmount the moment the parent
 * flips its `open` state — can call the requestClose() function exposed via
 * the useGlassPanelClose() hook instead of invoking their onClose prop
 * directly. This is optional: calling the parent's own onClose directly
 * still works exactly as it always has, it just skips the exit animation.
 * ========================================================================= */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Must roughly track the real duration of the .sheet-enter / .sheet-exit
// keyframes defined in animations.css, since these timers are what gate
// swapping the animation class out (enter) and firing onClose (exit).
const SHEET_ENTER_MS = 400;
const SHEET_EXIT_MS = 320;

// Drag-to-dismiss thresholds: either one alone is enough to dismiss.
const DRAG_DISMISS_DISTANCE_RATIO = 0.35; // 35% of the sheet's own height
const DRAG_DISMISS_VELOCITY_PX_MS = 0.5; // a fast downward flick

// Only used for the two post-release transitions (spring-back / carry-to-
// close) — never while the finger is actually down and dragging.
const SPRING_BACK_TRANSITION = 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)';
const CARRY_TO_CLOSE_TRANSITION = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';

const GlassPanelCloseContext = createContext(null);

/** Optional hook for content inside a sheet to trigger the same animated
 * close that the backdrop and drag-to-dismiss use. Returns a no-op outside
 * a sheet (or when the sheet has no onClose), so it's always safe to call. */
export function useGlassPanelClose() {
  const ctx = useContext(GlassPanelCloseContext);
  return ctx || (() => {});
}

export default function GlassPanel({ variant = 'card', onClose, children, className, style }) {
  if (variant === 'card') {
    // onClose has no meaning for a plain card — it's an inline surface, not
    // a dismissible overlay — so it's intentionally unused here.
    return (
      <div className={['glass-panel', className].filter(Boolean).join(' ')} style={style}>
        {children}
      </div>
    );
  }

  return (
    <GlassSheet onClose={onClose} className={className} style={style}>
      {children}
    </GlassSheet>
  );
}

function GlassSheet({ onClose, children, className, style }) {
  // 'entering' -> plays .sheet-enter, 'open' -> resting/interactive,
  // 'closing' -> either playing .sheet-exit or being carried off by a drag.
  const [phase, setPhase] = useState('entering');
  const [dragY, setDragY] = useState(0);
  const [dragTransition, setDragTransition] = useState('none');

  const sheetRef = useRef(null);
  const dragRef = useRef(null); // { startY, prevY, prevT }

  useEffect(() => {
    const timer = setTimeout(() => setPhase('open'), SHEET_ENTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const requestClose = useCallback(() => {
    if (!onClose || phase === 'closing') return;
    setPhase('closing');
    setDragTransition('none'); // resting at dragY 0 -> let .sheet-exit own the motion
    setTimeout(onClose, SHEET_EXIT_MS);
  }, [onClose, phase]);

  function handleBackdropClick() {
    requestClose();
  }

  function handlePointerDown(e) {
    if (!onClose || phase !== 'open') return;
    dragRef.current = { startY: e.clientY, prevY: e.clientY, prevT: performance.now() };
    setDragTransition('none');
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const now = performance.now();
    const rawDelta = e.clientY - drag.startY;
    // Floor at 0 so the sheet can't be dragged upward past its resting spot.
    const clamped = Math.max(0, rawDelta);
    drag.prevY = e.clientY;
    drag.prevT = now;
    // 1:1, no easing: the sheet's position on screen is a direct function
    // of the pointer's position on screen, every single move event.
    setDragTransition('none');
    setDragY(clamped);
  }

  function handlePointerUp(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const dt = Math.max(1, performance.now() - drag.prevT);
    const finalDelta = Math.max(0, e.clientY - drag.startY);
    const velocity = Math.max(0, e.clientY - drag.prevY) / dt; // px/ms, downward only
    dragRef.current = null;

    const panelHeight = sheetRef.current?.offsetHeight || 1;
    const distanceRatio = finalDelta / panelHeight;
    const pastThreshold = distanceRatio > DRAG_DISMISS_DISTANCE_RATIO || velocity > DRAG_DISMISS_VELOCITY_PX_MS;

    if (pastThreshold && onClose) {
      setPhase('closing');
      setDragTransition(CARRY_TO_CLOSE_TRANSITION);
      setDragY(panelHeight * 1.1); // carry it the rest of the way off-screen from wherever it was
      setTimeout(onClose, SHEET_EXIT_MS);
    } else {
      setDragTransition(SPRING_BACK_TRANSITION);
      setDragY(0);
    }
  }

  const isDraggable = !!onClose && phase === 'open';

  return (
    <GlassPanelCloseContext.Provider value={requestClose}>
      <div
        className="backdrop-fade"
        onClick={onClose ? handleBackdropClick : undefined}
        style={{
          opacity: phase === 'closing' ? 0 : 1,
          cursor: onClose ? 'pointer' : 'default',
        }}
      />
      <div
        ref={sheetRef}
        className={[
          'glass-sheet',
          phase === 'entering' ? 'sheet-enter' : '',
          phase === 'closing' && dragTransition === 'none' ? 'sheet-exit' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          ...style,
          transform: `translateY(${dragY}px)`,
          transition: dragTransition,
        }}
      >
        {isDraggable && (
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              padding: '10px 0 6px',
              touchAction: 'none',
              cursor: 'grab',
            }}
          >
            <div
              aria-hidden="true"
              style={{ width: 36, height: 5, borderRadius: 3, background: 'var(--glass-border)' }}
            />
          </div>
        )}
        {children}
      </div>
    </GlassPanelCloseContext.Provider>
  );
}
