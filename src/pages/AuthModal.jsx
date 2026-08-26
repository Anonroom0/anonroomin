/**
 * ============================================================================
 * AUTHENTICATION MODAL (GLASS UI)
 * ============================================================================
 * This component handles the complete authentication flow: Sign In, Sign Up,
 * Password Reset, and OTP Verification. Restyled to use dark glass tokens and
 * shared animation/utility classes.
 * 
 * Corrected Features Included Inline:
 * - Pre-checks `profiles` table for username availability before triggering signup.
 * - Enforced strict lowercase usernames on registration for universal uniqueness.
 * - Password Visibility Toggles (Eye / EyeOff) implemented natively.
 * - Forgot Password / Reset Password flow added.
 * - DB errors are masked with user-friendly messages for security.
 * - Liquid Glassmorphism Modal & Overlay via `animations.css` classes.
 * - Advanced OTP Input Matrix physics using standard transitions.
 * - Smooth Telegram sliding segmented controls.
 * 
 * Dependencies: React, Supabase, AuthContext, GlassToggle
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import GlassToggle from '../components/shared/GlassToggle';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const RESEND_COOLDOWN_S = 30;
const ANIMATION_DURATION = 400; // ms for fluid liquid transitions (matches unmount delay)

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Close: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Mail: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  Lock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  User: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Eye: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  EyeOff: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  Alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Spinner: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin">
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
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  ArrowLeft: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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
// 4. MAIN AUTH MODAL COMPONENT
// ============================================================================

export default function AuthModal({ open, onClose, initialTab = 'signin', onVerified }) {
  
  const [isVisible, setIsVisible] = useState(false);
  const [tab, setTab] = useState(initialTab); // 'signin' | 'signup' | 'forgot'
  const [stage, setStage] = useState('form'); // 'form' | 'otp' | 'success'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const [focusedField, setFocusedField] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setTab(initialTab);
      setStage('form');
      setError('');
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
    setShowPassword(false);
    setShowConfirmPassword(false);
    setOtp(['', '', '', '', '', '']);
    setError('');
  }, []);

  const triggerError = useCallback((msg) => {
    setError(msg);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose, submitting]);

  // Handle click outside to close (disabled when submitting)
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget && !submitting) {
      handleClose();
    }
  }, [handleClose, submitting]);

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
      // Masking raw DB/Auth error
      triggerError('Invalid email or password. Please try again.');
      return;
    }
    
    setStage('success');
    captureProfileMetadata();
    
    setTimeout(() => {
      handleClose();
      onVerified?.();
    }, 1200);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError('');

    // Force strictly lowercase and trim spaces
    const normalizedUsername = username.trim().toLowerCase();

    if (!acceptedTerms) {
      triggerError('You must accept the Terms and Privacy Policy.');
      return;
    }
    if (!normalizedUsername) {
      triggerError('Username is required for anonymity.');
      return;
    }
    
    // Strict alphanumeric/underscore check
    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      triggerError('Username can only contain lowercase letters, numbers, and underscores.');
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
    // Uses ilike just in case, but normalizedUsername is already strictly lowercased.
    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', normalizedUsername)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      setSubmitting(false);
      // Masking database query error
      triggerError('Service temporarily unavailable. Please try again.');
      return;
    }

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
      // Masking Auth database errors (e.g. rate limits or unhandled backend rules)
      triggerError('Registration failed. The email may already be in use or unavailable.');
      return;
    }

    if (data?.session) {
      setStage('success');
      captureProfileMetadata();
      setTimeout(() => {
        handleClose();
        onVerified?.();
      }, 1200);
      return;
    }

    setStage('otp');
    setResendCooldown(RESEND_COOLDOWN_S);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      triggerError('Please enter your email address.');
      return;
    }

    setSubmitting(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });

      if (resetError) throw resetError;

      setStage('success');
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      triggerError(err.message || 'Failed to send reset link.');
    } finally {
      setSubmitting(false);
    }
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
      // Masking verification backend errors
      triggerError('Invalid or expired code. Please try again.');
      return;
    }
    
    setStage('success');
    captureProfileMetadata();
    
    setTimeout(() => {
      handleClose();
      onVerified?.();
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
      // Masking resend endpoint errors
      triggerError('Failed to resend code. Please wait and try again.');
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
    background: 'var(--ink-2)',
    border: '1px solid',
    borderColor: focusedField === fieldName ? 'var(--ember)' : 'var(--glass-border)',
    borderRadius: 16, padding: '4px 16px',
    boxShadow: focusedField === fieldName ? '0 0 0 4px color-mix(in srgb, var(--ember) 15%, transparent)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
    transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
  });

  const getInputFieldStyle = () => ({
    flex: 1, border: 'none', background: 'transparent', outline: 'none',
    fontSize: 16, color: 'var(--paper)', padding: '10px 0', width: '100%',
  });

  if (!open && !isVisible) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className={`backdrop-fade ${isVisible ? 'is-visible' : ''}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={isVisible ? 'pop-in' : ''}
        style={{
          width: '100%', maxWidth: 420, position: 'relative',
          background: 'var(--glass-white)',
          backdropFilter: 'blur(20px) saturate(115%)',
          WebkitBackdropFilter: 'blur(20px) saturate(115%)',
          border: '1px solid var(--glass-border)',
          borderRadius: 28, padding: 32,
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        }}
      >
        
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%',
            border: 'none', background: 'transparent', color: 'var(--dim)',
            cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s, color 0.2s', opacity: submitting ? 0.5 : 1
          }}
          disabled={submitting}
        >
          {Vectors.Close}
        </button>

        {stage === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            <div style={{ textAlign: 'center', position: 'relative' }}>
              {tab === 'forgot' && (
                <button 
                  onClick={() => switchTab('signin')} 
                  disabled={submitting}
                  style={{ 
                    position: 'absolute', left: -16, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'transparent', color: 'var(--ember)', 
                    padding: 8, cursor: submitting ? 'default' : 'pointer', display: 'flex', 
                    alignItems: 'center', opacity: submitting ? 0.5 : 1 
                  }}
                  aria-label="Back to Sign In"
                >
                  {Vectors.ArrowLeft}
                </button>
              )}
              <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: 'var(--paper)', letterSpacing: '-0.5px' }}>
                {tab === 'signin' ? 'Welcome Back' : tab === 'signup' ? 'Join Anonroom' : 'Reset Password'}
              </h2>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)', lineHeight: 1.4 }}>
                {tab === 'signin' ? 'Sign in to continue bridging the gap.' : tab === 'signup' ? 'Create an anonymous identity.' : 'Enter your email to receive a reset link.'}
              </p>
            </div>

            {tab !== 'forgot' && (
              <div style={{ position: 'relative', display: 'flex', background: 'var(--ink-2)', borderRadius: 16, padding: 4, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)', border: '1px solid var(--glass-border)' }}>
                <div 
                  style={{
                    position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 4px)',
                    left: tab === 'signin' ? 4 : 'calc(50% + 2px)',
                    background: 'var(--glass-white)', borderRadius: 12,
                    transition: 'left 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    border: '1px solid var(--glass-border)'
                  }} 
                />
                
                <button
                  onClick={() => switchTab('signin')}
                  style={{
                    flex: 1, zIndex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                    fontWeight: 600, fontSize: 15, borderRadius: 12,
                    color: tab === 'signin' ? 'var(--paper)' : 'var(--dim)', cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => switchTab('signup')}
                  style={{
                    flex: 1, zIndex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                    fontWeight: 600, fontSize: 15, borderRadius: 12,
                    color: tab === 'signup' ? 'var(--paper)' : 'var(--dim)', cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* FORMS */}
            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={getInputWrapperStyle('email')}>
                  <div style={{ color: focusedField === 'email' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'email' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.Mail}
                  </div>
                  <input
                    type="email" placeholder="Email Address" value={email} required
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                </div>
                
                <div style={getInputWrapperStyle('password')}>
                  <div style={{ color: focusedField === 'password' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'password' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.Lock}
                  </div>
                  <input
                    type={showPassword ? "text" : "password"} placeholder="Password" value={password} required
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                    style={{ border: 'none', background: 'transparent', color: showPassword ? 'var(--ember)' : 'var(--dim)', cursor: 'pointer', padding: 0, display: 'flex', transition: 'color 0.2s' }}
                  >
                    {showPassword ? Vectors.EyeOff : Vectors.Eye}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
                  <button 
                    type="button" 
                    onClick={() => switchTab('forgot')}
                    disabled={submitting}
                    style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.5 : 1, padding: 0 }}
                  >
                    Forgot Password?
                  </button>
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ember)', fontSize: 14, fontWeight: 500, background: 'color-mix(in srgb, var(--ember) 16%, transparent)', padding: '10px 14px', borderRadius: 12 }}>
                    {Vectors.Alert}
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit" disabled={submitting}
                  className={!submitting ? 'chat-row' : ''}
                  style={{
                    marginTop: 8, padding: '16px 0', borderRadius: 16, border: 'none',
                    background: submitting ? 'var(--glass-border)' : 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 16, 
                    cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s'
                  }}
                >
                  {submitting ? <>{Vectors.Spinner} Authenticating...</> : 'Sign In'}
                </button>
              </form>
            ) : tab === 'forgot' ? (
              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={getInputWrapperStyle('email')}>
                  <div style={{ color: focusedField === 'email' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'email' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.Mail}
                  </div>
                  <input
                    type="email" placeholder="Email Address" value={email} required
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ember)', fontSize: 14, fontWeight: 500, background: 'color-mix(in srgb, var(--ember) 16%, transparent)', padding: '10px 14px', borderRadius: 12 }}>
                    {Vectors.Alert}
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit" disabled={submitting}
                  className={!submitting ? 'chat-row' : ''}
                  style={{
                    marginTop: 8, padding: '16px 0', borderRadius: 16, border: 'none',
                    background: submitting ? 'var(--glass-border)' : 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 16, 
                    cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s'
                  }}
                >
                  {submitting ? <>{Vectors.Spinner} Sending...</> : 'Send Reset Link'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={getInputWrapperStyle('username')}>
                  <div style={{ color: focusedField === 'username' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'username' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.User}
                  </div>
                  <input
                    type="text" placeholder="Anonymous Username" value={username} required
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                </div>

                <div style={getInputWrapperStyle('email')}>
                  <div style={{ color: focusedField === 'email' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'email' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.Mail}
                  </div>
                  <input
                    type="email" placeholder="Email Address (Kept Private)" value={email} required
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                </div>
                
                <div style={getInputWrapperStyle('password')}>
                  <div style={{ color: focusedField === 'password' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'password' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.Lock}
                  </div>
                  <input
                    type={showPassword ? "text" : "password"} placeholder="Create Password" value={password} required
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                    style={{ border: 'none', background: 'transparent', color: showPassword ? 'var(--ember)' : 'var(--dim)', cursor: 'pointer', padding: 0, display: 'flex', transition: 'color 0.2s' }}
                  >
                    {showPassword ? Vectors.EyeOff : Vectors.Eye}
                  </button>
                </div>

                <div style={getInputWrapperStyle('confirmPassword')}>
                  <div style={{ color: focusedField === 'confirmPassword' ? 'var(--ember)' : 'var(--dim)', transform: focusedField === 'confirmPassword' ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>
                    {Vectors.Lock}
                  </div>
                  <input
                    type={showConfirmPassword ? "text" : "password"} placeholder="Confirm Password" value={confirmPassword} required
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputFieldStyle()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex="-1"
                    style={{ border: 'none', background: 'transparent', color: showConfirmPassword ? 'var(--ember)' : 'var(--dim)', cursor: 'pointer', padding: 0, display: 'flex', transition: 'color 0.2s' }}
                  >
                    {showConfirmPassword ? Vectors.EyeOff : Vectors.Eye}
                  </button>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, cursor: 'pointer' }}>
                  <GlassToggle checked={acceptedTerms} onChange={setAcceptedTerms} />
                  <span style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.4 }}>
                    I agree to the <span style={{ color: 'var(--ember)' }}>Terms</span> and <span style={{ color: 'var(--ember)' }}>Privacy Policy</span>.
                  </span>
                </label>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ember)', fontSize: 14, fontWeight: 500, background: 'color-mix(in srgb, var(--ember) 16%, transparent)', padding: '10px 14px', borderRadius: 12 }}>
                    {Vectors.Alert}
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit" disabled={submitting}
                  className={!submitting ? 'chat-row' : ''}
                  style={{
                    marginTop: 8, padding: '16px 0', borderRadius: 16, border: 'none',
                    background: submitting ? 'var(--glass-border)' : 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 16, 
                    cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s'
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
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ember)', margin: '0 auto 16px' }}>
                {Vectors.Mail}
              </div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: 'var(--paper)' }}>
                Check Your Email
              </h2>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)', lineHeight: 1.5 }}>
                Enter the 6-digit verification code sent to <br/>
                <span style={{ color: 'var(--paper)', fontWeight: 600 }}>{email}</span>
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
                    background: 'var(--ink-2)', padding: 0, outline: 'none',
                    color: 'var(--paper)', borderRadius: 14, border: '1px solid',
                    borderColor: focusedField === `otp-${i}` || digit ? 'var(--ember)' : 'var(--glass-border)',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: focusedField === `otp-${i}` ? '0 0 0 4px color-mix(in srgb, var(--ember) 15%, transparent)' : 'none'
                  }}
                />
              ))}
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--ember)', fontSize: 14, fontWeight: 500 }}>
                {Vectors.Alert}
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                type="submit" disabled={submitting}
                className={!submitting ? 'chat-row' : ''}
                style={{
                  padding: '16px 0', borderRadius: 16, border: 'none',
                  background: submitting ? 'var(--glass-border)' : 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 16, 
                  cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.2s'
                }}
              >
                {submitting ? <>{Vectors.Spinner} Verifying...</> : 'Verify & Continue'}
              </button>

              <button
                type="button" onClick={handleResend} disabled={resendCooldown > 0 || submitting}
                style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 600, cursor: resendCooldown > 0 ? 'default' : 'pointer', textAlign: 'center', padding: '12px 0', color: resendCooldown > 0 ? 'var(--dim)' : 'var(--ember)', transition: 'color 0.2s' }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Verification Code'}
              </button>
            </div>
          </form>
        )}

        {stage === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
            <div style={{ color: 'var(--signal)', marginBottom: 20 }}>{Vectors.CheckCircle}</div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: 'var(--paper)' }}>Success</h2>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)' }}>
              {tab === 'forgot' ? 'Check your email for the reset link.' : 'Redirecting you to Anonroom...'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
