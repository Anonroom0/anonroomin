import { useState } from 'react';

function filenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').pop() || 'file');
  } catch {
    return 'file';
  }
}

export default function MediaViewer({ mediaUrl, mediaType, open, onClose }) {
  const [zoomed, setZoomed] = useState(false);

  if (!open) return null;

  function handleBackdropClick() {
    onClose();
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'pop-in 200ms ease both',
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 20, right: 20, width: 36, height: 36, borderRadius: '50%',
          border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16,
          cursor: 'pointer', zIndex: 1,
        }}
      >
        ✕
      </button>

      {mediaType === 'image' ? (
        <img
          src={mediaUrl}
          alt=""
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          style={{
            maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
            borderRadius: 12, cursor: zoomed ? 'zoom-out' : 'zoom-in',
            transform: zoomed ? 'scale(2)' : 'scale(1)',
            transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="glass-strong pop-in"
          style={{
            width: 320, maxWidth: '100%', padding: 28, display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: 14, background: 'var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
            }}
          >
            📄
          </div>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>
            {filenameFromUrl(mediaUrl)}
          </p>
          <a
            href={mediaUrl}
            download
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '10px 20px', borderRadius: 12, background: 'var(--blue)',
              color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none',
            }}
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}
