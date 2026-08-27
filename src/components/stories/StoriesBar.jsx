/** ===========================================================================
 * STORIES BAR
 * ============================================================================
 * <StoriesBar groups userId onOpenStory={(channels, startIndex) => {}} />
 *
 * Horizontal row mounted on Home.jsx just below the search bar.
 *
 * Circles shown, left to right:
 *   1. every group that has at least one confession posted in the last 24h,
 *      in this bar's left-to-right order.
 *   2. 'Confessions' — always present, opens the public confessions story
 *      reel (non-group, non-question posts).
 *   3. 'Questions' — always present, opens the public questions story reel
 *      (questions + question replies that were added to Confessions get
 *      surfaced here too — see StoryViewer.jsx).
 *
 * This order matters beyond display: it's also the chaining order
 * StoryViewer walks when a story ends (swipe/auto-advance past the last
 * item in a channel moves into the next channel in this array) — so
 * finishing the last group's story flows into Confessions, and finishing
 * Confessions flows into Questions, before the reel closes.
 *
 * LAYOUT — Instagram/Telegram style, no horizontal scrolling:
 * the row measures its own width (see useRowWidth below) and computes one
 * explicit pixel diameter for every circle from that width and the item
 * count, so circles sit right next to each other (small fixed px gap, not
 * a CSS `gap`) and shrink together as more stories appear — never a scroll
 * rail. Width and height are both set to that same literal pixel number
 * (not `aspect-ratio` or a percentage trick), so every circle is a true
 * circle regardless of what the renderer does or doesn't support. Each
 * circle carries its name underneath in a small, truncated label
 * (Instagram-style), bold/bright when unseen and dimmed once viewed.
 *
 * FIX (this pass) — "3 pages / only one giant circle" bug:
 * Root cause was two-fold:
 *  1. Circle size was computed from raw rowWidth without subtracting this
 *     row's own horizontal padding, and that computed number was the ONLY
 *     thing keeping circles small — a single bad measurement (0, a stale
 *     value from a mid-layout read, or a race before ResizeObserver's
 *     first callback) could produce a value that, even after Math.min,
 *     still didn't behave because of how it interacted with a flex parent
 *     that had no `minWidth: 0` (see Home.jsx) — so the strip could blow
 *     out to occupy far more than one screen's width, which is what
 *     rendered as "3 different pages" when scrolled.
 *  2. There was no hard CSS ceiling independent of the JS math — if the
 *     computed `size` value was ever wrong for any reason, nothing stopped
 *     a single circle from rendering oversized and, combined with
 *     `overflow: hidden` on the row, visually swallowing the other circles
 *     (Confessions/Questions were still in the DOM — just pushed offscreen).
 *
 * Fixes applied:
 *  - `usableWidth` subtracts the row's own padding before dividing.
 *  - `justifyContent: 'flex-start'` is now explicit (not just relying on
 *    flex default) so the row can never render centered.
 *  - `minWidth: 0` + `boxSizing: 'border-box'` on the row so it's a
 *    proper shrinkable flex child (pair with the matching Home.jsx change
 *    noted at the bottom of this file's usage).
 *  - Every circle now also gets a hard inline `maxWidth`/`maxHeight` cap of
 *    CIRCLE_MAX as a CSS-level safety net — independent of whatever the JS
 *    size math produces, so a single circle can never blow out the row.
 *  - Pre-measurement fallback size is now CIRCLE_MIN, not CIRCLE_MAX, so
 *    there's no flash of an oversized circle before the first real
 *    measurement lands.
 *
 * Seen/unseen ring: each circle gets a lit conic-gradient ring when it has
 * content newer than the last time this browser opened it, and a flat dim
 * ring otherwise (still tappable — a dull ring is not "disabled", it's
 * "already seen"). Seen state is tracked per-channel in localStorage,
 * written by StoryViewer.jsx as items are viewed.
 *
 * channels is built in a fixed order that StoryViewer depends on:
 *   1. every group-with-new-confessions, in this bar's left-to-right order
 *   2. the virtual channel 'public-confessions'
 *   3. the virtual channel 'public-questions'
 * startIndex is the tapped circle's position within that same array.
 *
 * Dependencies: React, src/lib/supabaseClient
 * ========================================================================= */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabaseClient';

const RECENT_WINDOW_HOURS = 24;
const CIRCLE_MAX = 58;
const CIRCLE_MIN = 40;
const CIRCLE_GAP = 8; // fixed px gap between circles — not CSS `gap`
const ROW_PADDING_X = 10; // matches the container's `padding: '10px 10px'` below
const SEEN_KEY_PREFIX = 'anonroom_story_seen:';

function getInitials(name) {
  if (!name) return '#';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Reads the last-seen timestamp this browser recorded for a channel key
 * (see StoryViewer.jsx's markChannelSeen, which is the only writer). */
function getSeenAt(key) {
  try {
    return window.localStorage.getItem(SEEN_KEY_PREFIX + key);
  } catch {
    return null;
  }
}

function isUnseen(key, latestIso) {
  if (!latestIso) return false; // nothing to show as "new" at all
  const seenAt = getSeenAt(key);
  if (!seenAt) return true;
  return new Date(latestIso).getTime() > new Date(seenAt).getTime();
}

/** Measures the row container's actual rendered width so circle diameter
 * can be computed as plain px math (see StoriesBar body) instead of
 * leaning on flexbox grow/shrink or CSS tricks to do it implicitly.
 * Runs in useLayoutEffect (not useEffect) so the real width is known
 * before first paint. Starts at 0 (handled by the CIRCLE_MIN fallback
 * below, not CIRCLE_MAX) so there's never a flash of an oversized row. */
function useRowWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return [ref, width];
}

// ============================================================================
// CIRCLE ICONS for the two always-on virtual channels
// ============================================================================
function ConfessionsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01" /><path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  );
}

function QuestionsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ============================================================================
// SHARED CIRCLE — Instagram/Telegram-style: ring + avatar + name label.
// `size` is a literal pixel number computed by the row (see useRowWidth),
// applied to width AND height directly so the circle can't warp into an
// oval no matter what the renderer does with aspect-ratio/percentages.
// maxWidth/maxHeight are a hard CSS-level cap independent of that JS math —
// this is the safety net that stops a single circle from ever blowing out
// the row, even if `size` is ever computed wrong for any reason.
// ============================================================================
function StoryCircle({ onClick, ring, name, size, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="touch-bounce"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: 'none',
        background: 'transparent',
        padding: 0,
        margin: 0,
        marginRight: CIRCLE_GAP,
        cursor: 'pointer',
        flexShrink: 0,
        width: size,
        maxWidth: CIRCLE_MAX,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          maxWidth: CIRCLE_MAX,
          maxHeight: CIRCLE_MAX,
          borderRadius: '50%',
          padding: 2.5,
          boxSizing: 'border-box',
          background: ring
            ? 'conic-gradient(from 220deg, #FFC966, #FF6B35, #FF3E7F, #C13584, #FFC966)'
            : 'var(--dim)',
          boxShadow: ring ? '0 0 0 1px rgba(255,107,53,0.15)' : 'none',
          transition: 'background 200ms ease',
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', padding: 2, boxSizing: 'border-box', background: 'var(--ink)' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--glass-white)',
              color: 'var(--paper)',
              fontWeight: 700,
              fontSize: Math.max(11, Math.round(size * 0.26)),
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <span
        style={{
          marginTop: 4,
          width: size,
          maxWidth: CIRCLE_MAX,
          textAlign: 'center',
          fontSize: 11,
          lineHeight: 1.2,
          fontWeight: ring ? 600 : 500,
          color: ring ? 'var(--paper)' : 'var(--dim)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </button>
  );
}

export default function StoriesBar({ groups, userId, onOpenStory }) {
  const [groupIdsWithConfessions, setGroupIdsWithConfessions] = useState(() => new Set());
  const [groupLatestAt, setGroupLatestAt] = useState({}); // group_id -> iso
  const [confessionsLatestAt, setConfessionsLatestAt] = useState(null);
  const [questionsLatestAt, setQuestionsLatestAt] = useState(null);
  // Bumped whenever the bar remounts/refreshes seen-state (e.g. coming back
  // from a story) so the ring recomputes against fresh localStorage reads.
  const [seenTick, setSeenTick] = useState(0);

  const [rowRef, rowWidth] = useRowWidth();

  const groupIds = useMemo(() => (groups || []).map((g) => g.id), [groups]);

  useEffect(() => {
    let isMounted = true;
    const sinceIso = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    // Groups: one batched query across every group id the bar is about to
    // render, rather than a query per group. Track the latest created_at
    // per group for the seen/unseen comparison.
    if (groupIds.length > 0) {
      supabase
        .from('confessions')
        .select('group_id, created_at')
        .in('group_id', groupIds)
        .gt('created_at', sinceIso)
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            console.error('Failed to load recent confessions for stories bar:', error.message);
            setGroupIdsWithConfessions(new Set());
            setGroupLatestAt({});
            return;
          }
          const ids = new Set();
          const latest = {};
          (data || []).forEach((row) => {
            ids.add(row.group_id);
            if (!latest[row.group_id] || row.created_at > latest[row.group_id]) {
              latest[row.group_id] = row.created_at;
            }
          });
          setGroupIdsWithConfessions(ids);
          setGroupLatestAt(latest);
        });
    } else {
      setGroupIdsWithConfessions(new Set());
      setGroupLatestAt({});
    }

    // Public confessions (group_id null) — latest timestamp in window.
    supabase
      .from('confessions')
      .select('created_at')
      .is('group_id', null)
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) { setConfessionsLatestAt(null); return; }
        setConfessionsLatestAt(data && data[0] ? data[0].created_at : null);
      });

    // Public questions — latest timestamp in window.
    supabase
      .from('questions')
      .select('created_at')
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) { setQuestionsLatestAt(null); return; }
        setQuestionsLatestAt(data && data[0] ? data[0].created_at : null);
      });

    return () => {
      isMounted = false;
    };
  }, [groupIds]);

  // Re-check seen-state when the tab regains focus (i.e. after closing a
  // story), so a just-viewed circle's ring/label go dull without a full reload.
  useEffect(() => {
    function refresh() { setSeenTick((t) => t + 1); }
    window.addEventListener('focus', refresh);
    window.addEventListener('anonroom:story-seen', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('anonroom:story-seen', refresh);
    };
  }, []);

  // Only groups with a fresh confession are actual story channels — this is
  // the array order StoryViewer depends on (after the two virtual ones).
  const highlightedGroups = useMemo(
    () => (groups || []).filter((g) => groupIdsWithConfessions.has(g.id)),
    [groups, groupIdsWithConfessions]
  );

  // StoryViewer expects every channel entry to be an object shaped like
  // { type, id, name, logoUrl, slug }.
  const channels = useMemo(
    () => [
      ...highlightedGroups.map((g) => ({
        type: 'group',
        id: g.id,
        name: g.name,
        logoUrl: g.cover_url || null,
        slug: g.slug || null,
      })),
      { type: 'public-confessions', id: 'public-confessions', name: 'Confessions', logoUrl: null, slug: null },
      { type: 'public-questions', id: 'public-questions', name: 'Questions', logoUrl: null, slug: null },
    ],
    [highlightedGroups]
  );

  function handleOpen(index) {
    onOpenStory(channels, index);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const confessionsUnseen = useMemo(() => isUnseen('public-confessions', confessionsLatestAt), [confessionsLatestAt, seenTick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const questionsUnseen = useMemo(() => isUnseen('public-questions', questionsLatestAt), [questionsLatestAt, seenTick]);

  // Single flat render list — groups first, then the two virtual channels —
  // Confessions and Questions are ALWAYS pushed here regardless of data, so
  // they must always render as circles even if a sizing bug ever makes one
  // circle too wide (see the hard maxWidth/maxHeight cap in StoryCircle,
  // which exists specifically so this list is never visually swallowed).
  const items = useMemo(
    () => [
      ...highlightedGroups.map((group, idx) => ({
        key: group.id,
        index: idx,
        name: group.name,
        ring: isUnseen(`group:${group.id}`, groupLatestAt[group.id]),
        render: () =>
          group.cover_url ? (
            <img src={group.cover_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            getInitials(group.name)
          ),
      })),
      {
        key: 'public-confessions',
        index: highlightedGroups.length,
        name: 'Confessions',
        ring: confessionsUnseen,
        render: () => <ConfessionsIcon />,
      },
      {
        key: 'public-questions',
        index: highlightedGroups.length + 1,
        name: 'Questions',
        ring: questionsUnseen,
        render: () => <QuestionsIcon />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlightedGroups, groupLatestAt, confessionsUnseen, questionsUnseen, seenTick]
  );

  // One explicit pixel diameter for every circle: divide the row's actual
  // *usable* width (measured clientWidth minus this row's own horizontal
  // padding — see ROW_PADDING_X) by the item count (minus the fixed gaps),
  // then clamp it — so circles sit snugly side by side and shrink together
  // as more stories qualify, with no scrolling and no flexbox guesswork.
  // Fallback while unmeasured (rowWidth === 0) is CIRCLE_MIN, not
  // CIRCLE_MAX — avoids a flash of an oversized row before first layout.
  const count = items.length || 1;
  const usableWidth = Math.max(0, rowWidth - ROW_PADDING_X * 2);
  const circleSize = usableWidth
    ? Math.max(CIRCLE_MIN, Math.min(CIRCLE_MAX, Math.floor((usableWidth - CIRCLE_GAP * count) / count)))
    : CIRCLE_MIN;

  return (
    <div
      ref={rowRef}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'flex-start', // explicit — never let this row center
        alignItems: 'flex-start',
        padding: '10px 10px',
        overflow: 'hidden', // never scroll — the whole strip shares the row
        width: '100%',
        minWidth: 0, // a flex child otherwise won't shrink below the
                     // intrinsic width of its (flexShrink:0) circle children
        boxSizing: 'border-box',
      }}
    >
      {items.map((item) => (
        <StoryCircle key={item.key} name={item.name} ring={item.ring} size={circleSize} onClick={() => handleOpen(item.index)}>
          {item.render()}
        </StoryCircle>
      ))}
    </div>
  );
}