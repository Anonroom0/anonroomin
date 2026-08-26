/** ===========================================================================
 * STORY VIEWER — full-screen IG/NGL-style story playback
 * ============================================================================
 * <StoryViewer channels startIndex onClose userId />
 *
 * `channels` is the array StoriesBar (prompt 27) builds. This file doesn't
 * have that component's source, so per the master context's instruction to
 * trust referenced shapes exactly as named, it assumes each entry looks
 * like:
 *   {
 *     type: 'group' | 'public-confessions' | 'public-questions',
 *     id:   string,        // group id for 'group'; a fixed key otherwise
 *     name: string,        // group display name (unused for virtual channels
 *                          // — those get the literal labels the prompt specifies)
 *     logoUrl: string|null,// group logo (unused for virtual channels)
 *     slug: string|null,   // group subdomain slug, for building share links
 *   }
 *
 * Body content:
 *   - 'group' / 'public-confessions' channels play confessions rows via the
 *     shared <ConfessionBubble size="story"/> (identical card everywhere
 *     else in the app).
 *   - 'public-questions' plays `questions` rows. It deliberately does NOT
 *     reuse ConfessionBubble — that component hardcodes a "Confession"
 *     header label and a "Reply" affordance baked into its own internal
 *     chrome, neither of which fits a question. Instead a small local
 *     <QuestionStoryCard> mirrors the same header-strip/glass-body shape
 *     for visual consistency, with no built-in interactive chrome of its
 *     own (interaction lives in this file's bottom bar, see below).
 *
 * Interaction model:
 *   - Tap the right/left half of the story area to move within the current
 *     channel; running past either end walks into the neighboring channel
 *     (landing on its first/last item respectively), skipping any channel
 *     that resolves to zero items in the last 24h.
 *   - A real swipe-left/right gesture also jumps straight to the
 *     next/previous channel, per the prompt's explicit "swipe-left at the
 *     channel's end" cue.
 *   - Judgment call: when chrome is hidden, the first tap only reveals it
 *     (doesn't also navigate) — standard story-viewer behavior, and it
 *     keeps "reveal" and "advance" from fighting over the same tap.
 *   - Header/bottom bar auto-hide after a few seconds of no interaction;
 *     any tap/swipe resets the timer. This is a distinct mechanism from
 *     ConfessionBubble's own internal story-mode chrome toggle — see the
 *     nav-zone overlay note below for why the two don't collide.
 *   - The nav-tap overlay is layered above the card so taps always resolve
 *     to navigation unambiguously; ConfessionBubble's own internal
 *     reply/react row therefore isn't reachable by pointer here. All real
 *     interaction (reply/answer input + reactions) lives in this file's
 *     own bottom bar instead, which is the "Bottom bar for ALL channel
 *     types" the prompt specifies as a first-class, always-present piece
 *     of chrome.
 *
 * Reply/answer backend, per channel type:
 *   - 'group': posts a normal row into group_messages (attributed to
 *     userId, is_confession: false) — "replies are sent normally in
 *     groups".
 *   - 'public-questions': posts into question_replies, anonymous-capable
 *     exactly like QuestionThread.jsx's insert (replier_id null + is_anon
 *     true for a signed-in user who wants to stay anon, or replier_id null
 *     + a cookie-style visitor_id for a fully anonymous visitor, matching
 *     the RLS policies in 0001_anonroom_v2.sql).
 *   - 'public-confessions': judgment call — there is no reply/comment table
 *     for a standalone (non-group) confession anywhere in the schema, so
 *     the text input is intentionally omitted for this channel type. The
 *     reaction bar still works everywhere, including here.
 * Reactions always post to `reactions` with target_type="confession"
 * against the current item's id, for all three channel types — exactly as
 * the prompt's own <ReactionBar targetType="confession" .../> snippet
 * specifies, even for question items (the schema has no "question" target
 * type to reach for).
 *
 * Dependencies: React, src/lib/supabaseClient, src/components/shared/
 * ConfessionBubble.jsx, src/components/shared/ReactionBar.jsx.
 * ========================================================================= */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../../lib/supabaseClient';
import ConfessionBubble from '../shared/ConfessionBubble';
import ReactionBar from '../shared/ReactionBar';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000; // stories are ephemeral: last 24h only
const IDLE_HIDE_MS = 4000;
const VISITOR_ID_KEY = 'anonroom_visitor_id';

// ============================================================================
// 1. DATA HELPERS
// ============================================================================

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
 * answers — the canonical helper QuestionThread.jsx presumably uses isn't
 * attached to this prompt, so this is a minimal stand-in with the same
 * cookie-ish persistence intent, kept private to this file. */
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
    // localStorage unavailable (private browsing, etc.) — fall back to a
    // session-only id so anon answers still work, just without persistence.
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function buildShareUrl(channel, item) {
  if (channel.type === 'public-questions') {
    return `${window.location.origin}/questions/${item.id}`;
  }
  if (channel.type === 'group' && channel.slug) {
    // Groups live on their own subdomain — mirrors ConfessionsFeed's
    // focusConfessionId deep-link pattern, just rooted at the group's host.
    return `https://${channel.slug}.anonroom.in/confessions?focus=${item.id}`;
  }
  return `${window.location.origin}/confessions?focus=${item.id}`;
}

// ============================================================================
// 2. QUESTION STORY CARD (local subcomponent — see banner for why this
//    isn't ConfessionBubble)
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

// ============================================================================
// 3. ICONS (small inline SVGs — no icon library dependency)
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

// ============================================================================
// 4. MAIN EXPORT
// ============================================================================

export default function StoryViewer({ channels, startIndex = 0, onClose, userId }) {
  const [chIndex, setChIndex] = useState(startIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [itemsCache, setItemsCache] = useState({});
  const [loadingCh, setLoadingCh] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);

  const idleTimerRef = useRef(null);
  const touchStartXRef = useRef(null);
  const skipDirRef = useRef(1);

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
      setChIndex(newIndex);
      setItemIndex(itemPos);
      setReplyText('');
      setMenuOpen(false);
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
    } else {
      goToChannel(chIndex + 1, { dir: 1, itemPos: 0 });
    }
  }

  function prevItem() {
    if (itemIndex > 0) {
      setItemIndex((i) => i - 1);
      setReplyText('');
    } else {
      goToChannel(chIndex - 1, { dir: -1, itemPos: -1 });
    }
  }

  function handleZoneTap(direction) {
    if (!chromeVisible) {
      // First tap while chrome is hidden only reveals it, per the header/
      // bottom-bar auto-hide spec — it doesn't also navigate.
      resetIdleTimer();
      return;
    }
    resetIdleTimer();
    if (direction === 'next') nextItem();
    else prevItem();
  }

  function handleTouchStart(e) {
    touchStartXRef.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
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
    >
      {/* Header */}
      <div
        style={{
          position: 'relative',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
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
        ) : null}

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
        }}
      >
        {loadingCh && !item && (
          <span style={{ color: 'var(--dim)', fontSize: 14 }}>Loading…</span>
        )}

        {item &&
          (channel.type === 'public-questions' ? (
            <QuestionStoryCard question={item} />
          ) : (
            <ConfessionBubble confession={item} size="story" userId={userId} />
          ))}

        {/* Nav-tap overlay — sits above the card so left/right taps always
            resolve to navigation unambiguously (see banner comment). */}
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
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px 18px',
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)',
        }}
      >
        {showComposer && (
          <>
            <input
              type="text"
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
  );
}
