/**
 * ============================================================================
 * PROFILE CARD (PORTAL + LIQUID GLASS UI)
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - REBUILT to match the current EditProfile.jsx design language exactly:
 *   glass-panel grouped sections, pill-shaped header close button, a
 *   decorative grab handle, gradient avatar ring, and a full pill gradient
 *   CTA button — replacing the older flat solid-hex treatment.
 * - overflow: 'hidden' is now set on the sheet itself (EditProfile's fix),
 *   which is what keeps the top corners looking properly rounded instead
 *   of "edgy" when child elements share the sheet's own background color.
 * - Avatar ring color adapts: gold gradient for the admin identity, ember
 *   gradient for everyone else, so it never fights LiquidAvatar's own
 *   internal admin ring treatment.
 *
 * Dependencies: React, ReactDOM, Supabase, Shared Components
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom'; // <--- MAGIC FIX FOR RENDERING LOCATION
import supabase from '../lib/supabaseClient';
import { getRootDomainUrl } from '../lib/subdomain';
import { playSend } from '../lib/soundManager';
import { hapticSend } from '../lib/haptics';

// Shared Components
import LiquidAvatar from '../components/shared/LiquidAvatar';
import MessageSkeleton from '../components/shared/MessageSkeleton';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ADMIN_DISPLAY_NAME = 'ADMIN';
const ANIMATION_DURATION = 320;

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  AdminShield: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  Twitter: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>,
  Instagram: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
  Link: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  Message: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
  User: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Hash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
};

// ============================================================================
// 3. UTILITY FUNCTIONS
// ============================================================================

function relativeTime(dateString) {
  if (!dateString) return 'Unknown';
  const diffDays = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} months ago`;
  return `${Math.floor(diffMonths / 12)} years ago`;
}

function resolveProfileIdentity(profile) {
  if (!profile) return null;
  if (profile.is_admin) {
    return {
      name: ADMIN_DISPLAY_NAME, avatar_url: profile.avatar_url || null, is_admin: true,
      bio: "Official Network Administrator", joined: relativeTime(profile.created_at), social: {}
    };
  }
  return {
    name: profile.username || 'Unknown User', avatar_url: profile.avatar_url || null, is_admin: false,
    bio: profile.bio || null, joined: relativeTime(profile.created_at), social: profile.social_links || {}
  };
}

// ============================================================================
// 4. SUB-COMPONENTS (mirrors EditProfile.jsx's SectionLabel / LiquidInput)
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
function ReadOnlyLiquidInput({ icon, label, value, isTextArea = false }) {
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

// Social link row — same visual language as EditProfile's Notification /
// Admin buttons (glass-panel, 40x40 icon chip, two-line text stack).
function SocialLinkRow({ icon, iconColor, label, href }) {
  return (
    <a
      href={href} target="_blank" rel="noreferrer"
      className="glass-panel"
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid var(--glass-border)', textDecoration: 'none' }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,0.06)', color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </a>
  );
}

// ============================================================================
// 5. MAIN PROFILE CARD COMPONENT
// ============================================================================

export default function ProfileCard({ userId, open, onClose, onMessage }) {
  const [status, setStatus] = useState('idle');
  const [profile, setProfile] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (open && userId) {
      setIsVisible(true);
      setStatus('loading');

      supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) { setStatus('error'); return; }
          if (!data) { setStatus('not-found'); return; }
          setProfile(data);
          setStatus('ready');
        });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        if (isMounted) { setStatus('idle'); setProfile(null); }
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
    return () => { isMounted = false; };
  }, [open, userId]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => { onClose(); }, ANIMATION_DURATION - 50);
  }, [onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  if (!open && !isVisible && status === 'idle') return null;

  const identity = profile ? resolveProfileIdentity(profile) : null;
  const ringGradient = identity?.is_admin
    ? 'linear-gradient(135deg, var(--admin-1), var(--admin-2))'
    : 'linear-gradient(135deg, var(--ember), #FFB199)';

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
          backgroundColor: 'rgba(0,0,0,0.85)', // 85% Solid Black
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
            Profile
          </h1>
          {/* Spacer keeps the title centered against the pill button's width */}
          <div style={{ width: 40 }} />
        </div>

        {/* SCROLLABLE CONTENT BODY */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {status === 'loading' && <MessageSkeleton variant="card" />}

            {(status === 'not-found' || status === 'error') && (
              <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ color: 'var(--dim)', opacity: 0.5, marginBottom: 8 }}>{Vectors.User}</div>
                <p style={{ color: 'var(--paper)', fontSize: 20, fontWeight: 700, margin: 0 }}>User Not Found</p>
                <p style={{ color: 'var(--dim)', fontSize: 15, margin: 0 }}>This profile may have been deleted.</p>
              </div>
            )}

            {status === 'ready' && identity && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 30 }}>

                {/* Big Avatar Rendering — gradient ring matches EditProfile's avatar treatment */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 148, height: 148, borderRadius: '50%', padding: 4, background: ringGradient, boxShadow: '0 10px 30px rgba(255,107,53,0.20), 0 4px 14px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <LiquidAvatar identity={identity} size={140} kind="user" />
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: identity.is_admin ? 'var(--admin-1)' : 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {identity.name}
                      {identity.is_admin && Vectors.AdminShield}
                    </h2>
                    {!identity.is_admin && <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--dim)' }}>@{profile.username}</p>}
                  </div>
                </div>

                {/* Joined Date Pill */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--paper)', fontSize: 14, fontWeight: 700, background: 'var(--glass-white)', border: '1px solid var(--glass-border)', padding: '8px 16px', borderRadius: 999, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
                    {Vectors.Calendar} <span>Joined {identity.joined}</span>
                  </div>
                </div>

                {/* Action Button (Send Message) — always available. If the
                    screen that opened this card wired up onMessage (Home.jsx),
                    use it to open the DM pane in place. Otherwise (GroupChat,
                    DirectMessages' own info panel) fall back to a real
                    navigation to the canonical anonroom.in/<username> DM
                    link, which every subdomain already shares a login
                    session with via cookies. Never shown for the site's own
                    ADMIN identity or for a profile viewing itself. */}
                {!identity.is_admin && profile?.username && (
                  <button
                    onClick={() => {
                      playSend();
                      hapticSend();
                      if (onMessage) {
                        setIsVisible(false);
                        setTimeout(() => { onMessage(userId); }, ANIMATION_DURATION - 50);
                      } else {
                        window.location.href = `${getRootDomainUrl()}${encodeURIComponent(profile.username)}`;
                      }
                    }}
                    style={{ width: '100%', padding: '17px 0', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, var(--ember), #FF8A5C)', color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: 0.2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 10px 26px rgba(255,107,53,0.32)' }}
                  >
                    {Vectors.Message} Send Message
                  </button>
                )}

                {/* Details section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>

                  {identity.bio && (
                    <div>
                      <SectionLabel icon={Vectors.User}>About</SectionLabel>
                      <div className="glass-panel" style={{ padding: 10, background: 'rgba(255,255,255,0.02)' }}>
                        <ReadOnlyLiquidInput icon={Vectors.User} label="Biography" value={identity.bio} isTextArea={true} />
                      </div>
                    </div>
                  )}

                  {(identity.social?.twitter || identity.social?.instagram || identity.social?.website) && (
                    <div>
                      <SectionLabel icon={Vectors.Hash}>Social Links</SectionLabel>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>

                        {identity.social?.twitter && (
                          <SocialLinkRow
                            icon={Vectors.Twitter} iconColor="var(--paper)"
                            label={`x.com/${identity.social.twitter.replace('@', '')}`}
                            href={`https://x.com/${identity.social.twitter.replace('@', '')}`}
                          />
                        )}

                        {identity.social?.instagram && (
                          <SocialLinkRow
                            icon={Vectors.Instagram} iconColor="#E1306C"
                            label={`instagram.com/${identity.social.instagram.replace('@', '')}`}
                            href={`https://instagram.com/${identity.social.instagram.replace('@', '')}`}
                          />
                        )}

                        {identity.social?.website && (
                          <SocialLinkRow
                            icon={Vectors.Link} iconColor="var(--dim)"
                            label={identity.social.website.replace(/^https?:\/\//, '')}
                            href={identity.social.website.startsWith('http') ? identity.social.website : `https://${identity.social.website}`}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Safely inject into body to escape all CSS flex/transform traps
  if (typeof document !== 'undefined') {
    return createPortal(modalUI, document.body);
  }
  return null;
}
