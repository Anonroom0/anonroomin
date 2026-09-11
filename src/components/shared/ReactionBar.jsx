import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchReactionSummary, toggleReaction, isValidReactionTargetId } from '../../lib/reactions';
import supabase from '../../lib/supabaseClient';
import { hapticSelect } from '../../lib/haptics';

// Quick row stays short; full grid is a wide set of common reactions.
const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '🙏', '🔥', '👍', '😡', '😍', '👏'];
const MORE_EMOJI = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥',
  '😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐',
  '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞',
  '😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝',
  '👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🖐️','✋','🖖','👌','🤌','🤏',
  '✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🔥','⭐','🌟','✨','💫','⚡','💥','💯',
  '🎉','🎊','🎈','🎁','🏆','🥇','🎯','🚀','💡','📌','✅','❌','❓','❗','💬','👀','🌸','🌹','☀️','🌙',
];

const Vectors = {
  Close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Grid: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
};

export default function ReactionBar({ targetType, targetId, userId, showTray, onCloseTray, align = 'center', actions = [], pullUp = 0 }) {
  const [reactions, setReactions] = useState([]);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [trayCoords, setTrayCoords] = useState(null);

  const containerRef = useRef(null);
  const trayRef = useRef(null);
  const togglePendingRef = useRef(false);

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

  useEffect(() => {
    if (showTray && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Wider tray so more quick emoji + actions fit without clipping
      const estimatedTrayWidth = fullPickerOpen ? 280 : 220;
      const marginFromEdge = 10;

      let desiredLeft = rect.left + rect.width / 2;
      const minLeft = marginFromEdge + estimatedTrayWidth / 2;
      const maxLeft = window.innerWidth - marginFromEdge - estimatedTrayWidth / 2;
      const safeLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft));

      const desiredBottom = window.innerHeight - rect.top + 6;
      const safeBottom = Math.max(8, Math.min(desiredBottom, window.innerHeight - 160));
      setTrayCoords({ bottom: safeBottom, left: safeLeft });
    } else {
      setTrayCoords(null);
    }
  }, [showTray, fullPickerOpen]);

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
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => { e.stopPropagation(); handleToggle(r.emoji); }}
          disabled={!userId}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px',
            borderRadius: 12,
            border: r.reactedByMe ? '1px solid var(--ember)' : '1px solid var(--separator)',
            backgroundColor: r.reactedByMe ? 'var(--ember-soft)' : 'var(--surface)',
            color: 'var(--paper)',
            fontSize: 12, fontWeight: 700,
            cursor: userId ? 'pointer' : 'default', lineHeight: 1,
            transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          <span style={{ fontSize: 13, transform: 'translateY(-1px)' }}>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

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
            gap: 6,
            transformOrigin: 'bottom center',
            maxWidth: 'min(94vw, 300px)',
          }}
        >
          {fullPickerOpen ? (
            <div
              style={{
                width: 'min(94vw, 300px)',
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: 'var(--menu-bg)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-card)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--separator)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dim)' }}>Emoji</span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setFullPickerOpen(false)}
                  style={{
                    border: 'none',
                    background: 'var(--glass-white)',
                    color: 'var(--paper)',
                    borderRadius: 999,
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {Vectors.Close}
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: 2,
                  padding: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {MORE_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleMorePick(emoji)}
                    style={{
                      border: 'none', background: 'transparent', fontSize: 18,
                      width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
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
                  display: 'flex', alignItems: 'center', gap: 2,
                  padding: '5px 7px',
                  borderRadius: 18,
                  backgroundColor: 'var(--menu-bg)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: 'var(--shadow-card)',
                  width: 'max-content',
                  maxWidth: 'min(94vw, 300px)',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleQuickPick(emoji)}
                    style={{
                      border: 'none', background: 'transparent',
                      fontSize: 18,
                      width: 28, height: 28,
                      borderRadius: '50%', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      transition: 'transform 0.15s ease, background-color 0.15s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'scale(1.18)';
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
                  type="button"
                  onClick={() => setFullPickerOpen(true)}
                  aria-label="More emoji"
                  style={{
                    border: 'none',
                    backgroundColor: 'var(--ember-soft)',
                    color: 'var(--paper)',
                    width: 26, height: 26, marginLeft: 2,
                    borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  {Vectors.Grid}
                </button>
              </div>

              {actions.length > 0 && (
                <div
                  style={{
                    display: 'flex', flexDirection: 'column',
                    width: Math.min(160, window.innerWidth * 0.7),
                    borderRadius: 12, overflow: 'hidden',
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
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 12px', border: 'none', background: 'transparent',
                        borderTop: idx > 0 ? '1px solid var(--separator)' : 'none',
                        color: action.danger ? 'var(--danger)' : 'var(--paper)',
                        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(127,127,127,0.1)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
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
