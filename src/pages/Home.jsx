/**
 * ============================================================================
 * MASTER LAYOUT (PROFESSIONAL MATTE UI)
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - COMPLETE RENDER REMAP: App viewport and Modals are now separated at the 
 *   React Root level using a Fragment (<>...</>). Modals are no longer trapped 
 *   inside Flexbox, fixing all PC/Mobile side-edge rendering glitches.
 * - Single "Ask Question" button implemented with premium Group Chat style layout.
 * - Solid Matte colors enforced globally. 
 * - Z-indexes completely re-tiered to guarantee perfect layering.
 * 
 * Dependencies: React, Supabase, AuthContext, Shared Components
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
  buildQuestionPath,
  buildStoryPath,
  getStoryTargetFromPath,
  ROOT_PATH,
  isShortId
} from '../lib/subdomain';
import { subscribeToPush } from '../lib/pushNotifications';
import { playTabSwitch, playRefreshComplete } from '../lib/soundManager';
import { hapticTap, hapticSuccess } from '../lib/haptics';
import { useViewportHeight } from '../lib/useViewportHeight';

import AuthModal from './AuthModal';
import SearchUsers from './SearchUsers';
import ProfileCard from './ProfileCard';
import DirectMessages from './DirectMessages';
import GroupChat from './GroupChat';
import EditProfile from './EditProfile';

// Shared Components
import LiquidAvatar from '../components/shared/LiquidAvatar';
import MessageSkeleton from '../components/shared/MessageSkeleton';
import StoriesBar from '../components/stories/StoriesBar';
import StoryViewer from '../components/stories/StoryViewer';
import CreateQuestionModal from '../components/questions/CreateQuestionModal';
import CreateConfessionModal from '../components/questions/CreateConfessionModal';
import QuestionCard from '../components/questions/QuestionCard';
import QuestionThread from './QuestionThread';
import ShareStorySheet from '../components/questions/ShareStorySheet';
import '../styles/tokens.css';
import '../styles/animations.css';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const ADMIN_DISPLAY_NAME = 'ADMIN';
const MOBILE_BREAKPOINT_PX = 768;

// ============================================================================
// 2. INLINE SVG ICONS
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
    return { name: ADMIN_DISPLAY_NAME, avatar_url: user?.avatar_url || null, is_admin: true };
  }
  return { 
    name: user?.username || 'Deleted User', 
    avatar_url: user?.avatar_url || null, 
    is_admin: false 
  };
}

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
    if (diff > 0 && scrollRef.current && scrollRef.current.scrollTop === 0) {
      const resistance = diff * 0.4; 
      setPullDistance(Math.min(resistance, 80)); 
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(50);
      await onRefresh();
      playRefreshComplete();
      hapticSuccess();
      setIsRefreshing(false);
    }
    setPullDistance(0); 
    startY.current = null;
  };

  return { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd };
}

// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================
function DarkGlassBackground() {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none', background: 'var(--ink)' }}>
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, var(--ink-2), transparent 60%)', animation: 'floatOrb 22s ease-in-out infinite', filter: 'blur(40px)' }} />
      <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '70vw', height: '70vw', borderRadius: '50%', background: 'radial-gradient(circle, var(--ink-2), transparent 60%)', animation: 'floatOrb 28s ease-in-out infinite reverse', filter: 'blur(50px)' }} />
      <style>{`
        * { -webkit-tap-highlight-color: transparent !important; }
        .touch-bounce { transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.15s ease-in-out; cursor: pointer; touch-action: manipulation; }
        .touch-bounce:active { transform: scale(0.95); opacity: 0.85; }

        /* Professional Matte Chat Row Shape */
        .chat-row { 
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          margin: 6px 12px 10px 12px;
          width: calc(100% - 24px);
          box-sizing: border-box;
          background: #1C1D24; /* Solid Matte */
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px; 
          color: var(--paper);
          text-align: left;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); 
          touch-action: manipulation;
          cursor: pointer;
          overflow: visible;
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        
        .chat-row:active { 
          transform: scale(0.96) translateY(2px);
          background: #252630;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .chat-row.active-chat {
          background: #2A2B36;
          border-color: rgba(255,255,255,0.18);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
          transform: translateY(-1px);
        }

        .chat-row::before {
          content: '';
          position: absolute;
          left: -1px;
          top: 50%;
          transform: translateY(-50%) translateX(-8px);
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-left: 8px solid var(--ember);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          z-index: 2;
        }

        .chat-row:hover::before, .chat-row.active-chat::before {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }
        
        .chat-row-content { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }

        @keyframes tab-slide-in { 0% { opacity: 0; transform: translateX(20px); } 100% { opacity: 1; transform: translateX(0); } }
        .tab-animated { animation: tab-slide-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.05) forwards; }
        @keyframes pop-fade { 0% { opacity: 0; transform: scale(0.96) translateY(12px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .stagger-item { opacity: 0; animation: pop-fade 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05) forwards; }
        .custom-scrollbar { overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch; }
        @keyframes floatOrb { 0% { transform: translate(0, 0) scale(1); } 33% { transform: translate(4%, -6%) scale(1.05); } 66% { transform: translate(-3%, 4%) scale(0.95); } 100% { transform: translate(0, 0) scale(1); } }
        @keyframes spin-fast { 100% { transform: rotate(360deg); } }
        .refresh-spin { animation: spin-fast 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

// ============================================================================
// 5. MAIN HOME COMPONENT (MASTER/DETAIL)
// ============================================================================
export default function Home() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < MOBILE_BREAKPOINT_PX;

  // Real visible height (shrinks live as the on-screen keyboard opens) —
  // see useViewportHeight.js. Applied once here, at the RIGHT PANEL wrapper
  // that every chat surface (DMs, group chat, question thread) renders
  // inside of, rather than each of those pages independently deriving it —
  // a single source of truth avoids a two-stage "jump" where the panel's
  // static 100dvh height and a nested page's own JS-driven height could
  // each resize a frame apart. QuestionThread/GroupChat/DirectMessages all
  // just fill this wrapper via height:'100%'.
  //
  // `offsetTop` is the other half of the fix: on browsers that pan the
  // visual viewport down (instead of just shrinking it) when the keyboard
  // opens, the `.app-viewport` root below — which is `position: fixed`,
  // anchored to the layout viewport — visually slides up out of the
  // visible area by that same amount, leaving a gap of dead space above
  // the keyboard. Compensating with a translateY on that root keeps it
  // pinned to whatever's actually visible. See useViewportHeight.js.
  const { height: viewportHeight, offsetTop: viewportOffsetTop } = useViewportHeight();
  const rightPanelHeight = viewportHeight ? `${viewportHeight}px` : '100dvh';

  const [activeChatId, setActiveChatId] = useState(null); 
  const [activeChatType, setActiveChatType] = useState(null); 
  const [activeChatSource, setActiveChatSource] = useState(null);
  
  const [activeTab, setActiveTab] = useState('chats'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const showSearch = searchFocused || searchQuery.trim().length > 0;

  const [authOpen, setAuthOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  
  // Updated `viewingStory` state to accept an `initialItemId`
  const [viewingStory, setViewingStory] = useState(null);
  
  const [initialStoryTarget, setInitialStoryTarget] = useState(null);
  
  const [createQuestionOpen, setCreateQuestionOpen] = useState(false);
  const [createQuestionType, setCreateQuestionType] = useState('general'); // Default fallback
const [sharingQuestion, setSharingQuestion] = useState(null);
const [sharingReply, setSharingReply] = useState(null); // NEW — { question, reply }
  const [createConfessionOpen, setCreateConfessionOpen] = useState(false);

  const [threads, setThreads] = useState([]);
  const [groups, setGroups] = useState([]);
  const [myQuestions, setMyQuestions] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const scrollRef = useRef(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    if (isInitialLoad) setLoadingList(true);

    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups').select('id, slug, name, description, cover_url, created_at').order('created_at', { ascending: false });
      if (groupsError) throw groupsError;
      let finalGroups = groupsData || [];
      let finalThreads = [];
      let finalQuestions = [];
      
      if (userId) {
        const { data: groupReceipts } = await supabase.from('group_read_receipts').select('group_id, last_read_at').eq('user_id', userId);
        const groupReceiptsMap = Object.fromEntries((groupReceipts || []).map(r => [r.group_id, r.last_read_at]));

        finalGroups = await Promise.all(finalGroups.map(async (g) => {
          const lastRead = groupReceiptsMap[g.id] || '1970-01-01T00:00:00.000Z';
          const { count } = await supabase.from('group_messages').select('*', { count: 'exact', head: true }).eq('group_id', g.id).contains('mentioned_user_ids', [userId]).gt('created_at', lastRead);
          return { ...g, unread_mention: count > 0 };
        }));

        const { data: threadRows, error: threadsError } = await supabase.from('dm_threads').select('id, user_a, user_b, created_at').or(`user_a.eq.${userId},user_b.eq.${userId}`).order('created_at', { ascending: false });
        if (threadsError) throw threadsError;

        const { data: dmReceipts } = await supabase.from('dm_read_receipts').select('thread_id, last_read_at').eq('user_id', userId);
        const dmReceiptsMap = Object.fromEntries((dmReceipts || []).map(r => [r.thread_id, r.last_read_at]));

        const otherIds = (threadRows || []).map((t) => (t.user_a === userId ? t.user_b : t.user_a));
        let profilesById = {};
        
        if (otherIds.length > 0) {
          const { data: profileRows, error: profilesError } = await supabase.from('profiles').select('id, username, avatar_url, is_admin').in('id', otherIds);
          if (profilesError) throw profilesError;
          profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
        }
        
        finalThreads = await Promise.all((threadRows || []).map(async (t) => {
          const otherId = t.user_a === userId ? t.user_b : t.user_a;
          const lastRead = dmReceiptsMap[t.id] || '1970-01-01T00:00:00.000Z';
          const { count } = await supabase.from('dm_messages').select('*', { count: 'exact', head: true }).eq('thread_id', t.id).contains('mentioned_user_ids', [userId]).gt('created_at', lastRead);
          return { ...t, otherUser: profilesById[otherId] || { id: otherId, username: 'Unknown User' }, unread_mention: count > 0 };
        }));

        const { data: questionsData, error: questionsError } = await supabase.from('questions').select('*').eq('author_id', userId).order('created_at', { ascending: false });
        if (!questionsError && questionsData) finalQuestions = questionsData;
      }

      if (isMounted) {
        setGroups(finalGroups);
        setThreads(finalThreads);
        setMyQuestions(finalQuestions);
      }
    } catch (err) { console.error("Data fetch error:", err.message); } 
    finally { if (isMounted) { setLoadingList(false); setIsInitialLoad(false); } }
  }, [userId, isInitialLoad]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchData, scrollRef);

  useEffect(() => {
    if (userId && 'Notification' in window) {
      const hasPrompted = localStorage.getItem('anonroom_push_prompted');
      if (!hasPrompted && Notification.permission === 'default') {
        const timer = setTimeout(() => setShowPushPrompt(true), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [userId]);

  const handleEnablePush = async () => { localStorage.setItem('anonroom_push_prompted', 'true'); setShowPushPrompt(false); try { await subscribeToPush(userId); } catch (err) {} };
  const handleDismissPush = () => { localStorage.setItem('anonroom_push_prompted', 'true'); setShowPushPrompt(false); };

  useEffect(() => {
    let cancelled = false;
    async function resolveInitialRoute() {
      const hostSlug = getGroupSlugFromHost();
      if (hostSlug) { if (!cancelled) { setActiveChatId(hostSlug); setActiveChatType('group'); setActiveChatSource('subdomain'); } return; }

      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/q/')) {
        const qId = currentPath.split('/')[2];
        if (qId && !cancelled) { setActiveChatId(qId); setActiveChatType('question'); setActiveChatSource('path'); }
        return;
      }

      const storyTarget = getStoryTargetFromPath();
      if (storyTarget) {
        if (!cancelled) setInitialStoryTarget(storyTarget);
        return;
      }

      const dmUsername = getDmUsernameFromPath();
      if (dmUsername) {
        const { data, error } = await supabase.from('profiles').select('id, username').eq('username', dmUsername.toLowerCase()).maybeSingle();
        if (cancelled) return;
        if (!error && data) { setActiveChatId(data.id); setActiveChatType('dm'); setActiveChatSource('path'); } 
        else { window.history.replaceState({}, '', ROOT_PATH); setActiveChatId(null); setActiveChatType(null); setActiveChatSource(null); }
      }
    }
    resolveInitialRoute();
    return () => { cancelled = true; };
  }, []);

  // Deep Link Resolver for #story-<id>
  useEffect(() => {
    const hashMatch = /^#story-(.+)$/.exec(window.location.hash || '');
    if (!hashMatch) return;
    const target = decodeURIComponent(hashMatch[1]);
    let cancelled = false;

    async function openSharedStory() {
      const isShort = isShortId(target);
      
      // 1. Check if it's a Question story
      const { data: qData } = await (isShort
        ? supabase.from('questions').select('id').eq('link_id', target).maybeSingle()
        : supabase.from('questions').select('id').eq('id', target).maybeSingle());
        
      if (cancelled) return;
      if (qData) {
        handleOpenStory([{ type: 'public-questions', id: 'public-questions', name: 'Public Questions', slug: null }], 0, qData.id);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }

      // 2. Check if it's a Confession story (Public or Group)
      const { data: cData } = await (isShort
        ? supabase.from('confessions').select('id, group_id, groups(id, name, cover_url, slug)').eq('link_id', target).maybeSingle()
        : supabase.from('confessions').select('id, group_id, groups(id, name, cover_url, slug)').eq('id', target).maybeSingle());
        
      if (cancelled) return;
      if (cData) {
        if (cData.group_id && cData.groups) {
          handleOpenStory([{ type: 'group', id: cData.groups.id, name: cData.groups.name, logoUrl: cData.groups.cover_url, slug: cData.groups.slug }], 0, cData.id);
        } else {
          handleOpenStory([{ type: 'public-confessions', id: 'public-confessions', name: 'Public Confessions', slug: null }], 0, cData.id);
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    openSharedStory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenChat(id, type, metaContext) {
    if (type === 'dm' && !userId) { setAuthOpen(true); return; }
    setActiveChatId(id); setActiveChatType(type); setActiveChatSource('path'); setSearchQuery('');
    if (type === 'dm') window.history.pushState({}, '', metaContext ? buildDmPath(metaContext) : ROOT_PATH);
    else if (type === 'question') window.history.pushState({}, '', buildQuestionPath(id));
  }

  function handleOpenGroup(slug) { window.location.href = getGroupUrl(slug); }

  // Now accepts an initialItemId so the viewer can jump directly to that story
  function handleOpenStory(channels, startIndex, initialItemId = null) {
    setViewingStory({ channels, startIndex, initialItemId });
    window.history.pushState({}, '', buildStoryPath(channels[startIndex]));
  }

  const closeStory = useCallback(() => {
    setViewingStory(null);
    setInitialStoryTarget(null);
    window.history.pushState({}, '', ROOT_PATH);
  }, []);

  useEffect(() => {
    function handlePopState() {
      if (!getStoryTargetFromPath()) {
        setViewingStory(null);
        setInitialStoryTarget(null);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const closeActiveChat = useCallback(() => {
    if (activeChatType === 'group' && activeChatSource === 'subdomain') { window.location.href = getRootDomainUrl(); return; }
    setActiveChatId(null); setActiveChatType(null); setActiveChatSource(null); window.history.pushState({}, '', ROOT_PATH);
  }, [activeChatType, activeChatSource]);

  const handleThreadReady = useCallback((identity) => {
    if (identity?.username) window.history.replaceState({}, '', buildDmPath(identity.username.toLowerCase()));
  }, []);

  const handleGroupResolved = useCallback((resolvedGroup) => {
    if (!resolvedGroup && activeChatSource === 'path') closeActiveChat();
  }, [activeChatSource, closeActiveChat]);

  const profileIdentity = session ? { name: profile?.username || 'You', avatar_url: profile?.avatar_url || null, is_admin: false } : null;
  const isChatActive = activeChatId !== null;

  return (
    <>
      <div 
        className="app-viewport no-copy-text" 
        style={{ 
          display: 'flex', width: '100vw', height: '100dvh', maxHeight: '100dvh',
          overflow: 'hidden', position: 'fixed', inset: 0,
          transform: viewportOffsetTop ? `translateY(${viewportOffsetTop}px)` : undefined,
          userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none'
        }}
      >
        <DarkGlassBackground />

        {/* ------------------------------------------------------------------
            LEFT PANEL: MASTER LIST 
            ------------------------------------------------------------------ */}
        {(!isMobile || !isChatActive) && (
          <div 
            style={{ 
              display: 'flex', flexDirection: 'column',
              width: isMobile ? '100%' : '25%', minWidth: isMobile ? '100%' : 280, 
              height: '100dvh', borderRight: '1px solid rgba(255,255,255,0.06)', 
              zIndex: 10, background: 'var(--ink-2)', position: 'relative'
            }}
          >
            {/* Header */}
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 50, position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', pointerEvents: 'none' }}>{Icons.Search}</span>
                <input 
                  type="search" name="home-search-field" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
                  onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 200)} 
                  placeholder="Search..." 
                  style={{ width: '100%', border: '1px solid rgba(255,255,255,0.06)', background: '#1C1D24', padding: '10px 36px 10px 42px', borderRadius: 14, fontSize: 16, color: 'var(--paper)', outline: 'none', transition: 'background 0.2s', boxSizing: 'border-box' }} 
                />
                {searchQuery.length > 0 && (
                  <button className="touch-bounce" onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--paper)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold' }}>✕</button>
                )}
              </div>
              <button className="touch-bounce" onClick={() => session ? setEditProfileOpen(true) : setAuthOpen(true)} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', padding: 0, flexShrink: 0, background: 'transparent' }}>
                {session ? <LiquidAvatar identity={profileIdentity} size={44} /> : <div style={{ width: '100%', height: '100%', background: 'var(--ember)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>{Icons.Menu}</div>}
              </button>
            </div>
            <div style={{ padding: '12px 0 4px', zIndex: 45, minWidth: 0, width: '100%' }}>
              <StoriesBar
                groups={groups}
                userId={userId}
                onOpenStory={handleOpenStory}
                initialTarget={initialStoryTarget}
                onConsumeInitialTarget={() => setInitialStoryTarget(null)}
              />
            </div>
            {/* Segmented Control - Elevated Z-Index */}
            <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 40 }}>
              <div style={{ display: 'flex', background: '#1C1D24', borderRadius: 20, padding: 4, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                <button 
                  className="touch-bounce" onClick={() => { playTabSwitch(); hapticTap(); setActiveTab('chats'); }} 
                  style={{ flex: 1, padding: '8px 0', borderRadius: 16, border: 'none', background: activeTab === 'chats' ? '#2A2B36' : 'transparent', color: activeTab === 'chats' ? 'var(--paper)' : 'var(--dim)', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease' }}
                >Chats</button>
                <button 
                  className="touch-bounce" onClick={() => { playTabSwitch(); hapticTap(); setActiveTab('ask_me'); }} 
                  style={{ flex: 1, padding: '8px 0', borderRadius: 16, border: 'none', background: activeTab === 'ask_me' ? '#2A2B36' : 'transparent', color: activeTab === 'ask_me' ? 'var(--paper)' : 'var(--dim)', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease' }}
                >Ask Me</button>
              </div>
            </div>

            {/* List area wrapper — establishes a fresh top:0 reference that
                starts right below the segmented tab switcher, so the pull
                spinner (positioned top:0 within THIS wrapper) always lands
                below the tabs no matter how tall the header/StoriesBar end
                up being, instead of a brittle hardcoded top:150 guess. */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Pull to Refresh Spinner - pointerEvents: none */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none', transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`, opacity: pullDistance > 10 ? 1 : 0, transition: isRefreshing ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none', color: 'var(--ember)' }}>
                <div className={isRefreshing ? "refresh-spin" : ""} style={{ transform: `rotate(${pullDistance * 4}deg)` }}>{Icons.Refresh}</div>
              </div>

              {/* Scrolling List */}
              <div ref={scrollRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: 24, zIndex: 10, transform: `translateY(${pullDistance}px)`, transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}>
              {showSearch ? (
                <div className="pop-in" style={{ padding: '0 12px' }}>
                  <SearchUsers externalTerm={searchQuery} onSelectUser={(id) => { setProfileCardUserId(id); setSearchQuery(''); }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  
                  {/* CHATS TAB */}
                  {activeTab === 'chats' && (
                    <div className="tab-animated">
                      {loadingList ? ( <div style={{ padding: '0 12px' }}><MessageSkeleton variant="list-row" count={6} /></div> ) : (
                        <>
                          {groups.length > 0 && (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dim)', padding: '18px 24px 6px' }}>Groups</div>
                              {groups.map((group, index) => {
                                const isActive = activeChatId === group.slug && activeChatType === 'group';
                                const identity = { name: group.name, avatar_url: group.cover_url, is_admin: false };
                                return (
                                  <button key={group.id} className={`chat-row stagger-item ${isActive ? 'active-chat' : ''}`} style={{ animationDelay: `${index * 0.04}s` }} onClick={() => handleOpenGroup(group.slug)}>
                                    <LiquidAvatar identity={identity} size={50} kind="group" />
                                    <div className="chat-row-content">
                                      <span style={{ fontWeight: 600, fontSize: 16, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
                                      <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{group.description || 'Public Channel'}</span>
                                    </div>
                                    {group.unread_mention && <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ember)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 }}>@</div>}
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {userId && threads.length > 0 && (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dim)', padding: '24px 24px 6px' }}>Direct Messages</div>
                              {threads.map((thread, index) => {
                                const otherId = thread.user_a === userId ? thread.user_b : thread.user_a;
                                const isActive = activeChatId === otherId && activeChatType === 'dm';
                                const identity = displayIdentity(thread.otherUser); 
                                return (
                                  <button key={thread.id} className={`chat-row stagger-item ${isActive ? 'active-chat' : ''}`} style={{ animationDelay: `${(groups.length + index) * 0.04}s` }} onClick={() => handleOpenChat(otherId, 'dm', thread.otherUser?.username)}>
                                    <LiquidAvatar identity={identity} size={50} />
                                    <div className="chat-row-content">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                        <span style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{identity.name}{identity.is_admin && <span style={{ color: 'var(--admin-1)' }}>{Icons.AdminShield}</span>}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingLeft: 8 }}>
                                          {thread.unread_mention && <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--ember)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>@</div>}
                                          <span style={{ fontSize: 12, color: 'var(--dim)' }}>{formatTelegramTime(thread.created_at)}</span>
                                        </div>
                                      </div>
                                      <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Tap to view messages</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {!userId && (
                            <div style={{ padding: '50px 24px', textAlign: 'center' }}>
                              <div style={{ width: 64, height: 64, background: '#1C1D24', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--dim)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              </div>
                              <p style={{ fontSize: 17, marginBottom: 12, fontWeight: 700, color: 'var(--paper)' }}>Private Messaging</p>
                              <p style={{ fontSize: 15, marginBottom: 24, color: 'var(--dim)', lineHeight: 1.4 }}>Sign in to unlock your private chats and connect securely.</p>
                              <button className="touch-bounce" onClick={() => setAuthOpen(true)} style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 24, fontWeight: 700, fontSize: 15, boxShadow: '0 8px 24px rgba(255,107,53,0.3)' }}>Sign In to Chat</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ASK ME TAB */}
                  {activeTab === 'ask_me' && (
                    <div className="tab-animated" style={{ padding: '16px' }}>
                      {!userId ? (
                        <div style={{ padding: '50px 10px', textAlign: 'center' }}>
                           <div style={{ width: 64, height: 64, background: '#1C1D24', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--ember)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                           </div>
                           <h3 style={{ margin: '0 0 12px 0', fontSize: 20, fontWeight: 800, color: 'var(--paper)' }}>Ask Me Anything</h3>
                           <p style={{ fontSize: 15, marginBottom: 28, color: 'var(--dim)', lineHeight: 1.5 }}>Create anonymous question links, share them on your story, and receive honest answers.</p>
                           <button className="touch-bounce" onClick={() => setAuthOpen(true)} style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 24, fontWeight: 700, fontSize: 15, boxShadow: '0 8px 24px rgba(255,107,53,0.3)' }}>Sign In to Create</button>
                        </div>
                      ) : (
                        <>
                          {/* SINGLE "ASK QUESTION" BUTTON (Matches Chat Layout) */}
                          <button 
                            className="chat-row stagger-item"
                            style={{ animationDelay: '0.05s', marginBottom: 12, width: '100%', marginLeft: 0 }}
                            onClick={(e) => { e.preventDefault(); hapticTap(); setCreateQuestionOpen(true); }}
                          >
                            <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--ember)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 28, fontWeight: 400, boxShadow: '0 4px 12px rgba(255,107,53,0.3)' }}>+</div>
                            <div className="chat-row-content">
                              <span style={{ fontWeight: 600, fontSize: 16, display: 'block', color: 'var(--paper)', marginBottom: 2 }}>Ask Question</span>
                              <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block' }}>Create a new anonymous link</span>
                            </div>
                          </button>

                          {/* "ADD CONFESSION" BUTTON — posts straight into the
                              public Confessions feed, no separate composer page */}
                          <button
                            className="chat-row stagger-item"
                            style={{ animationDelay: '0.1s', marginBottom: 28, width: '100%', marginLeft: 0 }}
                            onClick={(e) => { e.preventDefault(); hapticTap(); setCreateConfessionOpen(true); }}
                          >
                            <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#2A2B36', color: 'var(--ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></svg>
                            </div>
                            <div className="chat-row-content">
                              <span style={{ fontWeight: 600, fontSize: 16, display: 'block', color: 'var(--paper)', marginBottom: 2 }}>Add Confession</span>
                              <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block' }}>Post straight to the Confessions feed</span>
                            </div>
                          </button>

                          <div className="stagger-item" style={{ animationDelay: '0.15s', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dim)', marginBottom: 16, marginLeft: 8 }}>My Questions</div>

                          {loadingList ? (
                            <div style={{ padding: '0' }}><MessageSkeleton variant="list-row" count={3} /></div>
                          ) : myQuestions.length === 0 ? (
                            <div className="stagger-item" style={{ animationDelay: '0.2s', padding: '20px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 15, background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                              You haven't created any questions yet.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {myQuestions.map((q, idx) => (
                                <div key={q.id} className="stagger-item" style={{ animationDelay: `${0.2 + (idx * 0.05)}s` }}>
                                  <QuestionCard question={q} onOpen={() => handleOpenChat(q.id, 'question')} onClick={() => handleOpenChat(q.id, 'question')} onShare={() => setSharingQuestion(q)} />
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            RIGHT PANEL: MASTER DETAIL VIEW 
            ------------------------------------------------------------------ */}
        {(!isMobile || isChatActive) && (
          <div 
            style={{ 
              flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', 
              width: isMobile ? '100%' : undefined, height: rightPanelHeight, borderRadius: 0, 
              zIndex: 1, background: 'var(--ink)', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
              transition: 'height 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {activeChatId ? (
              activeChatType === 'dm' ? (
                <DirectMessages openThreadWithUserId={activeChatId} onBack={closeActiveChat} onThreadReady={handleThreadReady} />
              ) : activeChatType === 'group' ? (
                <GroupChat groupSlug={activeChatId} onBack={closeActiveChat} onGroupResolved={handleGroupResolved} />
              ) : activeChatType === 'question' ? (
                
  <QuestionThread
    questionId={activeChatId}
    onBack={closeActiveChat}
    onShareReply={(question, reply) => setSharingReply({ question, reply })}
  />
) : null
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>
                <div style={{ marginBottom: 20, animation: 'pop-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{Icons.EmptyChat}</div>
                <p style={{ fontSize: 15, fontWeight: 600, background: '#1C1D24', border: '1px solid rgba(255,255,255,0.06)', padding: '8px 20px', borderRadius: 24, color: 'var(--paper)' }}>Select a chat or question to view</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 
        ======================================================================
        ALL OVERLAYS & MODALS (ROOT LEVEL SEPARATION)
        Placed strictly OUTSIDE the `app-viewport` div so they never get 
        squashed by Flexbox and render perfectly on both PC and Mobile.
        ======================================================================
      */}
      
      {/* Push Notification Prompt */}
      {showPushPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(10px)', animation: 'pop-in 0.3s ease-out' }}>
          <div style={{ width: '100%', maxWidth: 400, background: 'var(--ink-2)', borderRadius: '28px 28px 0 0', padding: '32px 24px 40px', border: '1px solid rgba(255,255,255,0.06)', borderBottom: 'none', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', textAlign: 'center', animation: 'slide-up-modal 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05)' }}>
            <div style={{ color: 'var(--ember)', marginBottom: 16, display: 'inline-flex', padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>{Icons.Bell}</div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 22, fontWeight: 800, color: 'var(--paper)' }}>Enable Notifications</h2>
            <p style={{ margin: '0 0 24px 0', color: 'var(--dim)', fontSize: 15, lineHeight: 1.4 }}>Get instantly notified about new messages, mentions, and replies.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="touch-bounce" onClick={handleEnablePush} style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '16px', borderRadius: 20, fontWeight: 700, fontSize: 16 }}>Turn On Notifications</button>
              <button className="touch-bounce" onClick={handleDismissPush} style={{ background: 'transparent', color: 'var(--dim)', border: 'none', padding: '16px', borderRadius: 20, fontWeight: 600, fontSize: 15 }}>Not Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Component Overlays */}
<AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
<EditProfile open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />
<ProfileCard userId={profileCardUserId} open={profileCardUserId !== null} onClose={() => setProfileCardUserId(null)} onMessage={(id) => { setProfileCardUserId(null); handleOpenChat(id, 'dm'); }} />
<CreateQuestionModal open={createQuestionOpen} onClose={() => setCreateQuestionOpen(false)} initialType={createQuestionType} onCreated={(question) => { setMyQuestions(prev => [question, ...prev]); }} />
<CreateConfessionModal open={createConfessionOpen} onClose={() => setCreateConfessionOpen(false)} onCreated={() => {}} />
{sharingQuestion && (
  <ShareStorySheet mode="question" open={!!sharingQuestion} onClose={() => setSharingQuestion(null)} question={sharingQuestion} />
)}
{sharingReply && (
  <ShareStorySheet
    mode="reply"
    open={!!sharingReply}
    onClose={() => setSharingReply(null)}
    question={sharingReply.question}
    reply={sharingReply.reply}
  />
)}
{viewingStory && (
  <StoryViewer
    channels={viewingStory.channels}
    startIndex={viewingStory.startIndex}
    initialItemId={viewingStory.initialItemId} 
    userId={userId}
    onClose={closeStory}
    onChannelChange={(channel) => window.history.replaceState({}, '', buildStoryPath(channel))}
    onViewReplies={(questionId) => {
      closeStory();
      handleOpenChat(questionId, 'question');
    }}
  />
)}
</>
);
}