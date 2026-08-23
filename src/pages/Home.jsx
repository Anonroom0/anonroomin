/**
 * ============================================================================
 * MASTER LAYOUT (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component handles the core desktop/mobile master-detail routing.
 * It features a unified sidebar (Groups and Chats in one list), Apple-style
 * background blurs, and strict Telegram split-pane routing.
 *
 * CHANGES IN THIS PASS — real, working URL routing, and groups finally
 * render the same way DMs do:
 *
 * - DMs (desktop AND mobile) now sync the URL to /<username> via
 *   history.pushState — no reload, same origin, same as today's in-place
 *   open, just with a real address bar to match. Opening a DM from a place
 *   that doesn't have the username handy yet (e.g. a ProfileCard "Message"
 *   tap) still opens immediately; DirectMessages reports the resolved
 *   username back up once it loads the thread, and the URL is patched in
 *   with replaceState at that point.
 *
 * - Groups on DESKTOP still do a real navigation to slug.anonroom.in (same
 *   as before — that's the whole point of giving each group its own
 *   subdomain). What was broken: landing on that subdomain rendered a bare
 *   page with nothing open. Now, on mount, we check the hostname — if it's
 *   a group subdomain, we open that group the same way a DM opens: full
 *   sidebar on the left, group chat on the right. Same shell, just chosen
 *   by hostname instead of a sidebar click.
 *
 * - Groups on MOBILE no longer navigate away at all. They open in place
 *   (exactly like they already did) and now also sync the URL to
 *   /g/<slug> via history.pushState, the same same-origin pattern as the
 *   DM route — just with a /g/ prefix so a group slug can never collide
 *   with a username.
 *
 * - Browser back/forward (popstate) is handled too, so the back button
 *   does the right thing instead of just changing the address bar underneath
 *   a stale screen.
 *
 * Dependencies: React, Supabase, AuthContext
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import {
  getGroupSlugFromHost,
  getRootDomainUrl,
  getGroupUrl,
  getDmUsernameFromPath,
  buildDmPath,
  getMobileGroupSlugFromPath,
  buildMobileGroupPath,
  ROOT_PATH,
} from '../lib/subdomain';

// Import our newly upgraded Apple-Liquid Modals & Views
import AuthModal from './AuthModal';
import SearchUsers from './SearchUsers';
import ProfileCard from './ProfileCard';
import DirectMessages from './DirectMessages';
import GroupChat from './GroupChat'; 
import EditProfile from './EditProfile';

import '../styles/tokens.css';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ADMIN_DISPLAY_NAME = 'ADMIN';
const MOBILE_BREAKPOINT_PX = 768;

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY (APPLE / TELEGRAM STYLE)
// ============================================================================
const Icons = {
  Menu: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  EmptyChat: (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  AdminShield: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
};

// ============================================================================
// 3. UTILITY & FORMATTING FUNCTIONS
// ============================================================================

/**
 * Gets capitalized initials for avatar generation.
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Formats timestamps into Telegram-style relative time.
 */
function formatTelegramTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

/**
 * Global Admin Override for UI mapping.
 */
function displayIdentity(user) {
  if (user?.is_admin) {
    return { name: ADMIN_DISPLAY_NAME, avatarUrl: null, isAdmin: true };
  }
  return { name: user?.username || 'Deleted User', avatarUrl: user?.avatar_url || null, isAdmin: false };
}

// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================

/**
 * Background effects rendering soft glowing orbs matching Apple UI.
 */
function LiquidBackgroundEffects() {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none', background: 'var(--bg)' }}>
      <div style={{
        position: 'absolute', top: '-15%', left: '-10%', width: '60vw', height: '60vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,132,255,0.18), transparent 60%)',
        animation: 'floatApple 22s ease-in-out infinite', filter: 'blur(40px)'
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%', width: '70vw', height: '70vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(94,92,230,0.15), transparent 60%)',
        animation: 'floatApple 28s ease-in-out infinite reverse', filter: 'blur(50px)'
      }} />
      <style>{`
        @keyframes floatApple {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); }
          33% { transform: translate(4%, -6%) scale(1.05) rotate(4deg); }
          66% { transform: translate(-3%, 4%) scale(0.95) rotate(-3deg); }
          100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        }
        .chat-row {
          transition: background 0.15s ease-in-out, transform 0.1s ease-in-out;
        }
        .chat-row:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

/**
 * Highly detailed skeleton loader for Telegram list rendering
 */
function ListSkeletonLoader() {
  const skeletons = Array(8).fill(0);
  return (
    <div style={{ padding: '0 8px' }}>
      {skeletons.map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', opacity: 1 - (i * 0.1) }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--glass-border)', animation: 'pulse 1.5s infinite ease-in-out' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: '40%', height: 14, borderRadius: 4, background: 'var(--glass-border)', animation: 'pulse 1.5s infinite ease-in-out' }} />
            <div style={{ width: '70%', height: 12, borderRadius: 4, background: 'var(--glass-border)', animation: 'pulse 1.5s infinite ease-in-out 0.2s' }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

/**
 * Apple-style Avatar renderer handling Images, Initials, and Admin Gold variants
 */
function LiquidAvatar({ identity, size = 48, isGroup = false }) {
  const containerStyle = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--glass-border)'
  };

  if (identity.isAdmin && !isGroup) {
    return (
      <div style={{ ...containerStyle, background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: '#fff', fontSize: size * 0.3, fontWeight: 800 }}>
        ADM
      </div>
    );
  }

  if (identity.avatarUrl) {
    return (
      <div style={containerStyle}>
        <img src={identity.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  const colors = ['#ff5e62', '#4facfe', '#43e97b', '#fa709a', '#a18cd1'];
  const colorIndex = (identity.name || '').length % colors.length;

  return (
    <div style={{ ...containerStyle, background: colors[colorIndex], color: '#ffffff', fontWeight: 700, fontSize: size * 0.4 }}>
      {isGroup ? '#' : getInitials(identity.name)}
    </div>
  );
}

// ============================================================================
// 5. MAIN HOME COMPONENT (MASTER/DETAIL)
// ============================================================================

export default function Home() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  
  // --------------------------------------------------------------------------
  // WINDOW RESIZE / LAYOUT HOOK
  // --------------------------------------------------------------------------
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < MOBILE_BREAKPOINT_PX;

  // --------------------------------------------------------------------------
  // APPLICATION STATE
  // --------------------------------------------------------------------------
  const [activeChatId, setActiveChatId] = useState(null); 
  const [activeChatType, setActiveChatType] = useState(null); // 'dm' | 'group'
  // How the currently-open chat got opened — decides what the back button
  // should do. 'subdomain': this whole page IS a group's subdomain, so
  // "back" means leaving to the root domain. 'path': opened in place via a
  // same-origin pushState (sidebar click, or a /<username> or /g/<slug>
  // deep link on the root domain), so "back" just clears state + pops the
  // URL, no reload.
  const [activeChatSource, setActiveChatSource] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const showSearch = searchFocused || searchQuery.trim().length > 0;

  // Modals
  const [authOpen, setAuthOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState(null);

  // Data Stores
  const [threads, setThreads] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // --------------------------------------------------------------------------
  // UNIFIED DATA FETCHING (GROUPS & DMS)
  // --------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    let isMounted = true;
    setLoadingList(true);

    try {
      // 1. Fetch All Public Groups
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('id, slug, name, description, cover_url, created_at')
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;
      let finalGroups = groupsData || [];

      // 2. Fetch User DMs (If logged in)
      let finalThreads = [];
      if (userId) {
        const { data: threadRows, error: threadsError } = await supabase
          .from('dm_threads')
          .select('id, user_a, user_b, created_at')
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .order('created_at', { ascending: false });

        if (threadsError) throw threadsError;

        // Resolve profiles for other users in the DMs
        const otherIds = (threadRows || []).map((t) => (t.user_a === userId ? t.user_b : t.user_a));
        let profilesById = {};
        
        if (otherIds.length > 0) {
          const { data: profileRows, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, is_admin')
            .in('id', otherIds);
            
          if (profilesError) throw profilesError;
          profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
        }
        
        finalThreads = (threadRows || []).map((t) => {
          const otherId = t.user_a === userId ? t.user_b : t.user_a;
          return {
            ...t,
            otherUser: profilesById[otherId] || { id: otherId, username: 'Unknown User' }
          };
        });
      }

      if (isMounted) {
        setGroups(finalGroups);
        setThreads(finalThreads);
      }
    } catch (err) {
      console.error("Data fetching error:", err.message);
    } finally {
      if (isMounted) setLoadingList(false);
    }
    
    return () => { isMounted = false; };
  }, [userId]);

  // Initial Fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------------------------------
  // ROUTING: resolve whatever the URL says on first load, and keep it in
  // sync with the browser's back/forward buttons.
  // --------------------------------------------------------------------------

  // First load: figure out what should be open purely from the current
  // hostname + path, the same three routes handleOpenChat/handleOpenGroup
  // produce below. This is what makes a group's subdomain (or a shared
  // /<username> or /g/<slug> link) land on the right screen instead of a
  // bare "select a chat" shell.
  useEffect(() => {
    let cancelled = false;

    async function resolveInitialRoute() {
      // 1. We're ON a group's own subdomain (slug.anonroom.in) — open it
      //    the same way a DM opens: sidebar on the left, chat on the right.
      const hostSlug = getGroupSlugFromHost();
      if (hostSlug) {
        if (!cancelled) {
          setActiveChatId(hostSlug);
          setActiveChatType('group');
          setActiveChatSource('subdomain');
        }
        return;
      }

      // 2. Root domain, /g/<slug> — the mobile "open group in place" route.
      const pathGroupSlug = getMobileGroupSlugFromPath();
      if (pathGroupSlug) {
        if (!cancelled) {
          setActiveChatId(pathGroupSlug);
          setActiveChatType('group');
          setActiveChatSource('path');
        }
        return;
      }

      // 3. Root domain, /<username> — the DM route. Needs a lookup since
      //    the URL only has the username, not the id DirectMessages wants.
      const dmUsername = getDmUsernameFromPath();
      if (dmUsername) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', dmUsername)
          .maybeSingle();

        if (cancelled) {
          return;
        }
        if (!error && data) {
          setActiveChatId(data.id);
          setActiveChatType('dm');
          setActiveChatSource('path');
        } else {
          // Unknown username — don't leave a broken-looking URL up.
          window.history.replaceState({}, '', ROOT_PATH);
        }
      }
    }

    resolveInitialRoute();
    return () => { cancelled = true; };
    // Intentionally only on mount — this resolves whatever URL the page
    // was loaded with; everything after that goes through
    // handleOpenChat/handleOpenGroup/closeActiveChat instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward: re-derive state from wherever the URL landed.
  useEffect(() => {
    function handlePopState() {
      // A group subdomain never changes without a real navigation/reload,
      // so there's nothing to resync here in that case.
      if (getGroupSlugFromHost()) {
        return;
      }

      const pathGroupSlug = getMobileGroupSlugFromPath();
      if (pathGroupSlug) {
        setActiveChatId(pathGroupSlug);
        setActiveChatType('group');
        setActiveChatSource('path');
        return;
      }

      const dmUsername = getDmUsernameFromPath();
      if (dmUsername) {
        supabase
          .from('profiles')
          .select('id, username')
          .eq('username', dmUsername)
          .maybeSingle()
          .then(({ data, error }) => {
            if (!error && data) {
              setActiveChatId(data.id);
              setActiveChatType('dm');
              setActiveChatSource('path');
            }
          });
        return;
      }

      setActiveChatId(null);
      setActiveChatType(null);
      setActiveChatSource(null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --------------------------------------------------------------------------
  // ROUTING & INTERACTION LOGIC
  // --------------------------------------------------------------------------

  // Opens a DM and syncs the URL to /<username>, same-origin, no reload.
  // `username` is optional — when the caller only has a user id (e.g. a
  // ProfileCard "Message" tap), the URL gets patched in afterwards by
  // DirectMessages' onThreadReady once it resolves the other user's
  // profile, instead of blocking the chat from opening.
  function handleOpenChat(id, type, username) {
    // DMs require a signed-in user (they're threads keyed off userId).
    // Route logged-out taps to sign-in instead of opening a broken thread.
    if (type === 'dm' && !userId) {
      setAuthOpen(true);
      return;
    }
    setActiveChatId(id);
    setActiveChatType(type);
    setActiveChatSource('path');
    setSearchQuery('');

    if (type === 'dm') {
      window.history.pushState({}, '', username ? buildDmPath(username) : ROOT_PATH);
    }
  }

  // Groups live on their own subdomain (slug.anonroom.in). The two
  // viewports behave differently on purpose:
  //
  // - Desktop: a real browser navigation to slug.anonroom.in, same
  //   destination as typing that subdomain in by hand. Once that page
  //   loads, the routing effect above detects the subdomain and opens the
  //   group in the right-hand pane next to the full sidebar — same shell
  //   as a DM, not a separate bare page.
  // - Mobile: no navigation at all. It opens in place, exactly like a DM
  //   opens — local state swaps in <GroupChat> as its own full-screen
  //   page with a back button, and the URL syncs to /g/<slug> the same
  //   same-origin way /<username> does for DMs.
  function handleOpenGroup(slug) {
    if (isMobile) {
      setActiveChatId(slug);
      setActiveChatType('group');
      setActiveChatSource('path');
      setSearchQuery('');
      window.history.pushState({}, '', buildMobileGroupPath(slug));
      return;
    }
    window.location.href = getGroupUrl(slug);
  }

  // Single exit path for both DM and group back buttons. A group opened
  // via its own subdomain has nowhere same-origin to "go back" to, so
  // that case does a real navigation to the root domain; every other case
  // is a same-origin pop back to '/'.
  function closeActiveChat() {
    if (activeChatType === 'group' && activeChatSource === 'subdomain') {
      window.location.href = getRootDomainUrl();
      return;
    }
    setActiveChatId(null);
    setActiveChatType(null);
    setActiveChatSource(null);
    window.history.pushState({}, '', ROOT_PATH);
  }

  // Resolves the logged-in user's identity for the top-left Avatar
  const profileIdentity = session 
    ? { name: profile?.username || 'You', avatarUrl: profile?.avatar_url || null, isAdmin: false } 
    : null;

  // Layout check for mobile
  const isChatActive = activeChatId !== null;

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------
  return (
    <div className="app-viewport" style={{ display: 'flex', width: '100vw', position: 'relative' }}>
      <LiquidBackgroundEffects />

      {/* 
        ======================================================================
        LEFT PANEL: TELEGRAM SIDEBAR
        On mobile this pane IS the page when no chat is open — it isn't
        squeezed side-by-side with the chat pane, it's simply the only
        thing mounted. On desktop it holds a strict 25% (2.5 / 10) share
        of the width, with the chat pane taking the remaining 75%.
        ======================================================================
      */}
      {(!isMobile || !isChatActive) && (
      <div 
        className="glass-panel"
        style={{ 
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? '100%' : '25%', 
          minWidth: isMobile ? '100%' : 280, 
          height: '100%', 
          borderRight: '1px solid var(--glass-border)', 
          zIndex: 10,
          borderRadius: 0 // Snaps to edges of the window
        }}
      >
        
        {/* SIDEBAR HEADER */}
        <div 
          style={{ 
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, 
            background: 'var(--glass-strong)', 
            borderBottom: '1px solid var(--glass-border)' 
          }}
        >
          {/* Main User Avatar Button (Opens Profile/Settings) */}
          <button 
            onClick={() => session ? setEditProfileOpen(true) : setAuthOpen(true)} 
            style={{ 
              width: 44, height: 44, borderRadius: '50%', border: 'none', padding: 0, 
              cursor: 'pointer', flexShrink: 0, background: 'transparent',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {session ? (
              <LiquidAvatar identity={profileIdentity} size={44} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                {Icons.Menu}
              </div>
            )}
          </button>

          {/* Unified Global Search Bar */}
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', pointerEvents: 'none' }}>
              {Icons.Search}
            </span>
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              onFocus={() => setSearchFocused(true)} 
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)} 
              placeholder="Search..." 
              style={{ 
                width: '100%', border: 'none', background: 'var(--glass-border)', 
                padding: '10px 14px 10px 42px', borderRadius: 14, fontSize: 16, 
                color: 'var(--ink)', outline: 'none', transition: 'background 0.2s',
                boxSizing: 'border-box'
              }} 
            />
          </div>
        </div>

        {/* SIDEBAR SCROLLING LIST */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
          
          {showSearch ? (
            /* Render Search Module if user is typing */
            <div className="pop-in">
              <SearchUsers externalTerm={searchQuery} onSelectUser={(id) => { setProfileCardUserId(id); setSearchQuery(''); }} />
            </div>
          ) : (
            /* Render Standard Unified List */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              
              {loadingList && <ListSkeletonLoader />}

              {/* 
                1. GROUPS SECTION 
              */}
              {!loadingList && groups.length > 0 && (
                <>
                  <div style={{ 
                    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', 
                    letterSpacing: 0.5, color: 'var(--dim)', padding: '18px 16px 6px' 
                  }}>
                    Groups
                  </div>
                  
                  {groups.map((group) => {
                    const isActive = activeChatId === group.slug && activeChatType === 'group';
                    const identity = { name: group.name, avatarUrl: group.cover_url, isAdmin: false };
                    
                    return (
                      <button 
                        key={group.id} 
                        className="chat-row"
                        onClick={() => handleOpenGroup(group.slug)} 
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', 
                          border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%', 
                          background: isActive ? 'var(--blue)' : 'transparent', 
                          color: isActive ? '#fff' : 'var(--ink)'
                        }}
                      >
                        <LiquidAvatar identity={identity} size={50} isGroup={true} />
                        <div style={{ flex: 1, minWidth: 0, borderBottom: isActive ? 'none' : '1px solid var(--glass-border)', paddingBottom: 12, paddingTop: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 16, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {group.name}
                          </span>
                          <span style={{ fontSize: 14, color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--dim)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {group.description || 'Public Channel'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {/* 
                2. CHATS SECTION 
              */}
              {!loadingList && userId && threads.length > 0 && (
                <>
                  <div style={{ 
                    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', 
                    letterSpacing: 0.5, color: 'var(--dim)', padding: '24px 16px 6px' 
                  }}>
                    Chats
                  </div>
                  
                  {threads.map((thread) => {
                    const otherId = thread.user_a === userId ? thread.user_b : thread.user_a;
                    const isActive = activeChatId === otherId && activeChatType === 'dm';
                    const identity = displayIdentity(thread.otherUser); 
                    
                    return (
                      <button 
                        key={thread.id} 
                        className="chat-row"
                        onClick={() => handleOpenChat(otherId, 'dm', thread.otherUser?.username)} 
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', 
                          border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%', 
                          background: isActive ? 'var(--blue)' : 'transparent', 
                          color: isActive ? '#fff' : 'var(--ink)'
                        }}
                      >
                        <LiquidAvatar identity={identity} size={50} />
                        <div style={{ flex: 1, minWidth: 0, borderBottom: isActive ? 'none' : '1px solid var(--glass-border)', paddingBottom: 12, paddingTop: 2 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {identity.name}
                              {identity.isAdmin && <span style={{ color: isActive ? '#fff' : '#FF8C00' }}>{Icons.AdminShield}</span>}
                            </span>
                            <span style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--dim)', flexShrink: 0, paddingLeft: 8 }}>
                              {formatTelegramTime(thread.created_at)}
                            </span>
                          </div>
                          <span style={{ fontSize: 14, color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--dim)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            Tap to view messages
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Login Call to Action if logged out */}
              {!loadingList && !userId && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--dim)' }}>
                  <p style={{ fontSize: 15, marginBottom: 16, fontWeight: 500 }}>Sign in to view your private chats.</p>
                  <button 
                    onClick={() => setAuthOpen(true)} 
                    style={{ background: 'var(--blue)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 20, fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 24px rgba(10,132,255,0.3)' }}
                  >
                    Sign In
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 
        ======================================================================
        RIGHT PANEL: TELEGRAM MASTER CHAT VIEW
        On mobile this only mounts once a chat is actually open, so it opens
        as its own dedicated page (with a slide-in transition) instead of
        cramming in next to the sidebar. On desktop it holds the remaining
        75% (7.5 / 10) of the width. This is now the ONLY place group chats
        render, too — whether they got here via a sidebar click, a mobile
        /g/<slug> deep link, or by loading directly on a group's own
        subdomain.
        ======================================================================
      */}
      {(!isMobile || isChatActive) && (
      <div 
        className={isMobile ? 'mobile-chat-page glass-strong' : 'glass-strong'}
        style={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column', 
          position: 'relative', 
          width: isMobile ? '100%' : undefined,
          borderRadius: 0, zIndex: 1, boxShadow: '-4px 0 24px rgba(0,0,0,0.03)' 
        }}
      >
        {activeChatId ? (
          activeChatType === 'dm' ? (
            <DirectMessages 
              openThreadWithUserId={activeChatId} 
              onBack={closeActiveChat}
              onThreadReady={(identity) => {
                // Fills in / corrects the URL once the actual username is
                // known — covers opens that started with only a user id
                // (e.g. a ProfileCard "Message" tap). replaceState so this
                // doesn't add a second history entry on top of the one
                // handleOpenChat may have already pushed.
                if (identity?.username) {
                  window.history.replaceState({}, '', buildDmPath(identity.username));
                }
              }}
            />
          ) : (
            <GroupChat 
              groupSlug={activeChatId} 
              onBack={closeActiveChat}
              onGroupResolved={(resolvedGroup) => {
                // A /g/<slug> deep link (or a stale sidebar entry) that
                // doesn't match a real group — bounce back to the list
                // instead of leaving a broken route sitting in the address
                // bar. Only applies to the same-origin path route; a bad
                // subdomain is left alone since there's no same-origin
                // "back" to fall to.
                if (!resolvedGroup && activeChatSource === 'path') {
                  closeActiveChat();
                }
              }}
            />
          )
        ) : (
          /* Telegram "No Chat Selected" Empty State */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', userSelect: 'none' }}>
            <div style={{ marginBottom: 20, animation: 'pop-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
              {Icons.EmptyChat}
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, background: 'var(--glass-border)', padding: '8px 20px', borderRadius: 24 }}>
              Select a chat to start messaging
            </p>
          </div>
        )}
      </div>
      )}

      {/* 
        ======================================================================
        GLOBAL MODALS
        ======================================================================
      */}
      <AuthModal 
        open={authOpen} 
        onClose={() => setAuthOpen(false)} 
        initialTab="signin" 
        onVerified={() => setAuthOpen(false)} 
      />
      <EditProfile 
        open={editProfileOpen} 
        onClose={() => setEditProfileOpen(false)} 
      />
      <ProfileCard 
        userId={profileCardUserId} 
        open={profileCardUserId !== null} 
        onClose={() => setProfileCardUserId(null)} 
        onMessage={(id) => { 
          setProfileCardUserId(null); 
          handleOpenChat(id, 'dm');
        }} 
      />
    </div>
  );
}
