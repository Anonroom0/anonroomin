import { useEffect, useRef, useState } from 'react';

/**
 * ToastContainer
 *
 * Self-contained, provider-free toast renderer. Mount this exactly once
 * near the root of the app (e.g. in App.jsx). It listens for the global
 * 'anonroom:toast' window CustomEvent (dispatched by src/lib/toast.js)
 * and renders a stack of glassmorphic toast pills anchored to the
 * top-center of the screen, above the safe area.
 *
 * Restyled onto the shared --ink-2 / --paper / --dim / --ember / --signal
 * token system (tokens.css). All queueing/dismiss timing and the
 * 'anonroom:toast' event contract are unchanged — src/lib/toast.js keeps
 * calling into this exactly as it does today.
 *
 * No props. No context. No external dependencies.
 */

// How long a toast stays visible before auto-dismissing.
const AUTO_DISMISS_MS = 3500;
// Must match the CSS transition/animation duration used for exit below,
// so we don't rip the toast out of the DOM before its fade-out finishes.
const EXIT_ANIMATION_MS = 220;

// Per-type visual accents. All types share the same glass surface (applied
// via .glass-panel below); only the accent color + glyph differ.
//
// The token palette only defines one semantic accent (--ember, for
// success/action) plus --signal, which is reserved for live/delivered
// states specifically — none of this module's three documented types
// ('error' | 'success' | 'info', per toast.js) represent that, so --signal
// isn't used here. There's no dedicated destructive/error color in this
// palette, so 'error' uses --paper (the brightest neutral available) to
// keep it visually louder than the merely-informational --dim used for
// 'info', while still staying inside the token system rather than
// introducing a red that doesn't exist in tokens.css.
const TYPE_STYLES = {
  error: {
    accent: 'var(--paper)',
    glyph: '!',
  },
  success: {
    accent: 'var(--ember)',
    glyph: '✓',
  },
  info: {
    accent: 'var(--dim)',
    glyph: 'i',
  },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  // Tracks setTimeout handles so we can clean them up on unmount or
  // early dismissal, keyed by toast id. Each entry can hold both an
  // "auto-dismiss" timer and a "remove-after-exit-animation" timer.
  const timersRef = useRef(new Map());

  useEffect(() => {
    function clearTimersFor(id) {
      const entry = timersRef.current.get(id);
      if (entry) {
        clearTimeout(entry.autoDismiss);
        clearTimeout(entry.removeAfterExit);
        timersRef.current.delete(id);
      }
    }

    function removeToast(id) {
      clearTimersFor(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    function beginDismiss(id) {
      // Mark as leaving so it plays the fade-out animation, then
      // actually remove it from state once the animation finishes.
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );

      const entry = timersRef.current.get(id) || {};
      clearTimeout(entry.autoDismiss);
      entry.removeAfterExit = setTimeout(() => removeToast(id), EXIT_ANIMATION_MS);
      timersRef.current.set(id, entry);
    }

    function handleToastEvent(event) {
      const { id, message, type } = event.detail || {};
      if (!id || !message) return;

      const safeType = TYPE_STYLES[type] ? type : 'error';

      setToasts((prev) => [
        { id, message, type: safeType, leaving: false },
        ...prev,
      ]);

      const autoDismiss = setTimeout(() => beginDismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, { autoDismiss, removeAfterExit: null });
    }

    window.addEventListener('anonroom:toast', handleToastEvent);

    return () => {
      window.removeEventListener('anonroom:toast', handleToastEvent);
      // Clean up every pending timer on unmount.
      timersRef.current.forEach((entry) => {
        clearTimeout(entry.autoDismiss);
        clearTimeout(entry.removeAfterExit);
      });
      timersRef.current.clear();
    };
  }, []);

  function handleTap(id) {
    const entry = timersRef.current.get(id);
    if (entry) {
      clearTimeout(entry.autoDismiss);
    }
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    const removeAfterExit = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, EXIT_ANIMATION_MS);
    timersRef.current.set(id, { autoDismiss: null, removeAfterExit });
  }

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes anonroom-toast-in {
          from {
            opacity: 0;
            transform: translateY(-14px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes anonroom-toast-out {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-10px) scale(0.97);
          }
        }
        .anonroom-toast {
          animation: anonroom-toast-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .anonroom-toast.anonroom-toast-leaving {
          animation: anonroom-toast-out ${EXIT_ANIMATION_MS}ms ease forwards;
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          pointerEvents: 'none',
          width: 'min(92vw, 420px)',
        }}
      >
        {toasts.map((toast) => {
          const { accent, glyph } = TYPE_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className={`glass-panel anonroom-toast${toast.leaving ? ' anonroom-toast-leaving' : ''}`}
              onClick={() => handleTap(toast.id)}
              role="status"
              style={{
                pointerEvents: 'auto',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 18px',
                // .glass-panel supplies the shared blur/border/shadow and
                // radius-card corners; toasts override the background to
                // the more opaque --ink-2 surface (rather than the
                // translucent --glass-white the class defaults to) so text
                // stays legible over whatever's behind it, and override the
                // radius to a full pill shape, which radius-card doesn't
                // cover. Inline styles win over the class for both.
                background: 'var(--ink-2)',
                borderRadius: '999px',
                color: 'var(--paper)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: accent,
                  background: `color-mix(in srgb, ${accent} 20%, transparent)`,
                  border: `1px solid ${accent}`,
                }}
              >
                {glyph}
              </span>
              <span
                style={{
                  fontSize: '14px',
                  lineHeight: 1.35,
                  wordBreak: 'break-word',
                  flex: 1,
                }}
              >
                {toast.message}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
