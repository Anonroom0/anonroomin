/**
 * ============================================================================
 * ROOT APP WRAPPER & LOCATION GATE
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - Completely wraps the application in a strict `LocationGate`.
 * - Denies access to the app entirely if location permissions are blocked.
 * - Extracts latitude, longitude, and device metadata into separate DB columns
 *   for unknown/unlogged visitors.
 * - Fully unrolled and uncompressed.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider } from './lib/authContext';
import Home from './pages/Home';
import supabase from './lib/supabaseClient';
import './styles/tokens.css';

// ============================================================================
// 1. INLINE VECTORS
// ============================================================================
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

// ============================================================================
// 2. STRICT LOCATION GATE COMPONENT
// ============================================================================
function LocationGate({ children }) {
  const [status, setStatus] = useState('checking'); // 'checking', 'denied', 'allowed'

  useEffect(() => {
    // Check if browser supports geolocation
    if (!('geolocation' in navigator)) {
      setStatus('denied');
      return;
    }

    const checkLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setStatus('allowed');
          
          // Generate an anonymous tracking ID so we don't spam the database
          // with duplicate rows if the user refreshes the page multiple times.
          let visitorId = localStorage.getItem('anonroom_visitor_id');
          
          if (!visitorId) {
            visitorId = crypto.randomUUID();
            localStorage.setItem('anonroom_visitor_id', visitorId);
            
            // Capture extensive metadata into distinct columns
            const metadata = {
              visitor_id: visitorId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy,
              device_type: /Mobi/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
              browser: navigator.userAgent,
              os: navigator.platform
            };

            // Silently insert visitor telemetry
            await supabase.from('visitor_metadata').insert([metadata]);
          }
        },
        (err) => {
          console.warn("Location access denied or failed:", err);
          setStatus('denied');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    checkLocation();
  }, []);

  // --------------------------------------------------------------------------
  // RENDER: LOADING STATE
  // --------------------------------------------------------------------------
  if (status === 'checking') {
    return (
      <div 
        style={{ 
          display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', 
          alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)' 
        }}
      >
         <style>{`
           @keyframes spin { 100% { transform: rotate(360deg); } }
           .loader-spin { animation: spin 1s linear infinite; }
         `}</style>
         <div className="loader-spin" style={{ color: 'var(--blue)' }}>
           {Vectors.Spinner}
         </div>
         <p style={{ marginTop: 16, fontWeight: 600, fontSize: 15 }}>Securing Environment...</p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: BLOCKED STATE
  // --------------------------------------------------------------------------
  if (status === 'denied') {
    return (
      <div 
        style={{ 
          display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', 
          alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', 
          color: 'var(--ink)', padding: 24, textAlign: 'center' 
        }}
      >
         <div style={{ color: 'var(--red)', marginBottom: 20 }}>
           {Vectors.LocationOff}
         </div>
         <h2 style={{ margin: '0 0 12px 0', fontSize: 24, fontWeight: 800 }}>Region Restricted</h2>
         <p style={{ margin: 0, color: 'var(--dim)', lineHeight: 1.5, fontSize: 15, maxWidth: 320 }}>
           Anonroom is currently only available in select regions.<br/><br/>
           Please allow location access in your browser settings to verify your region and continue.
         </p>
         <button 
           onClick={() => window.location.reload()} 
           style={{ 
             marginTop: 32, background: 'var(--blue)', color: '#fff', border: 'none', 
             padding: '14px 28px', borderRadius: 24, fontWeight: 700, fontSize: 16, 
             cursor: 'pointer', boxShadow: '0 8px 24px rgba(10,132,255,0.3)' 
           }}
         >
           Grant Permission & Try Again
         </button>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: ALLOWED STATE (Pass through to App)
  // --------------------------------------------------------------------------
  return children;
}

// ============================================================================
// 3. MAIN APP EXPORT
// ============================================================================
export default function App() {
  return (
    <AuthProvider>
      <LocationGate>
        <Home />
      </LocationGate>
    </AuthProvider>
  );
}
