/**
 * ============================================================================
 * SEARCH USERS DIRECTORY (GLASS UI)
 * ============================================================================
 * This component powers the realtime user directory search. It has been
 * modified to act as a "dumb" list renderer that receives its search query 
 * directly from the master Home.jsx sidebar.
 * 
 * CHANGES IN THIS PASS:
 * - Restyled entirely to the new dark-glass aesthetic using token variables.
 * - Replaced local SearchSkeletonLoader with the shared <MessageSkeleton variant="search-row" />.
 * - Replaced local LiquidAvatar with the shared <LiquidAvatar />.
 * - Migrated animations to use the shared classes (.pop-in, .chat-row).
 * - Kept all existing search/debounce logic untouched.
 * 
 * Dependencies: React, Supabase, Shared Components
 * ============================================================================
 */

import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';

// Shared Components
import LiquidAvatar from '../components/LiquidAvatar';
import MessageSkeleton from '../components/MessageSkeleton';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ADMIN_DISPLAY_NAME = 'ADMIN';
const DEBOUNCE_MS = 300;

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Search: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
  )
};

// ============================================================================
// 3. UTILITY FUNCTIONS
// ============================================================================

/**
 * Enforces strict global admin overrides.
 * Returns a standardized identity object mapping so the UI never leaks
 * the real username or avatar of an admin.
 */
function resolveIdentity(user) {
  if (user?.is_admin) {
    return { 
      name: ADMIN_DISPLAY_NAME, 
      avatar_url: null, 
      is_admin: true 
    };
  }
  return { 
    name: user?.username || 'Unknown User', 
    avatar_url: user?.avatar_url || null, 
    is_admin: false 
  };
}

// ============================================================================
// 4. MAIN COMPONENT
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
    // Safely trim the term AND strip out any leading '@' symbol 
    // so users can search for "@username" seamlessly.
    const trimmed = externalTerm?.trim().replace(/^@/, '');

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
        // Execute fast, indexed ilike query on Supabase 'profiles' table.
        // Postgres ILIKE is case-insensitive, perfectly handling vansh vs VANSH.
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
          <div className="pop-in" style={{ marginBottom: 16, opacity: 0.8 }}>
            {Vectors.Search}
          </div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--paper)' }}>Global Search</p>
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
      {loading && <MessageSkeleton variant="search-row" count={6} />}

      {/* 
        ======================================================================
        STATE: NO RESULTS (Query complete, empty array returned)
        ======================================================================
      */}
      {externalTerm?.trim() && searched && !loading && results.length === 0 && (
        <div 
          className="pop-in"
          style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', 
            justifyContent: 'center', padding: '60px 20px', color: 'var(--dim)'
          }}
        >
          <div style={{ marginBottom: 16 }}>{Vectors.EmptyState}</div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--paper)' }}>No results found</p>
          <p style={{ margin: '6px 0 0 0', fontSize: 14, textAlign: 'center', opacity: 0.8, lineHeight: 1.4 }}>
            Nobody found matching<br/>"<span style={{ fontWeight: 700, color: 'var(--paper)' }}>{externalTerm.trim()}</span>".
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
                className="chat-row pop-in"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px',
                  border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
                  width: '100%', borderRadius: 16,
                  animationDelay
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-white)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {/* Avatar Column */}
                <LiquidAvatar identity={identity} kind="user" size={48} />
                
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
                        color: identity.is_admin ? '#FFD700' : 'var(--paper)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}
                    >
                      {identity.name}
                    </span>
                    {/* Inject Gold Shield Vector next to name if Admin */}
                    {identity.is_admin && (
                      <span style={{ color: '#FFD700', display: 'flex', alignItems: 'center' }}>
                        {Vectors.AdminShield}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--dim)', fontWeight: 500 }}>
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
