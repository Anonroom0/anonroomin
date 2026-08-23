/**
 * ============================================================================
 * AUTHENTICATION MODAL (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component handles the complete authentication flow: Sign In, Sign Up,
 * and OTP Verification. It utilizes Apple-style glassmorphism, fluid tab
 * transitions, and precise micro-interactions for a premium feel.
 * 
 * Corrected Features Included Inline:
 * - Pre-checks `profiles` table for username availability before triggering signup.
 * - Removed backdrop auto-close (must click 'X' to close)[span_2](start_span)[span_2](end_span).
 * - Enforced strict lowercase usernames on registration for universal uniqueness[span_3](start_span)[span_3](end_span).
 * - Liquid Glassmorphism Modal & Overlay[span_4](start_span)[span_4](end_span)
 * - Advanced OTP Input Matrix with focus bounce physics[span_5](start_span)[span_5](end_span)
 * - Smooth Telegram sliding segmented controls[span_6](start_span)[span_6](end_span)
 * - Fully unminified, enterprise-grade formatting[span_7](start_span)[span_7](end_span)
 * 
 * Dependencies: React, Supabase[span_8](start_span)[span_8](end_span)
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';

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
        return resolve({ geo_error: 'unsupported' });
      }
      if (!window.isSecureContext) {
        return resolve({ geo_error: 'insecure_context' });
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
          });
        },
        (err) => {
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

const GlobalKeyframes = () => (
  <style>{`
    @keyframes modal-pop-in {
      0% { opacity: 0; transform: scale(0.92) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
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

function AppleToggle({ checked, onChange }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--green)' : 'var(--glass-border)',
        transition: 'background 250ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        position: 'relative', box.shadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      <div
        style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
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
  
  const [isVisible, setIsVisible] = useState(false);
  const [tab, setTab] = useState(initialTab); // 'signin' | 'signup[span_9](start_span)'[span_9](end_span)
  const [stage, setStage] = useState('form'); // 'form' | 'otp' | 'success[span_10](start_span)'[span_10](end_span)
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const [focusedField, setFocusedField] = useState(null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setTab(initialTab);
      setStage('form');
      setError('');
      setShake(false);
    } else {
      setIsVisible(false);
      setTimeout(() => {
        resetFields();
      }, ANIMATION_DURATION);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => {
      setResendCooldown((s) => s - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

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
    setTimeout(() => {
      setShake(false);
    }, 500); 
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose]);

  async function handleSignIn(e) {
    e.preventDefault();
    setError('');
    
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
    
    setStage('success');
    captureProfileMetadata();
    
    setTimeout(() => {
      handleClose();
      onVerified();
    }, 1200);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError('');

    const normalizedUsername = username.trim().toLowerCase();

    if (!acceptedTerms) {
      triggerError('You must accept the Terms and Privacy Policy.');
      return;
    }
    if (!normalizedUsername) {
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

    // 🛑 PRE-CHECK: Explicitly verify if username already exists in profiles table
    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (existingProfile) {
      setSubmitting(false);
      triggerError('This username is already taken. Please choose another.');
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { 
        data: { 
          username: normalizedUsername, 
          accepted_terms: true 
        } 
      },
    });
    
    setSubmitting(false);

    if (signUpError) {
      triggerError(signUpError.message);
      return;
    }

    if (data?.session) {
      setStage('success');
      captureProfileMetadata();
      setTimeout(() => {
        handleClose();
        onVerified();
      }, 1200);
      return;
    }

    setStage('otp');
    setResendCooldown(RESEND_COOLDOWN_S);
  }

  function handleOtpChange(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1); 
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    
    const next = [...otp];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setOtp(next);
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
    
    setStage('success');
    captureProfileMetadata();
    
    setTimeout(() => {
      handleClose();
      onVerified();
    }, 1200);
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    
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
    
    setResendCooldown(RESEND_COOLDOWN_S);
  }

  function switchTab(nextTab) {
    setTab(nextTab);
    setStage('form');
    setError('');
    resetFields();
  }

  const getInputWrapperStyle = (fieldName) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--glass)',
    border: '1px solid',
    borderColor: focusedField === fieldName ? 'var(--blue)' : 'var(--glass-border)',
    borderRadius: 16, padding: '4px 16px',
    boxShadow: focusedField === fieldName ? '0 0 0 4px rgba(10,132,255,0.15)' : 'inset 0 2px 4px rgba(0,0,0,0.02)',
    transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
  });

  const getInputFieldStyle = () => ({
    flex: 1, border: 'none', background: 'transparent', outline: 'none',
    fontSize: 16, color: 'var(--ink)', padding: '10px 0', width: '100%',
  });

  if (!open && !isVisible) return null;

  return (
    <>
      <GlobalKeyframes />
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: isVisible ? 'blur(20px)' : 'blur(0px)',
          WebkitBackdropFilter: isVisible ? 'blur(20px)' : 'blur(0px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          opacity: isVisible ? 1 : 0,
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 420, position: 'relative',
            background: 'var(--glass-strong)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: '1px solid var(--glass-border)',
            borderRadius: 28, padding: 32,
            boxShadow: '0 24px 60px rgba(0,0,0,0.15)',
            transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(20px)',
            opacity: isVisible ? 1 : 0,
            transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
            animation: shake ? 'shake-error 0.5s cubic-bezier(.36,.07,.19,.97) both' : 'none'
          }}
        >
          
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%',
              border: 'none', background: 'transparent', color: 'var(--dim)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s'
            }}
          >
            {Vectors.Close}
          </button>

          {stage === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
                  {tab === 'signin' ? 'Welcome Back' : 'Join Anonroom'}[span_11](start_span)[span_11](end_span)
                </h2>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)', lineHeight: 1.4 }}>
                  {tab === 'signin' ? 'Sign in to continue bridging the gap.' : 'Create an anonymous identity.'}[span_12](start_span)[span_12](end_span)
                </p>
              </div>

              <div style={{ position: 'relative', display: 'flex', background: 'var(--glass-border)', borderRadius: 16, padding: 4, boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.04)' }}>
                <div 
                  style={{
                    position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 4px)',
                    left: tab === 'signin' ? 4 : 'calc(50% + 0px)',
                    background: 'var(--glass-strong)', borderRadius: 12,
                    transition: 'left 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }} 
                />
                
                <button
                  onClick={() => switchTab('signin')}
                  style={{
                    flex: 1, zIndex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                    fontWeight: 600, fontSize: 15, borderRadius: 12,
                    color: tab === 'signin' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer'
                  }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => switchTab('signup')}
                  style={{
                    flex: 1, zIndex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                    fontWeight: 600, fontSize: 15, borderRadius: 12,
                    color: tab === 'signup' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer'
                  }}
                >
                  Create Account
                </button>
              </div>

              {tab === 'signin' ? (
                <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('email')}>
                    <div style={{ color: 'var(--dim)' }}>{Vectors.Mail}</div>
                    <input
                      type="email" placeholder="Email Address" value={email} required
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>
                  
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('password')}>
                    <div style={{ color: 'var(--dim)' }}>{Vectors.Lock}</div>
                    <input
                      type="password" placeholder="Password" value={password} required
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 14, fontWeight: 500, background: 'rgba(255,59,48,0.1)', padding: '10px 14px', borderRadius: 12 }}>
                      {Vectors.Alert}
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit" disabled={submitting}
                    style={{
                      marginTop: 8, padding: '16px 0', borderRadius: 16, border: 'none',
                      background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 16, 
                      cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: submitting ? 0.7 : 1, boxShadow: submitting ? 'none' : '0 8px 24px rgba(10, 132, 255, 0.3)'
                    }}
                  >
                    {submitting ? <>{Vectors.Spinner} Authenticating...</> : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('username')}>
                    <div style={{ color: 'var(--dim)' }}>{Vectors.User}</div>
                    <input
                      type="text" placeholder="Anonymous Username" value={username} required
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('email')}>
                    <div style={{ color: 'var(--dim)' }}>{Vectors.Mail}</div>
                    <input
                      type="email" placeholder="Email Address (Kept Private)" value={email} required
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>
                  
                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('password')}>
                    <div style={{ color: 'var(--dim)' }}>{Vectors.Lock}</div>
                    <input
                      type="password" placeholder="Create Password" value={password} required
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  <div className="liquid-input-wrapper" style={getInputWrapperStyle('confirmPassword')}>
                    <div style={{ color: 'var(--dim)' }}>{Vectors.Lock}</div>
                    <input
                      type="password" placeholder="Confirm Password" value={confirmPassword} required
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={() => setFocusedField(null)}
                      style={getInputFieldStyle()}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, cursor: 'pointer' }}>
                    <AppleToggle checked={acceptedTerms} onChange={() => setAcceptedTerms(!acceptedTerms)} />
                    <span style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.4 }}>
                      I agree to the <span style={{ color: 'var(--blue)' }}>Terms</span> and <span style={{ color: 'var(--blue)' }}>Privacy Policy</span>.
                    </span>
                  </label>

                  {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 14, fontWeight: 500, background: 'rgba(255,59,48,0.1)', padding: '10px 14px', borderRadius: 12 }}>
                      {Vectors.Alert}
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit" disabled={submitting}
                    style={{
                      marginTop: 8, padding: '16px 0', borderRadius: 16, border: 'none',
                      background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 16, 
                      cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: submitting ? 0.7 : 1, boxShadow: submitting ? 'none' : '0 8px 24px rgba(10, 132, 255, 0.3)'
                    }}
                  >
                    {submitting ? <>{Vectors.Spinner} Checking Username...</> : 'Create Account'}
                  </button>
                </form>
              )}
            </div>
          )}

          {stage === 'otp' && (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(10,132,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', margin: '0 auto 16px' }}>
                  {Vectors.Mail}
                </div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>
                  Check Your Email
                </h2>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)', lineHeight: 1.5 }}>
                  Enter the 6-digit verification code sent to <br/>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{email}</span>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onFocus={() => setFocusedField(`otp-${i}`)}
                    onBlur={() => setFocusedField(null)}
                    inputMode="numeric" maxLength={1}
                    style={{
                      width: 48, height: 56, textAlign: 'center', fontSize: 24, fontWeight: 700,
                      background: 'var(--glass)', padding: 0, outline: 'none',
                      color: 'var(--ink)', borderRadius: 14, border: '1px solid',
                      borderColor: focusedField === `otp-${i}` || digit ? 'var(--blue)' : 'var(--glass-border)'
                    }}
                  />
                ))}
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--red)', fontSize: 14, fontWeight: 500 }}>
                  {Vectors.Alert}
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  type="submit" disabled={submitting}
                  style={{
                    padding: '16px 0', borderRadius: 16, border: 'none',
                    background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 16, 
                    cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}
                >
                  {submitting ? <>{Vectors.Spinner} Verifying...</> : 'Verify & Continue'}
                </button>

                <button
                  type="button" onClick={handleResend} disabled={resendCooldown > 0 || submitting}
                  style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 600, cursor: resendCooldown > 0 ? 'default' : 'pointer', textAlign: 'center', padding: '12px 0', color: resendCooldown > 0 ? 'var(--dim)' : 'var(--blue)' }}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Verification Code'}
                </button>
              </div>
            </form>
          )}

          {stage === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
              <div style={{ color: 'var(--green)', marginBottom: 20 }}>{Vectors.CheckCircle}</div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>Success</h2>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)' }}>Redirecting you to Anonroom...</p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
