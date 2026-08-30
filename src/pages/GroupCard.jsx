/**
 * ============================================================================
 * GROUP INFO CARD (PORTAL + LIQUID GLASS UI)
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - REBUILT to match the current EditProfile.jsx design language exactly:
 *   glass-panel grouped sections, pill-shaped header close button, a
 *   decorative grab handle, and a gradient avatar ring — replacing the
 *   older flat solid-hex treatment.
 * - overflow: 'hidden' is now set on the sheet itself (EditProfile's fix),
 *   which is what keeps the top corners looking properly rounded instead
 *   of "edgy" when child elements share the sheet's own background color.
 * - "Copy Link" moved into a circular glass icon button in the header's
 *   right slot — the same slot/style EditProfile uses for its Sign Out
 *   button — instead of a hidden dropdown menu or an extra bottom button
 *   (Group Info has no "save" action, so there's no need for a bottom CTA).
 *
 * Dependencies: React, ReactDOM, Supabase, Subdomain Helpers, Shared Components
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import supabase from '../lib/supabaseClient';
import { showToast, friendlyDbError } from '../lib/toast';
import { getGroupUrl } from '../lib/subdomain';

// Shared Components
import LiquidAvatar from '../components/shared/LiquidAvatar';
import MessageSkeleton from '../components/shared/MessageSkeleton';
import { hapticTap, hapticSelect } from '../lib/haptics';
import { playTap } from '../lib/soundManager';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ANIMATION_DURATION = 320;

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Close: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  Calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Link: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
};

// ============================================================================
// 3. UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// ============================================================================
// 4. UI SUB-COMPONENTS (mirrors EditProfile.jsx's SectionLabel / LiquidInput)
// ============================================================================

// Small icon-chip + uppercase label, purely decorative, used to break the
// card into visually distinct rounded groups — copied from EditProfile.
function SectionLabel({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 4px' }}>
      {icon && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 8, background: 'rgba(255,107,53,0.14)', color: 'var(--ember)' }}>
          {icon}
        </div>
      )}
      <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{children}</h3>
    </div>
  );
}

// Read-only counterpart to EditProfile's LiquidInput — same icon chip,
// glass material, and floating label, just non-interactive.
function ReadOnlyGroupInput({ icon, label, value, isTextArea = false }) {
  if (!value) return null;

  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: isTextArea ? 'flex-start' : 'center', gap: 14,
      background: 'rgba(255,255,255,0.03)', border: '1.5px solid var(--glass-border)',
      borderRadius: 22, padding: isTextArea ? '16px 18px' : '6px 14px',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      marginTop: 14, cursor: 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 14, background: 'rgba(255,255,255,0.05)', color: 'var(--dim)', marginTop: isTextArea ? 2 : 0 }}>
        {icon}
      </div>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: isTextArea ? 'auto' : 44 }}>
        {isTextArea ? (
          <textarea value={value} readOnly rows={4} autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--paper)', fontFamily: 'inherit', resize: 'none', paddingTop: 14, pointerEvents: 'none', lineHeight: 1.5 }} />
        ) : (
          <input type="text" value={value} readOnly autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--paper)', padding: '14px 0 6px', pointerEvents: 'none' }} />
        )}
        <label style={{ position: 'absolute', top: isTextArea ? 16 : '50%', left: 0, transform: isTextArea ? 'translateY(-22px) scale(0.82)' : 'translateY(-25px) scale(0.82)', transformOrigin: 'left top', color: 'var(--dim)', fontWeight: 600, fontSize: 15, pointerEvents: 'none' }}>
          {label}
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// 5. MAIN GROUP CARD COMPONENT EXPORT
// ============================================================================

export default function GroupCard({ groupSlug, open, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    if (open && groupSlug) {
      setIsVisible(true);
      setLoading(true);
      setError('');

      supabase
        .from('groups')
        .select('*')
        .eq('slug', groupSlug)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            console.error(error);
            showToast(friendlyDbError(), 'error');
            setError("Something went wrong loading this group.");
          } else if (!data) {
            setError("Group not found.");
          } else {
            setGroup(data);
          }
          setLoading(false);
        });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        if (isMounted) {
          setGroup(null);
          setError('');
        }
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }

    return () => { isMounted = false; };
  }, [open, groupSlug]);

  const handleClose = useCallback(() => {
    hapticTap();
    playTap();
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getGroupUrl(groupSlug));
    hapticSelect();
    playTap();
    showToast('Group link copied to clipboard!', 'success');
  };

  if (!open && !isVisible && !group && !loading) return null;

  // --------------------------------------------------------------------------
  // THE PORTAL UI (Physically escapes all CSS traps)
  // --------------------------------------------------------------------------
  const modalUI = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999, // Guaranteed Top Layer
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        pointerEvents: 'none' // Let clicks pass through empty space
      }}
    >
      {/* SOLID BLACK DIMMING BACKDROP */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${ANIMATION_DURATION}ms ease`,
          pointerEvents: 'auto',
          zIndex: 1
        }}
      />

      {/* THE SHEET — overflow:hidden here is the key fix that keeps the
          rounded top corners looking clean instead of edgy */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 2, pointerEvents: 'auto',
          width: '100%', maxWidth: 560, margin: '0 auto',
          height: '90dvh',
          background: 'linear-gradient(180deg, #1E1F27 0%, var(--ink-2) 100%)',
          borderTopLeftRadius: 32, borderTopRightRadius: 32,
          border: '1px solid var(--glass-border)', borderBottom: 'none',
          boxShadow: '0 -18px 50px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: `transform ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
        }}
      >
        {/* Decorative grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 40, height: 4.5, borderRadius: 999, background: 'rgba(255,255,255,0.16)' }} />
        </div>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 16px', borderBottom: '1px solid var(--glass-border)', zIndex: 10 }}>
          <button
            onClick={handleClose}
            style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'var(--glass-white)', color: 'var(--ember)', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '8px 14px 8px 10px', borderRadius: 999 }}
          >
            {Vectors.Close} <span>Close</span>
          </button>

          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--paper)', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: 0.2 }}>
            Group Info
          </h1>

          <button
            onClick={handleCopyLink}
            title="Copy Link"
            style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-white)', padding: '9px', borderRadius: '50%', color: 'var(--ember)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {Vectors.Link}
          </button>
        </div>

        {/* SCROLLABLE CONTENT BODY */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {loading ? (
              <MessageSkeleton variant="card" />
            ) : error ? (
              <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ color: 'var(--dim)', opacity: 0.5, marginBottom: 8 }}>{Vectors.Info}</div>
                <p style={{ color: 'var(--paper)', fontSize: 20, fontWeight: 700, margin: 0 }}>Group Unavailable</p>
                <p style={{ color: 'var(--dim)', fontSize: 15, margin: 0 }}>{error}</p>
              </div>
            ) : group ? (
              <>
                {/* Big Avatar Rendering — gradient ring matches EditProfile's avatar treatment */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 148, height: 148, borderRadius: '50%', padding: 4, background: 'linear-gradient(135deg, var(--ember), #FFB199)', boxShadow: '0 10px 30px rgba(255,107,53,0.20), 0 4px 14px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <LiquidAvatar
                        identity={{ name: group.name, avatar_url: group.cover_url, is_admin: false }}
                        size={140}
                        kind="group"
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--paper)', letterSpacing: '-0.5px' }}>
                      {group.name}
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--dim)' }}>Public Channel</p>
                  </div>
                </div>

                {/* Created Date Pill */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 30px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--paper)', fontSize: 14, fontWeight: 700, background: 'var(--glass-white)', border: '1px solid var(--glass-border)', padding: '8px 16px', borderRadius: 999, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
                    {Vectors.Calendar}
                    <span>Created {formatDate(group.created_at)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
                  <div>
                    <SectionLabel icon={Vectors.Info}>About</SectionLabel>
                    <div className="glass-panel" style={{ padding: 10, background: 'rgba(255,255,255,0.02)' }}>
                      <ReadOnlyGroupInput icon={Vectors.Info} label="Description" value={group.description || 'Welcome to the group.'} isTextArea={true} />
                    </div>
                  </div>
                </div>
              </>
            ) : null}

          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalUI, document.body);
  }
  return null;
}
