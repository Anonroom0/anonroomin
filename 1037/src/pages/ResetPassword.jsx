/** ===========================================================================
 * RESET PASSWORD (STANDALONE PAGE — /reset-password)
 * ============================================================================
 * Mounted directly by App.jsx at the root-domain path /reset-password,
 * OUTSIDE any auth gate — exactly like QuestionThread's /q/<id> and
 * ConfessionsFeed's /confessions.
 *
 * WHY THIS FILE EXISTS: AuthModal.jsx's "Forgot Password?" flow already
 * called supabase.auth.resetPasswordForEmail() correctly and really did
 * send a real email — that part was never fake. What was missing is this
 * page, and — just as important — a reliable way for it to know a recovery
 * request is legit.
 *
 * FLOW (token-hash based, NOT the redirect-URL based flow):
 *   The email links to /reset-password/<token_hash> (see subdomain.js's
 *   getResetPasswordTokenHash() and supabase/reset-password-email-template.html,
 *   which uses {{ .TokenHash }} rather than {{ .ConfirmationURL }}).
 *   1. On mount, this page reads the token hash straight out of its own
 *      path and calls supabase.auth.verifyOtp({ token_hash, type:
 *      'recovery' }) directly — a plain client -> Supabase API call. This
 *      is deliberately NOT the older "let supabase-js auto-parse a
 *      recovery token out of the URL fragment via detectSessionInUrl"
 *      approach: that approach depends on Supabase's own server-side
 *      redirect chain (ConfirmationURL -> project's *.supabase.co domain ->
 *      redirectTo, only if redirectTo is also on the Auth -> URL
 *      Configuration -> Redirect URLs allow list in the Supabase
 *      Dashboard). Miss that dashboard step and Supabase silently falls
 *      back to the Site URL instead, which looks exactly like "the link
 *      just logs me in" with no reset form ever shown. Calling verifyOtp()
 *      ourselves with the token_hash removes that whole failure mode.
 *   2. A successful verifyOtp() call establishes a real "recovery" session
 *      immediately (no waiting on an auth-state-change event), so the page
 *      goes straight from 'verifying' to 'form'.
 *   3. supabase.auth.updateUser({ password }) applies the new password —
 *      this also signs the visitor in properly (the recovery session
 *      becomes their real session), so success can go straight back into
 *      the app rather than asking them to sign in again.
 *   4. If the token is missing/expired/already used, verifyOtp() rejects
 *      and an explicit "invalid link" state is shown instead of a dead form.
 *
 * Legacy fallback: a bare /reset-password hit with no token in the path
 * (an old email already sitting in someone's inbox from before this
 * change) still gets one chance via the old detectSessionInUrl /
 * PASSWORD_RECOVERY-event path, so links already sent out don't just break.
 *
 * The URL is stripped down to the bare pathname via history.replaceState as
 * soon as a session is confirmed, so the token doesn't linger in the
 * address bar, browser history, or anything the visitor might screenshot/share.
 *
 * Dependencies: React, Supabase, src/lib/subdomain.js
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { ROOT_PATH, getResetPasswordTokenHash } from '../lib/subdomain';
import { showToast } from '../lib/toast';
import { hapticSuccess, hapticError } from '../lib/haptics';
import { playRefreshComplete, playError } from '../lib/soundManager';

// How long to wait for a recovery session to show up (either already
// present on mount, or via the PASSWORD_RECOVERY event) before concluding
// the link is invalid/expired rather than just "still loading".
const VERIFY_TIMEOUT_MS = 6000;
const REDIRECT_DELAY_MS = 2200;

// ============================================================================
// INLINE ICONS (same vocabulary as AuthModal.jsx)
// ============================================================================
const Vectors = {
  Lock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Eye: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  EyeOff: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  Alert: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  CheckCircle: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Spinner: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin">
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
};

export default function ResetPassword() {
  // 'verifying' | 'form' | 'invalid' | 'saving' | 'success'
  const [stage, setStage] = useState('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [error, setError] = useState('');

  const settledRef = useRef(false);

  // --------------------------------------------------------------------------
  // CONFIRM A RECOVERY SESSION EXISTS (see file banner's FLOW step 1)
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    function markVerified() {
      if (cancelled || settledRef.current) return;
      settledRef.current = true;
      // Strip the token out of the address bar now that the session built
      // from it is confirmed live.
      window.history.replaceState({}, '', window.location.pathname.split('/').slice(0, 2).join('/') || '/');
      setStage('form');
    }

    function markInvalid() {
      if (cancelled || settledRef.current) return;
      settledRef.current = true;
      setStage('invalid');
    }

    const tokenHash = getResetPasswordTokenHash();

    if (tokenHash) {
      // Primary path: verify the token straight off the URL. No dependence
      // on Supabase's redirect-URL allow list at all.
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ data, error }) => {
        if (error || !data?.session) {
          markInvalid();
          return;
        }
        markVerified();
      });

      const timeoutId = setTimeout(markInvalid, VERIFY_TIMEOUT_MS);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }

    // Legacy fallback for a bare /reset-password link with no token in the
    // path (sent before this page existed): fall back to letting
    // supabase-js auto-parse a recovery session out of the URL, same as
    // before.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) markVerified();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) markVerified();
    });

    const timeoutId = setTimeout(markInvalid, VERIFY_TIMEOUT_MS);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  // --------------------------------------------------------------------------
  // SUBMIT NEW PASSWORD
  // --------------------------------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setStage('saving');
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      playError(); hapticError();
      setStage('form');
      setError(updateError.message || 'Could not update your password. Please try again.');
      return;
    }

    playRefreshComplete(); hapticSuccess();
    setStage('success');
    showToast('Password updated', 'success');
    setTimeout(() => {
      window.location.href = ROOT_PATH;
    }, REDIRECT_DELAY_MS);
  }

  const inputWrapperStyle = (fieldName) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    backgroundColor: '#15161B',
    border: '1px solid',
    borderColor: focusedField === fieldName ? '#FF6B35' : 'rgba(255,255,255,0.06)',
    borderRadius: 16, padding: '4px 16px',
    boxShadow: focusedField === fieldName ? '0 0 0 4px rgba(255,107,53,0.15)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
    transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
  });

  const inputFieldStyle = {
    flex: 1, border: 'none', background: 'transparent', outline: 'none',
    fontSize: 16, color: '#F4F3F0', padding: '10px 0', width: '100%',
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', width: '100%', padding: 20,
        background: 'var(--ink)', boxSizing: 'border-box',
      }}
    >
      <div
        className="pop-in"
        style={{
          width: '100%', maxWidth: 420,
          backgroundColor: '#1C1D24',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 28, padding: 32,
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* ---------------------------------------------------------------- */}
        {/* VERIFYING                                                       */}
        {/* ---------------------------------------------------------------- */}
        {stage === 'verifying' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--ember)' }}>{Vectors.Spinner}</div>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)' }}>Verifying your reset link…</p>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* INVALID / EXPIRED LINK                                          */}
        {/* ---------------------------------------------------------------- */}
        {stage === 'invalid' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '12px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--ember)' }}>{Vectors.Alert}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: '#F4F3F0' }}>Link expired</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
              This password reset link is invalid or has already been used. Request a new one from the sign-in screen and try again.
            </p>
            <button
              onClick={() => { window.location.href = ROOT_PATH; }}
              style={{
                marginTop: 8, width: '100%', padding: '14px 0', borderRadius: 16, border: 'none',
                background: 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              Back to AnonRoom
            </button>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* SUCCESS                                                          */}
        {/* ---------------------------------------------------------------- */}
        {stage === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--success)' }}>{Vectors.CheckCircle}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: '#F4F3F0' }}>Password updated</h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--dim)' }}>Taking you back to AnonRoom…</p>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* FORM (also shown, disabled-feeling via `saving`, while saving)  */}
        {/* ---------------------------------------------------------------- */}
        {(stage === 'form' || stage === 'saving') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#F4F3F0' }}>Set a new password</h1>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--dim)' }}>Choose a new password for your AnonRoom account.</p>
            </div>

            {error && (
              <div style={{ background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--dim)', marginBottom: 6 }}>New password</label>
              <div style={inputWrapperStyle('password')}>
                <span style={{ color: 'var(--dim)', display: 'flex' }}>{Vectors.Lock}</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  disabled={stage === 'saving'}
                  style={inputFieldStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--dim)', cursor: 'pointer', display: 'flex' }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? Vectors.EyeOff : Vectors.Eye}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--dim)', marginBottom: 6 }}>Confirm password</label>
              <div style={inputWrapperStyle('confirmPassword')}>
                <span style={{ color: 'var(--dim)', display: 'flex' }}>{Vectors.Lock}</span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  disabled={stage === 'saving'}
                  style={inputFieldStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--dim)', cursor: 'pointer', display: 'flex' }}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? Vectors.EyeOff : Vectors.Eye}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={stage === 'saving' || !password || !confirmPassword}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 16, border: 'none',
                background: 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 16,
                cursor: stage === 'saving' ? 'default' : 'pointer',
                opacity: stage === 'saving' || !password || !confirmPassword ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {stage === 'saving' ? <>{Vectors.Spinner} Updating…</> : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
