/** ===========================================================================
 * ATTACHMENT SHEET — shared bottom-sheet attachment picker
 * ============================================================================
 * Single consolidated source for the attachment picker sheet that used to be
 * duplicated in GroupChat.jsx (which had an extra Confession row) and
 * DirectMessages.jsx (which didn't). Built on GlassPanel's "sheet" variant
 * for the standard backdrop-fade + sheet-enter/sheet-exit + drag-to-dismiss
 * behavior every other modal in the app already gets.
 *
 * This file is a drop-in replacement: its exported prop shape is a strict
 * superset of what each caller currently passes, so GroupChat.jsx and
 * DirectMessages.jsx need no changes beyond already importing this module —
 * every prop they pass today (open, onClose, onOpenCamera, onPickInstagram,
 * and GroupChat's onPickConfession) is still accepted with identical
 * behavior. The two new capabilities added here are purely additive and
 * caller-optional:
 *
 * Rows always shown: Camera, Instagram.
 * Rows shown conditionally, based on which optional prop the caller passes:
 *   - onPickConfession -> "Confession" row (GroupChat passes this today;
 *     DirectMessages doesn't, so that row simply doesn't render there —
 *     exactly the current behavior of both files, unchanged)
 *   - onPickPhoto -> "Photo" row: a gallery-only picker, for the new
 *     "attach a photo to a confession" requirement. Its hidden
 *     <input type="file" accept="image/*"> deliberately has NO `capture`
 *     attribute, so mobile browsers open the photo library instead of
 *     jumping straight to the camera. Clicking the row programmatically
 *     clicks that input; onPickPhoto(file) fires once the user picks one.
 *     Neither existing caller passes this prop yet, so neither shows the
 *     row yet — wiring it up is a future, separate change to whichever
 *     caller needs it.
 *
 * Dependencies: React, GlassPanel
 * ============================================================================ */

import React, { useRef } from 'react';
import GlassPanel from './GlassPanel';
import { hapticTap } from '../../lib/haptics';
import { playTap } from '../../lib/soundManager';

// ============================================================================
// 1. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Camera: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Photo: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Ghost: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01" /><path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  ),
  Instagram: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
};

// ============================================================================
// 2. SHEET ROW
// ============================================================================
function AttachmentSheetItem({ icon, label, onClick }) {
  return (
    <button
      onClick={() => { hapticTap(); playTap(); onClick?.(); }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        flex: 1,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--glass-white)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--paper)',
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 12, color: 'var(--paper)', fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// ============================================================================
// 3. MAIN EXPORT
// ============================================================================

/**
 * AttachmentSheet
 * @param {boolean} open
 * @param {function} onClose
 * @param {function} onOpenCamera - always shown
 * @param {function} onPickInstagram - always shown
 * @param {function} [onPickConfession] - shown only if passed (GroupChat today)
 * @param {function} [onPickPhoto] - shown only if passed; called with the
 *   selected File once the user picks one from their photo library
 */
export default function AttachmentSheet({
  open,
  onClose,
  onOpenCamera,
  onPickInstagram,
  onPickConfession,
  onPickPhoto,
}) {
  const photoInputRef = useRef(null);

  if (!open) return null;

  function handlePickPhotoClick() {
    photoInputRef.current?.click();
  }

  function handlePhotoInputChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (file && onPickPhoto) onPickPhoto(file);
  }

  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, padding: '4px 0 12px' }}>
        <AttachmentSheetItem icon={Vectors.Camera} label="Camera" onClick={onOpenCamera} />

        {onPickPhoto && (
          <AttachmentSheetItem icon={Vectors.Photo} label="Photo" onClick={handlePickPhotoClick} />
        )}

        {onPickConfession && (
          <AttachmentSheetItem icon={Vectors.Ghost} label="Confession" onClick={onPickConfession} />
        )}

        <AttachmentSheetItem icon={Vectors.Instagram} label="Instagram" onClick={onPickInstagram} />
      </div>

      {/* Gallery-only picker: no `capture` attribute so mobile browsers open
          the photo library instead of the camera. Only mounted when a
          caller opts in via onPickPhoto — existing callers that don't pass
          it get no extra hidden input and no behavior change. */}
      {onPickPhoto && (
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoInputChange}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}
    </GlassPanel>
  );
}