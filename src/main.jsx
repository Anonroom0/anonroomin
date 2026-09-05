import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isAdministratorSubdomain } from './lib/subdomain';
import './styles/tokens.css';
import './styles/animations.css';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

// When running as the wrapped native Android app (Capacitor), the WebView
// draws edge-to-edge under the status bar by default, which is what was
// causing the app header to sit underneath/behind the status bar. This
// tells the status bar not to overlay the web content, pushing the app's
// own header down below it instead. No-op on the regular web/PWA build.
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
}

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
        // Hook point for client-side routing (e.g. history.pushState +
        // whatever re-resolves App.jsx's top-level route) once sw.js
        // actually sends this message.
      }
    });
  });
}

// Global double-tap-to-zoom prevention safeguard.
// Some mobile browsers still allow zooming via a rapid double-tap even when
// pinch-zoom is otherwise blocked elsewhere in the app.
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

}
