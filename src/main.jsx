import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { isAdministratorSubdomain } from './lib/subdomain';
import './styles/tokens.css';
import './styles/animations.css';

// Theme bootstrap: dark by default, respect saved preference.
(() => {
  try {
    const saved = localStorage.getItem('anonroom-theme');
    const theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { App as CapacitorApp } from '@capacitor/app';

// When running as the wrapped native Android app (Capacitor), the WebView
// draws edge-to-edge under the status bar by default, which is what was
// causing the app header to sit underneath/behind the status bar. This
// tells the status bar not to overlay the web content, pushing the app's
// own header down below it instead. No-op on the regular web/PWA build.
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
}

// Some in-app browsers (Instagram, Facebook, LinkedIn) don't resize the
// layout viewport when the on-screen keyboard opens the way Chrome/Safari
// do — so anything pinned via CSS `position: fixed` + full-height containers
// (our chat screens) stays anchored behind the keyboard instead of sitting
// above it. Compensate by measuring the actual visible area via the
// VisualViewport API and exposing it as a CSS variable + a class on <html>,
// which any fixed-bottom composer can use as a bottom offset.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const applyViewportOffset = () => {
    const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
    document.documentElement.classList.toggle('keyboard-open', keyboardInset > 60);
  };
  vv.addEventListener('resize', applyViewportOffset);
  vv.addEventListener('scroll', applyViewportOffset);
  applyViewportOffset();

  // Same fix as useViewportHeight.js (see that file's comment for the full
  // explanation): Instagram's in-app browser updates vv.height correctly
  // but often never fires the 'resize'/'scroll' event that triggers the
  // recompute above, which is why the composer bar sits fixed behind the
  // keyboard there while Chrome handles it fine. Force a re-check on
  // window resize and on every text-field focus/blur so a missing event
  // can't leave --keyboard-inset stuck at a stale value.
  window.addEventListener('resize', applyViewportOffset);
  let keyboardPollTimers = [];
  const pollAfterFocusChange = () => {
    keyboardPollTimers.forEach(clearTimeout);
    keyboardPollTimers = [];
    for (let elapsed = 0; elapsed <= 1500; elapsed += 100) {
      keyboardPollTimers.push(setTimeout(applyViewportOffset, elapsed));
    }
  };
  const isTextField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  document.addEventListener('focusin', (e) => { if (isTextField(e.target)) pollAfterFocusChange(); });
  document.addEventListener('focusout', (e) => { if (isTextField(e.target)) pollAfterFocusChange(); });
}

// Instagram's in-app browser (and Facebook's/LinkedIn's) has long-standing,
// Meta-side keyboard/viewport bugs that the fix above can't fully paper
// over in every case. Flag it so the UI can optionally nudge people to open
// the link in their real browser instead.
export const isInAppBrowser = /Instagram|FBAN|FBAV|LinkedInApp/.test(navigator.userAgent);

// Safety-net redirect: administrator.<root domain> is supposed to be served
// admin.html directly at the host level (see vercel.json's host-based
// rewrite), so this main app (index.html -> main.jsx -> App.jsx) should
// never even load there. If it DOES end up loading here anyway — e.g. the
// hosting rewrite hasn't taken effect, a CDN edge is serving a stale/cached
// response, or the site is opened somewhere the rewrite doesn't apply —
// this catches it client-side and hard-navigates to /admin.html instead of
// silently rendering the normal home page on the admin host. Runs before
// React mounts and bails out immediately so nothing else in this file
// executes.
if (isAdministratorSubdomain() && !window.location.pathname.startsWith('/admin.html')) {
  window.location.replace('/admin.html');
} else {

// Register the Service Worker for Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });

    // Optional enhancement hook: if public/sw.js's notificationclick handler
    // ever posts a message back to an already-focused client (instead of
    // just calling client.focus()), this lets the app route client-side
    // rather than relying on a full navigation to notification.data.url.
    // NOTE: this is inert today — public/sw.js's notificationclick handler
    // (its `client.url == url && 'focus' in client` branch) does not yet
    // call client.postMessage(...) there, so this listener currently never
    // fires. It would need a matching `client.postMessage({ type: 'notification-navigate', url })`
    // added to that branch in sw.js to actually use this.
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'notification-navigate' && event.data?.url) {
        try {
          const u = new URL(event.data.url, window.location.origin);
          // Same-origin: stay inside the SPA / WebView — never bounce to an
          // external browser tab which would "close" the app experience.
          if (u.origin === window.location.origin || u.hostname.endsWith('anonroom.in')) {
            const path = `${u.pathname}${u.search}${u.hash}`;
            window.history.pushState({}, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          } else {
            window.location.assign(event.data.url);
          }
        } catch {
          window.location.assign(event.data.url);
        }
      }
    });
  });
}

// Capacitor / Android App Links: when the OS opens https://anonroom.in/...
// into the already-running WebView, route in-app instead of a full reload
// that can feel like leaving the app.
if (Capacitor.isNativePlatform()) {
  document.addEventListener('deviceready', () => {}, { once: true });
}

// Hardware/gesture back button (Android). Without this listener, Capacitor's
// default behavior is to exit the app on every back press — even with a
// DM/group/question/story open — which is the "back button just closes the
// whole app" bug. `canGoBack` reflects the WebView's own session history,
// which grows by one on every pushState this SPA does (opening a
// DM/group/question/story, navigateInApp calls, the anchor intercept
// below, ResetPassword's redirect, etc. — all pushState, never replaceState,
// except where a screen deliberately wants back to skip over it). So here,
// "go back" always means "close whatever's open via the same popstate
// listeners Home.jsx/App.jsx already have" (see resolveActiveChatFromLocation
// in Home.jsx and the top-level listener in App.jsx), and it's only once
// there's truly nothing left in that history that the app should exit.
if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });
}

// Global same-origin anchor intercept — runs on web AND native (previously
// native-only). Any <a href="/..."> or <a href="https://anonroom.in/...">
// anywhere in the app — including ones that aren't already wrapped in a
// navigateInApp()/onClick handler — gets routed through pushState + a
// synthetic popstate instead of a full document navigation. On native this
// also keeps the WebView from ever loading the real internet host (which
// would drop it out of the bundled app entirely, not just "leave the
// screen"); on web it's what makes an ordinary same-origin <a> behave like
// the rest of the SPA instead of a full-page reload/flash. External links
// (different host, target="_blank", download, mailto:/tel:/#) are left
// alone either way.
document.addEventListener(
  'click',
  (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    // Explicit opt-out for the rare internal link that genuinely needs a
    // full reload — e.g. anything pointing at admin.html, a separate Vite
    // entry point/bundle that isn't part of this SPA's router at all.
    if (a.hasAttribute('data-hard-nav')) return;
    try {
      const u = new URL(href, window.location.origin);
      if (u.origin === window.location.origin || u.hostname.endsWith('anonroom.in')) {
        e.preventDefault();
        window.history.pushState({}, '', `${u.pathname}${u.search}${u.hash}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch {
      /* ignore */
    }
  },
  true,
);

// Global double-tap-to-zoom prevention safeguard.
// Some mobile browsers still allow zooming via a rapid double-tap even when
// pinch-zoom is otherwise blocked elsewhere in the app.
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  // Never intercept taps on text fields — preventDefault here blocks the
  // iOS Safari keyboard from opening on the composer.
  const t = event.target;
  if (t && (t.closest && t.closest('input, textarea, select, [contenteditable="true"]'))) {
    lastTouchEnd = 0;
    return;
  }
  const now = Date.now();
  if (now - lastTouchEnd < 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

}
