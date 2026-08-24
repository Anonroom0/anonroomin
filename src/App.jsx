/**
 * ============================================================================
 * ROOT APP WRAPPER & LOCATION GATE (SUBDOMAIN SAFEGUARD FIX)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider } from './lib/authContext';
import Home from './pages/Home';
import supabase from './lib/supabaseClient';
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

function LocationGate({ children }) {
  const [status, setStatus] = useState('checking'); // 'checking', 'denied', 'allowed'

  useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const isSubdomain = parts.length > 2 && parts[0] !== 'www';

    const urlParams = new URLSearchParams(window.location.search);
    const redirectParam = urlParams.get('redirect');
    const hasGrantedLocation = localStorage.getItem('anonroom_location_verified') === 'true';

    // If we just got verified on the root domain and there's a redirect query parameter, bounce back immediately!
    if (redirectParam && hasGrantedLocation) {
      window.location.href = decodeURIComponent(redirectParam);
      return;
    }

    if (hasGrantedLocation) {
      setStatus('allowed');
      return;
    }

    // If on a subdomain and location isn't verified yet, redirect to root domain with the target URL in query params
    if (isSubdomain && !hasGrantedLocation) {
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
        localStorage.setItem('anonroom_location_verified', 'true');
        setStatus('allowed');

        let visitorId = localStorage.getItem('anonroom_visitor_id');
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          localStorage.setItem('anonroom_visitor_id', visitorId);
          
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
  return (
    <AuthProvider>
      <LocationGate>
        <Home />
      </LocationGate>
    </AuthProvider>
  );
}
