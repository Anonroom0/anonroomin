/**
 * ============================================================================
 * useViewportHeight — keyboard-safe viewport height + pan offset
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
 * `height` alone isn't the whole story, though. On several Android
 * browsers/webviews (Samsung Internet included), opening the keyboard
 * doesn't just shrink `visualViewport.height` — it also PANS the visual
 * viewport down within the (unchanged) layout viewport, so
 * `visualViewport.offsetTop` grows. The app's root is `position: fixed`,
 * which is anchored to the *layout* viewport, not the visual one — so as
 * offsetTop grows, the fixed root visually slides up out of view (its top
 * portion goes off-screen) even though nothing on the page actually
 * scrolled, and a gap of dead space opens up beneath whatever's now
 * bottom-most (typically a composer bar sitting just above the keyboard).
 * Consumers must translateY() the fixed root by `offsetTop` to compensate
 * — see Home.jsx's `.app-viewport` root for where that's applied.
 *
 * Usage: give a full-height flex column `style={{ height: vh ? `${vh}px` :
 * '100dvh', ... }}` — the bottom `flexShrink: 0` composer then always ends
 * up inside the real visible area, above the keyboard, because the whole
 * column is sized to exactly what's visible. Apply `offsetTop` as a
 * `translateY` on whatever `position: fixed` element anchors the app.
 * ============================================================================
 */
import { useEffect, useState } from 'react';

export function useViewportHeight() {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return { height: null, offsetTop: 0 };
    }
    return { height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop };
  });

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined; // no VisualViewport support — caller's 100dvh fallback stands

    function update() {
      setState({ height: vv.height, offsetTop: vv.offsetTop });
    }

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}

export default useViewportHeight;
