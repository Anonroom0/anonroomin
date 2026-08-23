import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';

const RESEND_COOLDOWN_S = 30;

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong pop-in"
        style={{ width: 380, maxWidth: '100%', padding: 28, position: 'relative' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%',
            border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {stage === 'form' && (
          <>
            {/* Sliding tab switcher */}
            <div
              style={{
                position: 'relative', display: 'flex', background: 'rgba(0,0,0,0.05)',
                borderRadius: 12, padding: 4, marginBottom: 24,
              }}
            >
              <div
                style={{
                  position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 4px)',
                  left: tab === 'signin' ? 4 : 'calc(50% + 0px)',
                  background: '#fff', borderRadius: 9,
                  transition: 'left 220ms cubic-bezier(0.34,1.56,0.64,1)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                }}
              />
              <button
                onClick={() => switchTab('signin')}
                style={{
                  flex: 1, zIndex: 1, padding: '8px 0', border: 'none', background: 'transparent',
                  fontWeight: 600, color: tab === 'signin' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer',
                }}
              >
                Sign In
              </button>
              <button
                onClick={() => switchTab('signup')}
                style={{
                  flex: 1, zIndex: 1, padding: '8px 0', border: 'none', background: 'transparent',
                  fontWeight: 600, color: tab === 'signup' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer',
                }}
              >
                Create Account
              </button>
            </div>

            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="email" placeholder="Email" value={email} required
                  onChange={(e) => setEmail(e.target.value)} style={inputStyle}
                />
                <input
                  type="password" placeholder="Password" value={password} required
                  onChange={(e) => setPassword(e.target.value)} style={inputStyle}
                />
                {error && <p style={errorStyle}>{error}</p>}
                <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                  {submitting ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="text" placeholder="Username" value={username} required
                  onChange={(e) => setUsername(e.target.value)} style={inputStyle}
                />
                <input
                  type="email" placeholder="Email" value={email} required
                  onChange={(e) => setEmail(e.target.value)} style={inputStyle}
                />
                <input
                  type="password" placeholder="Password" value={password} required
                  onChange={(e) => setPassword(e.target.value)} style={inputStyle}
                />
                <input
                  type="password" placeholder="Confirm password" value={confirmPassword} required
                  onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--dim)' }}>
                  <span
                    role="switch"
                    aria-checked={acceptedTerms}
                    onClick={() => setAcceptedTerms((v) => !v)}
                    style={{
                      width: 40, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                      background: acceptedTerms ? 'var(--blue)' : 'rgba(0,0,0,0.15)',
                      transition: 'background 180ms ease', position: 'relative',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute', top: 2, left: acceptedTerms ? 18 : 2,
                        width: 20, height: 20, borderRadius: '50%', background: '#fff',
                        transition: 'left 180ms cubic-bezier(0.34,1.56,0.64,1)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    />
                  </span>
                  <span>
                    I agree to the <a href="#">Terms</a> and <a href="#">Privacy Policy</a>
                  </span>
                </label>

                {error && <p style={errorStyle}>{error}</p>}
                <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                  {submitting ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            )}
          </>
        )}

        {stage === 'otp' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>Check your email</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dim)' }}>
                Enter the 6-digit code we sent to {email}
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
                  inputMode="numeric"
                  maxLength={1}
                  style={{ ...inputStyle, width: 40, textAlign: 'center', fontSize: 20, padding: '10px 0' }}
                />
              ))}
            </div>

            {error && <p style={errorStyle}>{error}</p>}

            <button type="submit" disabled={submitting} style={primaryButtonStyle}>
              {submitting ? 'Verifying…' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{
                background: 'none', border: 'none', fontSize: 13, cursor: resendCooldown > 0 ? 'default' : 'pointer',
                color: resendCooldown > 0 ? 'var(--dim)' : 'var(--blue)',
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

const inputStyle = {
  padding: '12px 14px', borderRadius: 12, border: '1px solid var(--glass-border)',
  background: 'rgba(255,255,255,0.7)', fontSize: 15, color: 'var(--ink)', outline: 'none',
};

const primaryButtonStyle = {
  padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
};

const errorStyle = { margin: 0, fontSize: 13, color: 'var(--red)' };
