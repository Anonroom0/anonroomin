/** ===========================================================================
 * STORY VIEWER — full-screen IG-style story playback
 * ============================================================================
 * <StoryViewer channels startIndex onClose userId onViewReplies? />
 *
 * `channels` is the array StoriesBar.jsx builds — groups (with fresh
 * confessions) first, then the two virtual channels 'public-confessions'
 * and 'public-questions', in that order. Each entry looks like:
 *   {
 *     type: 'group' | 'public-confessions' | 'public-questions',
 *     id:   string,
 *     name: string,
 *     logoUrl: string|null,
 *     slug: string|null,
 *   }
 *
 * Body content, one distinct treatment per type (never reused generically):
 *   - 'group': confessions posted inside that group, via the shared
 *     <ConfessionBubble size="story"/>.
 *   - 'public-confessions': standalone public confessions, same bubble.
 *     A confession that was actually posted as a question-reply (see
 *     QuestionThread.jsx's "Add to Confessions" flow, which tags the text
 *     with a small machine-readable marker) renders with an extra
 *     "Answered a question" strip quoting what it was replying to, so it
 *     reads as its own distinct kind of story rather than a plain
 *     confession.
 *   - 'public-questions' plays `questions` rows through a local
 *     <QuestionStoryCard>, with a "See all replies" button in the bottom
 *     bar (calls onViewReplies(questionId), wired to open QuestionThread).
 *
 * Progress bar: a segmented bar across the header, one segment per item in
 * the *current* channel — same visual language as Instagram. The active
 * segment fills over STORY_DURATION_MS and then auto-advances; completed
 * segments are solid, upcoming segments are empty. A press-and-hold pauses
 * the fill (and the chrome), same as IG's "hold to pause" behavior.
 *
 * Navigation:
 *   - Tap the right/left half of the story area to move within the current
 *     channel; running past either end walks into the neighboring channel
 *     (landing on its first/last item respectively), skipping any channel
 *     that resolves to zero items in the last 24h. Reaching the very end of
 *     the whole channel list closes the viewer.
 *   - Visible chevron nav buttons are layered over the tap zones purely for
 *     affordance/aesthetics — they trigger the exact same navigation as a
 *     tap, just discoverable without guessing.
 *   - A real swipe-left/right gesture jumps straight to the next/previous
 *     channel.
 *   - Whenever a channel boundary is crossed (tap-past-the-end, swipe, or
 *     auto-advance timeout at the last item), the new channel's card slides
 *     in from the appropriate side with a brief animation instead of
 *     popping in — this is the "end of channel" transition.
 *
 * Seen tracking: every time the active item changes, this writes a
 * per-channel "last seen" timestamp to localStorage (read by
 * StoriesBar.jsx to decide the ring highlight) and fires a
 * `anonroom:story-seen` window event so an already-mounted bar can refresh
 * without a reload.
 *
 * Reply/answer backend, per channel type — unchanged from before:
 *   - 'group': posts into group_messages (is_confession: false).
 *   - 'public-questions': posts into question_replies.
 *   - 'public-confessions': no composer — there's no comment table for a
 *     standalone confession, reactions still work.
 * Reactions always post to `reactions` with target_type="confession".
 *
 * Dependencies: React, src/lib/supabaseClient, src/components/shared/
 * ConfessionBubble.jsx, src/components/shared/ReactionBar.jsx.
 * ========================================================================= */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabaseClient';
import ConfessionBubble from '../shared/ConfessionBubble';
import { buildQuestionPath, toShortId } from '../../lib/subdomain';
import ReactionBar from '../shared/ReactionBar';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000; // stories are ephemeral: last 24h only
const IDLE_HIDE_MS = 4000;
const STORY_DURATION_MS = 6000; // per-item autoplay duration, IG-ish pace
const VISITOR_ID_KEY = 'anonroom_visitor_id';
const SEEN_KEY_PREFIX = 'anonroom_story_seen:';

// ============================================================================
// 1. DATA HELPERS
// ============================================================================

// Machine-readable marker QuestionThread.jsx's "Add to Confessions" flow
// stamps onto the confession text, so a question-reply-turned-confession can
// be told apart from a plain confession and still show what it answered.
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
    // localStorage unavailable — seen-state just won't persist, non-fatal.
  }
}

async function loadChannelItems(channel) {
  const since = new Date(Date.now() - STORY_WINDOW_MS).toISOString();

  if (channel.type === 'group') {
    const { data, error } = await supabase
      .from('confessions')
      .select('*')
      .eq('group_id', channel.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true }); // chronological, standard story order
    if (error) throw error;
    return data || [];
  }

  if (channel.type === 'public-confessions') {
    const { data, error } = await supabase
      .from('confessions')
      .select('*')
      .is('group_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false }); // spec: newest first
    if (error) throw error;
    return data || [];
  }

  if (channel.type === 'public-questions') {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false }); // same cadence as public-confessions
    if (error) throw error;
    return data || [];
  }

  return [];
}

/** Local, file-scoped visitor id for anonymous (unauthenticated) question
 * answers. */
function getOrCreateVisitorId() {
  try {
    let id = window.localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function buildShareUrl(channel, item) {
  if (channel.type === 'public-questions') {
    return `${window.location.origin}${buildQuestionPath(item.id)}`;
  }
  if (channel.type === 'group' && channel.slug) {
    return `https://${channel.slug}.anonroom.in/confessions?id=${toShortId(item.id)}`;
  }
  return `${window.location.origin}/confessions?id=${toShortId(item.id)}`;
}

// ============================================================================
// 2. STORY CARDS (one distinct look per content type)
// ============================================================================

export function QuestionStoryCard({ question }) {
  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
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

/** Wraps a plain <ConfessionBubble> with an "Answered a question" strip
 * when the underlying text carries the QUESTION_REPLY_MARKER — its own
 * distinct story type, separate from both a plain confession and a
 * question card, per the differentiate-everything requirement. */
function ConfessionOrQuestionReplyCard({ item, userId }) {
  const parsed = useMemo(() => parseQuestionReplyConfession(item.text), [item.text]);

  if (!parsed) {
    return <ConfessionBubble confession={item} size="story" userId={userId} />;
  }

  const cleanedItem = { ...item, text: parsed.replyText };

  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
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
      <ConfessionBubble confession={cleanedItem} size="story" userId={userId} />
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
// 4. SEGMENTED PROGRESS BAR (Instagram-style)
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

export default function StoryViewer({ channels, startIndex = 0, onClose, userId, onViewReplies }) {
  const [chIndex, setChIndex] = useState(startIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [itemsCache, setItemsCache] = useState({});
  const [loadingCh, setLoadingCh] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 fill of the active segment
  const [paused, setPaused] = useState(false);
  const [slideDir, setSlideDir] = useState(null); // 'from-right' | 'from-left' | null — channel-crossing animation
  const [slideKey, setSlideKey] = useState(0);

  const idleTimerRef = useRef(null);
  const touchStartXRef = useRef(null);
  const skipDirRef = useRef(1);
  const rafRef = useRef(null);
  const progressStartRef = useRef(null);
  const holdTimerRef = useRef(null);

  const channel = channels && channels[chIndex];
  const items = itemsCache[chIndex] || [];
  const item = items[itemIndex >= 0 ? itemIndex : 0];

  // ---- chrome auto-hide -----------------------------------------------
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

  // ---- channel navigation ----------------------------------------------
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
      setReplyText('');
      setMenuOpen(false);
      setProgress(0);
    },
    [channels, onClose]
  );

  // ---- load items for the active channel, skipping empty ones ----------
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
          // Skip empty channel entirely — don't show an empty story.
          goToChannel(chIndex + skipDirRef.current, { dir: skipDirRef.current });
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
  }, [channel, chIndex, itemsCache, goToChannel]);

  // Resolve the "-1 = last item" sentinel once that channel's items land.
  useEffect(() => {
    if (itemIndex === -1 && itemsCache[chIndex]) {
      setItemIndex(Math.max(itemsCache[chIndex].length - 1, 0));
    }
  }, [itemIndex, itemsCache, chIndex]);

  function nextItem() {
    if (itemIndex < items.length - 1) {
      setItemIndex((i) => i + 1);
      setReplyText('');
      setProgress(0);
    } else {
      goToChannel(chIndex + 1, { dir: 1, itemPos: 0 });
    }
  }

  function prevItem() {
    if (itemIndex > 0) {
      setItemIndex((i) => i - 1);
      setReplyText('');
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
    resetIdleTimer();
    if (direction === 'next') nextItem();
    else prevItem();
  }

  // ---- autoplay progress bar --------------------------------------------
  useEffect(() => {
    if (!item || paused || menuOpen) {
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
  }, [item, chIndex, itemIndex, paused, menuOpen]);

  // ---- press-and-hold to pause -------------------------------------------
  function handlePressStart() {
    holdTimerRef.current = setTimeout(() => setPaused(true), 180);
  }
  function handlePressEnd() {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setPaused(false);
  }

  function handleTouchStart(e) {
    touchStartXRef.current = e.touches[0].clientX;
    handlePressStart();
  }

  function handleTouchEnd(e) {
    handlePressEnd();
    if (touchStartXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(dx) < 50) return; // not a deliberate swipe
    resetIdleTimer();
    if (dx < 0) {
      goToChannel(chIndex + 1, { dir: 1, itemPos: 0 });
    } else {
      goToChannel(chIndex - 1, { dir: -1, itemPos: -1 });
    }
  }

  // ---- mark seen -----------------------------------------------------------
  useEffect(() => {
    if (channel && item) markChannelSeen(channel, item);
  }, [channel, item]);

  // ---- share -------------------------------------------------------------
  async function handleShare() {
    if (!channel || !item) return;
    const url = buildShareUrl(channel, item);
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

  // ---- reply / answer submit ---------------------------------------------
  async function submitGroupReply(text) {
    const { error } = await supabase.from('group_messages').insert({
      group_id: channel.id,
      user_id: userId,
      text,
      is_anon: false,
      is_confession: false,
    });
    if (error) throw error;
  }

  async function submitQuestionAnswer(text) {
    const payload = userId
      ? { question_id: item.id, replier_id: null, visitor_id: null, reply_text: text, is_anon: true }
      : {
          question_id: item.id,
          replier_id: null,
          visitor_id: getOrCreateVisitorId(),
          reply_text: text,
          is_anon: true,
        };
    const { error } = await supabase.from('question_replies').insert(payload);
    if (error) throw error;
  }

  async function handleSubmitReply() {
    if (!channel || !item || !replyText.trim() || posting) return;
    setPosting(true);
    try {
      if (channel.type === 'group') {
        await submitGroupReply(replyText.trim());
      } else if (channel.type === 'public-questions') {
        await submitQuestionAnswer(replyText.trim());
      }
      setReplyText('');
    } catch (err) {
      console.error('Failed to submit story reply:', err);
    } finally {
      setPosting(false);
    }
  }

  if (!channel) return null;

  const headerLabel =
    channel.type === 'group'
      ? channel.name
      : channel.type === 'public-confessions'
        ? 'Public Confessions'
        : 'Public Questions';

  const showComposer = channel.type !== 'public-confessions';
  const composerPlaceholder = channel.type === 'public-questions' ? 'Answer…' : 'Reply…';

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
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
    >
      {/* Segmented progress bar — Instagram-style */}
      <div style={{ position: 'relative', zIndex: 31, opacity: chromeVisible ? 1 : 0, transition: 'opacity 200ms ease' }}>
        <ProgressBar count={items.length || 1} activeIndex={itemIndex >= 0 ? itemIndex : 0} progress={progress} />
      </div>

      {/* Header */}
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
          onClick={() => onClose?.()}
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
            onClick={() => setMenuOpen((v) => !v)}
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

      {/* Body */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
          overflow: 'hidden',
        }}
      >
        {loadingCh && !item && (
          <span style={{ color: 'var(--dim)', fontSize: 14 }}>Loading…</span>
        )}

        {item && (
          <div
            key={slideKey}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              animation: slideDir
                ? `story-slide-${slideDir} 320ms cubic-bezier(0.22, 1, 0.36, 1)`
                : 'story-pop-in 220ms ease-out',
            }}
          >
            {channel.type === 'public-questions' ? (
              <QuestionStoryCard question={item} />
            ) : (
              <ConfessionOrQuestionReplyCard item={item} userId={userId} />
            )}
          </div>
        )}

        {/* Visible chevron nav buttons — pure affordance, same action as a
            tap on the underlying zone. */}
        {chromeVisible && (
          <>
            <button
              type="button"
              onClick={() => handleZoneTap('prev')}
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
              onClick={() => handleZoneTap('next')}
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

        {/* Nav-tap overlay — sits above the card so left/right taps always
            resolve to navigation unambiguously; sits below the chevrons. */}
        <div
          onClick={() => handleZoneTap('prev')}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', zIndex: 20 }}
        />
        <div
          onClick={() => handleZoneTap('next')}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', zIndex: 20 }}
        />
      </div>

      {/* Bottom bar */}
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
          {showComposer && (
            <>
              <input
                type="text"
                name="story-reply"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                data-form-type="other"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitReply();
                }}
                placeholder={composerPlaceholder}
                disabled={channel.type === 'group' && !userId}
                style={{
                  flex: 1,
                  background: 'var(--glass-white)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 999,
                  padding: '10px 16px',
                  color: 'var(--paper)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSubmitReply}
                disabled={!replyText.trim() || posting}
                style={{
                  border: 'none',
                  background: 'var(--ember)',
                  color: 'var(--paper)',
                  fontWeight: 700,
                  fontSize: 14,
                  borderRadius: 999,
                  padding: '10px 18px',
                  cursor: replyText.trim() && !posting ? 'pointer' : 'default',
                  opacity: replyText.trim() && !posting ? 1 : 0.5,
                }}
              >
                Send
              </button>
            </>
          )}

          {item && (
            <div style={{ marginLeft: showComposer ? 0 : 'auto' }}>
              <ReactionBar targetType="confession" targetId={item.id} userId={userId} />
            </div>
          )}
        </div>
      </div>

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
