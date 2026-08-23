/**
 * ============================================================================
 * EMOJI / GIF / STICKER PICKER
 * ============================================================================
 * Drop-in picker that pops up above the composer. Three tabs, all with SVG
 * icons (no emoji-as-icon glyphs):
 *   - Emoji: static curated list, no API needed, inserts unicode into text
 *   - GIFs: GIPHY API (free), search + trending grid
 *   - Stickers: GIPHY Stickers API
 *
 * ---------------------------------------------------------------------------
 * SETUP (required before this works):
 * Tenor's public API was discontinued for new/free integrations, so this
 * picker uses GIPHY instead, which still offers a free developer tier:
 * 1. Get a free GIPHY API key: https://developers.giphy.com/dashboard/
 *    (sign up, create an app, choose "API" not "SDK", takes a couple minutes)
 * 2. Paste it into GIPHY_API_KEY below, or better, load it from an env var
 *    and pass it down as a prop so it isn't hardcoded in the bundle.
 * The GIPHY_API_KEY below defaults to Giphy's public beta testing key
 * (dc6zaTOxFJmzC) which works out of the box for trying this out, but is
 * rate-limited and shared by everyone using it — swap in your own key
 * before shipping to real users.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   <EmojiGifPicker
 *     open={pickerOpen}
 *     onClose={() => setPickerOpen(false)}
 *     onEmoji={(char) => setText((t) => t + char)}
 *     onMedia={(url, type) => sendMediaMessage(url, type)} // type: 'gif' | 'sticker'
 *   />
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- 1. CONFIG --------------------------------------------------------------

const GIPHY_API_KEY = 'gdzlbBM7dxOVIYsC7btS1J2MOweXFdOf'; // <-- replace with your own free GIPHY key
const GIPHY_BASE = 'https://api.giphy.com/v1';

// A compact, hand-picked emoji set grouped by category. Extend freely —
// this needs no API and never rate-limits.
const EMOJI_GROUPS = [
  {
    label: 'Smileys',
    items: ['😀','😁','😂','🤣','😊','😍','😘','😜','🤔','😎','🥳','😭','😡','🥺','😴','🤗','🙃','😇','🤩','😬'],
  },
  {
    label: 'Gestures',
    items: ['👍','👎','👏','🙌','🙏','👌','✌️','🤝','💪','👋','🤟','🫶','✋','🤙','👊'],
  },
  {
    label: 'Hearts',
    items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💖','💗','💯'],
  },
  {
    label: 'Objects',
    items: ['🔥','✨','🎉','🎊','⭐','💤','⚡','🎵','📸','☕','🍕','🎁','🏆','💡','⏰'],
  },
];

// --- 2. SVG ICONS (tab bar + misc) ------------------------------------------

const TabIcons = {
  Emoji: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  ),
  Gif: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 10v4" />
      <path d="M11 10v4" />
      <path d="M11 12h1.5" />
      <path d="M16 14v-4h2.2" />
      <path d="M16 12h1.6" />
    </svg>
  ),
  Sticker: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h7l6-6V7a4 4 0 0 0-4-4z" />
      <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
    </svg>
  ),
};

// --- 3. GIPHY HELPERS --------------------------------------------------------

async function giphyFetch(path, params) {
  const qs = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: '21',
    rating: 'pg-13',
    ...params,
  });
  const res = await fetch(`${GIPHY_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) {
    throw new Error('GIPHY request failed');
  }
  const data = await res.json();
  return data.data || [];
}

function giphyResultToUrl(result) {
  const images = result.images || {};
  return {
    previewUrl: images.fixed_width_small?.url || images.fixed_width?.url,
    fullUrl: images.original?.url || images.fixed_width?.url,
  };
}

// --- 4. GIF / STICKER GRID (shared logic, different endpoint) --------------

function GiphyGrid({ contentFilter, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef(null);

  const endpointBase = contentFilter === 'sticker' ? 'stickers' : 'gifs';

  const load = useCallback(async (searchTerm) => {
    setLoading(true);
    setErrored(false);
    try {
      const path = searchTerm ? `${endpointBase}/search` : `${endpointBase}/trending`;
      const params = searchTerm ? { q: searchTerm } : {};
      const items = await giphyFetch(path, params);
      setResults(items);
    } catch (err) {
      console.error('GIPHY fetch failed:', err);
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }, [endpointBase]);

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentFilter]);

  function handleQueryChange(e) {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => load(value.trim()), 350);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={handleQueryChange}
        placeholder={contentFilter === 'sticker' ? 'Search stickers…' : 'Search GIFs…'}
        style={{
          margin: '10px 12px',
          padding: '10px 14px',
          borderRadius: 14,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass)',
          color: 'var(--ink)',
          fontSize: 14,
          outline: 'none',
        }}
      />

      {errored && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>
          Couldn't load {contentFilter === 'sticker' ? 'stickers' : 'GIFs'}. Check your GIPHY API key.
        </div>
      )}

      {!errored && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            padding: '0 12px 12px',
          }}
        >
          {loading && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24, color: 'var(--dim)', fontSize: 13 }}>
              Loading…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24, color: 'var(--dim)', fontSize: 13 }}>
              No results
            </div>
          )}
          {!loading && results.map((result) => {
            const { previewUrl, fullUrl } = giphyResultToUrl(result);
            if (!previewUrl) {
              return null;
            }
            return (
              <button
                key={result.id}
                onClick={() => onPick(fullUrl, contentFilter)}
                style={{
                  border: 'none',
                  padding: 0,
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: 'var(--glass)',
                  aspectRatio: '1 / 1',
                }}
              >
                <img
                  src={previewUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- 5. EMOJI GRID -----------------------------------------------------------

function EmojiGrid({ onPick }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dim)', margin: '8px 4px 6px' }}>
            {group.label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {group.items.map((char) => (
              <button
                key={char}
                onClick={() => onPick(char)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 24,
                  padding: 6,
                  borderRadius: 10,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the text input
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- 6. MAIN PICKER -----------------------------------------------------------

export default function EmojiGifPicker({ open, onClose, onEmoji, onMedia }) {
  const [tab, setTab] = useState('emoji'); // 'emoji' | 'gif' | 'sticker'
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const tabs = [
    { id: 'emoji', label: 'Emoji', icon: TabIcons.Emoji },
    { id: 'gif', label: 'GIFs', icon: TabIcons.Gif },
    { id: 'sticker', label: 'Stickers', icon: TabIcons.Sticker },
  ];

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 8,
        right: 8,
        marginBottom: 8,
        height: 340,
        background: 'var(--glass-strong)',
        backdropFilter: 'blur(30px) saturate(200%)',
        border: '1px solid var(--glass-border)',
        borderRadius: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 30,
        animation: 'slideUpFade 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              color: tab === t.id ? 'var(--blue)' : 'var(--dim)',
              borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'emoji' && <EmojiGrid onPick={(char) => onEmoji(char)} />}
        {tab === 'gif' && <GiphyGrid contentFilter="gif" onPick={(url, type) => onMedia(url, type)} />}
        {tab === 'sticker' && <GiphyGrid contentFilter="sticker" onPick={(url, type) => onMedia(url, type)} />}
      </div>
    </div>
  );
}
