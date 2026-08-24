/**
 * ============================================================================
 * GROUP INFO CARD (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component renders a premium, frosted-glass bottom-sheet for viewing
 * public group details. It features buttery smooth slide-up animations 
 * matching the ProfileCard and EditProfile settings sheets.
 * 
 * Corrected Features Included Inline:
 * - Redesigned strictly as an iOS Bottom Sheet.
 * - Dynamic rendering of Group Cover Image or fallback Liquid Gradient.
 * - Displays Group Name, Description, and Creation Date.
 * - Apple Liquid UI: Backdrop blur, spring physics, dynamic safe areas.
 * - Fully unminified, enterprise-grade formatting.
 * 
 * Dependencies: React, Supabase
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
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
  Users: (
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Info: (
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
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
 * Extracts initials from a group name for the placeholder avatar.
 */
function getInitials(name) {
  if (!name) return '#';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Formats the creation date into a clean, readable string.
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString([], { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================

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

function GroupCardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', marginTop: 16 }}>
      <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ width: '50%', height: 32, borderRadius: 16, background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ width: '40%', height: 18, borderRadius: 8, background: 'var(--glass-border)', animation: 'pulse 1.5s infinite 0.2s' }} />
    </div>
  );
}

function LiquidGroupAvatar({ url, name, size = 140 }) {
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

  if (url) {
    return (
      <div style={containerStyle}>
        <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
  const colorIndex = (name || '').length % colors.length;

  return (
    <div style={{ ...containerStyle, background: colors[colorIndex], color: '#ffffff', fontWeight: 700, fontSize: size * 0.4 }}>
      {getInitials(name)}
    </div>
  );
}

function ReadOnlyGroupInput({ icon, label, value, isTextArea = false }) {
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
            setError(error.message);
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
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  if (!open && !isVisible && !group && !loading) return null;

  return (
    <>
      <GlobalKeyframes />
      <div 
        onClick={handleBackdropClick} 
        style={{ 
          position: 'fixed', inset: 0, zIndex: 9000, 
          background: 'rgba(0,0,0,0.5)', 
          backdropFilter: isVisible ? 'blur(16px)' : 'blur(0px)', 
          WebkitBackdropFilter: isVisible ? 'blur(16px)' : 'blur(0px)', 
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', 
          opacity: isVisible ? 1 : 0, 
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)` 
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            width: '100%', maxWidth: 560, height: '85vh', 
            background: 'var(--bg)', 
            borderTopLeftRadius: 32, borderTopRightRadius: 32, 
            boxShadow: '0 -24px 60px rgba(0,0,0,0.2)', 
            display: 'flex', flexDirection: 'column', 
            transform: isVisible ? 'translateY(0)' : 'translateY(100%)', 
            transition: `transform ${ANIMATION_DURATION}ms cubic-bezier(0.175, 0.885, 0.32, 1.05)`, 
            overflow: 'hidden' 
          }}
        >
          {/* HEADER */}
          <div 
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              padding: '16px 20px', background: 'var(--glass-strong)', 
              backdropFilter: 'blur(30px) saturate(200%)', 
              borderBottom: '1px solid var(--glass-border)', zIndex: 10 
            }}
          >
            <button 
              onClick={handleClose} 
              style={{ 
                display: 'flex', alignItems: 'center', gap: 6, border: 'none', 
                background: 'transparent', color: 'var(--blue)', fontSize: 16, 
                fontWeight: 500, cursor: 'pointer', padding: 0 
              }}
            >
              {Vectors.Close} 
              <span>Close</span>
            </button>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Group Info</h1>
            <div style={{ width: 60 }} />
          </div>

          {/* BODY */}
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 60px' }}>
            <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              
              {loading ? (
                <GroupCardSkeleton />
              ) : error ? (
                <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <p style={{ color: 'var(--ink)', fontSize: 20, fontWeight: 700, margin: 0 }}>Group Unavailable</p>
                  <p style={{ color: 'var(--dim)', fontSize: 15, margin: 0 }}>{error}</p>
                </div>
              ) : group ? (
                <>
                  <LiquidGroupAvatar url={group.cover_url} name={group.name} size={140} />
                  
                  <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
                      {group.name}
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--dim)' }}>Public Channel</p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dim)', fontSize: 14, fontWeight: 600, marginBottom: 32, background: 'var(--glass-border)', padding: '8px 16px', borderRadius: 20 }}>
                    {Vectors.Calendar} 
                    <span>Created {formatDate(group.created_at)}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
                    <div>
                      <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>About</h3>
                      <ReadOnlyGroupInput icon={Vectors.Info} label="Description" value={group.description || 'Welcome to the group.'} isTextArea={true} />
                    </div>
                  </div>
                </>
              ) : null}

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
