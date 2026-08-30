/** ===========================================================================
 * STORY VIEWER — full-screen IG-style story playback
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabaseClient';
import ConfessionBubble from '../shared/ConfessionBubble';
import { buildQuestionPath, toShortId, getGroupUrl } from '../../lib/subdomain';
import ReactionBar from '../shared/ReactionBar';
import MediaViewer from '../../pages/MediaViewer';
import { hapticTap, hapticSelect } from '../../lib/haptics';
import { playTap } from '../../lib/soundManager';
import { generateStoryImage, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../lib/storyImageGenerator';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const IDLE_HIDE_MS = 4000;
const STORY_DURATION_MS = 6000;
const SEEN_KEY_PREFIX = 'anonroom_story_seen:';

// Gesture tuning — see the drag state block in StoryViewer for how these
// are used. Distances are in raw pixels of finger travel.
const AXIS_LOCK_PX = 8; // movement needed before a drag commits to x or y
const CLOSE_DISMISS_PX = 120; // swipe-down distance that dismisses the viewer
const REPLY_OPEN_PX = 90; // swipe-up distance that opens the reply action
const GROUP_SWITCH_PX = 70; // swipe-left/right distance that changes group

// ============================================================================
// 1. DATA HELPERS & MEDIA DETECTION
// ============================================================================

const QUESTION_REPLY_MARKER = /^❓ Re: "([\s\S]*?)"\n\n([\s\S]*)$/;

function parseQuestionReplyConfession(text) {
  if (!text) return null;
  const match = text.match(QUESTION_REPLY_MARKER);
  if (!match) return null;
  return { questionExcerpt: match[1], replyText: match[2] };
}

function channelSeenKey(channel) {
  return channel.type === 'group' ? `group:${channel.id}` : channel.type;
}

function markChannelSeen(channel, item) {
  if (!channel || !item?.created_at) return;
  try {
    const key = SEEN_KEY_PREFIX + channelSeenKey(channel);
    const existing = window.localStorage.getItem(key);
    if (!existing || new Date(item.created_at) > new Date(existing)) {
      window.localStorage.setItem(key, item.created_at);
    }
    window.dispatchEvent(new Event('anonroom:story-seen'));
  } catch {
    // Non-fatal
  }
}

function detectMediaType(url, explicitType) {
  if (explicitType === 'video' || explicitType === 'audio') return explicitType;
  if (!url) return 'image';
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v|mkv|3gp|quicktime)$/i.test(cleanUrl)) {
    return 'video';
  }
  if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(cleanUrl)) {
    return 'audio';
  }
  return explicitType || 'image';
}

async function loadChannelItems(channel) {
  const since = new Date(Date.now() - STORY_WINDOW_MS).toISOString();

  if (channel.type === 'group') {
    const { data, error } = await supabase
      .from('confessions')
      .select('*, profiles(username, avatar_url)')
      .eq('group_id', channel.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true }); 
    if (error) throw error;
    return data || [];
  }

  if (channel.type === 'public-confessions') {
    const { data, error } = await supabase
      .from('confessions')
      .select('*, profiles(username, avatar_url)')
      .is('group_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false }); 
    if (error) throw error;
    return data || [];
  }

  if (channel.type === 'public-questions') {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false }); 
    if (error) throw error;
    return data || [];
  }

  return [];
}

function buildShareUrl(channel, item) {
  if (channel.type === 'group' && channel.slug) {
    return `${getGroupUrl(channel.slug)}#story-${toShortId(item.id)}`;
  }
  return `${window.location.origin}/#story-${toShortId(item.id)}`;
}

// ============================================================================
// 2. STORY CARDS
// ============================================================================

export function QuestionStoryCard({ question }) {
  return (
    <div style={{ width: '70%', maxWidth: 340 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          borderRadius: '16px 16px 0 0',
          background: 'color-mix(in srgb, var(--signal) 16%, transparent)',
          border: '1px solid var(--glass-border)',
          borderBottom: 'none',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: 'var(--signal)',
          }}
        >
          {question.question_type === 'personal' ? 'Ask Me Anything' : 'Question'}
        </span>
      </div>
      <div
        style={{
          background: 'var(--glass-white)',
          border: '1px solid var(--glass-border)',
          borderTop: 'none',
          borderRadius: '0 0 20px 20px',
          padding: '20px 20px',
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: 'var(--paper)',
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textAlign: 'center',
          }}
        >
          {question.text}
        </div>
      </div>
    </div>
  );
}

// A confession posted with a "Customize" story style (see
// CreateConfessionModal.jsx + the 0002 migration's story_style column)
// stores only the chosen preset ids — no image was ever uploaded. This
// renders the actual story image on demand, client-side, through the exact
// same generateStoryImage() pipeline the Share Story sheet uses, so what
// shows up here always matches what a "real" shared story would look like.
function CustomizedConfessionCard({ confession }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const urlRef = useRef(null);

  // Same is_anon gating as ConfessionBubble's own overlay — only shown for
  // non-anonymous confessions, using whichever author fields are present
  // (joined `profiles` from loadChannelItems, or flat author_username /
  // author_avatar_url from a caller that already has them locally).
  const authorUsername = !confession.is_anon ? (confession.profiles?.username || confession.author_username || null) : null;
  const authorAvatarUrl = !confession.is_anon ? (confession.profiles?.avatar_url || confession.author_avatar_url || null) : null;
  const showAuthorOverlay = Boolean(authorUsername || authorAvatarUrl);

  useEffect(() => {
    let cancelled = false;
    generateStoryImage({
      kind: 'reply',
      questionText: '',
      replyText: confession.text || '',
      badgeLabel: 'CONFESSION',
      backgroundId: confession.story_style?.backgroundId,
      colorId: confession.story_style?.colorId,
      shapeId: confession.story_style?.shapeId,
      scaleId: confession.story_style?.scaleId,
      template: 'basic',
    })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPreviewUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [confession.id, confession.text, confession.story_style]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return (
    <div
      style={{
        width: '70%',
        maxWidth: 340,
        aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
        borderRadius: 20,
        overflow: 'hidden',
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        position: 'relative',
      }}
    >
      {showAuthorOverlay && (
        <div
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 2,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px 3px 3px', borderRadius: 999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          }}
        >
          {authorAvatarUrl ? (
            <img src={authorAvatarUrl} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {(authorUsername || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {authorUsername ? `@${authorUsername}` : 'Someone'}
          </span>
        </div>
      )}
      {previewUrl ? (
        <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14 }}>
          Loading…
        </div>
      )}
    </div>
  );
}

function ConfessionOrQuestionReplyCard({ item, userId, onPhotoClick }) {
  const parsed = useMemo(() => parseQuestionReplyConfession(item.text), [item.text]);

  // A customized confession takes priority over the plain rendering below —
  // it's the author's own chosen story style, not a synced Q&A reply.
  if (item.story_style && item.text) {
    return <CustomizedConfessionCard confession={item} />;
  }

  if (!parsed) {
    return <ConfessionBubble confession={item} size="story" userId={userId} onPhotoClick={onPhotoClick} />;
  }

  const cleanedItem = { ...item, text: parsed.replyText };

  return (
    <div style={{ width: '70%', maxWidth: 340 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 16,
          background: 'color-mix(in srgb, var(--ember) 16%, transparent)',
          border: '1px solid var(--glass-border)',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--ember)', flexShrink: 0 }}>
          Answered
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: 'var(--dim)',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          "{parsed.questionExcerpt}"
        </span>
      </div>
      <ConfessionBubble confession={cleanedItem} size="story" userId={userId} onPhotoClick={onPhotoClick} />
    </div>
  );
}

// ============================================================================
// 3. ICONS
// ============================================================================

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function ChevronIcon({ dir }) {
  const points = dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={points} />
    </svg>
  );
}

function RepliesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

// ============================================================================
// 4. SEGMENTED PROGRESS BAR
// ============================================================================
function ProgressBar({ count, activeIndex, progress }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 12px 0' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.28)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 999,
              background: '#fff',
              width: i < activeIndex ? '100%' : i === activeIndex ? `${progress * 100}%` : '0%',
              transition: i === activeIndex ? 'none' : 'width 150ms ease',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 5. MAIN EXPORT
// ============================================================================

export default function StoryViewer({ channels, startIndex = 0, initialItemId, onClose, userId, onViewReplies, onChannelChange }) {
  const [chIndex, setChIndex] = useState(startIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [itemsCache, setItemsCache] = useState({});
  const [loadingCh, setLoadingCh] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [paused, setPaused] = useState(false);
  const [slideDir, setSlideDir] = useState(null); 
  const [slideKey, setSlideKey] = useState(0);
  
  const [viewerMedia, setViewerMedia] = useState(null);

  // Live drag state driving the fluid gesture system below — updated on
  // every pointermove so the card tracks the finger 1:1 while a gesture is
  // in progress, then either completes (channel switch / close / reply) or
  // springs back to 0 on release. `axis` is locked to whichever direction
  // (x or y) crosses AXIS_LOCK_PX first, so a mostly-vertical drag can't
  // accidentally also read as a horizontal one and vice versa.
  const [drag, setDrag] = useState({ x: 0, y: 0, axis: null, active: false, releasing: false });
  const dragStartRef = useRef({ x: 0, y: 0, t: 0 });
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const idleTimerRef = useRef(null);
  const skipDirRef = useRef(1);
  const rafRef = useRef(null);
  const progressStartRef = useRef(null);
  const holdTimerRef = useRef(null);
  
  const initialItemConsumedRef = useRef(false);

  const channel = channels && channels[chIndex];
  const items = itemsCache[chIndex] || [];
  const item = items[itemIndex >= 0 ? itemIndex : 0];

  useEffect(() => {
    if (channel) onChannelChange?.(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const resetIdleTimer = useCallback(() => {
    setChromeVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setChromeVisible(false), IDLE_HIDE_MS);
  }, []);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [chIndex, itemIndex, resetIdleTimer]);

  const goToChannel = useCallback(
    (newIndex, opts = {}) => {
      const { itemPos = 0, dir = 1 } = opts;
      skipDirRef.current = dir;
      if (!channels || newIndex < 0 || newIndex >= channels.length) {
        onClose?.();
        return;
      }
      setSlideDir(dir > 0 ? 'from-right' : 'from-left');
      setSlideKey((k) => k + 1);
      setChIndex(newIndex);
      setItemIndex(itemPos);
      setMenuOpen(false);
      setProgress(0);
    },
    [channels, onClose]
  );

  useEffect(() => {
    if (!channel) return undefined;
    if (itemsCache[chIndex]) return undefined;

    let cancelled = false;
    setLoadingCh(true);
    loadChannelItems(channel)
      .then((loaded) => {
        if (cancelled) return;
        setItemsCache((prev) => ({ ...prev, [chIndex]: loaded }));
        setLoadingCh(false);
        
        if (loaded.length === 0) {
          goToChannel(chIndex + skipDirRef.current, { dir: skipDirRef.current });
        } else if (initialItemId && !initialItemConsumedRef.current && chIndex === startIndex) {
          initialItemConsumedRef.current = true;
          const targetIdx = loaded.findIndex(i => i.id === initialItemId);
          if (targetIdx > 0) {
            setItemIndex(targetIdx);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load story channel:', err);
        setLoadingCh(false);
        goToChannel(chIndex + skipDirRef.current, { dir: skipDirRef.current });
      });

    return () => {
      cancelled = true;
    };
  }, [channel, chIndex, itemsCache, goToChannel, initialItemId, startIndex]);

  useEffect(() => {
    if (itemIndex === -1 && itemsCache[chIndex]) {
      setItemIndex(Math.max(itemsCache[chIndex].length - 1, 0));
    }
  }, [itemIndex, itemsCache, chIndex]);

  function nextItem() {
    if (itemIndex < items.length - 1) {
      setItemIndex((i) => i + 1);
      setProgress(0);
    } else {
      goToChannel(chIndex + 1, { dir: 1, itemPos: 0 });
    }
  }

  function prevItem() {
    if (itemIndex > 0) {
      setItemIndex((i) => i - 1);
      setProgress(0);
    } else {
      goToChannel(chIndex - 1, { dir: -1, itemPos: -1 });
    }
  }

  function handleZoneTap(direction) {
    if (!chromeVisible) {
      resetIdleTimer();
      return;
    }
    hapticSelect();
    playTap();
    resetIdleTimer();
    if (direction === 'next') nextItem();
    else prevItem();
  }

  // Story Auto-Advance (Pauses when MediaViewer is opened)
  useEffect(() => {
    if (!item || paused || menuOpen || viewerMedia) {
      progressStartRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return undefined;
    }

    progressStartRef.current = performance.now() - progress * STORY_DURATION_MS;

    function tick(now) {
      const elapsed = now - progressStartRef.current;
      const pct = Math.min(elapsed / STORY_DURATION_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        nextItem();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, chIndex, itemIndex, paused, menuOpen, viewerMedia]);

  function handlePressStart() {
    holdTimerRef.current = setTimeout(() => setPaused(true), 180);
  }
  function handlePressEnd() {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setPaused(false);
  }

  // Swipe-up on the card is the fluid equivalent of tapping "Reply in
  // chat…" / "Answer…" at the bottom — whichever this channel type
  // supports. No-op (just springs back) for channel types with no reply
  // action, e.g. public-confessions.
  const triggerReplyIntent = useCallback(() => {
    if (!channel || !item) return;
    if (channel.type === 'group') {
      const sourceId = item.source_message_id || item.id;
      window.location.href = `${getGroupUrl(channel.slug)}#reply-${toShortId(sourceId)}`;
    } else if (channel.type === 'public-questions') {
      onViewReplies?.(item.id);
    }
  }, [channel, item, onViewReplies]);

  // ==========================================================================
  // Unified pointer-based gesture handling (touch, mouse, and pen alike).
  // One finger, three outcomes depending on the dominant axis of travel:
  //   - Horizontal past GROUP_SWITCH_PX  -> next/previous group (channel)
  //   - Vertical down past CLOSE_DISMISS_PX -> dismiss the viewer
  //   - Vertical up past REPLY_OPEN_PX      -> open the reply action
  // Short taps with no meaningful movement never lock an axis, so they fall
  // straight through to the existing left/right tap-zone onClick handlers
  // for prev/next-story navigation.
  // ==========================================================================
  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDrag({ x: 0, y: 0, axis: null, active: true, releasing: false });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    handlePressStart();
  }

  function handlePointerMove(e) {
    const current = dragRef.current;
    if (!current.active) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    let axis = current.axis;
    if (!axis) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis === 'y') e.preventDefault?.();
    setDrag({ x: axis === 'x' ? dx : 0, y: axis === 'y' ? dy : 0, axis, active: true, releasing: false });
  }

  function commitOrSpringBack() {
    const { x, y, axis } = dragRef.current;

    if (axis === 'x') {
      if (x <= -GROUP_SWITCH_PX) {
        resetIdleTimer();
        setDrag({ x: 0, y: 0, axis: null, active: false, releasing: false });
        goToChannel(chIndex + 1, { dir: 1, itemPos: 0 });
        return;
      }
      if (x >= GROUP_SWITCH_PX) {
        resetIdleTimer();
        setDrag({ x: 0, y: 0, axis: null, active: false, releasing: false });
        goToChannel(chIndex - 1, { dir: -1, itemPos: -1 });
        return;
      }
    } else if (axis === 'y') {
      if (y >= CLOSE_DISMISS_PX) {
        hapticTap();
        setDrag({ x: 0, y: (typeof window !== 'undefined' ? window.innerHeight : 800), axis: 'y', active: false, releasing: true });
        setTimeout(() => onClose?.(), 200);
        return;
      }
      if (y <= -REPLY_OPEN_PX) {
        hapticSelect();
        playTap();
        triggerReplyIntent();
      }
    }

    // Below every threshold (or an axis was never locked) — spring back.
    setDrag({ x: 0, y: 0, axis: null, active: false, releasing: true });
  }

  function handlePointerUp() {
    handlePressEnd();
    commitOrSpringBack();
  }

  function handlePointerCancel() {
    handlePressEnd();
    setDrag({ x: 0, y: 0, axis: null, active: false, releasing: true });
  }

  useEffect(() => {
    if (channel && item) markChannelSeen(channel, item);
  }, [channel, item]);

  async function handleShare() {
    if (!channel || !item) return;
    const url = buildShareUrl(channel, item);
    hapticSelect();
    playTap();
    setMenuOpen(false);
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Share failed:', err);
    }
  }

  if (!channel) return null;

  // A confession rendered via CustomizedConfessionCard (see above) draws
  // only the chosen text style into the canvas — any attached photo/video
  // is never shown anywhere in that card — so this button is the only way
  // to actually see the attachment for those. Harmless/redundant (but
  // still shown) for the plain ConfessionBubble rendering, which already
  // opens the same MediaViewer when its own photo is tapped directly.
  const itemMediaUrl = item ? (item.photo_url || item.media_url || '') : '';
  const itemMediaType = itemMediaUrl ? detectMediaType(itemMediaUrl, item.media_type) : '';

  const headerLabel =
    channel.type === 'group'
      ? channel.name
      : channel.type === 'public-confessions'
        ? 'Public Confessions'
        : 'Public Questions';

  // While actively dragging down to dismiss, the whole viewer follows the
  // finger and fades — a live preview of the close, not just a snap at the
  // end. Horizontal/reply drags leave the shell itself alone; only the
  // story card (below) moves for those.
  const closeDragY = drag.axis === 'y' && drag.y > 0 ? drag.y : 0;
  const closeDragProgress = Math.min(closeDragY / (CLOSE_DISMISS_PX * 2.2), 1);
  const shellTransform = closeDragY > 0 ? `translateY(${closeDragY * 0.55}px) scale(${1 - closeDragProgress * 0.08})` : 'none';
  const shellOpacity = closeDragY > 0 ? Math.max(1 - closeDragProgress * 0.85, 0.15) : 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        touchAction: 'none',
        transform: shellTransform,
        opacity: shellOpacity,
        borderRadius: closeDragY > 0 ? 28 : 0,
        transition: drag.active ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, border-radius 260ms ease',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div style={{ position: 'relative', zIndex: 31, opacity: chromeVisible ? 1 : 0, transition: 'opacity 200ms ease' }}>
        <ProgressBar count={items.length || 1} activeIndex={itemIndex >= 0 ? itemIndex : 0} progress={progress} />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px 14px',
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)',
        }}
      >
        <button
          type="button"
          onClick={() => { hapticTap(); playTap(); onClose?.(); }}
          aria-label="Close"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--paper)',
            cursor: 'pointer',
            display: 'flex',
            padding: 4,
          }}
        >
          <BackIcon />
        </button>

        {channel.type === 'group' ? (
          channel.logoUrl ? (
            <img
              src={channel.logoUrl}
              alt=""
              style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'var(--glass-white)',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--paper)',
              }}
            >
              {(channel.name || '?').charAt(0).toUpperCase()}
            </div>
          )
        ) : (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: channel.type === 'public-questions' ? 'var(--signal)' : 'var(--ember)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {channel.type === 'public-questions' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></svg>
            )}
          </div>
        )}

        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--paper)', flex: 1 }}>
          {headerLabel}
        </span>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => { hapticTap(); playTap(); setMenuOpen((v) => !v); }}
            aria-label="More options"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--paper)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
            }}
          >
            <DotsIcon />
          </button>

          {menuOpen && (
            <div
              className="glass-panel bubble-enter"
              style={{
                position: 'absolute',
                right: 0,
                top: '110%',
                borderRadius: 14,
                overflow: 'hidden',
                minWidth: 120,
                zIndex: 40,
              }}
            >
              <button
                type="button"
                className="chat-row"
                onClick={handleShare}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--paper)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Share
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        onClick={(e) => {
          // Tapping/clicking anywhere in this area pages through stories —
          // left half = previous, right half = next — exactly like a
          // native IG story, and works identically for touch taps and
          // mouse clicks since both fire a normal DOM 'click'. Interactive
          // elements inside the card (the photo/video trigger, etc.) call
          // stopPropagation() on their own onClick so tapping those still
          // opens the media viewer instead of also paging the story.
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          handleZoneTap(clickX < rect.width / 2 ? 'prev' : 'next');
        }}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        {loadingCh && !item && (
          <span style={{ color: 'var(--dim)', fontSize: 14 }}>Loading…</span>
        )}

        {item && (
          // Outer wrapper carries the *live* drag transform (follows the
          // finger 1:1 while dragging, springs back with a transition once
          // released) — kept separate from the inner div's slide-in
          // keyframe so the two never fight over `transform`/`animation`.
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              transform:
                drag.axis === 'x'
                  ? `translateX(${drag.x}px) rotate(${drag.x / 90}deg)`
                  : drag.axis === 'y' && drag.y < 0
                    ? `translateY(${Math.max(drag.y, -60)}px)`
                    : 'none',
              opacity: drag.axis === 'x' ? Math.max(1 - Math.abs(drag.x) / 500, 0.55) : 1,
              transition: drag.active ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease',
            }}
          >
            <div
              key={slideKey}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 21,
                animation: slideDir
                  ? `story-slide-${slideDir} 320ms cubic-bezier(0.22, 1, 0.36, 1)`
                  : 'story-pop-in 220ms ease-out',
              }}
            >
              {channel.type === 'public-questions' ? (
                <QuestionStoryCard question={item} />
              ) : (
                <ConfessionOrQuestionReplyCard 
                  item={item} 
                  userId={userId} 
                  onPhotoClick={(c) => {
                    const mediaUrl = c.photo_url || c.media_url;
                    const mediaType = detectMediaType(mediaUrl, c.media_type);
                    setViewerMedia({ url: mediaUrl, type: mediaType });
                  }}
                />
              )}
            </div>
          </div>
        )}

        {chromeVisible && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleZoneTap('prev'); }}
              aria-label="Previous"
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                zIndex: 25, width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(0,0,0,0.35)', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                backdropFilter: 'blur(6px)',
              }}
            >
              <ChevronIcon dir="left" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleZoneTap('next'); }}
              aria-label="Next"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                zIndex: 25, width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(0,0,0,0.35)', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                backdropFilter: 'blur(6px)',
              }}
            >
              <ChevronIcon dir="right" />
            </button>
          </>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '12px 16px 18px',
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)',
        }}
      >
        {channel.type === 'public-questions' && item && (
          <button
            type="button"
            onClick={() => onViewReplies?.(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              alignSelf: 'center',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13.5,
              borderRadius: 999,
              padding: '8px 18px',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            <RepliesIcon /> See all replies
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {channel.type === 'group' && (
            <button
              type="button"
              onClick={triggerReplyIntent}
              style={{
                flex: 1,
                background: 'var(--glass-white)',
                border: '1px solid var(--glass-border)',
                borderRadius: 999,
                padding: '10px 16px',
                color: 'var(--paper)',
                fontSize: 14,
                textAlign: 'left',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              Reply in chat…
            </button>
          )}

          {channel.type === 'public-questions' && (
            <button
              type="button"
              onClick={triggerReplyIntent}
              style={{
                flex: 1,
                background: 'var(--glass-white)',
                border: '1px solid var(--glass-border)',
                borderRadius: 999,
                padding: '10px 16px',
                color: 'var(--paper)',
                fontSize: 14,
                textAlign: 'left',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              Answer…
            </button>
          )}

          {itemMediaUrl && (
            <button
              type="button"
              onClick={() => { hapticTap(); playTap(); setViewerMedia({ url: itemMediaUrl, type: itemMediaType }); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13.5,
                borderRadius: 999,
                padding: '10px 16px',
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
              }}
            >
              📎 View attachment
            </button>
          )}

          {item && (
            <div style={{ marginLeft: channel.type !== 'public-confessions' ? 0 : 'auto' }}>
              <ReactionBar targetType="confession" targetId={item.id} userId={userId} />
            </div>
          )}
        </div>
      </div>
      
      {/* MediaViewer Modal with pause synchronization */}
      <MediaViewer 
        mediaUrl={viewerMedia?.url} 
        mediaType={viewerMedia?.type} 
        open={viewerMedia !== null} 
        onClose={() => setViewerMedia(null)} 
      />

      <style>{`
        @keyframes story-slide-from-right {
          0% { opacity: 0; transform: translateX(28px) scale(0.98); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes story-slide-from-left {
          0% { opacity: 0; transform: translateX(-28px) scale(0.98); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes story-pop-in {
          0% { opacity: 0; transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
