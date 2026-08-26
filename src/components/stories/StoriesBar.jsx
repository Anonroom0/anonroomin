/** ===========================================================================
 * STORIES BAR
 * ============================================================================
 * <StoriesBar groups userId onOpenStory={(channels, startIndex) => {}} />
 *
 * Horizontal-scroll row of group avatars, mounted on Home.jsx just below the
 * search bar. For each group in `groups` (the same shape Home.jsx already
 * fetches — {id, slug, name, description, cover_url, created_at}), this
 * checks whether that group has any confessions row (group_id = g.id,
 * created_at > now() - 24h) via a single batched query across all group ids
 * at once, rather than one query per group.
 *
 * Groups WITH a fresh confession render their circle avatar with a static
 * --signal conic-gradient ring (the "new story" ring); groups without one
 * render a plain --dim gray ring. Tapping a highlighted circle calls
 * onOpenStory(channels, startIndex).
 *
 * channels is built in a fixed order that StoryViewer depends on:
 *   1. every group-with-new-confessions, in this bar's left-to-right order
 *   2. the virtual channel 'public-confessions'
 *   3. the virtual channel 'public-questions'
 * startIndex is the tapped group's position within that same array (not its
 * position among all groups — only highlighted groups are story channels).
 *
 * Dependencies: React, src/lib/supabaseClient
 * ========================================================================= */

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../../lib/supabaseClient';

const RECENT_WINDOW_HOURS = 24;

function getInitials(name) {
  if (!name) return '#';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function StoriesBar({ groups, userId, onOpenStory }) {
  const [groupIdsWithConfessions, setGroupIdsWithConfessions] = useState(() => new Set());

  const groupIds = useMemo(() => (groups || []).map((g) => g.id), [groups]);

  useEffect(() => {
    let isMounted = true;

    if (groupIds.length === 0) {
      setGroupIdsWithConfessions(new Set());
      return;
    }

    const sinceIso = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    // One batched query across every group id the bar is about to render,
    // rather than a query per group.
    supabase
      .from('confessions')
      .select('group_id')
      .in('group_id', groupIds)
      .gt('created_at', sinceIso)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Failed to load recent confessions for stories bar:', error.message);
          setGroupIdsWithConfessions(new Set());
          return;
        }
        setGroupIdsWithConfessions(new Set((data || []).map((row) => row.group_id)));
      });

    return () => {
      isMounted = false;
    };
  }, [groupIds]);

  // Only groups with a fresh confession are actual story channels — this is
  // the array order StoryViewer depends on.
  const highlightedGroups = useMemo(
    () => (groups || []).filter((g) => groupIdsWithConfessions.has(g.id)),
    [groups, groupIdsWithConfessions]
  );

  const channels = useMemo(
    () => [...highlightedGroups, 'public-confessions', 'public-questions'],
    [highlightedGroups]
  );

  function handleTapGroup(group) {
    const startIndex = highlightedGroups.findIndex((g) => g.id === group.id);
    if (startIndex === -1) return; // not a story channel (no ring, shouldn't be reachable)
    onOpenStory(channels, startIndex);
  }

  if (!groups || groups.length === 0) return null;

  return (
    <div
      className="custom-scrollbar"
      style={{
        display: 'flex',
        gap: 14,
        padding: '10px 16px',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        flexShrink: 0,
      }}
    >
      {groups.map((group) => {
        const isHighlighted = groupIdsWithConfessions.has(group.id);

        return (
          <button
            key={group.id}
            type="button"
            onClick={() => handleTapGroup(group)}
            disabled={!isHighlighted}
            className="chat-row"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              background: 'transparent',
              flexShrink: 0,
              width: 64,
              cursor: isHighlighted ? 'pointer' : 'default',
              padding: 0,
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                padding: 2.5,
                background: isHighlighted
                  ? 'conic-gradient(var(--signal), var(--signal))'
                  : 'var(--dim)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  padding: 2,
                  background: 'var(--ink)', // ring gap, matches app background
                }}
              >
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
                    fontSize: 16,
                  }}
                >
                  {group.cover_url ? (
                    <img
                      src={group.cover_url}
                      alt={group.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    getInitials(group.name)
                  )}
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--paper)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {group.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}