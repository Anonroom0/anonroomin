/**
 * ============================================================================
 * BBSSM CROSS-PROMO BANNER
 * ============================================================================
 * Small glass card advertising the BBSSM group chat, shown on the
 * fully-anonymous standalone pages (QuestionThread's /q/<id>, ConfessToGroup's
 * /confess/<slug>) where a visitor has zero other context on the app. Tapping
 * it routes in-app via navigateInApp — NOT a plain <a href>, which would
 * force a full document navigation (a jarring reload on web, and on native
 * risks the WebView loading the real internet host instead of staying in
 * the bundled app — see main.jsx's anchor-intercept comment for the same
 * concern).
 *
 * Dependencies: React, src/lib/subdomain.js
 * ============================================================================
 */

import React from 'react';
import { buildGroupPath, navigateInApp } from '../../lib/subdomain';

const BBSSM_SLUG = 'bbssm';
const BBSSM_AVATAR_URL = 'https://akvvctjxodexaiwciwsd.supabase.co/storage/v1/object/public/media/2d745df8-d287-448d-aab3-74672e404238/dm-1787867170783-20919.jpg';

export default function BbssmBanner({ style }) {
  return (
    <button
      type="button"
      onClick={() => navigateInApp(buildGroupPath(BBSSM_SLUG))}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        margin: '0 16px 8px',
        padding: '12px 14px',
        borderRadius: 18,
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(115%)',
        WebkitBackdropFilter: 'blur(20px) saturate(115%)',
        gap: 12,
        boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
        flexShrink: 0,
        cursor: 'pointer',
        textAlign: 'left',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <img
        src={BBSSM_AVATAR_URL}
        alt="BBSSM DP"
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '2px solid var(--glass-border)',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ color: 'var(--paper)', fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>
          BBSSM
        </span>
        <span style={{ color: 'var(--dim)', fontSize: 13, fontWeight: 500, lineHeight: 1.1 }}>
          Join the official group chat ✨
        </span>
      </div>
      <div
        style={{
          background: 'var(--ember)',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          boxShadow: '0 2px 8px rgba(47,111,255,0.4)',
          flexShrink: 0,
        }}
      >
        Join
      </div>
    </button>
  );
}
