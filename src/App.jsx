/**
 * ============================================================================
 * ROOT APP WRAPPER & LOCATION GATE (SUBDOMAIN SAFEGUARD FIX)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider } from './lib/authContext';
import Home from './pages/Home';
import supabase from './lib/supabaseClient';
import ToastContainer from './components/ToastContainer';
import './styles/tokens.css';

const Vectors = {
  Spinner: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  LocationOff: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.2 16.2A8.43 8.43 0 0 0 19 11c0-4.4-3.6-8-8-8a8.43 8.43 0 0 0-5.2 2.8" />
      <path d="M12 11a3 3 0 0 1-3-3" />
      <path d="M4.6 4.6l14.8 14.8" />
      <path d="M21 21l-18-18" />
    </svg>
  )
};

// ----------------------------------------------------------------------------
// Cookie helpers (BUG 1 fix)
// ----------------------------------------------------------------------------
// localStorage is scoped per-origin, so a subdomain (general.anonroom.in)
// never shares storage with the root domain (anonroom.in). That caused the
// infinite redirect loop: the root domain would verify location and set a
// localStorage flag, but the subdomain could never see it and would keep
// bouncing the user back to root forever.
//
// The fix is to make cookies (scoped to a shared parent domain) the source
// of truth, since cookies with an explicit `domain` attribute are shared
// across all subdomains automatically. This mirrors the exact same
// domain-detection pattern already used in src/lib/supabaseClient.js,
// duplicated inline here so this file stays self-contained.

function getCookieDomain() {
  const hostname = window.location.hostname;
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

  if (hostname.includes('anonroom.in')) {
    return '.anonroom.in';
  }
  if (hostname === 'localhost' || isIPv4) {
    return hostname;
  }
  // Fallback for any other environment (e.g. preview deployments):
  // scope the cookie to the exact host rather than guessing a parent domain.
  return hostname;
}

function setCookie(name, value, days = 365) {
  const domain = getCookieDomain();
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; domain=${domain}; max-age=${maxAge}; SameSite=Lax; Secure`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function LocationGate({ children }) {
  const [status, setStatus] = useState('checking'); // 'checking', 'denied', 'allowed'

  useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const isSubdomain = parts.length > 2 && parts[0] !== 'www';

    const urlParams = new URLSearchParams(window.location.search);
    const redirectParam = urlParams.get('redirect');

    // Cookie is the source of truth (shared across root + subdomains).
    // We still also write to localStorage below as a harmless bonus, but
    // never read it as the deciding factor anymore.
    const hasGrantedLocation = getCookie('anonroom_location_verified') === 'true';

    // If we just got verified on the root domain and there's a redirect query parameter, bounce back immediately!
    if (redirectParam && hasGrantedLocation) {
      window.location.href = decodeURIComponent(redirectParam);
      return;
    }

    if (hasGrantedLocation) {
      setStatus('allowed');
      return;
    }

    // If on a subdomain and location isn't verified yet, redirect to root domain with the target URL in query params.
    // Loop guard: if we've already attempted this redirect once in this
    // browser session (e.g. cookies are blocked so verification can never
    // "stick"), don't redirect again — fail safely into the denied state
    // instead of bouncing back and forth forever.
    if (isSubdomain && !hasGrantedLocation) {
      if (sessionStorage.getItem('anonroom_redirect_attempted') === 'true') {
        setStatus('denied');
        return;
      }

      sessionStorage.setItem('anonroom_redirect_attempted', 'true');

      const rootDomain = parts.slice(-2).join('.');
      const protocol = window.location.protocol;
      const port = window.location.port ? `:${window.location.port}` : '';
      const currentUrl = encodeURIComponent(window.location.href);

      window.location.href = `${protocol}//${rootDomain}${port}/?redirect=${currentUrl}`;
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('denied');
      return;
    }

    // Request Location Permission on Root Domain
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setCookie('anonroom_location_verified', 'true');
        localStorage.setItem('anonroom_location_verified', 'true'); // harmless bonus, not the source of truth
        setStatus('allowed');

        let visitorId = getCookie('anonroom_visitor_id') || localStorage.getItem('anonroom_visitor_id');
        const isNewVisitor = !visitorId;

        if (isNewVisitor) {
          visitorId = crypto.randomUUID();
        }

        // Keep the cookie (shared across subdomains) and localStorage in sync either way.
        setCookie('anonroom_visitor_id', visitorId);
        localStorage.setItem('anonroom_visitor_id', visitorId);

        if (isNewVisitor) {
          await supabase.from('visitor_metadata').insert([{
            visitor_id: visitorId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            device_type: /Mobi/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            browser: navigator.userAgent,
            os: navigator.platform
          }]);
        }

        // If a redirect param exists in the root domain query string, bounce back now!
        if (redirectParam) {
          window.location.href = decodeURIComponent(redirectParam);
        }
      },
      (err) => {
        console.warn("Location permission denied:", err);
        setStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  if (status === 'checking') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)' }}>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .loader-spin { animation: spin 1s linear infinite; }`}</style>
        <div className="loader-spin" style={{ color: 'var(--blue)' }}>{Vectors.Spinner}</div>
        <p style={{ marginTop: 16, fontWeight: 600, fontSize: 15 }}>Verifying Region...</p>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)', padding: 24, textAlign: 'center' }}>
        <div style={{ color: 'var(--red)', marginBottom: 20 }}>{Vectors.LocationOff}</div>
        <h2 style={{ margin: '0 0 12px 0', fontSize: 24, fontWeight: 800 }}>Location Access Required</h2>
        <p style={{ margin: '0 0 24px 0', color: 'var(--dim)', lineHeight: 1.5, fontSize: 15, maxWidth: 340 }}>
          Anonroom requires location permission to verify your region. 
          <br/><br/>
          <strong style={{ color: 'var(--ink)' }}>If you previously clicked Block:</strong> Tap the lock/settings icon in your browser's address bar, reset permissions, and refresh the page.
        </p>
        <button 
          onClick={() => {
            if (navigator.permissions && navigator.permissions.query) {
              navigator.permissions.query({ name: 'geolocation' }).then((result) => {
                if (result.state === 'denied') {
                  alert("Location is blocked in your browser settings. Please click the lock icon 🔒 next to the URL, clear permissions, and reload.");
                } else {
                  window.location.reload();
                }
              });
            } else {
              window.location.reload();
            }
          }} 
          style={{ background: 'var(--blue)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 24, fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 8px 24px rgba(10,132,255,0.3)' }}
        >
          Try Again / Check Settings
        </button>
      </div>
    );
  }

  return children;
}

export default function App() {
  // ----------------------------------------------------------------------
  // BUG 2 fix: JS-level pinch-zoom prevention.
  // ----------------------------------------------------------------------
  // `user-scalable=no` in the viewport meta tag is ignored by some
  // browsers (notably iOS Safari) for accessibility reasons, so pinch
  // gestures can still zoom the page. This adds a global safety net:
  // block Safari's 'gesturestart' event, and block any multi-touch
  // 'touchmove' (the second finger of a pinch) app-wide.
  useEffect(() => {
    function handleGestureStart(e) {
      e.preventDefault();
    }

    function handleTouchMove(e) {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }

    document.addEventListener('gesturestart', handleGestureStart);
    // Must be non-passive, or preventDefault() on touchmove is a no-op.
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', handleGestureStart);
      document.removeEventListener('touchmove', handleTouchMove, { passive: false });
    };
  }, []);

  return (
    <>
      {/* BUG 3 fix: mounted once, outside/above LocationGate, so toasts can
          render even during the "Verifying Region..." or "denied" screens. */}
      <ToastContainer />
      <AuthProvider>
        <LocationGate>
          <Home />
        </LocationGate>
      </AuthProvider>
    </>
  );
}
