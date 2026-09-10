/**
 * ============================================================================
 * EXPLORE CHANNELS SHEET
 * ============================================================================
 * <ExploreChannelsSheet open onClose groups onJoin joiningId /> — a
 * GlassPanel bottom sheet listing every group the viewer HASN'T joined yet
 * (Home.jsx already filters `groups` down to "not in my group_threads rows"
 * before passing them in as `groups` here). Tapping Join calls onJoin(group)
 * and Home.jsx handles the actual insert + navigation; this component is
 * purely presentational plus a search filter for long lists.
 *
 * Dependencies: React, GlassPanel, LiquidAvatar
 * ============================================================================
 */

import React, { useMemo, useState } from 'react';
import GlassPanel from '../shared/GlassPanel';
import LiquidAvatar from '../shared/LiquidAvatar';

const Icons = {
  Search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Compass: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
};

export default function ExploreChannelsSheet({ open, onClose, groups, onJoin, joiningId }) {
  const [query, setQuery] = useState('');

  // Hooks must run unconditionally every render — this component never
  // actually unmounts (Home.jsx always renders it; `open` just toggles
  // whether it draws anything), so the early return has to come AFTER
  // every hook call, not before. Bailing out before useMemo below made the
  // hook count differ between the closed render (1 hook) and the open one
  // (2 hooks) — React trips on that and the ErrorBoundary catches it,
  // which is the "Something went wrong" on tapping Explore.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = groups || [];
    if (!q) return list;
    return list.filter((g) => g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));
  }, [groups, query]);

  if (!open) return null;

  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '75vh' }}>
        <div style={{ padding: '4px 20px 14px', flexShrink: 0 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 19, fontWeight: 800, color: 'var(--paper)' }}>Explore channels</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2, var(--glass-border))', borderRadius: 14, padding: '10px 14px' }}>
            <span style={{ color: 'var(--dim)', display: 'flex' }}>{Icons.Search}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels…"
              aria-label="Search channels"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--paper)', fontSize: 15 }}
            />
          </div>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ color: 'var(--dim)', display: 'flex', justifyContent: 'center', marginBottom: 14 }}>{Icons.Compass}</div>
              <p style={{ fontSize: 15, color: 'var(--dim)', margin: 0 }}>
                {(groups || []).length === 0 ? "You've joined every channel there is." : 'No channels match that search.'}
              </p>
            </div>
          ) : (
            filtered.map((group) => {
              const identity = { name: group.name, avatar_url: group.cover_url, is_admin: false };
              const isJoining = joiningId === group.id;
              return (
                <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 16 }}>
                  <LiquidAvatar identity={identity} size={46} kind="group" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: 'var(--paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.description || 'Public Channel'}</span>
                  </div>
                  <button
                    type="button"
                    className="touch-bounce"
                    disabled={isJoining}
                    onClick={() => onJoin?.(group)}
                    style={{
                      flexShrink: 0,
                      border: 'none',
                      background: 'var(--ember)',
                      color: '#fff',
                      padding: '8px 16px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isJoining ? 'default' : 'pointer',
                      opacity: isJoining ? 0.6 : 1,
                    }}
                  >
                    {isJoining ? 'Joining…' : 'Join'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
