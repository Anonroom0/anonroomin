/**
 * ============================================================================
 * MEDIA VIEWER LIGHTBOX (APPLE LIQUID UI)
 * ============================================================================
 * This component provides a full-screen, immersive media viewing experience
 * with iOS-style glassmorphism and spring physics.
 * 
 * CHANGES IN THIS PASS:
 * - Removed all download buttons/anchors as requested.
 * - Universal Object Preview: Uses a secure iframe to natively display code
 *   files, text documents, and PDFs directly in the browser.
 * - True 100dvh edge-to-edge rendering with heavy backdrop blur.
 * - Fully unminified, single-file delivery with no cut-offs.
 * 
 * Dependencies: React
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ANIMATION_DURATION = 300; // Fast, snappy spring timing

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
// 3. UI SUB-COMPONENTS
// ============================================================================

const GlobalKeyframes = () => (
  <style>{`
    @keyframes lightbox-fade-in {
      0% { opacity: 0; backdrop-filter: blur(0px); }
      100% { opacity: 1; backdrop-filter: blur(24px); }
    }
    @keyframes lightbox-scale-up {
      0% { opacity: 0; transform: scale(0.9) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
  `}</style>
);

// ============================================================================
// 4. MAIN MEDIA VIEWER COMPONENT
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
    }, ANIMATION_DURATION - 50);
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
    <>
      <GlobalKeyframes />
      <div 
        onClick={handleClose}
        style={{ 
          position: 'fixed', 
          inset: 0, 
          zIndex: 9999, 
          background: 'rgba(0,0,0,0.85)', 
          backdropFilter: isVisible ? 'blur(24px)' : 'blur(0px)', 
          WebkitBackdropFilter: isVisible ? 'blur(24px)' : 'blur(0px)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          opacity: isVisible ? 1 : 0, 
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
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
            onClick={handleClose}
            style={{ 
              background: 'rgba(255,255,255,0.15)', 
              backdropFilter: 'blur(10px)', 
              border: 'none', 
              color: '#fff', 
              width: 44, 
              height: 44, 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              transition: 'background 0.2s, transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
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
            transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(20px)',
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
                boxShadow: mediaType === 'sticker' ? 'none' : '0 24px 60px rgba(0,0,0,0.4)'
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
                border: 'none',
                borderRadius: 16,
                background: '#ffffff', // Provides a clean background for transparent PDFs or text files
                boxShadow: '0 24px 60px rgba(0,0,0,0.4)'
              }}
            />
          )}
        </div>

      </div>
    </>
  );
}
