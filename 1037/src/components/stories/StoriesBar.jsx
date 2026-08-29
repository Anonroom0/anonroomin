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
 * LAYOUT — Instagram-style: every circle renders at a fixed diameter
 * (CIRCLE_SIZE) with a fixed gap (CIRCLE_GAP) between them — nothing ever
 * shrinks to fit. When there are more circles than fit on screen, the row
 * scrolls horizontally (no visible scrollbar — see .hide-scrollbar in
 * src/styles/animations.css), exactly like Instagram's own story tray.
 * Each circle carries its name underneath in a small, truncated label
 * (Instagram-style), bold/bright when unseen and dimmed once viewed.
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

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../../lib/supabaseClient';
import { hapticTap } from '../../lib/haptics';
import { playTap } from '../../lib/soundManager';

const RECENT_WINDOW_HOURS = 24;
const CIRCLE_SIZE = 64; // fixed diameter, IG-style — circles never shrink to fit
const CIRCLE_GAP = 14; // fixed px gap between circles — IG spacing, not CSS `gap`
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
// SHARED CIRCLE — Instagram-style: ring + avatar + name label, always a
// fixed CIRCLE_SIZE so it can't warp or shrink regardless of item count.
// ============================================================================
function StoryCircle({ onClick, ring, name, children }) {
  return (
    <button
      type="button"
      onClick={() => { hapticTap(); playTap(); onClick?.(); }}
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
        width: CIRCLE_SIZE,
      }}
    >
      <div
        style={{
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
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
              fontSize: 17,
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <span
        style={{
          marginTop: 4,
          width: CIRCLE_SIZE,
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

export default function StoriesBar({ groups, userId, onOpenStory, initialTarget, onConsumeInitialTarget }) {
  const [groupIdsWithConfessions, setGroupIdsWithConfessions] = useState(() => new Set());
  const [groupLatestAt, setGroupLatestAt] = useState({}); // group_id -> iso
  const [confessionsLatestAt, setConfessionsLatestAt] = useState(null);
  const [questionsLatestAt, setQuestionsLatestAt] = useState(null);
  // Bumped whenever the bar remounts/refreshes seen-state (e.g. coming back
  // from a story) so the ring recomputes against fresh localStorage reads.
  const [seenTick, setSeenTick] = useState(0);

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

  // Direct-link support: a /stories/<type>[/<slug>] URL hit directly (or a
  // page refresh while a story was open — see Home.jsx's popstate handling)
  // arrives here as `initialTarget` before `channels` has necessarily
  // resolved (group-with-fresh-confessions membership is async). Once
  // `channels` reflects the real data, find the matching entry and open it
  // exactly once; onConsumeInitialTarget lets the parent clear the target so
  // this doesn't refire on every subsequent channels recompute.
  useEffect(() => {
    if (!initialTarget) return;
    const idx = channels.findIndex((c) => {
      if (c.type !== initialTarget.type) return false;
      return initialTarget.type === 'group' ? c.slug === initialTarget.slug : true;
    });
    if (idx !== -1) {
      onOpenStory(channels, idx);
      onConsumeInitialTarget?.();
    }
    // If not found yet, it may just not have loaded (or resolved as empty)
    // this pass — leave initialTarget in place so this effect re-checks
    // against the next `channels` recompute rather than giving up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, initialTarget]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const confessionsUnseen = useMemo(() => isUnseen('public-confessions', confessionsLatestAt), [confessionsLatestAt, seenTick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const questionsUnseen = useMemo(() => isUnseen('public-questions', questionsLatestAt), [questionsLatestAt, seenTick]);

  // Single flat render list — groups first, then the two virtual channels —
  // Confessions and Questions are ALWAYS pushed here regardless of data.
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

  // Every circle renders at a fixed IG-style diameter (CIRCLE_SIZE) with a
  // fixed gap between them — never shrunk to fit. When there are more
  // circles than fit on screen, the row scrolls horizontally instead,
  // exactly like Instagram's story tray.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'flex-start', // explicit — never let this row center
        alignItems: 'flex-start',
        padding: '10px 10px',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', // Firefox
        width: '100%',
        boxSizing: 'border-box',
      }}
      className="hide-scrollbar"
    >
      {items.map((item) => (
        <StoryCircle key={item.key} name={item.name} ring={item.ring} onClick={() => handleOpen(item.index)}>
          {item.render()}
        </StoryCircle>
      ))}
    </div>
  );
}