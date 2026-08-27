import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchReactionSummary, toggleReaction } from '../../lib/reactions';
import supabase from '../../lib/supabaseClient';
import EmojiGifPicker from '../../pages/EmojiGifPicker';

const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '🙏', '🔥', '👍', '😡'];

export default function ReactionBar({ targetType, targetId, userId, showTray, onCloseTray, align = 'center', actions = [] }) {
  const [reactions, setReactions] = useState([]);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [trayCoords, setTrayCoords] = useState(null);

  const containerRef = useRef(null);
  const trayRef = useRef(null);

  const refresh = useCallback(() => {
    fetchReactionSummary(targetType, targetId)
      .then(setReactions)
      .catch((err) => console.error('Failed to load reactions:', err));
  }, [targetType, targetId]);

  useEffect(() => {
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
      
      // We estimate the tray is roughly ~290px wide (8 emojis * ~30px + padding)
      const estimatedTrayWidth = 290; 
      const marginFromEdge = 12; // 12px safe area from screen edge
      
      // Start by trying to perfectly center it above the tapped row
      let desiredLeft = rect.left + rect.width / 2;
      
      // Calculate the minimum and maximum left positions allowed on screen
      const minLeft = marginFromEdge + (estimatedTrayWidth / 2);
      const maxLeft = window.innerWidth - marginFromEdge - (estimatedTrayWidth / 2);
      
      // Clamp the value so it NEVER bleeds off the left or right edge
      const safeLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft));

      setTrayCoords({
        bottom: window.innerHeight - rect.top + 8, // Hovers 8px above the bubble
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
    try {
      await toggleReaction({ targetType, targetId, userId, emoji });
      refresh();
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
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

  // Hide container entirely if no reactions exist and the tray isn't open
  if (reactions.length === 0 && !showTray) {
    return <div ref={containerRef} style={{ height: 0, width: '100%' }} />;
  }

  return (
    <div 
      ref={containerRef} 
      style={{ 
        display: 'flex', flexWrap: 'wrap', gap: 6, 
        justifyContent: align, width: '100%' 
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
            border: r.reactedByMe ? '1px solid #FF6B35' : '1px solid rgba(255,255,255,0.06)',
            backgroundColor: r.reactedByMe ? 'rgba(255,107,53,0.16)' : '#15161B',
            color: '#F4F3F0',
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
            transform: 'translateX(-50%)', // Centered relative to the clamped X coordinate
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            transformOrigin: 'bottom center'
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 2, // Tighter gap
              padding: '6px 10px', // Tighter padding
              borderRadius: 32,
              backgroundColor: 'rgba(28, 29, 36, 0.90)', // Subtly transparent for sleekness
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              width: 'max-content',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji} type="button" onClick={() => handleQuickPick(emoji)}
                style={{
                  border: 'none', background: 'transparent', 
                  fontSize: 18, // Smaller Emojis
                  width: 32, height: 32, // Smaller Hitbox
                  borderRadius: '50%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  transition: 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.15s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.25)';
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
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
                border: 'none', backgroundColor: 'rgba(255,255,255,0.05)', color: '#8B8B96',
                fontSize: 12, fontWeight: 700, 
                width: 30, height: 30, marginLeft: 4, // Smaller plus button
                borderRadius: '50%', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                transition: 'background-color 0.15s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            >
              …
            </button>
          </div>

          {actions.length > 0 && (
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                width: 190, borderRadius: 16, overflow: 'hidden',
                backgroundColor: 'rgba(28, 29, 36, 0.95)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              {actions.map((action, idx) => (
                <button
                  key={action.key || action.label}
                  type="button"
                  onClick={() => { action.onClick(); if (onCloseTray) onCloseTray(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', border: 'none', background: 'transparent',
                    borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    color: action.danger ? '#FF6B6B' : '#F4F3F0',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {fullPickerOpen && (
            <EmojiGifPicker
              open={fullPickerOpen} mode="emoji-only"
              onClose={() => setFullPickerOpen(false)} onEmoji={handleMorePick} onMedia={() => {}}
            />
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
