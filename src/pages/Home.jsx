/**
 * ============================================================================
 * MASTER LAYOUT (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component handles the core desktop/mobile master-detail routing.
 *
 * CHANGES IN THIS PASS:
 * - Custom iOS-style Pull-to-Refresh: Spinner slides from behind the search header.
 * - Push Notification Prompt: Asks users for notification permissions on first load.
 * - Locked homescreen to be completely unscrollable/unzoomable (100dvh, overflow hidden).
 * - Full Sidebar Unread Mention Badges (`@`) for groups and DM rows.
 * - All code fully unrolled and un-compressed.
 *
 * Dependencies: React, Supabase, AuthContext
 * ============================================================================
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import {
  getGroupSlugFromHost,
  getRootDomainUrl,
  getGroupUrl,
  getDmUsernameFromPath,
  buildDmPath,
  ROOT_PATH,
} from '../lib/subdomain';

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
  ),
  Bell: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Refresh: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
};

// ============================================================================
// 3. UTILITY & PHYSICS FUNCTIONS
// ============================================================================

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

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

function displayIdentity(user) {
  if (user?.is_admin) {
    return { name: ADMIN_DISPLAY_NAME, avatarUrl: null, isAdmin: true };
  }
  return { 
    name: user?.username || 'Deleted User', 
    avatarUrl: user?.avatar_url || null, 
    isAdmin: false 
  };
}

/**
 * Custom React Hook for iOS-style Pull-to-Refresh Physics
 */
function usePullToRefresh(onRefresh, scrollRef) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(null);

  const handleTouchStart = (e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (startY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    // Apply friction to the pull down
    if (diff > 0 && scrollRef.current && scrollRef.current.scrollTop === 0) {
      const resistance = diff * 0.4; 
      setPullDistance(Math.min(resistance, 80)); // Cap the pull visual at 80px
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(50); // Hold spinner position while refreshing
      await onRefresh();
      setIsRefreshing(false);
    }
    setPullDistance(0); // Snap back
    startY.current = null;
  };

  return { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd };
}

// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================

function LiquidBackgroundEffects() {
  return (
    <div 
      aria-hidden="true" 
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none', background: 'var(--bg)' }}
    >
      <div 
        style={{
          position: 'absolute', top: '-15%', left: '-10%', width: '60vw', height: '60vw',
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,132,255,0.18), transparent 60%)',
          animation: 'floatApple 22s ease-in-out infinite', filter: 'blur(40px)'
        }} 
      />
      <div 
        style={{
          position: 'absolute', bottom: '-20%', right: '-10%', width: '70vw', height: '70vw',
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(94,92,230,0.15), transparent 60%)',
          animation: 'floatApple 28s ease-in-out infinite reverse', filter: 'blur(50px)'
        }} 
      />
      <style>{`
        @keyframes floatApple {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); }
          33% { transform: translate(4%, -6%) scale(1.05) rotate(4deg); }
          66% { transform: translate(-3%, 4%) scale(0.95) rotate(-3deg); }
          100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        }
        .chat-row { transition: background 0.15s ease-in-out, transform 0.1s ease-in-out; }
        .chat-row:active { transform: scale(0.98); }
        @keyframes spin-fast { 100% { transform: rotate(360deg); } }
        .refresh-spin { animation: spin-fast 0.8s linear infinite; }
        @keyframes slide-up-modal { 
          0% { transform: translateY(100%); opacity: 0; } 
          100% { transform: translateY(0); opacity: 1; } 
        }
      `}</style>
    </div>
  );
}

function ListSkeletonLoader() {
  const skeletons = Array(8).fill(0);
  return (
    <div style={{ padding: '0 8px', width: '100%', boxSizing: 'border-box' }}>
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
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.2; } }
      `}</style>
    </div>
  );
}

function LiquidAvatar({ identity, size = 48, isGroup = false }) {
  const containerStyle = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--glass-border)',
    userSelect: 'none'
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
  const [activeChatType, setActiveChatType] = useState(null); 
  const [activeChatSource, setActiveChatSource] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const showSearch = searchFocused || searchQuery.trim().length > 0;

  // Modals & Prompts
  const [authOpen, setAuthOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // Data Stores
  const [threads, setThreads] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const scrollRef = useRef(null);

  // --------------------------------------------------------------------------
  // UNIFIED DATA FETCHING WITH UNREAD MENTION BADGE CALCULATION
  // --------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    let isMounted = true;
    
    // Only show full skeleton load if it's the very first load (prevents flashing on pull-to-refresh)
    if (groups.length === 0 && threads.length === 0) {
      setLoadingList(true);
    }

    try {
      // 1. Fetch All Public Groups
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('id, slug, name, description, cover_url, created_at')
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;
      let finalGroups = groupsData || [];

      // 2. Fetch User DMs and Read Receipts for Unread Mentions
      let finalThreads = [];
      if (userId) {
        // Fetch Read Receipts for Groups
        const { data: groupReceipts } = await supabase
          .from('group_read_receipts')
          .select('group_id, last_read_at')
          .eq('user_id', userId);
        
        const groupReceiptsMap = Object.fromEntries((groupReceipts || []).map(r => [r.group_id, r.last_read_at]));

        // Check unread mentions for each group
        finalGroups = await Promise.all(finalGroups.map(async (g) => {
          const lastRead = groupReceiptsMap[g.id] || '1970-01-01T00:00:00.000Z';
          const { count } = await supabase
            .from('group_messages')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', g.id)
            .contains('mentioned_user_ids', [userId])
            .gt('created_at', lastRead);
            
          return { ...g, unread_mention: count && count > 0 };
        }));

        // Fetch DM Threads
        const { data: threadRows, error: threadsError } = await supabase
          .from('dm_threads')
          .select('id, user_a, user_b, created_at')
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .order('created_at', { ascending: false });

        if (threadsError) throw threadsError;

        // Fetch DM Read Receipts
        const { data: dmReceipts } = await supabase
          .from('dm_read_receipts')
          .select('thread_id, last_read_at')
          .eq('user_id', userId);
          
        const dmReceiptsMap = Object.fromEntries((dmReceipts || []).map(r => [r.thread_id, r.last_read_at]));

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
        
        finalThreads = await Promise.all((threadRows || []).map(async (t) => {
          const otherId = t.user_a === userId ? t.user_b : t.user_a;
          const lastRead = dmReceiptsMap[t.id] || '1970-01-01T00:00:00.000Z';
          
          const { count } = await supabase
            .from('dm_messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', t.id)
            .contains('mentioned_user_ids', [userId])
            .gt('created_at', lastRead);

          return {
            ...t,
            otherUser: profilesById[otherId] || { id: otherId, username: 'Unknown User' },
            unread_mention: count && count > 0
          };
        }));
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
  }, [userId, groups.length, threads.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Hook into our custom Pull-To-Refresh physics
  const { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchData, scrollRef);

  // --------------------------------------------------------------------------
  // FIRST-TIME PUSH NOTIFICATION PROMPT LOGIC
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (userId && 'Notification' in window) {
      const hasPrompted = localStorage.getItem('anonroom_push_prompted');
      if (!hasPrompted && Notification.permission === 'default') {
        // Delay prompt slightly to not overwhelm user on immediate login
        const timer = setTimeout(() => setShowPushPrompt(true), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [userId]);

  const handleEnablePush = async () => {
    localStorage.setItem('anonroom_push_prompted', 'true');
    setShowPushPrompt(false);
    
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        // NOTE: A real VAPID key is required for actual delivery, this sets up the DB subscription
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: 'BLANK_VAPID_KEY_PLACEHOLDER_REPLACE_LATER' 
        });
        const subJSON = sub.toJSON();
        
        await supabase.from('push_subscriptions').insert({
          user_id: userId,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth
        });
      }
    } catch (err) {
      console.warn("Push setup failed or user denied:", err);
    }
  };

  const handleDismissPush = () => {
    localStorage.setItem('anonroom_push_prompted', 'true');
    setShowPushPrompt(false);
  };

  // --------------------------------------------------------------------------
  // ROUTING & INVALID URL FALLBACKS
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function resolveInitialRoute() {
      const hostSlug = getGroupSlugFromHost();
      if (hostSlug) {
        if (!cancelled) {
          setActiveChatId(hostSlug);
          setActiveChatType('group');
          setActiveChatSource('subdomain');
        }
        return;
      }

      const dmUsername = getDmUsernameFromPath();
      if (dmUsername) {
        // STRICT LOWERCASE LOOKUP
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', dmUsername.toLowerCase())
          .maybeSingle();

        if (cancelled) return;
        
        if (!error && data) {
          setActiveChatId(data.id);
          setActiveChatType('dm');
          setActiveChatSource('path');
        } else {
          // SILENT INVALID URL FALLBACK: User does not exist, redirect strictly to Home with ZERO alerts.
          window.history.replaceState({}, '', ROOT_PATH);
          setActiveChatId(null);
          setActiveChatType(null);
          setActiveChatSource(null);
        }
      }
    }

    resolveInitialRoute();
    return () => { cancelled = true; };
  }, []);

  function handleOpenChat(id, type, username) {
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

  function handleOpenGroup(slug) {
    window.location.href = getGroupUrl(slug);
  }

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

  const profileIdentity = session 
    ? { name: profile?.username || 'You', avatarUrl: profile?.avatar_url || null, isAdmin: false } 
    : null;

  const isChatActive = activeChatId !== null;

  // --------------------------------------------------------------------------
  // MAIN RENDER (LOCKED VIEWPORT: HEIGHT 100VH, OVERFLOW HIDDEN)
  // --------------------------------------------------------------------------
  return (
    <div 
      className="app-viewport no-copy-text" 
      style={{ 
        display: 'flex', 
        width: '100vw', 
        height: '100dvh', // STRICT DYNAMIC HEIGHT
        maxHeight: '100dvh',
        overflow: 'hidden', // PREVENTS ENTIRE SCREEN FROM SCROLLING
        position: 'fixed',
        inset: 0,
        userSelect: 'none', 
        WebkitUserSelect: 'none',
        msUserSelect: 'none'
      }}
    >
      <LiquidBackgroundEffects />

      {/* 
        ======================================================================
        LEFT PANEL: TELEGRAM SIDEBAR
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
            height: '100dvh', 
            borderRight: '1px solid var(--glass-border)', 
            zIndex: 10, 
            borderRadius: 0,
            position: 'relative'
          }}
        >
          {/* HEADER (Z-INDEX 20 TO COVER PULL-TO-REFRESH SPINNER) */}
          <div 
            style={{ 
              padding: '14px 16px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              background: 'var(--glass-strong)', 
              borderBottom: '1px solid var(--glass-border)',
              zIndex: 20,
              position: 'relative'
            }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <span 
                style={{ 
                  position: 'absolute', 
                  left: 12, 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--dim)', 
                  pointerEvents: 'none' 
                }}
              >
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
                  width: '100%', 
                  border: 'none', 
                  background: 'var(--glass-border)', 
                  padding: '10px 36px 10px 42px', 
                  borderRadius: 14, 
                  fontSize: 16, 
                  color: 'var(--ink)', 
                  outline: 'none', 
                  transition: 'background 0.2s', 
                  boxSizing: 'border-box' 
                }} 
              />
              
              {/* CLEAR SEARCH BUTTON */}
              {searchQuery.length > 0 && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute', 
                    right: 10, 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    background: 'var(--glass)', 
                    border: 'none', 
                    color: 'var(--dim)',
                    borderRadius: '50%', 
                    width: 22, 
                    height: 22, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    cursor: 'pointer', 
                    fontSize: 11, 
                    fontWeight: 'bold'
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Profile Avatar Button moved to the right */}
            <button 
              onClick={() => session ? setEditProfileOpen(true) : setAuthOpen(true)} 
              style={{ 
                width: 44, 
                height: 44, 
                borderRadius: '50%', 
                border: 'none', 
                padding: 0, 
                cursor: 'pointer', 
                flexShrink: 0, 
                background: 'transparent', 
                transition: 'transform 0.2s' 
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {session ? (
                <LiquidAvatar identity={profileIdentity} size={44} />
              ) : (
                <div 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    background: 'var(--blue)', 
                    color: '#fff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    borderRadius: '50%' 
                  }}
                >
                  {Icons.Menu}
                </div>
              )}
            </button>
          </div>

          {/* HIDDEN PULL-TO-REFRESH SPINNER CONTAINER */}
          <div 
            style={{
              position: 'absolute',
              top: 72, // Just below the header
              left: 0,
              right: 0,
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
              transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`,
              opacity: pullDistance > 10 ? 1 : 0,
              transition: isRefreshing ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
              color: 'var(--blue)'
            }}
          >
            <div 
              className={isRefreshing ? "refresh-spin" : ""}
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
            >
              {Icons.Refresh}
            </div>
          </div>

          {/* SCROLLING LIST WITH TOUCH PHYSICS */}
          <div 
            ref={scrollRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="custom-scrollbar" 
            style={{ 
              flex: 1, 
              overflowY: 'auto', 
              paddingBottom: 24,
              zIndex: 10,
              background: 'transparent',
              transform: `translateY(${pullDistance}px)`,
              transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
            }}
          >
            {showSearch ? (
              <div className="pop-in">
                <SearchUsers 
                  externalTerm={searchQuery} 
                  onSelectUser={(id) => { 
                    setProfileCardUserId(id); 
                    setSearchQuery(''); 
                  }} 
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {loadingList && <ListSkeletonLoader />}

                {!loadingList && groups.length > 0 && (
                  <>
                    <div 
                      style={{ 
                        fontSize: 13, 
                        fontWeight: 700, 
                        textTransform: 'uppercase', 
                        letterSpacing: 0.5, 
                        color: 'var(--dim)', 
                        padding: '18px 16px 6px' 
                      }}
                    >
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
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 12, 
                            padding: '10px 16px', 
                            border: 'none', 
                            textAlign: 'left', 
                            cursor: 'pointer', 
                            width: '100%', 
                            background: isActive ? 'var(--blue)' : 'transparent', 
                            color: isActive ? '#fff' : 'var(--ink)' 
                          }}
                        >
                          <LiquidAvatar identity={identity} size={50} isGroup={true} />
                          
                          <div 
                            style={{ 
                              flex: 1, 
                              minWidth: 0, 
                              borderBottom: isActive ? 'none' : '1px solid var(--glass-border)', 
                              paddingBottom: 12, 
                              paddingTop: 2, 
                              display: 'flex', 
                              alignItems: 'center' 
                            }}
                          >
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <span 
                                style={{ 
                                  fontWeight: 600, 
                                  fontSize: 16, 
                                  display: 'block', 
                                  whiteSpace: 'nowrap', 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis' 
                                }}
                              >
                                {group.name}
                              </span>
                              <span 
                                style={{ 
                                  fontSize: 14, 
                                  color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--dim)', 
                                  display: 'block', 
                                  textOverflow: 'ellipsis', 
                                  overflow: 'hidden', 
                                  whiteSpace: 'nowrap' 
                                }}
                              >
                                {group.description || 'Public Channel'}
                              </span>
                            </div>
                            
                            {/* UNREAD MENTION BADGE UI FOR GROUPS */}
                            {group.unread_mention && (
                              <div 
                                style={{ 
                                  width: 22, 
                                  height: 22, 
                                  borderRadius: '50%', 
                                  background: 'var(--blue)', 
                                  color: '#fff', 
                                  fontSize: 12, 
                                  fontWeight: 700, 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  flexShrink: 0, 
                                  marginLeft: 8 
                                }}
                              >
                                @
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {!loadingList && userId && threads.length > 0 && (
                  <>
                    <div 
                      style={{ 
                        fontSize: 13, 
                        fontWeight: 700, 
                        textTransform: 'uppercase', 
                        letterSpacing: 0.5, 
                        color: 'var(--dim)', 
                        padding: '24px 16px 6px' 
                      }}
                    >
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
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 12, 
                            padding: '10px 16px', 
                            border: 'none', 
                            textAlign: 'left', 
                            cursor: 'pointer', 
                            width: '100%', 
                            background: isActive ? 'var(--blue)' : 'transparent', 
                            color: isActive ? '#fff' : 'var(--ink)' 
                          }}
                        >
                          <LiquidAvatar identity={identity} size={50} />
                          
                          <div 
                            style={{ 
                              flex: 1, 
                              minWidth: 0, 
                              borderBottom: isActive ? 'none' : '1px solid var(--glass-border)', 
                              paddingBottom: 12, 
                              paddingTop: 2 
                            }}
                          >
                            <div 
                              style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                marginBottom: 4 
                              }}
                            >
                              <span 
                                style={{ 
                                  fontWeight: 600, 
                                  fontSize: 16, 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 4, 
                                  whiteSpace: 'nowrap', 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis' 
                                }}
                              >
                                {identity.name}
                                {identity.isAdmin && <span style={{ color: isActive ? '#fff' : '#FF8C00' }}>{Icons.AdminShield}</span>}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingLeft: 8 }}>
                                
                                {/* UNREAD MENTION BADGE UI FOR DMS */}
                                {thread.unread_mention && (
                                  <div 
                                    style={{ 
                                      width: 18, 
                                      height: 18, 
                                      borderRadius: '50%', 
                                      background: 'var(--blue)', 
                                      color: '#fff', 
                                      fontSize: 11, 
                                      fontWeight: 700, 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center' 
                                    }}
                                  >
                                    @
                                  </div>
                                )}
                                <span style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--dim)' }}>
                                  {formatTelegramTime(thread.created_at)}
                                </span>
                              </div>
                            </div>
                            <span 
                              style={{ 
                                fontSize: 14, 
                                color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--dim)', 
                                display: 'block', 
                                textOverflow: 'ellipsis', 
                                overflow: 'hidden', 
                                whiteSpace: 'nowrap' 
                              }}
                            >
                              Tap to view messages
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {!loadingList && !userId && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--dim)' }}>
                    <p style={{ fontSize: 15, marginBottom: 16, fontWeight: 500 }}>
                      Sign in to view your private chats.
                    </p>
                    <button 
                      onClick={() => setAuthOpen(true)} 
                      style={{ 
                        background: 'var(--blue)', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '12px 24px', 
                        borderRadius: 20, 
                        fontWeight: 700, 
                        fontSize: 15, 
                        cursor: 'pointer', 
                        boxShadow: '0 8px 24px rgba(10,132,255,0.3)' 
                      }}
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
            height: '100dvh', 
            borderRadius: 0, 
            zIndex: 1, 
            boxShadow: '-4px 0 24px rgba(0,0,0,0.03)' 
          }}
        >
          {activeChatId ? (
            activeChatType === 'dm' ? (
              <DirectMessages 
                openThreadWithUserId={activeChatId} 
                onBack={closeActiveChat}
                onThreadReady={(identity) => {
                  if (identity?.username) {
                    window.history.replaceState({}, '', buildDmPath(identity.username.toLowerCase()));
                  }
                }}
              />
            ) : (
              <GroupChat 
                groupSlug={activeChatId} 
                onBack={closeActiveChat}
                onGroupResolved={(resolvedGroup) => {
                  if (!resolvedGroup && activeChatSource === 'path') {
                    closeActiveChat();
                  }
                }}
              />
            )
          ) : (
            <div 
              style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: 'var(--dim)', 
                userSelect: 'none' 
              }}
            >
              <div style={{ marginBottom: 20, animation: 'pop-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                {Icons.EmptyChat}
              </div>
              <p 
                style={{ 
                  fontSize: 15, 
                  fontWeight: 600, 
                  background: 'var(--glass-border)', 
                  padding: '8px 20px', 
                  borderRadius: 24 
                }}
              >
                Select a chat to start messaging
              </p>
            </div>
          )}
        </div>
      )}

      {/* PUSH NOTIFICATION PROMPT MODAL */}
      {showPushPrompt && (
        <div 
          style={{ 
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            backdropFilter: 'blur(10px)', animation: 'pop-in 0.3s ease-out'
          }}
        >
          <div 
            style={{ 
              width: '100%', maxWidth: 400, background: 'var(--glass-strong)', 
              borderRadius: '24px 24px 0 0', padding: '32px 24px 40px',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.2)', textAlign: 'center',
              animation: 'slide-up-modal 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05)'
            }}
          >
            <div style={{ color: 'var(--blue)', marginBottom: 16 }}>{Icons.Bell}</div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 22, fontWeight: 800 }}>Enable Notifications</h2>
            <p style={{ margin: '0 0 24px 0', color: 'var(--dim)', fontSize: 15, lineHeight: 1.4 }}>
              Get instantly notified when someone mentions you or sends a private message.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button 
                onClick={handleEnablePush}
                style={{ background: 'var(--blue)', color: '#fff', border: 'none', padding: '14px', borderRadius: 16, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
              >
                Turn On Notifications
              </button>
              <button 
                onClick={handleDismissPush}
                style={{ background: 'transparent', color: 'var(--dim)', border: 'none', padding: '14px', borderRadius: 16, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

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
