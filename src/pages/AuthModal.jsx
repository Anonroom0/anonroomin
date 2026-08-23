import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';

const RESEND_COOLDOWN_S = 30;

function captureProfileMetadata() {
  // Fire-and-forget, best-effort only — never awaited, never blocks
  // onVerified(), and must never fail or delay the sign-up experience.
  supabase.functions
    .invoke('capture-profile-metadata', {
      body: {
        device_type: /Mobi/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        browser: navigator.userAgent,
        os: navigator.platform,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        referrer: document.referrer || null,
      },
    })
    .catch((err) => console.warn('Metadata capture failed:', err));
}

export default function AuthModal({ open, onClose, initialTab = 'signin', onVerified }) {
  const [tab, setTab] = useState(initialTab);
  const [stage, setStage] = useState('form'); // 'form' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [focusedField, setFocusedField] = useState(null);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setStage('form');
      setError('');
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  if (!open) return null;

  function resetFields() {
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    setAcceptedTerms(false);
    setOtp(['', '', '', '', '', '']);
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    onVerified();
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError('');

    if (!acceptedTerms) {
      setError('You must accept the Terms and Privacy Policy.');
      return;
    }
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim(), accepted_terms: true } },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data?.session) {
      captureProfileMetadata();
      onVerified();
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
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = [...otp];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] || '';
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    const token = otp.join('');
    if (token.length !== 6) {
      setError('Enter the full 6-digit code.');
      return;
    }
    setSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    captureProfileMetadata();
    onVerified();
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError('');
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
    if (resendError) {
      setError(resendError.message);
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

  function fieldStyle(name) {
    return {
      ...inputStyle,
      ...(focusedField === name ? inputFocusStyle : null),
    };
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,28,30,0.44)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong pop-in"
        style={{
          width: 380, maxWidth: '100%', padding: 32, position: 'relative',
          borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={closeButtonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
        >
          ✕
        </button>

        {stage === 'form' && (
          <>
            <div style={{ marginBottom: 22 }}>
              <h2 style={titleStyle}>
                {tab === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p style={subtitleStyle}>
                {tab === 'signin'
                  ? 'Sign in to continue to anonroom'
                  : 'Join anonymously — no real name required'}
              </p>
            </div>

            {/* Sliding tab switcher */}
            <div
              style={{
                position: 'relative', display: 'flex', background: 'rgba(0,0,0,0.05)',
                borderRadius: 13, padding: 4, marginBottom: 24,
              }}
            >
              <div
                style={{
                  position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 4px)',
                  left: tab === 'signin' ? 4 : 'calc(50% + 0px)',
                  background: '#fff', borderRadius: 10,
                  transition: 'left 260ms cubic-bezier(0.34,1.56,0.64,1)',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.14)',
                }}
              />
              <button
                onClick={() => switchTab('signin')}
                style={{
                  flex: 1, zIndex: 1, padding: '9px 0', border: 'none', background: 'transparent',
                  fontWeight: 600, fontSize: 14, letterSpacing: -0.1, borderRadius: 10,
                  color: tab === 'signin' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer',
                  transition: 'color 180ms ease',
                }}
              >
                Sign In
              </button>
              <button
                onClick={() => switchTab('signup')}
                style={{
                  flex: 1, zIndex: 1, padding: '9px 0', border: 'none', background: 'transparent',
                  fontWeight: 600, fontSize: 14, letterSpacing: -0.1, borderRadius: 10,
                  color: tab === 'signup' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer',
                  transition: 'color 180ms ease',
                }}
              >
                Create Account
              </button>
            </div>

            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} style={formStyle}>
                <input
                  type="email" placeholder="Email" value={email} required
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  style={fieldStyle('email')}
                />
                <input
                  type="password" placeholder="Password" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  style={fieldStyle('password')}
                />
                {error && <p style={errorStyle}>{error}</p>}
                <button
                  type="submit" disabled={submitting}
                  style={submitting ? primaryButtonDisabledStyle : primaryButtonStyle}
                >
                  {submitting ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} style={formStyle}>
                <input
                  type="text" placeholder="Username" value={username} required
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  style={fieldStyle('username')}
                />
                <input
                  type="email" placeholder="Email" value={email} required
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  style={fieldStyle('email')}
                />
                <input
                  type="password" placeholder="Password" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  style={fieldStyle('password')}
                />
                <input
                  type="password" placeholder="Confirm password" value={confirmPassword} required
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  style={fieldStyle('confirmPassword')}
                />

                <label style={termsLabelStyle}>
                  <span
                    role="switch"
                    aria-checked={acceptedTerms}
                    onClick={() => setAcceptedTerms((v) => !v)}
                    style={{
                      width: 38, height: 22, borderRadius: 11, cursor: 'pointer', flexShrink: 0,
                      background: acceptedTerms ? 'var(--blue)' : 'rgba(0,0,0,0.14)',
                      transition: 'background 200ms ease', position: 'relative',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute', top: 2, left: acceptedTerms ? 18 : 2,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left 200ms cubic-bezier(0.34,1.56,0.64,1)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.28)',
                      }}
                    />
                  </span>
                  <span>
                    I agree to the <a href="#" style={linkStyle}>Terms</a> and{' '}
                    <a href="#" style={linkStyle}>Privacy Policy</a>
                  </span>
                </label>

                {error && <p style={errorStyle}>{error}</p>}
                <button
                  type="submit" disabled={submitting}
                  style={submitting ? primaryButtonDisabledStyle : primaryButtonStyle}
                >
                  {submitting ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            )}
          </>
        )}

        {stage === 'otp' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={titleStyle}>Check your email</h2>
              <p style={subtitleStyle}>
                Enter the 6-digit code we sent to <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{email}</span>
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }} onPaste={handleOtpPaste}>
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
                    ...inputStyle,
                    ...(focusedField === `otp-${i}` ? inputFocusStyle : null),
                    width: 44, height: 52, textAlign: 'center', fontSize: 20,
                    fontWeight: 600, padding: 0,
                  }}
                />
              ))}
            </div>

            {error && <p style={{ ...errorStyle, textAlign: 'center' }}>{error}</p>}

            <button
              type="submit" disabled={submitting}
              style={submitting ? primaryButtonDisabledStyle : primaryButtonStyle}
            >
              {submitting ? 'Verifying…' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{
                background: 'none', border: 'none', fontSize: 13, fontWeight: 500,
                cursor: resendCooldown > 0 ? 'default' : 'pointer', textAlign: 'center',
                color: resendCooldown > 0 ? 'var(--dim)' : 'var(--blue)',
                transition: 'opacity 180ms ease',
              }}
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const formStyle = { display: 'flex', flexDirection: 'column', gap: 12 };

const titleStyle = {
  margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3,
};

const subtitleStyle = {
  margin: '4px 0 0', fontSize: 13.5, color: 'var(--dim)', lineHeight: 1.4,
};

const closeButtonStyle = {
  position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: '50%',
  border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer',
  fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 160ms ease',
};

const inputStyle = {
  padding: '12px 14px', borderRadius: 12, border: '1px solid var(--glass-border)',
  background: 'rgba(255,255,255,0.7)', fontSize: 15, color: 'var(--ink)', outline: 'none',
  transition: 'border-color 160ms ease, box-shadow 160ms ease, background 160ms ease',
};

const inputFocusStyle = {
  borderColor: 'var(--blue)',
  background: '#fff',
  boxShadow: '0 0 0 3px rgba(10,132,255,0.15)',
};

const primaryButtonStyle = {
  padding: '13px 0', borderRadius: 12, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(10,132,255,0.28)',
  transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
};

const primaryButtonDisabledStyle = {
  ...primaryButtonStyle,
  opacity: 0.6, cursor: 'default', boxShadow: 'none',
};

const termsLabelStyle = {
  display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.4,
};

const linkStyle = { color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 };

const errorStyle = { margin: 0, fontSize: 13, color: 'var(--red)' };
