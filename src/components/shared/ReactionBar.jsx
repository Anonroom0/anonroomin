/** ===========================================================================
 * REACTION BAR — shared emoji reaction pills + quick-react tray
 * ============================================================================
 * <ReactionBar targetType="group_message"|"dm_message"|"confession"
 *              targetId userId />
 *
 * Works identically across group messages, DM messages, and public
 * confessions — it's parameterized purely by targetType/targetId against
 * the polymorphic `reactions` table (src/lib/reactions.js), so nothing here
 * branches on which kind of target it's attached to.
 *
 * On mount: fetches the reaction summary for (targetType, targetId) and
 * subscribes to realtime changes on it, matching the channel-setup/cleanup
 * pattern GroupChat.jsx already uses for its own message subscription.
 *
 * Renders one pill per distinct emoji (emoji + count), with an
 * --ember-tinted border/fill when the current user is the one behind that
 * emoji. Tapping an existing pill toggles that same reaction off (or
 * switches to it, per toggleReaction's add/change/remove rules). A trailing
 * "+" pill opens a small quick-emoji tray — a glass-panel popover of 6-8
 * common emoji, positioned above the tap point like a Telegram/Instagram
 * press-and-hold reaction tray. A "more…" affordance inside that tray opens
 * the full <EmojiGifPicker mode="emoji-only" /> for the complete emoji set.
 *
 * Motion: reuses .chat-row (existing press-state class) for pill/tray-item
 * tap feedback, and .bubble-enter (existing generic pop-in) for the tray's
 * entrance, rather than inventing new keyframes — per animations.css being
 * the single owner of the app's motion.
 *
 * Dependencies: React, src/lib/reactions.js, src/lib/supabaseClient,
 * src/pages/EmojiGifPicker.jsx (its `mode` prop is assumed to already exist,
 * per the master context's note that it's added by a later prompt)
 * ========================================================================= */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReactionSummary, subscribeToReactions, toggleReaction } from '../../lib/reactions';
import supabase from '../../lib/supabaseClient';
import EmojiGifPicker from '../../pages/EmojiGifPicker';

// A compact, commonly-reached-for row — mirrors the quick-react trays this
// component is modeled on (Telegram/Instagram press-and-hold menus).
const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '🙏', '🔥', '👍', '😡'];

export default function ReactionBar({ targetType, targetId, userId }) {
  const [reactions, setReactions] = useState([]);
  const [trayOpen, setTrayOpen] = useState(false);
  // Fixed-position coordinates anchored above the "+" trigger's tap point.
  const [trayPosition, setTrayPosition] = useState(null);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);

  const triggerRef = useRef(null);
  const trayRef = useRef(null);

  const refresh = useCallback(() => {
    fetchReactionSummary(targetType, targetId)
      .then(setReactions)
      .catch((err) => console.error('Failed to load reactions:', err));
  }, [targetType, targetId]);

  useEffect(() => {
    refresh();
    const channel = subscribeToReactions(targetType, targetId, refresh);
    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetType, targetId, refresh]);

  // Close the tray (and any full picker inside it) on outside click / Escape
  // — same pattern EmojiGifPicker.jsx already uses for its own panel.
  useEffect(() => {
    if (!trayOpen) return;

    function handleClick(e) {
      const clickedTray = trayRef.current && trayRef.current.contains(e.target);
      const clickedTrigger = triggerRef.current && triggerRef.current.contains(e.target);
      if (!clickedTray && !clickedTrigger) {
        setTrayOpen(false);
        setFullPickerOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') {
        setTrayOpen(false);
        setFullPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [trayOpen]);

  async function handleToggle(emoji) {
    if (!userId) return;
    try {
      await toggleReaction({ targetType, targetId, userId, emoji });
      // Realtime will also refresh other viewers; refresh immediately here
      // too so the tapper's own UI feels instant rather than waiting on the
      // round-trip.
      refresh();
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  }

  function openTray() {
    if (!userId) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setTrayPosition({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8, // sit just above the tap point
      });
    }
    setTrayOpen(true);
  }

  function handleQuickPick(emoji) {
    setTrayOpen(false);
    setFullPickerOpen(false);
    handleToggle(emoji);
  }

  function handleMorePick(emoji) {
    setFullPickerOpen(false);
    setTrayOpen(false);
    handleToggle(emoji);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className="chat-row"
          onClick={() => handleToggle(r.emoji)}
          disabled={!userId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 9px',
            borderRadius: 999,
            border: r.reactedByMe ? '1px solid var(--ember)' : '1px solid var(--glass-border)',
            background: r.reactedByMe
              ? 'color-mix(in srgb, var(--ember) 16%, var(--glass-white))'
              : 'var(--glass-white)',
            color: 'var(--paper)',
            fontSize: 13,
            fontWeight: 600,
            cursor: userId ? 'pointer' : 'default',
            lineHeight: 1,
          }}
        >
          <span style={{ fontSize: 14 }}>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      <button
        ref={triggerRef}
        type="button"
        className="chat-row"
        onClick={openTray}
        disabled={!userId}
        aria-label="Add reaction"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-white)',
          color: 'var(--dim)',
          fontSize: 15,
          fontWeight: 700,
          cursor: userId ? 'pointer' : 'default',
          opacity: userId ? 1 : 0.5,
          lineHeight: 1,
        }}
      >
        +
      </button>

      {trayOpen && trayPosition && (
        <div
          ref={trayRef}
          className="glass-panel bubble-enter"
          style={{
            position: 'fixed',
            left: trayPosition.left,
            bottom: trayPosition.bottom,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 8,
            borderRadius: 24,
            zIndex: 60,
          }}
        >
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="chat-row"
              onClick={() => handleQuickPick(emoji)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: 22,
                width: 34,
                height: 34,
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {emoji}
            </button>
          ))}

          <button
            type="button"
            className="chat-row"
            onClick={() => setFullPickerOpen(true)}
            aria-label="More emoji"
            style={{
              border: 'none',
              background: 'var(--glass-border)',
              color: 'var(--dim)',
              fontSize: 13,
              fontWeight: 700,
              width: 34,
              height: 34,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            …
          </button>

          {/* The tray div above is itself the nearest positioned ancestor
              (fixed), which is exactly what EmojiGifPicker's own
              `position: absolute; bottom: 100%` styling needs to anchor to
              — no extra wrapper required. */}
          {fullPickerOpen && (
            <EmojiGifPicker
              open={fullPickerOpen}
              mode="emoji-only"
              onClose={() => setFullPickerOpen(false)}
              onEmoji={handleMorePick}
              onMedia={() => {}}
            />
          )}
        </div>
      )}
    </div>
  );
}