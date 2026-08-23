/**
 * ============================================================================
 * MEDIA VIEWER & GALLERY (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component renders an immersive, full-screen gallery overlay for
 * viewing images and downloading documents. It utilizes iOS-style heavy
 * background blurs and fluid zooming/panning physics.
 * 
 * Features Included Inline:
 * - Immersive Blur Backdrop with scroll-locking
 * - Telegram-style Zoom physics (Click to zoom, Drag to pan)
 * - Beautiful Document/File cards for non-image media
 * - Inline Vector Library (Zero external assets)
 * - Hardware Escape key binding
 * - Liquid Enter/Exit Animations
 * 
 * Dependencies: React
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// 1. MASSIVE INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Close: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Download: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  File: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  ZoomIn: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  ZoomOut: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
};

// ============================================================================
// 2. UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts a readable filename from a raw Supabase Storage URL.
 * Safely handles malformed URLs and strips out the prepended timestamp.
 */
function filenameFromUrl(url) {
  try {
    if (!url) return 'Unknown File';
    const path = new URL(url).pathname;
    const decoded = decodeURIComponent(path.split('/').pop() || 'file');
    // Strip out the timestamp (e.g., "1700000000-filename.pdf" -> "filename.pdf")
    return decoded.replace(/^\d+-/, '');
  } catch {
    return 'Secure Document';
  }
}

/**
 * Global Keyframes for Liquid Physics
 * Rendered inline to guarantee availability without external CSS linking
 */
const GlobalKeyframes = () => (
  <style>{`
    @keyframes viewer-fade-in {
      0% { opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
      100% { opacity: 1; backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
    }
    @keyframes media-pop-in {
      0% { opacity: 0; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }
    .media-viewer-backdrop {
      animation: viewer-fade-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .media-element {
      animation: media-pop-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05) both;
    }
  `}</style>
);

// ============================================================================
// 3. MAIN MEDIA VIEWER COMPONENT
// ============================================================================

export default function MediaViewer({ mediaUrl, mediaType, open, onClose }) {
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  const [zoomed, setZoomed] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  // Panning/Dragging Physics State
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartInfo = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // --------------------------------------------------------------------------
  // LIFECYCLES & HARDWARE INTEGRATION
  // --------------------------------------------------------------------------

  // Reset all physical states when new media is opened
  useEffect(() => {
    if (open) {
      setZoomed(false);
      setIsClosing(false);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
      
      // Lock background scrolling on native OS
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Hardware Escape Key Binding
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // --------------------------------------------------------------------------
  // INTERACTION HANDLERS (ZOOM & PAN PHYSICS)
  // --------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    setIsClosing(true);
    // Wait for the CSS opacity transition before fully unmounting
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300); 
  }, [onClose]);

  const toggleZoom = useCallback((e) => {
    e.stopPropagation();
    setZoomed((prev) => {
      const nextZoom = !prev;
      // Reset pan position when zooming out
      if (!nextZoom) setPosition({ x: 0, y: 0 });
      return nextZoom;
    });
  }, []);

  // Pointer Events for Drag-to-Pan
  const handlePointerDown = useCallback((e) => {
    if (!zoomed) return;
    setIsDragging(true);
    dragStartInfo.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
  }, [zoomed, position]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !zoomed) return;
    
    const dx = e.clientX - dragStartInfo.current.x;
    const dy = e.clientY - dragStartInfo.current.y;
    
    // Apply 1:1 panning mapping
    setPosition({
      x: dragStartInfo.current.posX + dx,
      y: dragStartInfo.current.posY + dy
    });
  }, [isDragging, zoomed]);

  const handlePointerUp = useCallback(() => {
    if (isDragging) setIsDragging(false);
  }, [isDragging]);

  // Global mouse up to catch drags outside the image bounds
  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerUp]);

  // --------------------------------------------------------------------------
  // RENDER GUARD
  // --------------------------------------------------------------------------
  if (!open && !isClosing) return null;

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------
  return (
    <>
      <GlobalKeyframes />
      <div
        className={isClosing ? '' : 'media-viewer-backdrop'}
        // Clicking the backdrop closes the viewer
        onClick={handleClose}
        onPointerMove={handlePointerMove}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.85)', // Deep Telegram Dim
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
          opacity: isClosing ? 0 : 1,
          transition: 'opacity 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          userSelect: 'none',
          touchAction: 'none' // Prevent native mobile behaviors while panning
        }}
      >
        {/* 
          ======================================================================
          FLOATING TOOLBAR
          ======================================================================
        */}
        <div style={{
          position: 'absolute', top: 24, right: 24,
          display: 'flex', gap: 16, zIndex: 10
        }}>
          {mediaType === 'image' && (
            <a
              href={mediaUrl}
              download
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Download Full Resolution"
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', cursor: 'pointer', transition: 'background 0.2s', textDecoration: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
              {Vectors.Download}
            </a>
          )}
          <button
            onClick={handleClose}
            aria-label="Close Viewer"
            title="Close (Esc)"
            style={{
              width: 48, height: 48, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', cursor: 'pointer', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          >
            {Vectors.Close}
          </button>
        </div>

        {/* 
          ======================================================================
          MEDIA PAYLOAD RENDERING
          ======================================================================
        */}
        {mediaType === 'image' ? (
          
          /* IMAGE RENDERER */
          <div 
            className="media-element"
            style={{ 
              position: 'relative', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', width: '100%', height: '100%' 
            }}
          >
            <img
              src={mediaUrl}
              alt="Fullscreen Viewer"
              draggable={false} // Disable native ghost-image dragging
              onPointerDown={handlePointerDown}
              onClick={toggleZoom}
              style={{
                maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
                borderRadius: 12, 
                cursor: zoomed ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                // Apply scaling and translation physics
                transform: `scale(${zoomed ? 2 : 1}) translate(${zoomed ? position.x / 2 : 0}px, ${zoomed ? position.y / 2 : 0}px)`,
                // Disable smooth transition while dragging to ensure 1:1 mouse tracking
                transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
              }}
            />
            
            {/* Contextual Zoom Tooltip overlay */}
            <div style={{
              position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: 20,
              color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 500, pointerEvents: 'none',
              opacity: isDragging ? 0 : 1, transition: 'opacity 0.2s', backdropFilter: 'blur(8px)'
            }}>
              {zoomed ? Vectors.ZoomOut : Vectors.ZoomIn} 
              {zoomed ? 'Click to zoom out • Drag to pan' : 'Click to zoom'}
            </div>
          </div>

        ) : (
          
          /* APPLE/TELEGRAM DOCUMENT CARD RENDERER */
          <div
            onClick={(e) => e.stopPropagation()}
            className="media-element"
            style={{
              width: 360, maxWidth: '90%', padding: 32,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(30px) saturate(200%)',
              borderRadius: 32, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 24, textAlign: 'center',
              boxShadow: '0 24px 60px rgba(0,0,0,0.2)'
            }}
          >
            <div
              style={{
                width: 96, height: 96, borderRadius: 28, background: 'rgba(10,132,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue, #007aff)'
              }}
            >
              {Vectors.File}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink, #000)', wordBreak: 'break-all', lineHeight: 1.3 }}>
                {filenameFromUrl(mediaUrl)}
              </p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--dim, #8e8e93)', fontWeight: 500 }}>
                Encrypted File Payload
              </p>
            </div>
            
            <a
              href={mediaUrl}
              download
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 20, background: 'var(--blue, #007aff)',
                color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 8px 24px rgba(10,132,255,0.3)',
                transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(10,132,255,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(10,132,255,0.3)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.98)';
              }}
            >
              {Vectors.Download} Download File
            </a>
          </div>
        )}
      </div>
    </>
  );
}
