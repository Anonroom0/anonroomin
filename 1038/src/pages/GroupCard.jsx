/**
 * ============================================================================
 * GROUP INFO CARD (PORTAL + MATTE UI)
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - MATCHED PROFILE CARD: Applied exact hex colors (#1C1D24, #15161B, 
 *   #F4F3F0, #8B8B96, #FF6B35) and removed all var() dependencies.
 * - STRUCTURAL ALIGNMENT: Adopted the same master fixed wrapper with 
 *   split backdrop and sheet siblings to guarantee perfect bottom-snapping
 *   and avoid CSS flex traps.
 * - BORDERS & RADII: Matched the exact border radii (28px top) and subtle 
 *   rgba(255,255,255,0.06) border treatments.
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  ThreeDots: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
  Link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
// 4. UI SUB-COMPONENTS
// ============================================================================

function ReadOnlyGroupInput({ icon, label, value, isTextArea = false }) {
  if (!value) return null;

  return (
    <div 
      style={{
        position: 'relative', display: 'flex', alignItems: isTextArea ? 'flex-start' : 'center', gap: 12,
        backgroundColor: '#15161B', border: '1px solid rgba(255,255,255,0.06)', // Matched to Profile Card
        borderRadius: 16, padding: isTextArea ? '16px' : '8px 16px',
        marginTop: 12, opacity: 0.9, cursor: 'default'
      }}
    >
      <div style={{ color: '#8B8B96', paddingTop: isTextArea ? 2 : 0 }}>
        {icon}
      </div>
      
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
        
        <label 
          style={{
            position: 'absolute', top: 0, left: 0,
            transform: isTextArea ? 'translateY(-20px) scale(0.85)' : 'translateY(-24px) scale(0.85)',
            transformOrigin: 'left top', color: '#8B8B96', fontSize: 16, pointerEvents: 'none',
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (open && groupSlug) {
      setIsVisible(true);
      setLoading(true);
      setError('');
      setMenuOpen(false);
      
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
          setMenuOpen(false);
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
    setMenuOpen(false);
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
      
      {/* THE SHEET CONTAINER */}
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
        <div 
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
            padding: '16px 20px', backgroundColor: '#1C1D24', 
            borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 10 
          }}
        >
          <button 
            onClick={handleClose} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, border: 'none', 
              background: 'transparent', color: '#FF6B35', fontSize: 16, 
              fontWeight: 500, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, marginLeft: -8 
            }}
          >
            {Vectors.Close} 
            <span>Close</span>
          </button>
          
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F3F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            Group Info
          </h1>
          
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => { hapticTap(); playTap(); setMenuOpen(!menuOpen); }} 
              style={{ 
                border: 'none', background: 'transparent', color: '#F4F3F0', 
                cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', 
                justifyContent: 'center', borderRadius: '50%', marginRight: -8 
              }}
            >
              {Vectors.ThreeDots}
            </button>
            
            {menuOpen && (
              <div 
                className="pop-in" 
                style={{ 
                  position: 'absolute', right: 0, top: '100%', marginTop: 4, 
                  zIndex: 30, minWidth: 160, padding: 6,
                  backgroundColor: '#1C1D24',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}
              >
                <button 
                  onClick={handleCopyLink} 
                  style={{ 
                    width: '100%', padding: '10px 14px', border: 'none', 
                    background: 'transparent', color: '#F4F3F0', textAlign: 'left', 
                    borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, 
                    display: 'flex', alignItems: 'center', gap: 8 
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {Vectors.Link} Copy Link
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SCROLLABLE CONTENT BODY */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {loading ? (
              <MessageSkeleton variant="card" />
            ) : error ? (
              <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ color: '#8B8B96', opacity: 0.5, marginBottom: 8 }}>{Vectors.Info}</div>
                <p style={{ color: '#F4F3F0', fontSize: 20, fontWeight: 700, margin: 0 }}>Group Unavailable</p>
                <p style={{ color: '#8B8B96', fontSize: 15, margin: 0 }}>{error}</p>
              </div>
            ) : group ? (
              <>
                <LiquidAvatar 
                  identity={{ name: group.name, avatar_url: group.cover_url, is_admin: false }} 
                  size={140} 
                  kind="group" 
                />
                
                <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#F4F3F0', letterSpacing: '-0.5px' }}>
                    {group.name}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 15, color: '#8B8B96' }}>Public Channel</p>
                </div>

                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 8, color: '#F4F3F0', 
                  fontSize: 14, fontWeight: 600, marginBottom: 32, 
                  backgroundColor: '#15161B',
                  border: '1px solid rgba(255,255,255,0.06)', 
                  padding: '8px 16px', borderRadius: 20 
                }}>
                  {Vectors.Calendar} 
                  <span>Created {formatDate(group.created_at)}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>About</h3>
                    <ReadOnlyGroupInput icon={Vectors.Info} label="Description" value={group.description || 'Welcome to the group.'} isTextArea={true} />
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
