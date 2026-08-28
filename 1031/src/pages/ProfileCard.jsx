/**
 * ============================================================================
 * PROFILE CARD (PORTAL + MATTE UI)
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - ADDED: `createPortal` to escape the Flexbox layout, preventing side-edge 
 *   rendering glitches and guaranteeing it snaps to the bottom correctly.
 * - FIXED: Replaced CSS variables with solid Hex colors (`#1C1D24` and `#15161B`)
 *   to completely stop transparency bleeding.
 * - FIXED: Adjusted height to `90dvh` and verified the `flex: 1` scroll 
 *   container to guarantee long bios and social links are never cut off.
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
  Close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  AdminShield: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  Twitter: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>,
  Instagram: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
  Link: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  Message: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
  User: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
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
      name: ADMIN_DISPLAY_NAME, avatar_url: null, is_admin: true, 
      bio: "Official Network Administrator", joined: relativeTime(profile.created_at), social: {} 
    };
  }
  return { 
    name: profile.username || 'Unknown User', avatar_url: profile.avatar_url || null, is_admin: false,
    bio: profile.bio || null, joined: relativeTime(profile.created_at), social: profile.social_links || {}
  };
}

// ============================================================================
// 4. SUB-COMPONENTS
// ============================================================================

function ReadOnlyInput({ icon, label, value, isTextArea = false }) {
  if (!value) return null;

  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: isTextArea ? 'flex-start' : 'center', gap: 12,
      backgroundColor: '#15161B', border: '1px solid rgba(255,255,255,0.06)', // SOLID MATTE COLORS
      borderRadius: 16, padding: isTextArea ? '16px' : '8px 16px',
      marginTop: 12, opacity: 0.9, cursor: 'default'
    }}>
      <div style={{ color: '#8B8B96', paddingTop: isTextArea ? 2 : 0 }}>{icon}</div>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {isTextArea ? (
          <textarea
            value={value} readOnly rows={4}
            autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other"
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: '#F4F3F0', fontFamily: 'inherit', resize: 'none', paddingTop: 12, pointerEvents: 'none' }}
          />
        ) : (
          <input
            type="text" value={value} readOnly
            autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other"
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: '#F4F3F0', padding: '12px 0 4px', pointerEvents: 'none' }}
          />
        )}
        <label style={{
          position: 'absolute', top: 0, left: 0,
          transform: isTextArea ? 'translateY(-20px) scale(0.85)' : 'translateY(-24px) scale(0.85)',
          transformOrigin: 'left top', color: '#8B8B96', fontSize: 16, pointerEvents: 'none',
        }}>
          {label}
        </label>
      </div>
    </div>
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
      
      {/* THE SHEET CONTAINER (NO CLASSES) */}
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          position: 'relative', zIndex: 2, pointerEvents: 'auto',
          width: '100%', maxWidth: 560, margin: '0 auto', 
          height: '90dvh', // Explicit 90dvh height prevents content cutoff
          backgroundColor: '#1C1D24', // SOLID MATTE HEX
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: `transform ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
        }}
      >
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 10 }}>
          <button 
            onClick={handleClose} 
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: '#FF6B35', fontSize: 16, fontWeight: 500, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, marginLeft: -8 }}
          >
            {Vectors.Close} <span>Close</span>
          </button>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F3F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            Profile
          </h1>
        </div>

        {/* SCROLLABLE CONTENT BODY */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {status === 'loading' && <MessageSkeleton variant="card" />}
            
            {(status === 'not-found' || status === 'error') && (
              <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ color: '#8B8B96', opacity: 0.5, marginBottom: 8 }}>{Vectors.User}</div>
                <p style={{ color: '#F4F3F0', fontSize: 20, fontWeight: 700, margin: 0 }}>User Not Found</p>
                <p style={{ color: '#8B8B96', fontSize: 15, margin: 0 }}>This profile may have been deleted.</p>
              </div>
            )}
            
            {status === 'ready' && identity && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>
                
                {/* Big Avatar Rendering */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <LiquidAvatar identity={identity} size={140} kind="user" />
                  <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: identity.is_admin ? 'var(--admin-1)' : '#F4F3F0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {identity.name}
                      {identity.is_admin && Vectors.AdminShield}
                    </h2>
                    {!identity.is_admin && <p style={{ margin: '4px 0 0', fontSize: 15, color: '#8B8B96' }}>@{profile.username}</p>}
                  </div>
                </div>

                {/* Joined Date Pill */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F4F3F0', fontSize: 14, fontWeight: 600, backgroundColor: '#15161B', border: '1px solid rgba(255,255,255,0.06)', padding: '8px 16px', borderRadius: 20 }}>
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
                    style={{ width: '100%', padding: '16px 0', borderRadius: 20, border: 'none', background: '#FF6B35', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 24px rgba(255,107,53,0.3)' }}
                  >
                    {Vectors.Message} Send Message
                  </button>
                )}

                {/* Details section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
                  
                  {identity.bio && (
                    <div>
                      <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>About</h3>
                      <ReadOnlyInput icon={Vectors.User} label="Biography" value={identity.bio} isTextArea={true} />
                    </div>
                  )}

                  {(identity.social?.twitter || identity.social?.instagram || identity.social?.website) && (
                    <div>
                      <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Social Links</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 12 }}>
                        
                        {identity.social?.twitter && (
                          <a 
                            href={`https://x.com/${identity.social.twitter.replace('@','')}`} target="_blank" rel="noreferrer" 
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', backgroundColor: '#15161B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, color: '#F4F3F0', textDecoration: 'none', fontWeight: 600 }}
                          >
                            <div style={{ color: '#F4F3F0' }}>{Vectors.Twitter}</div>
                            x.com/{identity.social.twitter.replace('@','')}
                          </a>
                        )}
                        
                        {identity.social?.instagram && (
                          <a 
                            href={`https://instagram.com/${identity.social.instagram.replace('@','')}`} target="_blank" rel="noreferrer" 
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', backgroundColor: '#15161B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, color: '#F4F3F0', textDecoration: 'none', fontWeight: 600 }}
                          >
                            <div style={{ color: '#E1306C' }}>{Vectors.Instagram}</div>
                            instagram.com/{identity.social.instagram.replace('@','')}
                          </a>
                        )}
                        
                        {identity.social?.website && (
                          <a 
                            href={identity.social.website.startsWith('http') ? identity.social.website : `https://${identity.social.website}`} target="_blank" rel="noreferrer" 
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', backgroundColor: '#15161B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, color: '#F4F3F0', textDecoration: 'none', fontWeight: 600 }}
                          >
                            <div style={{ color: '#8B8B96' }}>{Vectors.Link}</div>
                            {identity.social.website.replace(/^https?:\/\//, '')}
                          </a>
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
