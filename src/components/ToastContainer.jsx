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
 * No props. No context. No external dependencies.
 */

// How long a toast stays visible before auto-dismissing.
const AUTO_DISMISS_MS = 3500;
// Must match the CSS transition/animation duration used for exit below,
// so we don't rip the toast out of the DOM before its fade-out finishes.
const EXIT_ANIMATION_MS = 220;

// Per-type visual accents. All types share the same glass background;
// only the accent color + dot/icon differ.
const TYPE_STYLES = {
  error: {
    accent: 'var(--red)',
    glyph: '!',
  },
  success: {
    accent: '#34d399', // green accent (falls back gracefully if no --green token exists)
    glyph: '✓',
  },
  info: {
    accent: 'var(--blue)',
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
              className={`anonroom-toast${toast.leaving ? ' anonroom-toast-leaving' : ''}`}
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
                borderRadius: '999px',
                background: 'var(--glass-strong, var(--glass))',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28), 0 1px 0 rgba(255, 255, 255, 0.06) inset',
                color: 'var(--ink)',
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
                  background: accent.startsWith('var(')
                    ? `color-mix(in srgb, ${accent} 20%, transparent)`
                    : `${accent}33`,
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
