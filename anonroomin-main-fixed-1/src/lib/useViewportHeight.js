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

// How long, and how often, to keep re-reading visualViewport after a text
// input gains/loses focus — see the big comment below for why this exists.
const FOCUS_POLL_DURATION_MS = 1500;
const FOCUS_POLL_INTERVAL_MS = 100;

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
      setState((prev) => {
        if (prev.height === vv.height && prev.offsetTop === vv.offsetTop) return prev;
        return { height: vv.height, offsetTop: vv.offsetTop };
      });
    }

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // Some in-app browsers (Instagram's chief among them — see main.jsx's
    // isInAppBrowser) reliably update `visualViewport.height` itself as the
    // keyboard opens, but DON'T reliably fire the 'resize'/'scroll' events
    // that this hook otherwise depends on entirely — a well-known, long-
    // standing bug in Meta's WebView wrapper, not something either browser
    // vendor can fix from here. Chrome/Safari fire the events correctly, so
    // this bug is invisible there — which is exactly why "Chrome shows the
    // input bar correctly above the keyboard, Instagram doesn't move it at
    // all" is the textbook symptom.
    //
    // Rather than trust the event to arrive, also listen for plain
    // `window.resize` (a second, independent signal some WebViews DO still
    // fire even when visualViewport's own events don't) and, on every
    // input/textarea focus or blur anywhere in the app, force a short burst
    // of re-reads of vv.height/offsetTop directly — a handful of times over
    // ~1.5s covers the keyboard's open/close animation regardless of
    // whether any event for it ever fires.
    function onWindowResize() { update(); }
    window.addEventListener('resize', onWindowResize);

    let pollTimers = [];
    function clearPolls() {
      pollTimers.forEach(clearTimeout);
      pollTimers = [];
    }
    function pollAfterFocusChange() {
      clearPolls();
      for (let elapsed = 0; elapsed <= FOCUS_POLL_DURATION_MS; elapsed += FOCUS_POLL_INTERVAL_MS) {
        pollTimers.push(setTimeout(update, elapsed));
      }
    }
    function handleFocusIn(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        pollAfterFocusChange();
      }
    }
    function handleFocusOut(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        pollAfterFocusChange();
      }
    }
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      clearPolls();
    };
  }, []);

  return state;
}

export default useViewportHeight;
