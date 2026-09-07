import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchReactionSummary, toggleReaction, isValidReactionTargetId } from '../../lib/reactions';
import supabase from '../../lib/supabaseClient';
import { hapticSelect } from '../../lib/haptics';

const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '🙏', '🔥', '👍', '😡'];
const MORE_EMOJI = ['❤️','😂','😮','😢','🙏','🔥','👍','😡','😍','🥰','😊','😎','🤔','😴','😭','🤣','😩','🙃','💯','✨','🎉','👏','🙌','💪','👀','💬','✅','❌','⭐','💡','🚀','🌸'];

export default function ReactionBar({ targetType, targetId, userId, showTray, onCloseTray, align = 'center', actions = [], pullUp = 0 }) {
  const [reactions, setReactions] = useState([]);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [trayCoords, setTrayCoords] = useState(null);

  const containerRef = useRef(null);
  const trayRef = useRef(null);
  const togglePendingRef = useRef(false);

  // Close emoji grid when the whole tray is dismissed
  useEffect(() => {
    if (!showTray) setFullPickerOpen(false);
  }, [showTray]);

  const refresh = useCallback(() => {
    if (!isValidReactionTargetId(targetId)) {
      setReactions([]);
      return;
    }
    fetchReactionSummary(targetType, targetId)
      .then(setReactions)
      .catch((err) => console.error('Failed to load reactions:', err));
  }, [targetType, targetId]);

  useEffect(() => {
    // Skip network + realtime for optimistic temp-* ids (not UUIDs).
    if (!isValidReactionTargetId(targetId)) {
      setReactions([]);
      return undefined;
    }
    refresh();
    const uniqueId = Math.random().toString(36).substring(2, 10);
    const uniqueChannelName = `reactions_${targetType}_${targetId}_${uniqueId}`;

    const channel = supabase.channel(uniqueChannelName)
      .on(
        'postgres_changes', 
        { event: '*', schema: 'public', table: 'reactions', filter: `target_id=eq.${targetId}` }, 
        refresh
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [targetType, targetId, refresh]);

  // Measure exact coordinates AND strictly clamp to screen edges
  useEffect(() => {
    if (showTray && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      // Half-size tray (~8 emojis * ~16px + padding)
      const estimatedTrayWidth = 150;
      const marginFromEdge = 8;
      
      // Start by trying to perfectly center it above the tapped row
      let desiredLeft = rect.left + rect.width / 2;
      
      // Calculate the minimum and maximum left positions allowed on screen
      const minLeft = marginFromEdge + (estimatedTrayWidth / 2);
      const maxLeft = window.innerWidth - marginFromEdge - (estimatedTrayWidth / 2);
      
      // Clamp the value so it NEVER bleeds off the left or right edge
      const safeLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft));

      const desiredBottom = window.innerHeight - rect.top + 6;
      // Keep tray within the viewport (never hang above the screen top)
      const safeBottom = Math.max(8, Math.min(desiredBottom, window.innerHeight - 120));
      setTrayCoords({
        bottom: safeBottom,
        left: safeLeft,
      });
    } else {
      setTrayCoords(null);
    }
  }, [showTray]);

  // Close tray when clicking outside
  useEffect(() => {
    if (!showTray) return;
    function handleClickOutside(e) {
      if (trayRef.current && !trayRef.current.contains(e.target)) {
        if (onCloseTray) onCloseTray();
      }
    }
    const timer = setTimeout(() => document.addEventListener('click', handleClickOutside), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showTray, onCloseTray]);

  async function handleToggle(emoji) {
    if (!userId) return;
    // A fast double-tap on the same pill fires this twice before the first
    // call's insert/select round trip resolves, racing the same (target_type,
    // target_id, user_id) row and surfacing an avoidable 409 from the unique
    // constraint. Drop any tap that arrives while one is already in flight.
    if (togglePendingRef.current) return;
    togglePendingRef.current = true;
    hapticSelect();
    try {
      await toggleReaction({ targetType, targetId, userId, emoji });
      refresh();
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    } finally {
      togglePendingRef.current = false;
    }
  }

  function handleQuickPick(emoji) {
    if (onCloseTray) onCloseTray();
    setFullPickerOpen(false);
    handleToggle(emoji);
  }

  function handleMorePick(emoji) {
    setFullPickerOpen(false);
    if (onCloseTray) onCloseTray();
    handleToggle(emoji);
  }

  // Hide container entirely if no reactions exist and the tray isn't open.
  // Deliberately NOT given the `pullUp` negative margin below: that margin
  // exists purely to tuck the reaction pills into the bottom corner of the
  // bubble above it, and only makes sense when pills are actually rendered.
  // Applying it here too (as used to happen, via a hardcoded margin on the
  // caller's wrapper) pulled the timestamp row up by that same amount even
  // when there was nothing to compensate for, so timestamps rendered too
  // close to (or overlapping) the bubble when a message had no reactions.
  if (reactions.length === 0 && !showTray) {
    return <div ref={containerRef} style={{ height: 0, width: '100%', marginTop: 0 }} />;
  }

  return (
    <div 
      ref={containerRef} 
      style={{ 
        display: 'flex', flexWrap: 'wrap', gap: 6, 
        justifyContent: align, width: '100%',
        marginTop: pullUp ? -pullUp : 0,
      }}
    >
      {/* Sleeker, Smaller Permanent Reaction Pills — rendered by the caller
          so they overlap the bottom edge of the message bubble, Telegram
          style, instead of sitting in their own full-width row. */}
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => { e.stopPropagation(); handleToggle(r.emoji); }}
          disabled={!userId}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, 
            padding: '3px 8px', // Tighter padding
            borderRadius: 12, // Smoother modern curve
            border: r.reactedByMe ? '1px solid var(--ember)' : '1px solid var(--separator)',
            backgroundColor: r.reactedByMe ? 'var(--ember-soft)' : 'var(--surface)',
            color: 'var(--paper)',
            fontSize: 12, fontWeight: 700, // Smaller font
            cursor: userId ? 'pointer' : 'default', lineHeight: 1,
            transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
        >
          <span style={{ fontSize: 13, transform: 'translateY(-1px)' }}>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      {/* Pop-up menu: quick-reaction tray on top, then (optionally) a
          professional Telegram-style action list — Share, and Delete for
          admins — stacked directly beneath it as one cohesive popup. */}
      {showTray && trayCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={trayRef}
          onClick={(e) => e.stopPropagation()}
          className="bubble-enter"
          style={{
            position: 'fixed',
            zIndex: 99999,
            bottom: trayCoords.bottom,
            left: trayCoords.left,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            transformOrigin: 'bottom center',
            maxWidth: 'min(92vw, 200px)',
          }}
        >
          {/* Full emoji grid replaces the selection tray (not stacked on top). */}
          {fullPickerOpen ? (
            <div
              style={{
                width: 'min(92vw, 168px)',
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: 'var(--menu-bg)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-card)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderBottom: '1px solid var(--separator)' }}>
                <button
                  type="button"
                  onClick={() => setFullPickerOpen(false)}
                  style={{
                    border: 'none', background: 'var(--glass-white)', color: 'var(--paper)',
                    borderRadius: 6, padding: '3px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--dim)' }}>More</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: 2,
                  padding: 6,
                  maxHeight: 140,
                  overflowY: 'auto',
                }}
              >
                {MORE_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleMorePick(emoji)}
                    style={{
                      border: 'none', background: 'transparent', fontSize: 14,
                      width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  padding: '3px 5px',
                  borderRadius: 16,
                  backgroundColor: 'var(--menu-bg)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: 'var(--shadow-card)',
                  width: 'max-content',
                  maxWidth: 'min(92vw, 200px)',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    key={emoji} type="button" onClick={() => handleQuickPick(emoji)}
                    style={{
                      border: 'none', background: 'transparent',
                      fontSize: 14,
                      width: 22, height: 22,
                      borderRadius: '50%', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      transition: 'transform 0.15s ease, background-color 0.15s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'scale(1.2)';
                      e.currentTarget.style.backgroundColor = 'rgba(127,127,127,0.12)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {emoji}
                  </button>
                ))}

                <button
                  type="button" onClick={() => setFullPickerOpen(true)} aria-label="More emoji"
                  style={{
                    border: 'none', backgroundColor: 'var(--ember-soft)', color: 'var(--dim)',
                    fontSize: 11, fontWeight: 700,
                    width: 20, height: 20, marginLeft: 2,
                    borderRadius: '50%', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  }}
                >
                  …
                </button>
              </div>

              {actions.length > 0 && (
                <div
                  style={{
                    display: 'flex', flexDirection: 'column',
                    width: 112, borderRadius: 10, overflow: 'hidden',
                    backgroundColor: 'var(--menu-bg)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  {actions.map((action, idx) => (
                    <button
                      key={action.key || action.label}
                      type="button"
                      onClick={() => { action.onClick(); if (onCloseTray) onCloseTray(); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', border: 'none', background: 'transparent',
                        borderTop: idx > 0 ? '1px solid var(--separator)' : 'none',
                        color: action.danger ? 'var(--danger)' : 'var(--paper)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(127,127,127,0.1)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
