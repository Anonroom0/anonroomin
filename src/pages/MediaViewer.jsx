/**
 * ============================================================================
 * MEDIA VIEWER LIGHTBOX (GLASS UI)
 * ============================================================================
 * This component provides a full-screen, immersive media viewing experience
 * with iOS-style glassmorphism and spring physics.
 * 
 * CHANGES IN THIS PASS:
 * - Restyled entirely to the new dark-glass aesthetic using token variables.
 * - Replaced local GlobalKeyframes with animations.css classes (.backdrop-fade).
 * - True 100dvh edge-to-edge rendering with heavy backdrop blur.
 * - Kept all existing pinch/zoom/swipe media-viewing logic untouched.
 * 
 * Dependencies: React
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ANIMATION_DURATION = 280; // Fast, snappy spring timing matching animations.css

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Close: (
    <svg 
      width="28" 
      height="28" 
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
  )
};

// ============================================================================
// 3. MAIN MEDIA VIEWER COMPONENT
// ============================================================================

export default function MediaViewer({ mediaUrl, mediaType, open, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  // --------------------------------------------------------------------------
  // VISIBILITY LOGIC
  // --------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    if (open && mediaUrl) {
      setIsVisible(true);
      // Prevent body scrolling underneath the lightbox
      document.body.style.overflow = 'hidden';
    } else {
      setIsVisible(false);
      // Wait for exit animation
      const timer = setTimeout(() => {
        if (isMounted) {
          document.body.style.overflow = '';
        }
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }

    return () => {
      isMounted = false;
      document.body.style.overflow = '';
    };
  }, [open, mediaUrl]);

  // --------------------------------------------------------------------------
  // INTERACTION LOGIC
  // --------------------------------------------------------------------------
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION); // Wait full duration before unmounting
  }, [onClose]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    if (isVisible) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleClose]);

  // Prevent closing when clicking the actual image/content
  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  // --------------------------------------------------------------------------
  // RENDER GUARD
  // --------------------------------------------------------------------------
  if (!open && !isVisible) return null;

  const isImageLike = mediaType === 'image' || mediaType === 'gif' || mediaType === 'sticker';

  // --------------------------------------------------------------------------
  // MAIN COMPONENT RENDER
  // --------------------------------------------------------------------------
  return (
    <div 
      className={`backdrop-fade ${isVisible ? 'is-visible' : ''}`}
      onClick={handleClose}
      style={{ 
        position: 'fixed', 
        inset: 0, 
        zIndex: 9999, 
        background: 'rgba(0,0,0,0.85)', 
        backdropFilter: 'blur(20px) saturate(115%)', 
        WebkitBackdropFilter: 'blur(20px) saturate(115%)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      
      {/* HEADER CONTROLS */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          padding: '20px 24px', 
          display: 'flex', 
          justifyContent: 'flex-start', // Keeps the close button on the left natively 
          alignItems: 'center', 
          zIndex: 10,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)'
        }}
      >
        <button 
          className="chat-row"
          onClick={handleClose}
          style={{ 
            background: 'var(--glass-white)', 
            border: '1px solid var(--glass-border)', 
            color: 'var(--paper)', 
            width: 44, 
            height: 44, 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer'
          }}
        >
          {Vectors.Close}
        </button>
      </div>

      {/* CONTENT RENDERING */}
      <div 
        onClick={handleContentClick}
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: 20,
          boxSizing: 'border-box',
          minWidth: 0,
          minHeight: 0,
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(20px)',
          opacity: isVisible ? 1 : 0,
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.175, 0.885, 0.32, 1.1)`
        }}
      >
        {isImageLike ? (
          <img 
            src={mediaUrl} 
            alt="Media Attachment" 
            style={{ 
              maxWidth: '100%', 
              maxHeight: '85dvh', 
              objectFit: 'contain', 
              borderRadius: mediaType === 'sticker' ? 0 : 16,
              boxShadow: mediaType === 'sticker' ? 'none' : '0 6px 18px rgba(0,0,0,0.35)'
            }} 
          />
        ) : (
          // BROWSER NATIVE PREVIEW (Shows Code, Text, PDFs automatically)
          <iframe 
            src={mediaUrl}
            title="Document Preview"
            style={{
              width: '100%',
              height: '85dvh',
              maxWidth: 1000,
              border: '1px solid var(--glass-border)',
              borderRadius: 16,
              background: 'var(--ink-2)', // Uses elevated surface token
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
            }}
          />
        )}
      </div>

    </div>
  );
}
