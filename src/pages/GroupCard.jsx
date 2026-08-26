/**
 * ============================================================================
 * GROUP INFO CARD (GLASS UI)
 * ============================================================================
 * This component renders a premium, frosted-glass bottom-sheet for viewing
 * public group details.
 * 
 * CHANGES IN THIS PASS:
 * - Restyled entirely to the new dark-glass aesthetic using token variables.
 * - Replaced local skeleton with the shared <MessageSkeleton variant="card"/>.
 * - Replaced local avatar with the shared <LiquidAvatar kind="group"/>.
 * - Modal backdrop and entrance/exit animations now use standard classes
 *   (.backdrop-fade, .sheet-enter, .sheet-exit) from animations.css.
 * - Added a 3-dot menu with a "Copy Link" action to share the group.
 * - Kept all read-only group-info display logic untouched.
 * 
 * Dependencies: React, Supabase, Subdomain Helpers, Shared Components
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { showToast, friendlyDbError } from '../lib/toast';
import { getGroupUrl } from '../lib/subdomain';

// Shared Components
import LiquidAvatar from '../components/shared/LiquidAvatar';
import MessageSkeleton from '../components/shared/MessageSkeleton';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ANIMATION_DURATION = 320; // Matches typical .sheet-exit timing

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

function ReadOnlyGroupInput({ icon, label, value, isTextArea = false }) {
  if (!value) return null;

  return (
    <div 
      style={{
        position: 'relative', display: 'flex', alignItems: isTextArea ? 'flex-start' : 'center', gap: 12,
        background: 'var(--ink-2)', border: '1px solid var(--glass-border)',
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
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--paper)', fontFamily: 'inherit', resize: 'none', paddingTop: 12, pointerEvents: 'none' }}
          />
        ) : (
          <input
            type="text" value={value} readOnly
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--paper)', padding: '12px 0 4px', pointerEvents: 'none' }}
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
    setMenuOpen(false);
    showToast('Group link copied to clipboard!', 'success');
  };

  if (!open && !isVisible && !group && !loading) return null;

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`backdrop-fade ${isVisible ? 'is-visible' : ''}`}
      style={{ 
        position: 'fixed', inset: 0, zIndex: 9000, 
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        className={`glass-sheet ${isVisible ? 'sheet-enter' : 'sheet-exit'}`}
        style={{ 
          width: '100%', maxWidth: 560, height: '85dvh', 
          display: 'flex', flexDirection: 'column', 
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0
        }}
      >
        {/* HEADER */}
        <div 
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
            padding: '16px 20px', background: 'var(--glass-white)', 
            backdropFilter: 'blur(20px) saturate(115%)', 
            WebkitBackdropFilter: 'blur(20px) saturate(115%)',
            borderBottom: '1px solid var(--glass-border)', zIndex: 10 
          }}
        >
          <button 
            onClick={handleClose} 
            className="chat-row"
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, border: 'none', 
              background: 'transparent', color: 'var(--ember)', fontSize: 16, 
              fontWeight: 500, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, marginLeft: -8 
            }}
          >
            {Vectors.Close} 
            <span>Close</span>
          </button>
          
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--paper)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            Group Info
          </h1>
          
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setMenuOpen(!menuOpen)} 
              className="chat-row" 
              style={{ 
                border: 'none', background: 'transparent', color: 'var(--paper)', 
                cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', 
                justifyContent: 'center', borderRadius: '50%', marginRight: -8 
              }}
            >
              {Vectors.ThreeDots}
            </button>
            
            {menuOpen && (
              <div 
                className="glass-panel pop-in" 
                style={{ 
                  position: 'absolute', right: 0, top: '100%', marginTop: 4, 
                  zIndex: 30, minWidth: 160, padding: 6 
                }}
              >
                <button 
                  onClick={handleCopyLink} 
                  className="chat-row" 
                  style={{ 
                    width: '100%', padding: '10px 14px', border: 'none', 
                    background: 'transparent', color: 'var(--paper)', textAlign: 'left', 
                    borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, 
                    display: 'flex', alignItems: 'center', gap: 8 
                  }}
                >
                  {Vectors.Link} Copy Link
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BODY */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {loading ? (
              <MessageSkeleton variant="card" />
            ) : error ? (
              <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <p style={{ color: 'var(--paper)', fontSize: 20, fontWeight: 700, margin: 0 }}>Group Unavailable</p>
                <p style={{ color: 'var(--dim)', fontSize: 15, margin: 0 }}>{error}</p>
              </div>
            ) : group ? (
              <>
                <LiquidAvatar 
                  identity={{ name: group.name, avatar_url: group.cover_url, is_admin: false }} 
                  size={140} 
                  kind="group" 
                />
                
                <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--paper)', letterSpacing: '-0.5px' }}>
                    {group.name}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--dim)' }}>Public Channel</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--paper)', fontSize: 14, fontWeight: 600, marginBottom: 32, background: 'var(--glass-white)', border: '1px solid var(--glass-border)', padding: '8px 16px', borderRadius: 20 }}>
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
  );
}
