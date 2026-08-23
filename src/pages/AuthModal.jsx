/**
 * ============================================================================
 * AUTHENTICATION MODAL (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component handles the complete authentication flow: Sign In, Sign Up,
 * and OTP Verification. It utilizes Apple-style glassmorphism, fluid tab
 * transitions, and precise micro-interactions for a premium feel.
 * 
 * Corrected Features Included Inline:
 * - Liquid Glassmorphism Modal & Overlay
 * - Advanced OTP Input Matrix with focus bounce physics
 * - Smooth Telegram sliding segmented controls
 * - Apple-style toggle switches for Terms & Conditions
 * - Inline Vector Library (No external clunky image assets)
 * - Telemetry & Metadata capture silently runs in background
 * - Fully unminified, enterprise-grade formatting
 * 
 * Dependencies: React, Supabase
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const RESEND_COOLDOWN_S = 30;
const ANIMATION_DURATION = 400; // ms for fluid liquid transitions

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Close: (
    <svg 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Mail: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  Lock: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  User: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Alert: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Spinner: (
    <svg 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className="spinner-animation"
    >
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
  CheckCircle: (
    <svg 
      width="48" 
      height="48" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
};

// ============================================================================
// 3. BACKGROUND TELEMETRY & METADATA
// ============================================================================
/**
 * REPLACE ONLY the existing `captureProfileMetadata` function in
 * AuthModal.jsx with this version. Nothing else in the file changes.
 */

function captureProfileMetadata() {
  const baseMetadata = {
    device_type: /Mobi/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    browser: navigator.userAgent,
    os: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    referrer: document.referrer || null,
  };

  const getCoords = () =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        console.warn('[geo] navigator.geolocation not available');
        return resolve({ geo_error: 'unsupported' });
      }
      if (!window.isSecureContext) {
        // Geolocation silently fails on non-HTTPS origins (localhost excluded).
        console.warn('[geo] not a secure context — geolocation will fail. Serve over HTTPS.');
        return resolve({ geo_error: 'insecure_context' });
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Full precision, no rounding — JS doubles carry ~15-17 significant
          // digits and we pass them straight through.
          console.log('[geo] got position', {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
          });
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
          });
        },
        (err) => {
          // err.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
          console.warn('[geo] getCurrentPosition failed', err.code, err.message);
          resolve({ geo_error: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  getCoords().then((coords) => {
    supabase.functions
      .invoke('capture-profile-metadata', {
        body: { ...baseMetadata, ...coords },
      })
      .catch((err) => {
        console.warn('Silent metadata capture failed:', err);
      });
  });
}


// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================

/**
 * Injects required CSS animations into the document head.
 */
const GlobalKeyframes = () => (
  <style>{`
    @keyframes modal-pop-in {
      0% { 
        opacity: 0; 
        transform: scale(0.92) translateY(20px); 
      }
      100% { 
        opacity: 1; 
        transform: scale(1) translateY(0); 
      }
    }
    @keyframes shake-error {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-6px); }
      40%, 80% { transform: translateX(6px); }
    }
    @keyframes otp-bounce {
      0% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-4px) scale(1.02); }
      100% { transform: translateY(0) scale(1); }
    }
    .spinner-animation {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
    .liquid-input-wrapper:focus-within svg {
      color: var(--blue) !important;
      transform: scale(1.1);
    }
  `}</style>
);

/**
 * Apple-style toggle switch for Terms and Conditions
 */
function AppleToggle({ checked, onChange }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 44, 
        height: 24, 
        borderRadius: 12, 
        cursor: 'pointer', 
        flexShrink: 0,
        background: checked ? 'var(--green)' : 'var(--glass-border)',
        transition: 'background 250ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        position: 'relative', 
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      <div
        style={{
          position: 'absolute', 
          top: 2, 
          left: checked ? 22 : 2,
          width: 20, 
          height: 20, 
          borderRadius: '50%', 
          background: '#fff',
          transition: 'left 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
}

// ============================================================================
// 5. MAIN AUTH MODAL COMPONENT
// ============================================================================

export default function AuthModal({ open, onClose, initialTab = 'signin', onVerified }) {
  
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  
  // Animation / Rendering State
  const [isVisible, setIsVisible] = useState(false);
  const [tab, setTab] = useState(initialTab); // 'signin' | 'signup'
  const [stage, setStage] = useState('form'); // 'form' | 'otp' | 'success'
  
  // Form Field Data
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  // OTP Matrix Logic
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  // UX & Validation State
  const [focusedField, setFocusedField] = useState(null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --------------------------------------------------------------------------
  // EFFECTS & LIFECYCLES
  // --------------------------------------------------------------------------
  
  // Open / Close Animation Hook
  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setTab(initialTab);
      setStage('form');
      setError('');
      setShake(false);
    } else {
      setIsVisible(false);
      // Wait for exit animation to complete before wiping memory
      setTimeout(() => {
        resetFields();
      }, ANIMATION_DURATION);
    }
  }, [open, initialTab]);

  // Resend Verification Code Timer Hook
  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const id = setTimeout(() => {
      setResendCooldown((s) => s - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  // --------------------------------------------------------------------------
  // UTILITY HANDLERS
  // --------------------------------------------------------------------------

  const resetFields = useCallback(() => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    setAcceptedTerms(false);
    setOtp(['', '', '', '', '', '']);
    setError('');
  }, []);

  const triggerError = useCallback((msg) => {
    setError(msg);
    setShake(true);
    // Remove shake class after CSS animation finishes
    setTimeout(() => {
      setShake(false);
    }, 500); 
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    // Allow CSS fade-out animation to complete before notifying parent
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose]);

  // --------------------------------------------------------------------------
  // NETWORK LOGIC: SIGN IN & SIGN UP
  // --------------------------------------------------------------------------

  async function handleSignIn(e) {
    e.preventDefault();
    setError('');
    
    // Front-end Validation
    if (!email || !password) {
      triggerError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    setSubmitting(false);

    if (signInError) {
      triggerError(signInError.message);
      return;
    }
    
    // Smooth transition to Success State
    setStage('success');
    captureProfileMetadata();
    
    // Allow user to read success message before closing automatically
    setTimeout(() => {
      handleClose();
      onVerified();
    }, 1200);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError('');

    // Front-end Validation Guardrails
    if (!acceptedTerms) {
      triggerError('You must accept the Terms and Privacy Policy.');
      return;
    }
    if (!username.trim()) {
      triggerError('Username is required for anonymity.');
      return;
    }
    if (password !== confirmPassword) {
      triggerError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      triggerError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { 
        data: { 
          username: username.trim(), 
          accepted_terms: true 
        } 
      },
    });
    
    setSubmitting(false);

    if (signUpError) {
      triggerError(signUpError.message);
      return;
    }

    // Auto-login behavior if Supabase email confirmations are toggled OFF
    if (data?.session) {
      setStage('success');
      captureProfileMetadata();
      setTimeout(() => {
        handleClose();
        onVerified();
      }, 1200);
      return;
    }

    // Default behavior: Transition to Email OTP Verification stage
    setStage('otp');
    setResendCooldown(RESEND_COOLDOWN_S);
  }

  // --------------------------------------------------------------------------
  // OTP MATRIX LOGIC
  // --------------------------------------------------------------------------

  function handleOtpChange(index, value) {
    // Strip out any non-numeric characters immediately
    const digit = value.replace(/\D/g, '').slice(-1); 
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    
    // Auto-advance focus to the next box
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, e) {
    // Auto-regress focus on backspace if current box is empty
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    // Grab pasted text, strip non-digits, slice to 6 chars
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) {
      return;
    }
    
    const next = [...otp];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setOtp(next);
    
    // Focus the last filled box, or the final box if full
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    
    const token = otp.join('');
    if (token.length !== 6) {
      triggerError('Enter the full 6-digit code.');
      return;
    }

    setSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ 
      email, 
      token, 
      type: 'signup' 
    });
    setSubmitting(false);

    if (verifyError) {
      triggerError(verifyError.message);
      return;
    }
    
    // Render Apple Success Checkmark
    setStage('success');
    captureProfileMetadata();
    
    setTimeout(() => {
      handleClose();
      onVerified();
    }, 1200);
  }

  async function handleResend() {
    if (resendCooldown > 0) {
      return;
    }
    
    setError('');
    setSubmitting(true);
    
    const { error: resendError } = await supabase.auth.resend({ 
      type: 'signup', 
      email 
    });
    
    setSubmitting(false);
    
    if (resendError) {
      triggerError(resendError.message);
      return;
    }
    
    // Restart the 30-second countdown loop
    setResendCooldown(RESEND_COOLDOWN_S);
  }

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  function switchTab(nextTab) {
    setTab(nextTab);
    setStage('form');
    setError('');
    resetFields();
  }

  // Common UI Wrapper for the liquid input fields
  const getInputWrapperStyle = (fieldName) => ({
    display: 'flex', 
    alignItems: 'center', 
    gap: 12,
    background: 'var(--glass)',
    border: '1px solid',
    borderColor: focusedField === fieldName ? 'var(--blue)' : 'var(--glass-border)',
    borderRadius: 16,
    padding: '4px 16px',
    boxShadow: focusedField === fieldName ? '0 0 0 4px rgba(10,132,255,0.15)' : 'inset 0 2px 4px rgba(0,0,0,0.02)',
    transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
  });

  const getInputFieldStyle = () => ({
    flex: 1, 
    border: 'none', 
    background: 'transparent', 
    outline: 'none',
    fontSize: 16, 
    color: 'var(--ink)', 
    padding: '10px 0',
    width: '100%',
  });

  // --------------------------------------------------------------------------
  // RENDER GUARD
  // --------------------------------------------------------------------------
  
  // If modal is closed and CSS exit animation is finished, unmount from DOM
  if (!open && !isVisible) {
    return null;
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------
  return (
    <>
      <GlobalKeyframes />
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', 
          inset: 0, 
          zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: isVisible ? 'blur(20px)' : 'blur(0px)',
          WebkitBackdropFilter: isVisible ? 'blur(20px)' : 'blur(0px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: 20,
          opacity: isVisible ? 1 : 0,
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', 
            maxWidth: 420, 
            position: 'relative',
            background: 'var(--glass-strong)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: '1px solid var(--glass-border)',
            borderRadius: 28, 
            padding: 32,
            boxShadow: '0 24px 60px rgba(0,0,0,0.15)',
            transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(20px)',
            opacity: isVisible ? 1 : 0,
            transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
            animation: shake ? 'shake-error 0.5s cubic-bezier(.36,.07,.19,.97) both' : 'none'
          }}
        >
          
          {/* Close Button Header */}
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              position: 'absolute', 
              top: 16, 
              right: 16, 
              width: 32, 
              height: 32, 
              borderRadius: '50%',
              border: 'none', 
              background: 'transparent', 
              color: 'var(--dim)',
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--glass-border)';
              e.currentTarget.style.color = 'var(--ink)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--dim)';
            }}
          >
            {Vectors.Close}
          </button>

          {/* 
            ======================================================================
            STAGE 1: AUTHENTICATION FORMS (SIGN IN / SIGN UP)
            ======================================================================
          */}
          {stage === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* Header Text Block */}
              <div style={{ textAlign: 'center' }}>
                <h2 
                  style={{ 
                    margin: '0 0 8px 0', 
                    fontSize: 24, 
                    fontWeight: 800, 
                    color: 'var(--ink)', 
                    letterSpacing: '-0.5px' 
                  }}
                >
                  {tab === 'signin' ? 'Welcome Back' : 'Join Anonroom'}
                </h2>
                <p 
                  style={{ 
                    margin: 0, 
                    fontSize: 15, 
                    color: 'var(--dim)', 
                    lineHeight: 1.4 
                  }}
                >
                  {tab === 'signin' 
                    ? 'Sign in to continue bridging the gap.' 
                    : 'Create an anonymous identity.'}
                </p>
              </div>

              {/* Liquid Sliding Tab Segment Control */}
              <div 
                style={{
                  position: 'relative', 
                  display: 'flex', 
                  background: 'var(--glass-border)',
                  borderRadius: 16, 
                  padding: 4, 
                  boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.04)'
                }}
              >
                <div 
                  style={{
                    position: 'absolute', 
                    top: 4, 
                    bottom: 4, 
                    width: 'calc(50% - 4px)',
                    left: tab === 'signin' ? 4 : 'calc(50% + 0px)',
                    background: 'var(--glass-strong)', 
                    borderRadius: 12,
                    transition: 'left 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }} 
                />
                
                <button
                  onClick={() => switchTab('signin')}
                  style={{
                    flex: 1, 
                    zIndex: 1, 
                    padding: '10px 0', 
                    border: 'none', 
                    background: 'transparent',
                    fontWeight: 600, 
                    fontSize: 15, 
                    borderRadius: 12,
                    color: tab === 'signin' ? 'var(--ink)' : 'var(--dim)', 
                    cursor: 'pointer', 
                    transition: 'color 200ms ease'
                  }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => switchTab('signup')}
                  style={{
                    flex: 1, 
                    zIndex: 1, 
                    padding: '10px 0', 
                    border: 'none', 
                    background: 'transparent',
                    fontWeight: 600, 
                    fontSize: 15, 
                    borderRadius: 12,
                    color: tab === 'signup' ? 'var(--ink)' : 'var(--dim)', 
                    cursor: 'pointer', 
                    transition: 'color 200ms ease'
                  }}
                >
                  Create Account
                </button>
              </div>

              {/* Form Input Regions */}
              {tab === 'signin' ? (
                <form 
                  onSubmit={handleSignIn} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 16 
                  }}
                >
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('email')}>
                    <div style={{ color: 'var(--dim)', transition: 'all 0.2s' }}>
                      {Vectors.Mail}
                    </div>
                    <input
                      type="email" 
                      placeholder="Email Address" 
                      value={email} 
                      required
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>
                  
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('password')}>
                    <div style={{ color: 'var(--dim)', transition: 'all 0.2s' }}>
                      {Vectors.Lock}
                    </div>
                    <input
                      type="password" 
                      placeholder="Password" 
                      value={password} 
                      required
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  {error && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        color: 'var(--red)', 
                        fontSize: 14, 
                        fontWeight: 500, 
                        background: 'rgba(255,59,48,0.1)', 
                        padding: '10px 14px', 
                        borderRadius: 12 
                      }}
                    >
                      {Vectors.Alert}
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit" 
                    disabled={submitting}
                    style={{
                      marginTop: 8, 
                      padding: '16px 0', 
                      borderRadius: 16, 
                      border: 'none',
                      background: 'var(--blue)', 
                      color: '#fff', 
                      fontWeight: 700, 
                      fontSize: 16, 
                      cursor: submitting ? 'default' : 'pointer',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 8,
                      opacity: submitting ? 0.7 : 1,
                      boxShadow: submitting ? 'none' : '0 8px 24px rgba(10, 132, 255, 0.3)',
                      transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                    }}
                  >
                    {submitting ? <>{Vectors.Spinner} Authenticating...</> : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form 
                  onSubmit={handleSignUp} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 16 
                  }}
                >
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('username')}>
                    <div style={{ color: 'var(--dim)', transition: 'all 0.2s' }}>
                      {Vectors.User}
                    </div>
                    <input
                      type="text" 
                      placeholder="Anonymous Username" 
                      value={username} 
                      required
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('email')}>
                    <div style={{ color: 'var(--dim)', transition: 'all 0.2s' }}>
                      {Vectors.Mail}
                    </div>
                    <input
                      type="email" 
                      placeholder="Email Address (Kept Private)" 
                      value={email} 
                      required
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>
                  
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('password')}>
                    <div style={{ color: 'var(--dim)', transition: 'all 0.2s' }}>
                      {Vectors.Lock}
                    </div>
                    <input
                      type="password" 
                      placeholder="Create Password" 
                      value={password} 
                      required
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('confirmPassword')}>
                    <div style={{ color: 'var(--dim)', transition: 'all 0.2s' }}>
                      {Vectors.Lock}
                    </div>
                    <input
                      type="password" 
                      placeholder="Confirm Password" 
                      value={confirmPassword} 
                      required
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  {/* Terms & Privacy Toggle */}
                  <label 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      marginTop: 4, 
                      cursor: 'pointer' 
                    }}
                  >
                    <AppleToggle 
                      checked={acceptedTerms} 
                      onChange={() => setAcceptedTerms(!acceptedTerms)} 
                    />
                    <span 
                      style={{ 
                        fontSize: 13, 
                        color: 'var(--dim)', 
                        lineHeight: 1.4 
                      }}
                    >
                      I agree to the <span style={{ color: 'var(--blue)' }}>Terms</span> and <span style={{ color: 'var(--blue)' }}>Privacy Policy</span>.
                    </span>
                  </label>

                  {error && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        color: 'var(--red)', 
                        fontSize: 14, 
                        fontWeight: 500, 
                        background: 'rgba(255,59,48,0.1)', 
                        padding: '10px 14px', 
                        borderRadius: 12 
                      }}
                    >
                      {Vectors.Alert}
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit" 
                    disabled={submitting}
                    style={{
                      marginTop: 8, 
                      padding: '16px 0', 
                      borderRadius: 16, 
                      border: 'none',
                      background: 'var(--blue)', 
                      color: '#fff', 
                      fontWeight: 700, 
                      fontSize: 16, 
                      cursor: submitting ? 'default' : 'pointer',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 8,
                      opacity: submitting ? 0.7 : 1,
                      boxShadow: submitting ? 'none' : '0 8px 24px rgba(10, 132, 255, 0.3)',
                      transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                    }}
                  >
                    {submitting ? <>{Vectors.Spinner} Creating Profile...</> : 'Create Account'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* 
            ======================================================================
            STAGE 2: OTP VERIFICATION MATRIX
            ======================================================================
          */}
          {stage === 'otp' && (
            <form 
              onSubmit={handleVerifyOtp} 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 28 
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div 
                  style={{ 
                    width: 64, 
                    height: 64, 
                    borderRadius: '50%', 
                    background: 'rgba(10,132,255,0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: 'var(--blue)',
                    margin: '0 auto 16px' 
                  }}
                >
                  {Vectors.Mail}
                </div>
                <h2 
                  style={{ 
                    margin: '0 0 8px 0', 
                    fontSize: 24, 
                    fontWeight: 800, 
                    color: 'var(--ink)', 
                    letterSpacing: '-0.5px' 
                  }}
                >
                  Check Your Email
                </h2>
                <p 
                  style={{ 
                    margin: 0, 
                    fontSize: 15, 
                    color: 'var(--dim)', 
                    lineHeight: 1.5 
                  }}
                >
                  Enter the 6-digit verification code sent to <br/>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{email}</span>
                </p>
              </div>

              {/* Apple-style Animated OTP Matrix Grid */}
              <div 
                style={{ 
                  display: 'flex', 
                  gap: 10, 
                  justifyContent: 'center' 
                }} 
                onPaste={handleOtpPaste}
              >
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onFocus={() => setFocusedField(`otp-${i}`)}
                    onBlur={() => setFocusedField(null)}
                    inputMode="numeric"
                    maxLength={1}
                    style={{
                      width: 48, 
                      height: 56, 
                      textAlign: 'center', 
                      fontSize: 24, 
                      fontWeight: 700,
                      background: 'var(--glass)', 
                      padding: 0, 
                      outline: 'none',
                      color: 'var(--ink)', 
                      borderRadius: 14,
                      border: '1px solid',
                      borderColor: focusedField === `otp-${i}` || digit ? 'var(--blue)' : 'var(--glass-border)',
                      boxShadow: focusedField === `otp-${i}` ? '0 0 0 4px rgba(10,132,255,0.15)' : 'inset 0 2px 4px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      animation: focusedField === `otp-${i}` ? 'otp-bounce 0.3s ease' : 'none'
                    }}
                  />
                ))}
              </div>

              {error && (
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 8, 
                    color: 'var(--red)', 
                    fontSize: 14, 
                    fontWeight: 500 
                  }}
                >
                  {Vectors.Alert}
                  <span>{error}</span>
                </div>
              )}

              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 12 
                }}
              >
                <button
                  type="submit" 
                  disabled={submitting}
                  style={{
                    padding: '16px 0', 
                    borderRadius: 16, 
                    border: 'none',
                    background: 'var(--blue)', 
                    color: '#fff', 
                    fontWeight: 700, 
                    fontSize: 16, 
                    cursor: submitting ? 'default' : 'pointer',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 8,
                    opacity: submitting ? 0.7 : 1,
                    boxShadow: submitting ? 'none' : '0 8px 24px rgba(10, 132, 255, 0.3)',
                    transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                  }}
                >
                  {submitting ? <>{Vectors.Spinner} Verifying...</> : 'Verify & Continue'}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || submitting}
                  style={{
                    background: 'none', 
                    border: 'none', 
                    fontSize: 14, 
                    fontWeight: 600,
                    cursor: (resendCooldown > 0 || submitting) ? 'default' : 'pointer', 
                    textAlign: 'center', 
                    padding: '12px 0',
                    color: resendCooldown > 0 ? 'var(--dim)' : 'var(--blue)',
                    transition: 'color 0.2s ease',
                  }}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Verification Code'}
                </button>
              </div>
            </form>
          )}

          {/* 
            ======================================================================
            STAGE 3: SUCCESS ANIMATION
            ======================================================================
          */}
          {stage === 'success' && (
            <div 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '40px 0', 
                animation: 'modal-pop-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' 
              }}
            >
              <div 
                style={{ 
                  color: 'var(--green)', 
                  marginBottom: 20 
                }}
              >
                {Vectors.CheckCircle}
              </div>
              <h2 
                style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: 24, 
                  fontWeight: 800, 
                  color: 'var(--ink)' 
                }}
              >
                Success
              </h2>
              <p 
                style={{ 
                  margin: 0, 
                  fontSize: 15, 
                  color: 'var(--dim)' 
                }}
              >
                Redirecting you to Anonroom...
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
