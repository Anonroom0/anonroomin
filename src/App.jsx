/**
 * ============================================================================
 * ROOT APP WRAPPER & ROUTE DISPATCH
 * ============================================================================
 * Top-level component: mounts the global toast host, the auth provider, and
 * dispatches to one of three top-level views based on the current URL —
 * <Home/> (default), <QuestionThread/> (/q/<id>), or <ConfessionsFeed/>
 * (/confessions) — via src/lib/subdomain.js's getQuestionIdFromPath() /
 * isConfessionsFeedPath(). Both of the latter two must be reachable by a
 * fully anonymous, unauthenticated visitor, so they're dispatched the same
 * way <Home/> is: never gated behind a login prompt, and never gated behind
 * location permission.
 *
 * CHANGES IN THIS PASS:
 * - LocationGate's BLOCKING behavior is gone entirely: no more 'checking' /
 *   'denied' full-screen takeover states, and no more forced
 *   navigator.geolocation.getCurrentPosition() call on mount. Whatever the
 *   route resolves to now renders immediately, regardless of location
 *   permission state.
 * - Replaced with <LocationBanner/>: a small, dismissible, non-blocking
 *   glass-panel banner that only requests location when the visitor taps
 *   "Allow". "Not now" just hides it and remembers that dismissal in
 *   localStorage so it doesn't re-nag on every load.
 * - The old inline cookie/visitor-id duplication is gone; location-grant
 *   bookkeeping now goes through src/lib/visitorId.js's getCookie/setCookie/
 *   getOrCreateVisitorId() instead.
 * - The subdomain -> root "bounce to root domain just to ask for location"
 *   redirect is deleted outright. A group subdomain (or any route) now
 *   renders its real content immediately; the location cookie is shared
 *   across subdomains simply because setCookie() (see visitorId.js) already
 *   scopes it to the shared parent domain, so granting it anywhere on
 *   *.anonroom.in still covers the whole app without a redirect round-trip.
 * - Added routing branches for /q/<id> (QuestionThread) and /confessions
 *   (ConfessionsFeed).
 *
 * Dependencies: React, AuthProvider, Supabase, ToastContainer,
 * src/lib/subdomain.js, src/lib/visitorId.js, Home, QuestionThread,
 * ConfessionsFeed
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider } from './lib/authContext';
import Home from './pages/Home';
import QuestionThread from './pages/QuestionThread';
import ConfessionsFeed from './pages/ConfessionsFeed';
import ResetPassword from './pages/ResetPassword';
import supabase from './lib/supabaseClient';
import ToastContainer from './components/ToastContainer';
import { getQuestionIdFromPath, isConfessionsFeedPath, isResetPasswordPath, isGroupSubdomain, getGroupSlugFromRealSubdomain, getGroupUrl, isAdministratorSubdomain } from './lib/subdomain';
import AdminPanel from './pages/AdminPanel';
import { getCookie, setCookie, getOrCreateVisitorId } from './lib/visitorId';
import './styles/tokens.css';

const LOCATION_VERIFIED_COOKIE = 'anonroom_location_verified';
const LOCATION_BANNER_DISMISSED_KEY = 'anonroom_location_banner_dismissed';
// Matches the storage key visitorId.js writes internally — read directly
// here (rather than adding a new export) purely to answer "does a visitor
// id already exist" so the metadata row below is only inserted once.
const VISITOR_ID_STORAGE_KEY = 'anonroom_visitor_id';

const Vectors = {
  Pin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
};

// ----------------------------------------------------------------------------
// LOCATION BANNER (non-blocking)
// ----------------------------------------------------------------------------
// Renders nothing once the visitor has either granted location or
// dismissed the banner (this session's localStorage flag), and never
// blocks the route underneath it from rendering while it decides.
function LocationBanner() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    // Never show this on a group subdomain — see isGroupSubdomain()'s
    // comment in subdomain.js for why. Root-domain visits are unaffected.
    if (isGroupSubdomain()) {
      setVisible(false);
      return;
    }
    const alreadyGranted = getCookie(LOCATION_VERIFIED_COOKIE) === 'true';
    const alreadyDismissed = localStorage.getItem(LOCATION_BANNER_DISMISSED_KEY) === 'true';
    setVisible(!alreadyGranted && !alreadyDismissed);
  }, []);

  function handleDismiss() {
    localStorage.setItem(LOCATION_BANNER_DISMISSED_KEY, 'true');
    setVisible(false);
  }

  function handleAllow() {
    if (!('geolocation' in navigator)) {
      // No geolocation support at all: nothing to request, just stop nagging.
      handleDismiss();
      return;
    }

    setRequesting(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setCookie(LOCATION_VERIFIED_COOKIE, 'true');
        localStorage.setItem(LOCATION_VERIFIED_COOKIE, 'true'); // harmless bonus, not the source of truth

        // Determine "new visitor" BEFORE minting/reading via
        // getOrCreateVisitorId(), so the metadata insert below only ever
        // fires once per visitor, exactly like the old inline logic did.
        const hadVisitorId = Boolean(
          getCookie(VISITOR_ID_STORAGE_KEY) || localStorage.getItem(VISITOR_ID_STORAGE_KEY)
        );
        const visitorId = getOrCreateVisitorId();

        if (!hadVisitorId) {
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

        setRequesting(false);
        setVisible(false);
      },
      (err) => {
        console.warn('Location permission denied or unavailable:', err);
        setRequesting(false);
        // Denying isn't the same as dismissing — leave the banner up so the
        // visitor can still tap "Not now" or retry "Allow" later, rather
        // than silently persisting a denial we never asked to remember.
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  if (!visible) return null;

  return (
    <div
      className="pop-in"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 5000,
        maxWidth: 420,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 20,
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(115%)',
        WebkitBackdropFilter: 'blur(20px) saturate(115%)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        color: 'var(--paper)'
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--glass-border)',
          color: 'var(--signal)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {Vectors.Pin}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
          Enable location for a better experience
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          disabled={requesting}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dim)',
            fontWeight: 600,
            fontSize: 13,
            padding: '8px 10px',
            borderRadius: 14,
            cursor: requesting ? 'default' : 'pointer'
          }}
        >
          Not now
        </button>
        <button
          onClick={handleAllow}
          disabled={requesting}
          style={{
            background: 'var(--ember)',
            border: 'none',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            padding: '8px 16px',
            borderRadius: 14,
            cursor: requesting ? 'default' : 'pointer',
            opacity: requesting ? 0.7 : 1
          }}
        >
          {requesting ? 'Checking…' : 'Allow'}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// TOP-LEVEL ROUTE DISPATCH
// ----------------------------------------------------------------------------
// Plain reads of window.location, resolved once per full page load — the
// same "no client router" model the rest of the app uses (see
// getGroupSlugFromHost() / getDmUsernameFromPath() in Home.jsx). /q/<id> and
// /confessions both need to be visible to a signed-out visitor, so they're
// dispatched at this same top level rather than nested inside any
// login-required or location-gated branch.
function resolveTopLevelView() {
  // Checked first: this is where Supabase's password-recovery email link
  // redirects to (see AuthModal.jsx's resetPasswordForEmail redirectTo),
  // and it needs to render outside any auth gate exactly like /q/<id> and
  // /confessions — the visitor isn't "logged in" yet in the normal sense,
  // they're mid-recovery.
  if (isResetPasswordPath()) {
    return <ResetPassword />;
  }

  if (isConfessionsFeedPath()) {
    return <ConfessionsFeed />;
  }

  // ✅ FIX: Commented out the manual override for `/q/<id>`. 
  // This forces it to fall through to `<Home />`, which properly handles
  // putting the chat window in the right-hand panel on desktop!
  //
  // const questionId = getQuestionIdFromPath();
  // if (questionId) {
  //   return <QuestionThread questionId={questionId} />;
  // }

  return <Home />;
}

// ----------------------------------------------------------------------------
// GROUP SUBDOMAIN -> /g/<slug> REDIRECT
// ----------------------------------------------------------------------------
// Groups no longer render on their own subdomain at all. A visit to a real
// production subdomain (groupname.anonroom.in) now ONLY ever redirects to
// the path-based anonroom.in/g/<slug> route (see getGroupUrl in
// subdomain.js) — it never opens the group's content itself. This check
// runs before anything else mounts (AuthProvider, Home, etc.), so a
// subdomain visit never flashes the app before bouncing.
function useGroupSubdomainRedirect() {
  const [slug] = useState(() => getGroupSlugFromRealSubdomain());

  useEffect(() => {
    if (slug) {
      window.location.replace(getGroupUrl(slug));
    }
  }, [slug]);

  return slug;
}

// Minimal placeholder shown for the brief moment between mount and the
// browser actually following the redirect above — never the group's
// content itself, since that no longer renders on the subdomain at all.
function SubdomainRedirectScreen() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ink, #0C0D10)',
        color: 'var(--dim, #8B8B96)',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      Redirecting…
    </div>
  );
}

export default function App() {
  const subdomainGroupSlug = useGroupSubdomainRedirect();

  // ----------------------------------------------------------------------
  // JS-level pinch-zoom prevention.
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

  // ----------------------------------------------------------------------
  // Global Browser Autofill Bar Blocker
  // ----------------------------------------------------------------------
  useEffect(() => {
    const sanitizeInputs = () => {
      const inputs = document.querySelectorAll('input, textarea');
      inputs.forEach(input => {
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');
        
        if (input.getAttribute('type') === 'password') {
          // Best for actual password fields
          input.setAttribute('autoComplete', 'new-password');
        } else {
          // The magic bullet for hiding the Key/Card/Pin bar on text fields
          input.setAttribute('autoComplete', 'one-time-code');
        }
      });
    };

    sanitizeInputs();
    const observer = new MutationObserver(sanitizeInputs);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // A real group subdomain never renders the app itself — just the brief
  // redirect placeholder while the browser follows the replace() above.
  if (subdomainGroupSlug) {
    return <SubdomainRedirectScreen />;
  }

  // administrator.anonroom.in renders a completely separate view (its own
  // gate on profile.is_admin lives inside AdminPanel itself) instead of the
  // normal Home/QuestionThread/ConfessionsFeed dispatch below. It still
  // needs AuthProvider so it can read the shared cross-subdomain session.
  if (isAdministratorSubdomain()) {
    return (
      <>
        <ToastContainer />
        <AuthProvider>
          <AdminPanel />
        </AuthProvider>
      </>
    );
  }

  return (
    <>
      {/* Mounted once, above everything else, so toasts can render no
          matter which top-level view is active. */}
      <ToastContainer />
      <AuthProvider>
        {resolveTopLevelView()}
      </AuthProvider>
      <LocationBanner />
    </>
  );
}
