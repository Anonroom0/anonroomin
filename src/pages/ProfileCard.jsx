/**
 * ============================================================================
 * PROFILE CARD (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component renders a premium, frosted-glass bottom-sheet for viewing
 * user profiles. It enforces global Admin display rules and features buttery
 * smooth slide-up animations matching the EditProfile settings sheet.
 * 
 * Corrected Features Included Inline:
 * - Redesigned strictly as an iOS Bottom Sheet
 * - Fixed colors relying purely on Tokens (No CSS overlaps)
 * - Dynamically renders Twitter, Instagram, Website as branded link pills
 * - Displays all available details including Bio
 * - Strict Admin Override (Gold badges, hides real name)
 * - Fully unminified, enterprise-grade formatting
 * 
 * Dependencies: React, Supabase
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ADMIN_DISPLAY_NAME = 'ADMIN';
const ANIMATION_DURATION = 400; // Liquid spring timing matches EditProfile

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY (APPLE / TELEGRAM STYLE)
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
  AdminShield: (
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Calendar: (
    <svg 
      width="18" 
      height="18" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Twitter: (
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
      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
    </svg>
  ),
  Instagram: (
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
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  Link: (
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  Message: (
    <svg 
      width="22" 
      height="22" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
  Spinner: (
    <svg 
      width="32" 
      height="32" 
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
  )
};

// ============================================================================
// 3. UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts initials from a username for the placeholder avatar.
 */
function getInitials(name) {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Calculates human-readable relative time (e.g., "Joined 2 months ago").
 */
function relativeTime(dateString) {
  if (!dateString) {
    return 'Unknown';
  }
  const diffDays = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 1) {
    return 'today';
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} months ago`;
  }
  return `${Math.floor(diffMonths / 12)} years ago`;
}

/**
 * Ensures strict global admin overrides.
 * Returns a standardized identity object mapping.
 */
function resolveProfileIdentity(profile) {
  if (!profile) {
    return null;
  }
  if (profile.is_admin) {
    return { 
      name: ADMIN_DISPLAY_NAME, 
      avatarUrl: null, 
      isAdmin: true, 
      bio: "Official Network Administrator", 
      joined: relativeTime(profile.created_at), 
      social: {} 
    };
  }
  return { 
    name: profile.username || 'Unknown User', 
    avatarUrl: profile.avatar_url || null, 
    isAdmin: false,
    bio: profile.bio || null, 
    joined: relativeTime(profile.created_at), 
    social: profile.social_links || {}
  };
}

// ============================================================================
// 4. SUB-COMPONENTS
// ============================================================================

/**
 * Injects required CSS animations into the document head.
 */
const GlobalKeyframes = () => (
  <style>{`
    @keyframes pulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.2; }
    }
    .spinner-animation {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  `}</style>
);

/**
 * Highly detailed skeleton loader matching the final Apple layout.
 */
function ProfileCardSkeleton() {
  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        gap: 20, 
        width: '100%',
        marginTop: 16
      }}
    >
      <div 
        style={{ 
          width: 140, 
          height: 140, 
          borderRadius: '50%', 
          background: 'var(--glass-border)', 
          animation: 'pulse 1.5s infinite' 
        }} 
      />
      <div 
        style={{ 
          width: '50%', 
          height: 32, 
          borderRadius: 16, 
          background: 'var(--glass-border)', 
          animation: 'pulse 1.5s infinite' 
        }} 
      />
      <div 
        style={{ 
          width: '40%', 
          height: 18, 
          borderRadius: 8, 
          background: 'var(--glass-border)', 
          animation: 'pulse 1.5s infinite 0.2s' 
        }} 
      />
    </div>
  );
}

/**
 * Avatar Renderer enforcing Admin rules and generating Apple gradients.
 */
function LiquidProfileAvatar({ identity, size = 140 }) {
  const containerStyle = {
    width: size, 
    height: size, 
    borderRadius: '50%', 
    flexShrink: 0, 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center',
    overflow: 'hidden', 
    boxShadow: '0 12px 32px rgba(0,0,0,0.15), inset 0 0 0 1px var(--glass-border)', 
    margin: '0 auto'
  };

  if (identity.isAdmin) {
    return (
      <div 
        style={{ 
          ...containerStyle, 
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', 
          color: '#fff', 
          fontSize: size * 0.35, 
          fontWeight: 800 
        }}
      >
        ADM
      </div>
    );
  }

  if (identity.avatarUrl) {
    return (
      <div style={containerStyle}>
        <img 
          src={identity.avatarUrl} 
          alt={identity.name} 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover' 
          }} 
        />
      </div>
    );
  }

  const colors = [
    'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)', 
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', 
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', 
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', 
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
  ];
  const colorIndex = (identity.name || '').length % colors.length;

  return (
    <div 
      style={{ 
        ...containerStyle, 
        background: colors[colorIndex], 
        color: '#ffffff', 
        fontWeight: 700, 
        fontSize: size * 0.4 
      }}
    >
      {getInitials(identity.name)}
    </div>
  );
}

/**
 * Read-Only input for displaying bio and other static text cleanly.
 */
function ReadOnlyInput({ icon, label, value, isTextArea = false }) {
  if (!value) return null;

  return (
    <div 
      style={{
        position: 'relative', display: 'flex', alignItems: isTextArea ? 'flex-start' : 'center', gap: 12,
        background: 'rgba(0,0,0,0.03)', border: '1px solid var(--glass-border)',
        borderRadius: 16, padding: isTextArea ? '16px' : '8px 16px',
        marginTop: 12, opacity: 0.8, cursor: 'default'
      }}
    >
      <div style={{ color: 'var(--dim)', paddingTop: isTextArea ? 2 : 0 }}>
        {icon}
      </div>
      
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {isTextArea ? (
          <textarea
            value={value} readOnly rows={4}
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--ink)', fontFamily: 'inherit', resize: 'none', paddingTop: 12, pointerEvents: 'none' }}
          />
        ) : (
          <input
            type="text" value={value} readOnly
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--ink)', padding: '12px 0 4px', pointerEvents: 'none' }}
          />
        )}
        
        <label 
          style={{
            position: 'absolute', top: 0, left: 0,
            transform: isTextArea ? 'translateY(-20px) scale(0.85)' : 'translateY(-24px) scale(0.85)',
            transformOrigin: 'left top', color: 'var(--dim)', fontSize: 16, pointerEvents: 'none',
          }}
        >
          {label}
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// 5. MAIN PROFILE CARD COMPONENT EXPORT
// ============================================================================

export default function ProfileCard({ userId, open, onClose, onMessage }) {
  
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  const [profile, setProfile] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  // --------------------------------------------------------------------------
  // VISIBILITY & DATA FETCHING LOGIC
  // --------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    if (open && userId) {
      setIsVisible(true);
      setStatus('loading');
      
      // Fetch user profile from Supabase
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) {
            return;
          }
          
          if (error) {
            console.error('Failed to load profile:', error.message);
            setStatus('error');
            return;
          }
          
          if (!data) {
            setStatus('not-found');
            return;
          }
          
          setProfile(data);
          setStatus('ready');
        });
    } else {
      // Trigger exit animation
      setIsVisible(false);
      // Wait for animation to finish before destroying data state
      const timer = setTimeout(() => {
        if (isMounted) {
          setStatus('idle');
          setProfile(null);
        }
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }

    return () => { 
      isMounted = false; 
    };
  }, [open, userId]);

  // --------------------------------------------------------------------------
  // INTERACTION HANDLERS
  // --------------------------------------------------------------------------
  
  const handleClose = useCallback(() => {
    setIsVisible(false);
    // Wait for the exit animation to play before informing the parent component
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose]);

  // Prevent clicks inside the actual sheet from closing the overlay
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  // --------------------------------------------------------------------------
  // RENDER GUARD
  // --------------------------------------------------------------------------
  if (!open && !isVisible && status === 'idle') {
    return null;
  }
  
  // Resolve the identity using our strict Admin overrides
  const identity = profile ? resolveProfileIdentity(profile) : null;

  // --------------------------------------------------------------------------
  // MAIN COMPONENT RENDER
  // --------------------------------------------------------------------------
  return (
    <>
      <GlobalKeyframes />
      <div 
        onClick={handleBackdropClick} 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          zIndex: 1000, 
          background: 'rgba(0,0,0,0.5)', 
          backdropFilter: isVisible ? 'blur(16px)' : 'blur(0px)', 
          WebkitBackdropFilter: isVisible ? 'blur(16px)' : 'blur(0px)', 
          display: 'flex', 
          alignItems: 'flex-end', 
          justifyContent: 'center', 
          opacity: isVisible ? 1 : 0, 
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)` 
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            width: '100%', 
            maxWidth: 560, 
            height: '85vh', 
            background: 'var(--bg)', 
            borderTopLeftRadius: 32, 
            borderTopRightRadius: 32, 
            boxShadow: '0 -24px 60px rgba(0,0,0,0.2)', 
            display: 'flex', 
            flexDirection: 'column', 
            transform: isVisible ? 'translateY(0)' : 'translateY(100%)', 
            transition: `transform ${ANIMATION_DURATION}ms cubic-bezier(0.175, 0.885, 0.32, 1.05)`, 
            overflow: 'hidden' 
          }}
        >
          
          {/* 
            ===================================================================
            HEADER
            ===================================================================
          */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '16px 20px', 
              background: 'var(--glass-strong)', 
              backdropFilter: 'blur(30px) saturate(200%)', 
              borderBottom: '1px solid var(--glass-border)', 
              zIndex: 10 
            }}
          >
            <button 
              onClick={handleClose} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                border: 'none', 
                background: 'transparent', 
                color: 'var(--blue)', 
                fontSize: 16, 
                fontWeight: 500, 
                cursor: 'pointer', 
                padding: 0 
              }}
            >
              {Vectors.Close} 
              <span>Close</span>
            </button>
            <h1 
              style={{ 
                margin: 0, 
                fontSize: 17, 
                fontWeight: 700, 
                color: 'var(--ink)' 
              }}
            >
              Profile
            </h1>
            <div style={{ width: 60 }} /> {/* Spacer to perfectly center the title */}
          </div>

          {/* 
            ===================================================================
            SCROLLABLE CONTENT BODY
            ===================================================================
          */}
          <div 
            className="custom-scrollbar" 
            style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '32px 20px 60px' 
            }}
          >
            <div 
              style={{ 
                maxWidth: 440, 
                margin: '0 auto', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center' 
              }}
            >
              
              {/* STATE: LOADING */}
              {status === 'loading' && <ProfileCardSkeleton />}
              
              {/* STATE: ERROR OR NOT FOUND */}
              {(status === 'not-found' || status === 'error') && (
                <div 
                  style={{ 
                    marginTop: 40, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    gap: 12 
                  }}
                >
                  <div style={{ color: 'var(--dim)', opacity: 0.5, marginBottom: 8 }}>
                    {Vectors.User}
                  </div>
                  <p 
                    style={{ 
                      color: 'var(--ink)', 
                      fontSize: 20, 
                      fontWeight: 700, 
                      margin: 0 
                    }}
                  >
                    User Not Found
                  </p>
                  <p 
                    style={{ 
                      color: 'var(--dim)', 
                      fontSize: 15, 
                      margin: 0 
                    }}
                  >
                    This profile may have been deleted.
                  </p>
                </div>
              )}
              
              {/* STATE: READY */}
              {status === 'ready' && identity && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>
                  {/* Big Avatar Rendering */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <LiquidProfileAvatar 
                      identity={identity} 
                      size={140} 
                    />
                    
                    {/* Name and Admin Badges */}
                    <div style={{ textAlign: 'center' }}>
                      <h2 
                        style={{ 
                          margin: 0, 
                          fontSize: 24, 
                          fontWeight: 800, 
                          color: identity.isAdmin ? '#FF8C00' : 'var(--ink)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: 8 
                        }}
                      >
                        {identity.name}
                        {identity.isAdmin && Vectors.AdminShield}
                      </h2>
                      {!identity.isAdmin && (
                        <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--dim)' }}>
                          @{profile.username}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Joined Date Pill */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        color: 'var(--dim)', 
                        fontSize: 14, 
                        fontWeight: 600, 
                        background: 'var(--glass-border)', 
                        padding: '8px 16px', 
                        borderRadius: 20 
                      }}
                    >
                      {Vectors.Calendar} 
                      <span>Joined {identity.joined}</span>
                    </div>
                  </div>

                  {/* Action Button (Send Message) */}
                  {onMessage && (
                    <button 
                      onClick={() => { 
                        // Start the closing animation first
                        setIsVisible(false); 
                        // Wait for it to slide down, then trigger the chat route
                        setTimeout(() => {
                          onMessage(userId);
                        }, ANIMATION_DURATION - 50); 
                      }} 
                      style={{ 
                        width: '100%', 
                        padding: '16px 0', 
                        borderRadius: 20, 
                        border: 'none', 
                        background: 'var(--blue)', 
                        color: '#fff', 
                        fontWeight: 700, 
                        fontSize: 16, 
                        cursor: 'pointer', 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        boxShadow: '0 8px 24px rgba(10,132,255,0.3)',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(10,132,255,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(10,132,255,0.3)';
                      }}
                      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                    >
                      {Vectors.Message}
                      Send Message
                    </button>
                  )}

                  {/* Details section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
                    
                    {/* Biography */}
                    {identity.bio && (
                      <div>
                        <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>About</h3>
                        <ReadOnlyInput icon={Vectors.User} label="Biography" value={identity.bio} isTextArea={true} />
                      </div>
                    )}

                    {/* Social Links Engine */}
                    {(identity.social?.twitter || identity.social?.instagram || identity.social?.website) && (
                      <div>
                        <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Social Links</h3>
                        <div 
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 12, 
                            width: '100%', 
                            marginTop: 12 
                          }}
                        >
                          {/* TWITTER / X */}
                          {identity.social?.twitter && (
                            <a 
                              href={`https://x.com/${identity.social.twitter.replace('@','')}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 14, 
                                padding: '16px 20px', 
                                background: 'var(--glass-border)', 
                                borderRadius: 18, 
                                color: 'var(--ink)', 
                                textDecoration: 'none', 
                                fontWeight: 600,
                                transition: 'transform 0.2s, background 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--glass-border)'}
                            >
                              <div style={{ color: 'var(--blue)' }}>{Vectors.Twitter}</div>
                              x.com/{identity.social.twitter.replace('@','')}
                            </a>
                          )}
                          
                          {/* INSTAGRAM */}
                          {identity.social?.instagram && (
                            <a 
                              href={`https://instagram.com/${identity.social.instagram.replace('@','')}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 14, 
                                padding: '16px 20px', 
                                background: 'var(--glass-border)', 
                                borderRadius: 18, 
                                color: 'var(--ink)', 
                                textDecoration: 'none', 
                                fontWeight: 600,
                                transition: 'transform 0.2s, background 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--glass-border)'}
                            >
                              <div style={{ color: '#E1306C' }}>{Vectors.Instagram}</div>
                              instagram.com/{identity.social.instagram.replace('@','')}
                            </a>
                          )}
                          
                          {/* PERSONAL WEBSITE */}
                          {identity.social?.website && (
                            <a 
                              href={identity.social.website.startsWith('http') ? identity.social.website : `https://${identity.social.website}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 14, 
                                padding: '16px 20px', 
                                background: 'var(--glass-border)', 
                                borderRadius: 18, 
                                color: 'var(--ink)', 
                                textDecoration: 'none', 
                                fontWeight: 600,
                                transition: 'transform 0.2s, background 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--glass-border)'}
                            >
                              <div style={{ color: 'var(--dim)' }}>{Vectors.Link}</div>
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
    </>
  );
}
