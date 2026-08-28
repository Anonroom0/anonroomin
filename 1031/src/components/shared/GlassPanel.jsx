import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom'; // <--- ADDED PORTAL

const SHEET_ENTER_MS = 400;
const SHEET_EXIT_MS = 320;
const DRAG_DISMISS_DISTANCE_RATIO = 0.35; 
const DRAG_DISMISS_VELOCITY_PX_MS = 0.5; 
const SPRING_BACK_TRANSITION = 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)';
const CARRY_TO_CLOSE_TRANSITION = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';

const GlassPanelCloseContext = createContext(null);

export function useGlassPanelClose() {
  const ctx = useContext(GlassPanelCloseContext);
  return ctx || (() => {});
}

export default function GlassPanel({ variant = 'card', onClose, children, className, style }) {
  if (variant === 'card') {
    return (
      <div 
        className={className} 
        style={{
          ...style,
          backgroundColor: '#1C1D24', // SOLID MATTE FOR CARDS
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.06)'
        }}
      >
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
  const [phase, setPhase] = useState('entering');
  const [dragY, setDragY] = useState(0);
  const [dragTransition, setDragTransition] = useState('none');

  const sheetRef = useRef(null);
  const dragRef = useRef(null); 

  useEffect(() => {
    const timer = setTimeout(() => setPhase('open'), SHEET_ENTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const requestClose = useCallback(() => {
    if (!onClose || phase === 'closing') return;
    setPhase('closing');
    setDragTransition('none'); 
    setTimeout(onClose, SHEET_EXIT_MS);
  }, [onClose, phase]);

  function handleBackdropClick() { requestClose(); }

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
    const clamped = Math.max(0, rawDelta);
    drag.prevY = e.clientY; drag.prevT = now;
    setDragTransition('none'); setDragY(clamped);
  }

  function handlePointerUp(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const dt = Math.max(1, performance.now() - drag.prevT);
    const finalDelta = Math.max(0, e.clientY - drag.startY);
    const velocity = Math.max(0, e.clientY - drag.prevY) / dt; 
    dragRef.current = null;
    const panelHeight = sheetRef.current?.offsetHeight || 1;
    const distanceRatio = finalDelta / panelHeight;
    const pastThreshold = distanceRatio > DRAG_DISMISS_DISTANCE_RATIO || velocity > DRAG_DISMISS_VELOCITY_PX_MS;

    if (pastThreshold && onClose) {
      setPhase('closing'); setDragTransition(CARRY_TO_CLOSE_TRANSITION); setDragY(panelHeight * 1.1); setTimeout(onClose, SHEET_EXIT_MS);
    } else {
      setDragTransition(SPRING_BACK_TRANSITION); setDragY(0);
    }
  }

  const isDraggable = !!onClose && phase === 'open';

  // --------------------------------------------------------------------------
  // THE PORTAL UI (Physically escapes all CSS traps for generic Modals)
  // --------------------------------------------------------------------------
  const sheetUI = (
    <GlassPanelCloseContext.Provider value={requestClose}>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 99999, // Guaranteed Top Layer
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          pointerEvents: 'none' 
        }}
      >
        {/* SOLID BLACK DIMMING BACKDROP */}
        <div
          onClick={onClose ? handleBackdropClick : undefined}
          style={{
            position: 'absolute', inset: 0, 
            backgroundColor: 'rgba(0,0,0,0.85)', // 85% Solid Black
            opacity: phase === 'closing' ? 0 : 1,
            transition: 'opacity 0.3s ease',
            cursor: onClose ? 'pointer' : 'default',
            pointerEvents: 'auto',
            zIndex: 1
          }}
        />

        {/* THE SHEET CONTAINER (NO CLASSES) */}
        <div
          ref={sheetRef}
          style={{
            position: 'relative', zIndex: 2, pointerEvents: 'auto',
            width: '100%', maxWidth: 560, margin: '0 auto', 
            backgroundColor: '#1C1D24', // SOLID MATTE HEX
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
            
            // Handle Enter/Drag/Exit Translations strictly through inline styles
            transform: phase === 'entering' ? 'translateY(100%)' : `translateY(${dragY}px)`,
            transition: phase === 'entering' ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' : dragTransition,
            ...style
          }}
        >
          {isDraggable && (
            <div
              onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '12px 0 8px', touchAction: 'none', cursor: 'grab' }}
            >
              <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.15)' }} />
            </div>
          )}
          {children}
        </div>
      </div>
    </GlassPanelCloseContext.Provider>
  );

  if (typeof document !== 'undefined') {
    return createPortal(sheetUI, document.body);
  }
  return null;
}
