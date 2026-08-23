/**
 * ============================================================================
 * SEARCH USERS DIRECTORY (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component powers the realtime user directory search. It has been
 * strictly modified to act as a "dumb" list renderer that receives its
 * search query directly from the master Home.jsx sidebar, eliminating
 * the double search bar issue completely.
 * 
 * Corrected Features Included Inline:
 * - Removed internal input (Fixes double search bar overlap)
 * - Debounced Network Requests (300ms) with memory leak cleanup
 * - Shimmering Skeleton Matrix for loading states
 * - Apple Liquid Hover Physics on list items
 * - Strict Admin Override (Gold Badges, Hidden Names)
 * - Massive Inline Vector Library (Zero external loading flashes)
 * 
 * Dependencies: React, Supabase
 * ============================================================================
 */

import React, { useEffect, useState, useMemo } from 'react';
import supabase from '../lib/supabaseClient';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ADMIN_DISPLAY_NAME = 'ADMIN';
const DEBOUNCE_MS = 300;

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY (APPLE / TELEGRAM STYLE)
// ============================================================================
// We use inline SVGs to guarantee crisp vector rendering on all displays
// and to avoid external loading flashes or "worst animations".
const Vectors = {
  Search: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  User: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  AdminShield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  ChevronRight: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  EmptyState: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  Spinner: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner-animation">
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
// 3. UTILITY FUNCTIONS & STYLES
// ============================================================================

/**
 * Gets capitalized initials for avatar generation.
 * Handles single names, double names, and trailing spaces securely.
 */
function getInitials(username) {
  if (!username) return '?';
  const parts = username.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

/**
 * Enforces strict global admin overrides.
 * Returns a standardized identity object mapping so the UI never leaks
 * the real username or avatar of an admin.
 */
function resolveIdentity(user) {
  if (user?.is_admin) {
    return { 
      name: ADMIN_DISPLAY_NAME, 
      avatarUrl: null, 
      isAdmin: true 
    };
  }
  return { 
    name: user?.username || 'Unknown User', 
    avatarUrl: user?.avatar_url || null, 
    isAdmin: false 
  };
}

/**
 * Global Keyframes for List Physics and Skeletons
 * Rendered inline to guarantee availability without external CSS linking
 */
const GlobalKeyframes = () => (
  <style>{`
    @keyframes list-pop-in {
      0% { opacity: 0; transform: scale(0.96) translateY(10px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }
    .shimmer-box {
      animation: shimmer 2s infinite linear;
      background: linear-gradient(to right, rgba(0,0,0,0.04) 4%, rgba(0,0,0,0.08) 25%, rgba(0,0,0,0.04) 36%);
      background-size: 1000px 100%;
    }
    .dark .shimmer-box {
      background: linear-gradient(to right, rgba(255,255,255,0.04) 4%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.04) 36%);
      background-size: 1000px 100%;
    }
    .spinner-animation {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
    .search-row {
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .search-row:active {
      transform: scale(0.97);
    }
  `}</style>
);

// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================

/**
 * Highly detailed skeleton loader for Search results.
 * Staggers the opacity to create a depth-of-field loading effect.
 */
function SearchSkeletonLoader() {
  const skeletons = Array(6).fill(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '0 8px' }}>
      {skeletons.map((_, i) => (
        <div 
          key={i} 
          style={{ 
            display: 'flex', alignItems: 'center', gap: 14, 
            padding: '10px 8px', opacity: 1 - (i * 0.12) 
          }}
        >
          {/* Avatar Skeleton */}
          <div className="shimmer-box" style={{ width: 48, height: 48, borderRadius: '50%' }} />
          
          {/* Text Skeletons */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="shimmer-box" style={{ width: '45%', height: 14, borderRadius: 4 }} />
            <div className="shimmer-box" style={{ width: '25%', height: 12, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Avatar Renderer enforcing Admin rules and Apple gradients.
 * Generates identical deterministic colors based on the username hash.
 */
function LiquidAvatar({ identity, size = 48 }) {
  const containerStyle = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)',
  };

  // Admin Override
  if (identity.isAdmin) {
    return (
      <div style={{ 
        ...containerStyle, 
        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', 
        color: '#fff', fontSize: size * 0.35, fontWeight: 800, letterSpacing: 0.5 
      }}>
        ADM
      </div>
    );
  }

  // Image Override
  if (identity.avatarUrl) {
    return (
      <div style={containerStyle}>
        <img src={identity.avatarUrl} alt={identity.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  // Liquid Gradient Hash
  const colors = [
    'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
  ];
  const colorIndex = (identity.name || '').length % colors.length;

  return (
    <div style={{ 
      ...containerStyle, background: colors[colorIndex], 
      color: '#ffffff', fontWeight: 700, fontSize: size * 0.4 
    }}>
      {getInitials(identity.name)}
    </div>
  );
}

// ============================================================================
// 5. MAIN COMPONENT
// ============================================================================

/**
 * SearchUsers Component
 * @param {string} externalTerm - The search term strictly managed and passed down by Home.jsx
 * @param {function} onSelectUser - Callback fired with user ID to trigger Profile Card opening
 */
export default function SearchUsers({ externalTerm, onSelectUser }) {
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // --------------------------------------------------------------------------
  // NETWORK & DEBOUNCE LOGIC
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Safely trim the term passed down from Home.jsx
    const trimmed = externalTerm?.trim();

    // If the input is empty or null, reset the state completely
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    // Begin Loading State
    setLoading(true);
    setSearched(false);

    // Debounce the Supabase query to prevent rate limits and save network calls
    const timeoutId = setTimeout(async () => {
      try {
        // Execute fast, indexed ilike query on Supabase 'profiles' table
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_admin')
          .ilike('username', `%${trimmed}%`)
          .order('username')
          .limit(25); // Hard limit to keep rendering butter-smooth

        if (error) throw error;
        
        setResults(data || []);
      } catch (err) {
        console.warn('User search failed:', err.message);
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, DEBOUNCE_MS);

    // Memory cleanup function to clear timeout on unmount or keystroke
    return () => clearTimeout(timeoutId);
  }, [externalTerm]);

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <GlobalKeyframes />

      {/* 
        ======================================================================
        STATE: INITIAL / EMPTY (Awaiting Input)
        ======================================================================
      */}
      {!externalTerm?.trim() && (
        <div 
          style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', 
            justifyContent: 'center', padding: '60px 20px', color: 'var(--dim)' 
          }}
        >
          <div style={{ marginBottom: 16, opacity: 0.8, animation: 'list-pop-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            {Vectors.Search}
          </div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Global Search</p>
          <p style={{ margin: '6px 0 0 0', fontSize: 14, textAlign: 'center', opacity: 0.8, lineHeight: 1.4 }}>
            Find users by username to start<br/>a secure private chat.
          </p>
        </div>
      )}

      {/* 
        ======================================================================
        STATE: LOADING (Debouncing or Fetching)
        ======================================================================
      */}
      {loading && <SearchSkeletonLoader />}

      {/* 
        ======================================================================
        STATE: NO RESULTS (Query complete, empty array returned)
        ======================================================================
      */}
      {externalTerm?.trim() && searched && !loading && results.length === 0 && (
        <div 
          style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', 
            justifyContent: 'center', padding: '60px 20px', color: 'var(--dim)', 
            animation: 'list-pop-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' 
          }}
        >
          <div style={{ marginBottom: 16 }}>{Vectors.EmptyState}</div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>No results found</p>
          <p style={{ margin: '6px 0 0 0', fontSize: 14, textAlign: 'center', opacity: 0.8, lineHeight: 1.4 }}>
            Nobody found matching<br/>"<span style={{ fontWeight: 700 }}>{externalTerm.trim()}</span>".
          </p>
        </div>
      )}

      {/* 
        ======================================================================
        STATE: SUCCESS / LIST RENDERING
        ======================================================================
      */}
      {!loading && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px' }}>
          
          <div 
            style={{ 
              fontSize: 13, fontWeight: 700, textTransform: 'uppercase', 
              letterSpacing: 0.5, color: 'var(--dim)', padding: '8px 8px 12px' 
            }}
          >
            Search Results
          </div>
          
          {results.map((user, index) => {
            // Apply strict admin identity override
            const identity = resolveIdentity(user);
            
            // Staggered pop-in animation
            const animationDelay = `${index * 0.05}s`;

            return (
              <button
                key={user.id}
                onClick={() => onSelectUser(user.id)}
                className="search-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px',
                  border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
                  width: '100%', borderRadius: 16,
                  animation: 'list-pop-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both',
                  animationDelay
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {/* Avatar Column */}
                <LiquidAvatar identity={identity} />
                
                {/* User Info Column */}
                <div 
                  style={{ 
                    flex: 1, minWidth: 0, borderBottom: '1px solid var(--glass-border)', 
                    paddingBottom: 10, paddingTop: 2 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span 
                      style={{ 
                        fontSize: 16, fontWeight: 600, 
                        color: identity.isAdmin ? '#FF8C00' : 'var(--ink)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}
                    >
                      {identity.name}
                    </span>
                    {/* Inject Gold Shield Vector next to name if Admin */}
                    {identity.isAdmin && (
                      <span style={{ color: '#FF8C00', display: 'flex', alignItems: 'center' }}>
                        {Vectors.AdminShield}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500 }}>
                    Tap to view profile
                  </span>
                </div>
                
                {/* Navigation Chevron Column */}
                <div style={{ color: 'var(--dim)', paddingBottom: 8 }}>
                  {Vectors.ChevronRight}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
