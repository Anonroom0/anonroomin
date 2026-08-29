/**
 * ============================================================================
 * useViewportHeight — keyboard-safe viewport height
 * ============================================================================
 * `100dvh` is *supposed* to shrink when the on-screen keyboard opens, but a
 * lot of real mobile browsers/webviews don't actually recompute it on
 * keyboard show (notably iOS Safari in various versions, and several
 * Android WebViews) — so a `height: '100dvh'` root with a `flexShrink: 0`
 * bottom composer bar ends up laid out against the *pre-keyboard* height,
 * and the keyboard simply covers the composer instead of the layout
 * shrinking to make room for it.
 *
 * `window.visualViewport`, where supported, DOES fire a live `resize` event
 * with the actual visible height as the keyboard animates open/closed. This
 * hook tracks that value in JS and falls back to `window.innerHeight` (and
 * ultimately `null`, meaning "just use 100dvh via CSS") wherever
 * `visualViewport` isn't available, so it's a strict enhancement — nothing
 * regresses on a platform that lacks it.
 *
 * Usage: give a full-height flex column `style={{ height: vh ? `${vh}px` :
 * '100dvh', ... }}` — the bottom `flexShrink: 0` composer then always ends
 * up inside the real visible area, above the keyboard, because the whole
 * column is sized to exactly what's visible.
 * ============================================================================
 */
import { useEffect, useState } from 'react';

export function useViewportHeight() {
  const [height, setHeight] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.visualViewport ? window.visualViewport.height : null;
  });

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined; // no VisualViewport support — caller's 100dvh fallback stands

    function update() {
      setHeight(vv.height);
    }

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return height;
}

export default useViewportHeight;
