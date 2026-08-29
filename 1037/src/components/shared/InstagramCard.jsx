/**
 * ============================================================================
 * INSTAGRAM CARD (SHARED SCRAPED-PROFILE ATTACHMENT)
 * ============================================================================
 * Single consolidated source for the Instagram profile-card attachment that
 * used to be duplicated near-identically in both GroupChat.jsx and
 * DirectMessages.jsx. Renders a scraped profile (avatar, username, verified
 * badge, full name, follower count) as a tappable link inside a message
 * bubble, powered by supabase/functions/instagram-scrape.
 *
 * Data shape is unchanged from both prior copies — it reads the same
 * message.instagram_* columns (instagram_username, instagram_pfp_url,
 * instagram_full_name, instagram_is_verified, instagram_followers), which
 * map directly onto the edge function's response fields (username,
 * pfp_url, full_name, is_verified, followers) at insert time. This pass is
 * restyle-only: fills now come from --glass-white / an --ember-tinted glass
 * fill instead of the old hardcoded rgba() values, matching the same
 * own/other convention used by MediaBubbles.jsx.
 *
 * Dependencies: React
 * ============================================================================
 */

import React from 'react';

// ============================================================================
// 1. INLINE SVG VECTOR (Instagram glyph fallback when no pfp is available)
// ============================================================================
const InstagramGlyph = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

// ============================================================================
// 2. UTILITY
// ============================================================================

/**
 * Compacts a raw follower/following count (e.g. 12345 -> "12.3K") the same
 * way both original callers formatted instagram_followers.
 */
function formatCount(n) {
  if (n === null || n === undefined) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ============================================================================
// 3. MAIN EXPORT
// ============================================================================

/**
 * InstagramCard
 * @param {object} message - the chat message row carrying instagram_* fields
 *   (instagram_username, instagram_pfp_url, instagram_full_name,
 *   instagram_is_verified, instagram_followers) as inserted from the
 *   instagram-scrape edge function's response.
 * @param {boolean} isOwn - true for the current user's own outgoing message;
 *   controls the ember-tinted vs. plain-glass restyle only.
 */
export default function InstagramCard({ message, isOwn }) {
  const followers = formatCount(message.instagram_followers);

  // Restyle only: own-message cards get an ember-tinted glass fill (the
  // one primary-action color per screen); everyone else's is plain glass.
  const cardFill = isOwn ? 'color-mix(in srgb, var(--ember) 18%, var(--glass-white))' : 'var(--glass-white)';
  const textColor = 'var(--paper)';
  const subtleTextColor = 'var(--dim)';

  return (
    <a
      href={`https://instagram.com/${message.instagram_username}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        minWidth: 220,
        textDecoration: 'none',
        background: cardFill,
        border: '1px solid var(--glass-border)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isOwn ? 'var(--ember)' : textColor,
        }}
      >
        {message.instagram_pfp_url ? (
          <img
            src={message.instagram_pfp_url}
            alt={message.instagram_username}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          InstagramGlyph
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: textColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            @{message.instagram_username}
          </span>
          {message.instagram_is_verified && (
            <span style={{ color: isOwn ? 'var(--ember)' : 'var(--signal)', fontSize: 13 }}>✓</span>
          )}
        </div>
        {message.instagram_full_name && (
          <div
            style={{
              fontSize: 12,
              color: subtleTextColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {message.instagram_full_name}
          </div>
        )}
        <div style={{ fontSize: 11, color: subtleTextColor, marginTop: 2 }}>
          {followers ? `${followers} followers` : 'View on Instagram'}
        </div>
      </div>
    </a>
  );
}