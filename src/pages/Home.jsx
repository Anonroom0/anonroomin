import { Capacitor } from '@capacitor/core';
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
 * - NEW: Unauthenticated visitors now see the full public group list (not an
 *   empty "sign in" placeholder) in the Chats tab — group_threads membership
 *   is only used to personalize order/unread badges once signed in.
 * - NEW: StoriesBar is unmounted entirely (not just rendered empty) whenever
 *   it has nothing to show — see `storiesAvailable` state, fed by an
 *   onAvailabilityChange callback StoriesBar is expected to call. Same flag
 *   hides the "Add Confession" quick-action so it never dead-ends into an
 *   empty feed.
 * - NEW: Dropped the flat `--separator` hairlines around the header, tab
 *   switcher and panel edge in favor of soft shadow-based separation, and
 *   redid `.chat-row` (especially group rows) as a layered glassmorphic
 *   "brushed metal" card — gradient border, inner bevel highlight/shadow,
 *   and real drop shadow instead of a solid 1px outline.
 * 
 * Dependencies: React, Supabase, AuthContext, Shared Components
 * ============================================================================
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import {
  getGroupSlugFromHost,
  getGroupSlugFromPath,
  getRootDomainUrl,
  buildGroupPath,
  getDmUsernameFromPath,
  buildDmPath,
  buildQuestionPath,
  buildStoryPath,
  getStoryTargetFromPath,
  ROOT_PATH,
  isShortId,
  navigateInApp,
} from '../lib/subdomain';
import { subscribeToPush } from '../lib/pushNotifications';
import { playTabSwitch, playRefreshComplete, playError, playTap } from '../lib/soundManager';
import { hapticTap, hapticSuccess, hapticError } from '../lib/haptics';
import { useViewportHeight } from '../lib/useViewportHeight';
import { APP_VERSION, fetchLatestAppVersion, isNewerVersion } from '../lib/appVersion';
import { downloadAndInstallUpdate } from '../lib/appUpdate';

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
import ExploreChannelsSheet from '../components/groups/ExploreChannelsSheet';
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
  Profile: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
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
  ),
  Compass: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  Pin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79L16 12V6a1 1 0 0 1 1-1 1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1v6l-1.89 1.45A2 2 0 0 0 5 15.24Z" />
    </svg>
  ),
  Trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
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

// Swipe left/right on the Chats/Ask Me list area to switch tabs — the
// modularity convenience feature: swipe left on Chats to land on Ask Me,
// swipe right on Ask Me to land back on Chats (and vice-versa symmetrically
// once on Ask Me), same as the segmented control buttons above the list.
// Runs alongside usePullToRefresh's own touch handlers on the same
// element (see the ref usage below) — it only ever acts once a gesture is
// clearly more horizontal than vertical, so it never fights the vertical
// scroll/pull-to-refresh gesture.
const SWIPE_TAB_ORDER = ['chats', 'ask_me'];
const SWIPE_DISTANCE_THRESHOLD_PX = 50;
const SWIPE_DIRECTION_LOCK_PX = 12;

function useTabSwipe(activeTab, setActiveTab, disabled, onSwitch) {
  const startX = useRef(null);
  const startY = useRef(null);
  const isHorizontal = useRef(false);

  const onTouchStart = (e) => {
    if (disabled || !e.touches || e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = false;
  };

  const onTouchMove = (e) => {
    if (disabled || startX.current === null || !e.touches || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!isHorizontal.current && Math.abs(dx) > SWIPE_DIRECTION_LOCK_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      isHorizontal.current = true;
    }
  };

  const onTouchEnd = (e) => {
    if (disabled || startX.current === null) { startX.current = null; return; }
    if (isHorizontal.current && e.changedTouches && e.changedTouches.length) {
      const dx = e.changedTouches[0].clientX - startX.current;
      if (Math.abs(dx) >= SWIPE_DISTANCE_THRESHOLD_PX) {
        const currentIndex = SWIPE_TAB_ORDER.indexOf(activeTab);
        // Swipe left (dx < 0, finger moves right-to-left) -> next tab.
        // Swipe right (dx > 0, finger moves left-to-right) -> previous tab.
        const nextIndex = currentIndex + (dx < 0 ? 1 : -1);
        const nextTab = SWIPE_TAB_ORDER[nextIndex];
        if (nextTab && nextTab !== activeTab) {
          setActiveTab(nextTab);
          onSwitch?.();
        }
      }
    }
    startX.current = null;
    startY.current = null;
    isHorizontal.current = false;
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
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

        /* ------------------------------------------------------------------
           Chat row — layered glassmorphic "brushed metal" card.
           Separator hairlines are gone in favor of shadow-based depth, so
           the border itself now carries a soft metallic gradient outline
           (via ::after, masked to a ring) instead of a flat 1px line, plus
           an inset highlight/shadow pair for a real bevel.
           ------------------------------------------------------------------ */
        .chat-row { 
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          margin: 6px 12px 10px 12px;
          width: calc(100% - 24px);
          box-sizing: border-box;
          background:
            linear-gradient(155deg, rgba(255,255,255,0.07), rgba(255,255,255,0.01) 45%, rgba(0,0,0,0.06) 100%),
            var(--ink-2);
          border: none;
          border-radius: 18px; 
          color: var(--paper);
          text-align: left;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); 
          touch-action: manipulation;
          cursor: pointer;
          overflow: visible;
          backdrop-filter: blur(16px) saturate(160%);
          -webkit-backdrop-filter: blur(16px) saturate(160%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            inset 0 -1px 1px rgba(0,0,0,0.35),
            0 10px 22px rgba(0,0,0,0.28),
            0 2px 4px rgba(0,0,0,0.35);
        }

        /* Thin metallic ring drawn as a masked gradient border, replacing
           the old flat var(--separator) outline. */
        .chat-row::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 18px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(255,255,255,0.32), rgba(255,255,255,0.02) 35%, rgba(255,255,255,0.14) 60%, rgba(255,255,255,0.30));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
        }
        
        .chat-row:active { 
          transform: scale(0.96) translateY(2px);
          /* Semi-transparent tint reads as a highlight over whichever
             theme's --ink-2 is underneath, light or dark. */
          background:
            linear-gradient(155deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.06) 100%),
            rgba(120, 170, 255, 0.16);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            inset 0 -2px 3px rgba(0,0,0,0.4),
            0 4px 10px rgba(0,0,0,0.25);
        }

        .chat-row.active-chat {
          background:
            linear-gradient(155deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.05) 100%),
            var(--ink-2);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.16),
            inset 0 -1px 1px rgba(0,0,0,0.35),
            0 12px 26px rgba(0,0,0,0.32);
          transform: translateY(-1px);
        }
        .chat-row.active-chat::after {
          background: linear-gradient(135deg, rgba(255,255,255,0.5), rgba(255,255,255,0.05) 35%, rgba(255,255,255,0.24) 60%, rgba(255,255,255,0.5));
        }

        /* Group rows: brushed-steel variant — cooler, higher-contrast
           metallic ring and a deeper bevel so they read as distinct,
           slightly more "hardware" than a plain DM row. */
        .chat-row.group-row {
          background:
            linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.01) 40%, rgba(0,0,0,0.12) 100%),
            var(--ink-2);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.14),
            inset 0 -2px 4px rgba(0,0,0,0.4),
            0 12px 26px rgba(0,0,0,0.3),
            0 2px 5px rgba(0,0,0,0.45);
        }
        .chat-row.group-row::after {
          background: linear-gradient(135deg, #eef0f3 0%, #9a9da3 22%, #dfe1e5 42%, #6b6e75 60%, #e9eaed 78%, #8b8e95 100%);
          opacity: 0.5;
        }
        .chat-row.group-row:active {
          transform: scale(0.96) translateY(2px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            inset 0 -2px 4px rgba(0,0,0,0.5),
            0 5px 12px rgba(0,0,0,0.35);
        }
        .chat-row.group-row.active-chat::after {
          opacity: 0.85;
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
  // Website + phone/tablet only — never on desktop layout or native APK.
  const [isMobileWeb, setIsMobileWeb] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (Capacitor.isNativePlatform()) {
      setIsMobileWeb(false);
      return undefined;
    }
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobileWeb(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // In-app update notification — same fetchLatestAppVersion/APP_VERSION
  // pair EditProfile.jsx uses for its manual "Check for update" button,
  // but here it's automatic (checked on load + kept live over realtime)
  // so the update shows up as a banner without the user having to go
  // digging in their profile settings for it.
  const isNativeApp = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const [updateInfo, setUpdateInfo] = useState(null); // { version, apkUrl } once a newer build is known
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState(null); // dismissing only hides that specific version
  const [updateDownloadState, setUpdateDownloadState] = useState('idle'); // idle | downloading | error
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0);
  
  // Updated `viewingStory` state to accept an `initialItemId`
  const [viewingStory, setViewingStory] = useState(null);
  
  const [initialStoryTarget, setInitialStoryTarget] = useState(null);

  // Whether StoriesBar currently has anything to show (stories AND/OR
  // confessions). StoriesBar is expected to call onAvailabilityChange(bool)
  // once it knows; until then we assume true so it isn't hidden pointlessly
  // on first paint. When false, the whole bar unmounts — no empty strip —
  // and the "Add Confession" quick action in Ask Me hides with it, since
  // there's nowhere for that confession to surface as a story.
  const [storiesAvailable, setStoriesAvailable] = useState(true);
  
  const [createQuestionOpen, setCreateQuestionOpen] = useState(false);
  const [createQuestionType, setCreateQuestionType] = useState('general'); // Default fallback
const [sharingQuestion, setSharingQuestion] = useState(null);
const [sharingReply, setSharingReply] = useState(null); // NEW — { question, reply }
  const [createConfessionOpen, setCreateConfessionOpen] = useState(false);

  const [threads, setThreads] = useState([]);
  const [groups, setGroups] = useState([]);
  // Channels the user hasn't joined yet — only ever shown behind "Explore
  // more" (see the CHATS TAB render below), never mixed into `groups`.
  // Always empty for signed-out visitors, since they now see every public
  // group directly in the main list (see fetchData below) rather than
  // behind a separate "Explore" step.
  const [exploreGroups, setExploreGroups] = useState([]);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState(null);
  const [myQuestions, setMyQuestions] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const scrollRef = useRef(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    if (isInitialLoad) setLoadingList(true);

    try {
      const { data: allGroupsData, error: groupsError } = await supabase
        .from('groups').select('id, slug, name, description, cover_url, created_at').order('created_at', { ascending: false });
      if (groupsError) throw groupsError;
      const allGroups = allGroupsData || [];
      let finalGroups = [];
      let finalExploreGroups = allGroups;
      let finalThreads = [];
      let finalQuestions = [];

      if (userId) {
        // A group_threads row = "joined this channel" — it's also where its
        // unread_count/mention live now, denormalized and kept current by
        // DB triggers, so this replaces the old per-group COUNT queries
        // entirely (see 0009_group_threads_and_dm_counters.sql).
        const { data: joinedRows, error: joinedError } = await supabase
          .from('group_threads')
          .select('group_id, unread_count, mention, joined_at, pinned')
          .eq('user_id', userId)
          .order('joined_at', { ascending: false });
        if (joinedError) throw joinedError;

        const groupsById = Object.fromEntries(allGroups.map((g) => [g.id, g]));
        finalGroups = (joinedRows || [])
          .map((r) => {
            const g = groupsById[r.group_id];
            if (!g) return null; // group was deleted since joining
            return { ...g, unread_mention: !!r.mention, unread_count: r.unread_count || 0, pinned: !!r.pinned };
          })
          .filter(Boolean)
          .sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1));

        const joinedIds = new Set(finalGroups.map((g) => g.id));
        finalExploreGroups = allGroups.filter((g) => !joinedIds.has(g.id));

        // Include bot DMs (user_b null, bot_id set) as well as normal user
        // threads. Unread counts + last-message preview are columns on
        // dm_threads itself now (kept current by DB triggers), so no more
        // separate read-receipts fetch or per-thread COUNT queries either.
        const { data: threadRows, error: threadsError } = await supabase
          .from('dm_threads')
          .select('id, user_a, user_b, bot_id, created_at, last_message_at, last_message_preview, unread_count_a, unread_count_b, mention_a, mention_b')
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .order('last_message_at', { ascending: false, nullsFirst: false });
        if (threadsError) throw threadsError;

        const otherIds = (threadRows || [])
          .map((t) => (t.bot_id ? null : (t.user_a === userId ? t.user_b : t.user_a)))
          .filter(Boolean);
        const botIds = (threadRows || []).map((t) => t.bot_id).filter(Boolean);
        let profilesById = {};
        let botsById = {};

        if (otherIds.length > 0) {
          const { data: profileRows, error: profilesError } = await supabase.from('profiles').select('id, username, avatar_url, is_admin').in('id', otherIds);
          if (profilesError) throw profilesError;
          profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
        }
        if (botIds.length > 0) {
          const { data: botRows } = await supabase.from('bots').select('id, name, avatar_url').in('id', botIds);
          botsById = Object.fromEntries((botRows || []).map((b) => [b.id, { id: b.id, username: b.name, avatar_url: b.avatar_url, is_admin: false, is_bot: true }]));
        }

        finalThreads = (threadRows || []).map((t) => {
          const isBotThread = !!t.bot_id;
          const otherId = isBotThread ? t.bot_id : (t.user_a === userId ? t.user_b : t.user_a);
          const isUserA = t.user_a === userId;
          const otherUser = isBotThread
            ? (botsById[t.bot_id] || { id: t.bot_id, username: 'Bot', is_bot: true })
            : (profilesById[otherId] || { id: otherId, username: 'Unknown User' });
          return {
            ...t,
            otherUser,
            unread_mention: isUserA ? !!t.mention_a : !!t.mention_b,
            unread_count: (isUserA ? t.unread_count_a : t.unread_count_b) || 0,
          };
        });

        const { data: questionsData, error: questionsError } = await supabase.from('questions').select('*').eq('author_id', userId).order('created_at', { ascending: false });
        if (!questionsError && questionsData) finalQuestions = questionsData;
      } else {
        // Signed out: skip the "Explore" detour entirely and show every
        // public group directly in the main Chats list. There's no
        // group_threads row to source unread/pinned state from, so those
        // just default off — they only matter once someone signs in.
        finalGroups = allGroups.map((g) => ({ ...g, unread_mention: false, unread_count: 0, pinned: false }));
        finalExploreGroups = [];
      }

      if (isMounted) {
        setGroups(finalGroups);
        setExploreGroups(finalExploreGroups);
        setThreads(finalThreads);
        setMyQuestions(finalQuestions);
      }
    } catch (err) { console.error("Data fetch error:", err.message); } 
    finally { if (isMounted) { setLoadingList(false); setIsInitialLoad(false); } }
  }, [userId, isInitialLoad]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchData, scrollRef);
  // Disabled while the search results view is showing — that's a single
  // view, not a tab to swipe out of.
  const tabSwipe = useTabSwipe(activeTab, setActiveTab, showSearch, () => { playTabSwitch(); hapticTap(); });

  // Badge counts live on group_threads/dm_threads rows now (see
  // 0009_group_threads_and_dm_counters.sql), so a plain postgres_changes
  // UPDATE subscription is enough to keep them current in real time —
  // no more waiting on the next pull-to-refresh to see a new unread count.
  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`home_badges:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_threads', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new;
          setGroups((prev) => prev.map((g) => (g.id === row.group_id ? { ...g, unread_count: row.unread_count || 0, unread_mention: !!row.mention, pinned: !!row.pinned } : g)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dm_threads', filter: `user_a=eq.${userId}` },
        (payload) => {
          const row = payload.new;
          setThreads((prev) => prev.map((t) => (t.id === row.id ? { ...t, unread_count: row.unread_count_a || 0, unread_mention: !!row.mention_a, last_message_preview: row.last_message_preview, last_message_at: row.last_message_at } : t)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dm_threads', filter: `user_b=eq.${userId}` },
        (payload) => {
          const row = payload.new;
          setThreads((prev) => prev.map((t) => (t.id === row.id ? { ...t, unread_count: row.unread_count_b || 0, unread_mention: !!row.mention_b, last_message_preview: row.last_message_preview, last_message_at: row.last_message_at } : t)));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Update notification: check once on load, then stay live via
  // postgres_changes on app_releases — CI upserts that row (id='android')
  // on every build (see .github/workflows/build-apk.yml), so the banner
  // appears the moment a new version is published instead of waiting for
  // someone to open Edit Profile and tap "Check for update".
  const applyReleaseRow = useCallback((row) => {
    if (!row || typeof row.version !== 'string' || !row.version.trim()) return;
    const version = row.version.trim();
    const apkUrl = (typeof row.apk_url === 'string' && row.apk_url.trim()) || 'https://anonroom.in/apk/download/';
    if (isNewerVersion(version, APP_VERSION)) {
      setUpdateInfo((prev) => (prev && prev.version === version ? prev : { version, apkUrl }));
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await fetchLatestAppVersion();
        if (!cancelled) applyReleaseRow({ version: latest.version, apk_url: latest.apkUrl });
      } catch (err) {
        console.error('Update check failed:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isNativeApp, applyReleaseRow]);

  useEffect(() => {
    if (!isNativeApp) return undefined;

    const channel = supabase
      .channel('app_release_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_releases', filter: 'id=eq.android' },
        (payload) => applyReleaseRow(payload.new)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isNativeApp, applyReleaseRow]);

  async function handleDownloadUpdate() {
    if (!updateInfo?.apkUrl) return;
    setUpdateDownloadState('downloading');
    setUpdateDownloadProgress(0);
    try {
      await downloadAndInstallUpdate(updateInfo.apkUrl, {
        onProgress: (fraction) => setUpdateDownloadProgress(fraction),
      });
      // Handed off to Android's installer sheet — leave the banner in
      // place so it's still there (with its button) if the user backs
      // out of that screen instead of confirming the install.
      setUpdateDownloadState('idle');
    } catch (err) {
      console.error(err);
      playError(); hapticError();
      setUpdateDownloadState('error');
    }
  }

  function handleDismissUpdateBanner() {
    hapticTap(); playTap();
    if (updateInfo?.version) setDismissedUpdateVersion(updateInfo.version);
  }

  const showUpdateBanner = isNativeApp && !!updateInfo && updateInfo.version !== dismissedUpdateVersion;

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

  // Single source of truth for "what should activeChatId/Type/Source be,
  // given the CURRENT URL" — used both at mount (cold start / deep link)
  // and on every popstate (browser back/forward, our own synthetic
  // popstate from navigateInApp/pushState elsewhere in the app, and the
  // native back-button handler in main.jsx). Previously this logic only
  // ever ran once at mount, so pressing back out of a DM/group/question
  // changed the URL but left the old panel on screen until a manual
  // refresh re-read the path — this is what makes that URL the actual
  // source of truth continuously, not just on first load. Deliberately
  // does NOT handle story paths (see the popstate listener below for why).
  const resolveActiveChatFromLocation = useCallback(async ({ isCancelled = () => false } = {}) => {
    // Groups now route through the path-based anonroom.in/g/<slug> URL —
    // a real subdomain visit never reaches this point at all anymore (see
    // App.jsx's redirect effect), so this only needs to check the path.
    const pathGroupSlug = getGroupSlugFromPath();
    if (pathGroupSlug) { if (!isCancelled()) { setActiveChatId(pathGroupSlug); setActiveChatType('group'); setActiveChatSource('path'); } return; }

    // Local/dev-only fallback: wildcard subdomains don't resolve on
    // localhost or a bare IP, so a group can still be opened there via
    // ?group=slug (see getGroupSlugFromHost's local-host branch).
    const hostSlug = getGroupSlugFromHost();
    if (hostSlug) { if (!isCancelled()) { setActiveChatId(hostSlug); setActiveChatType('group'); setActiveChatSource('subdomain'); } return; }

    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/q/')) {
      const qId = currentPath.split('/')[2];
      if (qId) { if (!isCancelled()) { setActiveChatId(qId); setActiveChatType('question'); setActiveChatSource('path'); } return; }
    }

    const dmUsername = getDmUsernameFromPath();
    if (dmUsername) {
      const uname = dmUsername.toLowerCase();
      // Real profiles first, then bots treated as real usernames so
      // /botname opens a DM the same way /username does.
      const { data, error } = await supabase.from('profiles').select('id, username').eq('username', uname).maybeSingle();
      if (isCancelled()) return;
      if (!error && data) {
        // Own profile path should not open a self-DM
        const myId = (await supabase.auth.getSession()).data?.session?.user?.id;
        if (isCancelled()) return;
        if (myId && data.id === myId) {
          showToast("Messaging yourself isn't available.", 'info');
          window.history.replaceState({}, '', ROOT_PATH);
          setActiveChatId(null); setActiveChatType(null); setActiveChatSource(null);
        } else {
          setActiveChatId(data.id); setActiveChatType('dm'); setActiveChatSource('path');
        }
      } else {
        const { data: botRow } = await supabase.from('bots').select('id, name, active, dm_enabled').ilike('name', uname).eq('active', true).maybeSingle();
        if (isCancelled()) return;
        if (botRow && botRow.dm_enabled !== false) {
          setActiveChatId(botRow.id); setActiveChatType('dm'); setActiveChatSource('path');
        } else {
          window.history.replaceState({}, '', ROOT_PATH); setActiveChatId(null); setActiveChatType(null); setActiveChatSource(null);
        }
      }
      return;
    }

    // Nothing above matched — we're at the root (or a story/top-level path
    // this function doesn't own). Clear any stale panel so a back-navigation
    // out of a DM/group/question actually lands on Home.
    if (!isCancelled()) { setActiveChatId(null); setActiveChatType(null); setActiveChatSource(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Story deep links are a cold-start-only concern (handed to StoriesBar
    // via initialTarget, consumed once) — resolveActiveChatFromLocation
    // deliberately doesn't touch them; see the popstate listener below for
    // why re-opening a story from a back-navigation isn't done the same way.
    const storyTarget = getStoryTargetFromPath();
    if (storyTarget) setInitialStoryTarget(storyTarget);
    resolveActiveChatFromLocation({ isCancelled: () => cancelled });
    return () => { cancelled = true; };
  }, [resolveActiveChatFromLocation]);

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
    // Messaging yourself is not available
    if (type === 'dm' && id && userId && String(id) === String(userId)) {
      showToast("Messaging yourself isn't available.", 'info');
      return;
    }
    setActiveChatId(id); setActiveChatType(type); setActiveChatSource('path'); setSearchQuery('');
    if (type === 'dm') window.history.pushState({}, '', metaContext ? buildDmPath(metaContext) : ROOT_PATH);
    else if (type === 'question') window.history.pushState({}, '', buildQuestionPath(id));
  }

  // Groups are same-origin now (anonroom.in/g/<slug>), so opening one from
  // the sidebar is a normal in-app navigation — push the path and switch
  // the active chat directly, instead of a full-page cross-origin reload
  // to a subdomain like this used to do.
  function handleOpenGroup(slug) {
    setActiveChatId(slug); setActiveChatType('group'); setActiveChatSource('path'); setSearchQuery('');
    window.history.pushState({}, '', buildGroupPath(slug));
  }

  // Explore → Join: inserts the group_threads membership row, then opens
  // the channel. Optimistic (moves the card into the main list immediately)
  // with a rollback on failure. GroupChat.jsx would actually create this
  // same row itself the moment it marks the channel read, so this is really
  // just "join right now, from the list" instead of "join by opening it".
  async function handleJoinGroup(group) {
    if (!userId) { setAuthOpen(true); return; }
    hapticTap();
    setJoiningGroupId(group.id);
    setExploreGroups((prev) => prev.filter((g) => g.id !== group.id));
    setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [{ ...group, unread_count: 0, unread_mention: false, pinned: false }, ...prev]));

    const { error } = await supabase.from('group_threads').insert({ group_id: group.id, user_id: userId });
    setJoiningGroupId(null);
    if (error) {
      console.error(error);
      showToast(friendlyDbError(), 'error');
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setExploreGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [group, ...prev]));
      return;
    }
    setExploreOpen(false);
    handleOpenGroup(group.slug);
  }

  // Long-press / right-click context menu for a group row: Pin or Delete
  // (delete = leave the channel, i.e. remove this user's group_threads row).
  const [groupMenuFor, setGroupMenuFor] = useState(null); // group object or null
  const [groupMenuBusy, setGroupMenuBusy] = useState(false);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);

  function openGroupMenu(group) {
    hapticTap();
    setGroupMenuFor(group);
  }
  function closeGroupMenu() {
    if (groupMenuBusy) return;
    setGroupMenuFor(null);
  }
  function handleGroupRowPressStart(group) {
    longPressFired.current = false;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      openGroupMenu(group);
    }, 450);
  }
  function handleGroupRowPressEnd() {
    clearTimeout(longPressTimer.current);
  }
  function handleGroupRowClick(group) {
    if (longPressFired.current) { longPressFired.current = false; return; }
    handleOpenGroup(group.slug);
  }
  function handleGroupContextMenu(e, group) {
    e.preventDefault();
    openGroupMenu(group);
  }

  async function handleTogglePinGroup(group) {
    if (!userId || groupMenuBusy) return;
    setGroupMenuBusy(true);
    hapticTap();
    const nextPinned = !group.pinned;
    setGroups((prev) => {
      const updated = prev.map((g) => (g.id === group.id ? { ...g, pinned: nextPinned } : g));
      return [...updated].sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1));
    });
    setGroupMenuFor(null);
    const { error } = await supabase
      .from('group_threads')
      .update({ pinned: nextPinned })
      .eq('group_id', group.id)
      .eq('user_id', userId);
    setGroupMenuBusy(false);
    if (error) {
      console.error(error);
      // Roll back on failure
      setGroups((prev) => {
        const updated = prev.map((g) => (g.id === group.id ? { ...g, pinned: !nextPinned } : g));
        return [...updated].sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1));
      });
    }
  }

  async function handleDeleteGroupThread(group) {
    if (!userId || groupMenuBusy) return;
    setGroupMenuBusy(true);
    hapticTap();
    const wasActive = activeChatId === group.slug && activeChatType === 'group';
    setGroups((prev) => prev.filter((g) => g.id !== group.id));
    setExploreGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [group, ...prev]));
    setGroupMenuFor(null);
    if (wasActive) closeActiveChat();

    const { error } = await supabase
      .from('group_threads')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId);
    setGroupMenuBusy(false);
    if (error) {
      console.error(error);
      // Roll back on failure
      setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [...prev, group]));
      setExploreGroups((prev) => prev.filter((g) => g.id !== group.id));
    }
  }

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
      // Story open/close only ever CLOSES here (never re-opens) — see
      // resolveActiveChatFromLocation's comment for why: handleOpenStory
      // pushes a new history entry, so re-opening from a popstate handler
      // would push on top of a back-navigation and leave an extra, wrong
      // entry in the stack. Landing back on a story URL via forward/back
      // is rare enough (StoryViewer's own channel-switching uses
      // replaceState, not pushState) that this asymmetry is fine.
      if (!getStoryTargetFromPath()) {
        setViewingStory(null);
        setInitialStoryTarget(null);
      }
      resolveActiveChatFromLocation();
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resolveActiveChatFromLocation]);

  const closeActiveChat = useCallback(() => {
    if (activeChatType === 'group' && activeChatSource === 'subdomain') { navigateInApp(ROOT_PATH || '/'); return; }
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
              height: '100dvh',
              zIndex: 10, background: 'var(--glass-panel)', backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)', position: 'relative',
              boxShadow: isMobile ? 'none' : '8px 0 30px rgba(0,0,0,0.22)'
            }}
          >
            {/* Header — Apple-style: title + icon search; expands to full search */}
            <div
              style={{
                padding: searchFocused || searchQuery.trim() ? '10px 12px' : '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                zIndex: 50,
                position: 'relative',
                background: 'var(--header-bg)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                minHeight: 56,
                boxSizing: 'border-box',
                boxShadow: '0 8px 16px -12px rgba(0,0,0,0.35)'
              }}
            >
              {(searchFocused || searchQuery.trim().length > 0) ? (
                <>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', pointerEvents: 'none', display: 'flex' }}>{Icons.Search}</span>
                    <input
                      autoFocus
                      type="search"
                      name="home-search-field"
                      autoComplete="off-nope"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore
                      data-form-type="other"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                      placeholder="Search"
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'var(--surface-2)',
                        padding: '10px 12px 10px 40px',
                        borderRadius: 12,
                        fontSize: 16,
                        color: 'var(--paper)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setSearchFocused(false); }}
                    style={{
                      border: 'none', background: 'transparent', color: 'var(--ember)',
                      fontWeight: 600, fontSize: 16, cursor: 'pointer', padding: '8px 4px', flexShrink: 0,
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        color: 'var(--paper)',
                        lineHeight: 1.1,
                      }}
                    >
                      Anonroom
                    </span>
                  </div>
                  <button
                    type="button"
                    className="touch-bounce"
                    aria-label="Search"
                    title="Search"
                    onClick={() => setSearchFocused(true)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', border: 'none',
                      background: 'var(--surface-2)', color: 'var(--paper)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0, padding: 0,
                    }}
                  >
                    {Icons.Search}
                  </button>
                  {isMobileWeb && (
                    <button
                      type="button"
                      className="touch-bounce"
                      title="Download app"
                      aria-label="Download app"
                      // NOT navigateInApp(): /apk/download/ is a real static
                      // page (public/apk/download/index.html), not a route
                      // this SPA's router knows about. navigateInApp() only
                      // does pushState + a synthetic popstate, which updates
                      // the address bar but never actually fetches that
                      // page — nothing here is listening for that path, so
                      // the SPA just kept rendering Home underneath the new
                      // URL until a manual refresh forced a real page load
                      // (which is why it "worked after refreshing"). This
                      // needs an actual navigation instead.
                      onClick={() => { window.location.assign('/apk/download/'); }}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--glass-border)',
                        padding: 0, flexShrink: 0, background: 'var(--surface-2)', color: 'var(--paper)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  )}
                </>
              )}
              <button
                className="touch-bounce"
                onClick={() => session ? setEditProfileOpen(true) : setAuthOpen(true)}
                aria-label={session ? 'Profile' : 'Sign in'}
                style={{
                  width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--glass-border)',
                  padding: 0, flexShrink: 0, background: session ? 'transparent' : 'var(--surface-2)',
                  color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                }}
              >
                {session
                  ? <LiquidAvatar identity={profileIdentity} size={40} />
                  : Icons.Profile}
              </button>
            </div>

            {/* Update available notification — realtime via app_releases,
                see the app_release_updates channel above. */}
            {showUpdateBanner && (
              <div
                style={{
                  margin: '10px 12px 0', padding: '12px 14px', borderRadius: 14,
                  background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
                  display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 45,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--paper)' }}>Update available</div>
                    <div style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 2 }}>
                      {updateDownloadState === 'downloading'
                        ? `Downloading… ${Math.round(updateDownloadProgress * 100)}%`
                        : updateDownloadState === 'error'
                        ? 'Download failed — tap to retry'
                        : `Version ${updateInfo.version} is ready to install`}
                    </div>
                  </div>
                  {updateDownloadState !== 'downloading' && (
                    <button
                      type="button"
                      className="touch-bounce"
                      onClick={handleDismissUpdateBanner}
                      aria-label="Dismiss"
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: 'none', flexShrink: 0,
                        background: 'transparent', color: 'var(--dim)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="touch-bounce"
                  onClick={handleDownloadUpdate}
                  disabled={updateDownloadState === 'downloading'}
                  style={{
                    width: '100%', border: 'none', background: 'var(--ember)', color: '#fff',
                    borderRadius: 12, padding: '10px 14px', fontWeight: 700, fontSize: 13.5,
                    cursor: updateDownloadState === 'downloading' ? 'default' : 'pointer',
                    opacity: updateDownloadState === 'downloading' ? 0.7 : 1,
                  }}
                >
                  {updateDownloadState === 'downloading'
                    ? 'Downloading…'
                    : updateDownloadState === 'error'
                    ? 'Retry download'
                    : 'Update now'}
                </button>
                {updateDownloadState === 'downloading' && (
                  <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(4, Math.round(updateDownloadProgress * 100))}%`,
                        height: '100%', borderRadius: 999, background: 'var(--ember)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Stories/confessions bar — fully unmounted (not just empty)
                when there's nothing to show. StoriesBar reports that back
                via onAvailabilityChange(bool); until it reports, we render
                it (storiesAvailable defaults true) so it isn't flashed away
                on first paint. */}
            {storiesAvailable && (
              <StoriesBar
                groups={groups}
                userId={userId}
                onOpenStory={handleOpenStory}
                initialTarget={initialStoryTarget}
                onConsumeInitialTarget={() => setInitialStoryTarget(null)}
                onAvailabilityChange={setStoriesAvailable}
              />
            )}
            {/* Segmented Control - Elevated Z-Index */}
            <div style={{ padding: '8px 16px 12px', position: 'relative', zIndex: 40, boxShadow: '0 8px 16px -12px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', background: 'var(--tab-track)', borderRadius: 20, padding: 4, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25), inset 0 -1px 0 rgba(255,255,255,0.04)' }}>
                <button 
                  className="touch-bounce" onClick={() => { playTabSwitch(); hapticTap(); setActiveTab('chats'); }} 
                  style={{ flex: 1, padding: '8px 0', borderRadius: 16, border: 'none', background: activeTab === 'chats' ? 'var(--tab-active)' : 'transparent', color: activeTab === 'chats' ? 'var(--tab-active-text)' : 'var(--tab-idle-text)', boxShadow: activeTab === 'chats' ? 'var(--shadow-float)' : 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease' }}
                >Chats</button>
                <button 
                  className="touch-bounce" onClick={() => { playTabSwitch(); hapticTap(); setActiveTab('ask_me'); }} 
                  style={{ flex: 1, padding: '8px 0', borderRadius: 16, border: 'none', background: activeTab === 'ask_me' ? 'var(--tab-active)' : 'transparent', color: activeTab === 'ask_me' ? 'var(--tab-active-text)' : 'var(--tab-idle-text)', boxShadow: activeTab === 'ask_me' ? 'var(--shadow-float)' : 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease' }}
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
              <div
                ref={scrollRef}
                onTouchStart={(e) => { handleTouchStart(e); tabSwipe.onTouchStart(e); }}
                onTouchMove={(e) => { handleTouchMove(e); tabSwipe.onTouchMove(e); }}
                onTouchEnd={(e) => { handleTouchEnd(e); tabSwipe.onTouchEnd(e); }}
                className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: 24, zIndex: 10, transform: `translateY(${pullDistance}px)`, transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 6px' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dim)' }}>Groups</span>
                            {/* Only meaningful once signed in — signed-out
                                visitors already see every public group in
                                the list below, so there's nothing left to
                                "explore" separately. */}
                            {userId && (
                              <button
                                className="touch-bounce"
                                onClick={() => { hapticTap(); setExploreOpen(true); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'var(--tab-track)', color: 'var(--paper)', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                              >
                                {Icons.Compass} Explore more
                              </button>
                            )}
                          </div>
                          {groups.length === 0 ? (
                            <div style={{ padding: '4px 24px 8px' }}>
                              <p style={{ fontSize: 13.5, color: 'var(--dim)', lineHeight: 1.4 }}>
                                {userId ? "You haven't joined any channels yet — tap Explore more to find one." : 'No public channels yet.'}
                              </p>
                            </div>
                          ) : (
                            <>
                              {groups.map((group, index) => {
                                const isActive = activeChatId === group.slug && activeChatType === 'group';
                                const identity = { name: group.name, avatar_url: group.cover_url, is_admin: false };
                                return (
                                  <button key={group.id} className={`chat-row group-row stagger-item ${isActive ? 'active-chat' : ''}`} style={{ animationDelay: `${index * 0.04}s` }} onClick={() => handleOpenGroup(group.slug)}>
                                    <LiquidAvatar identity={identity} size={50} kind="group" />
                                    <div className="chat-row-content">
                                      <span style={{ fontWeight: 600, fontSize: 16, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
                                      <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{group.description || 'Public Channel'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                      {group.unread_mention && <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ember)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>@</div>}
                                      {(group.unread_count || 0) > 0 && (
                                        <div style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, background: 'var(--signal)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          {group.unread_count > 99 ? '99+' : group.unread_count}
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {userId && threads.length > 0 && (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dim)', padding: '24px 24px 6px' }}>Direct Messages</div>
                              {threads.map((thread, index) => {
                                const otherId = thread.bot_id || (thread.user_a === userId ? thread.user_b : thread.user_a);
                                const isActive = activeChatId === otherId && activeChatType === 'dm';
                                const identity = displayIdentity(thread.otherUser); 
                                return (
                                  <button key={thread.id} className={`chat-row stagger-item ${isActive ? 'active-chat' : ''}`} style={{ animationDelay: `${(groups.length + index) * 0.04}s` }} onClick={() => handleOpenChat(otherId, 'dm', thread.otherUser?.username)}>
                                    <LiquidAvatar identity={identity} size={50} />
                                    <div className="chat-row-content">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                        <span style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{identity.name}{identity.is_admin && <span style={{ color: 'var(--admin-1)' }}>{Icons.AdminShield}</span>}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingLeft: 8 }}>
                                          {thread.unread_mention && <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--ember)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>@</div>}
                                          {(thread.unread_count || 0) > 0 && (
                                            <div style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--signal)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                              {thread.unread_count > 99 ? '99+' : thread.unread_count}
                                            </div>
                                          )}
                                          <span style={{ fontSize: 12, color: 'var(--dim)' }}>{formatTelegramTime(thread.last_message_at || thread.created_at)}</span>
                                        </div>
                                      </div>
                                      <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{thread.last_message_preview || 'Tap to view messages'}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {!userId && (
                            <div style={{ padding: '32px 24px 12px', textAlign: 'center' }}>
                              <p style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.4, marginBottom: 16 }}>Sign in to send direct messages and unlock Ask Me.</p>
                              <button className="touch-bounce" onClick={() => setAuthOpen(true)} style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 24, fontWeight: 700, fontSize: 14, boxShadow: '0 8px 24px rgba(47,111,255,0.3)' }}>Sign In</button>
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
                           <div style={{ width: 64, height: 64, background: 'var(--ink-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--ember)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                           </div>
                           <h3 style={{ margin: '0 0 12px 0', fontSize: 20, fontWeight: 800, color: 'var(--paper)' }}>Ask Me Anything</h3>
                           <p style={{ fontSize: 15, marginBottom: 28, color: 'var(--dim)', lineHeight: 1.5 }}>Create anonymous question links, share them on your story, and receive honest answers.</p>
                           <button className="touch-bounce" onClick={() => setAuthOpen(true)} style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 24, fontWeight: 700, fontSize: 15, boxShadow: '0 8px 24px rgba(47,111,255,0.3)' }}>Sign In to Create</button>
                        </div>
                      ) : (
                        <>
                          {/* SINGLE "ASK QUESTION" BUTTON (Matches Chat Layout) */}
                          <button 
                            className="chat-row stagger-item"
                            style={{ animationDelay: '0.05s', marginBottom: 12, width: '100%', marginLeft: 0 }}
                            onClick={(e) => { e.preventDefault(); hapticTap(); setCreateQuestionOpen(true); }}
                          >
                            <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--ember)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 28, fontWeight: 400, boxShadow: '0 4px 12px rgba(47,111,255,0.3)' }}>+</div>
                            <div className="chat-row-content">
                              <span style={{ fontWeight: 600, fontSize: 16, display: 'block', color: 'var(--paper)', marginBottom: 2 }}>Ask Question</span>
                              <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block' }}>Create a new anonymous link</span>
                            </div>
                          </button>

                          {/* "ADD CONFESSION" BUTTON — posts straight into the
                              public Confessions feed, no separate composer page.
                              Hidden entirely (not just disabled) whenever
                              storiesAvailable is false, since there'd be no
                              story feed for the confession to land in. */}
                          {storiesAvailable && (
                            <button
                              className="chat-row stagger-item"
                              style={{ animationDelay: '0.1s', marginBottom: 28, width: '100%', marginLeft: 0 }}
                              onClick={(e) => { e.preventDefault(); hapticTap(); setCreateConfessionOpen(true); }}
                            >
                              <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--ink-2)', color: 'var(--ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></svg>
                              </div>
                              <div className="chat-row-content">
                                <span style={{ fontWeight: 600, fontSize: 16, display: 'block', color: 'var(--paper)', marginBottom: 2 }}>Add Confession</span>
                                <span style={{ fontSize: 14, color: 'var(--dim)', display: 'block' }}>Post straight to the Confessions feed</span>
                              </div>
                            </button>
                          )}

                          <div className="stagger-item" style={{ animationDelay: '0.15s', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dim)', marginBottom: 16, marginLeft: 8 }}>My Questions</div>

                          {loadingList ? (
                            <div style={{ padding: '0' }}><MessageSkeleton variant="list-row" count={3} /></div>
                          ) : myQuestions.length === 0 ? (
                            <div className="stagger-item" style={{ animationDelay: '0.2s', padding: '20px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 15, background: 'rgba(255,255,255,0.03)', borderRadius: 16, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)' }}>
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
                <DirectMessages key={`dm-${activeChatId}`} openThreadWithUserId={activeChatId} onBack={closeActiveChat} onThreadReady={handleThreadReady} />
              ) : activeChatType === 'group' ? (
                <GroupChat key={`group-${activeChatId}`} groupSlug={activeChatId} onBack={closeActiveChat} onGroupResolved={handleGroupResolved} />
              ) : activeChatType === 'question' ? (
                
  <QuestionThread
    key={`question-${activeChatId}`}
    questionId={activeChatId}
    onBack={closeActiveChat}
    onShareReply={(question, reply) => setSharingReply({ question, reply })}
  />
) : null
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>
                <div style={{ marginBottom: 20, animation: 'pop-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{Icons.EmptyChat}</div>
                <p style={{ fontSize: 15, fontWeight: 600, background: 'var(--ink-2)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.2)', padding: '8px 20px', borderRadius: 24, color: 'var(--paper)' }}>Select a chat or question to view</p>
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
          <div style={{ width: '100%', maxWidth: 400, background: 'var(--ink-2)', borderRadius: '28px 28px 0 0', padding: '32px 24px 40px', boxShadow: 'var(--shadow-sheet)', textAlign: 'center', animation: 'slide-up-modal 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05)' }}>
            <div style={{ color: 'var(--ember)', marginBottom: 16, display: 'inline-flex', padding: 12, background: 'rgba(63,120,255,0.06)', borderRadius: '50%' }}>{Icons.Bell}</div>
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
<ExploreChannelsSheet open={exploreOpen} onClose={() => setExploreOpen(false)} groups={exploreGroups} onJoin={handleJoinGroup} joiningId={joiningGroupId} />
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
