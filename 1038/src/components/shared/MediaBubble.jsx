/**
 * ============================================================================
 * MEDIA BUBBLES (SHARED AUDIO / VIDEO PLAYERS)
 * ============================================================================
 * Single consolidated source for the two chat-bubble media players that used
 * to be duplicated near-identically in both GroupChat.jsx and
 * DirectMessages.jsx:
 *   - AudioBubble  custom waveform player (play/pause, scrub, timer)
 *   - VideoBubble  framed, rounded, shadowed <video> player
 *
 * Playback/waveform behavior is untouched from both prior copies — this pass
 * only re-skins the fills to design tokens: an --ember-tinted glass fill for
 * the sender's own messages (own messages carry the app's single
 * primary-action color per the token spec), and a plain --glass-white fill
 * for everyone else's, replacing the old hardcoded 'var(--blue)' / white
 * rgba() values.
 *
 * Dependencies: React
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';

// ============================================================================
// 1. INLINE SVG VECTORS (Play / Pause) — same glyphs both callers used
// ============================================================================
const Vectors = {
  Play: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  ),
  Pause: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ),
};

// ============================================================================
// 2. UTILITY
// ============================================================================

function formatClock(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ============================================================================
// 3. AUDIO BUBBLE — waveform bars, scrub, play/pause, timer
// ============================================================================

/**
 * AudioBubble
 * @param {string} src - playable audio URL
 * @param {boolean} isOwn - true for the current user's own outgoing message;
 *   controls the ember-tinted vs. plain-glass restyle only, playback logic
 *   is identical either way.
 */
export function AudioBubble({ src, isOwn }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      setCurrentTime(el.currentTime);
      if (el.duration) setProgress((el.currentTime / el.duration) * 100);
    };
    const onLoaded = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    playing ? el.pause() : el.play();
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
  };

  const barCount = 26;

  // Restyle only: own-message bubbles get an ember-tinted glass fill (the
  // one primary-action color per screen); everyone else's is plain glass.
  // Play button + active waveform bars pick up the same tint so the control
  // reads as one coherent surface rather than a blue accent on top of it.
  const bubbleFill = isOwn ? 'color-mix(in srgb, var(--ember) 18%, var(--glass-white))' : 'var(--glass-white)';
  const playButtonBg = isOwn ? 'var(--ember)' : 'var(--glass-border)';
  const playButtonColor = isOwn ? '#fff' : 'var(--paper)';
  const activeBarColor = isOwn ? 'var(--ember)' : 'var(--paper)';
  const inactiveBarColor = 'var(--glass-border)';
  const timerColor = 'var(--dim)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: 230,
        padding: '8px 10px',
        borderRadius: 20,
        background: bubbleFill,
        border: '1px solid var(--glass-border)',
        boxSizing: 'border-box',
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button
        onClick={toggle}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: 'none',
          flexShrink: 0,
          background: playButtonBg,
          color: playButtonColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {playing ? Vectors.Pause : Vectors.Play}
      </button>
      <div onClick={seek} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 26, cursor: 'pointer' }}>
        {Array.from({ length: barCount }).map((_, i) => {
          const active = (i / barCount) * 100 <= progress;
          const h = 5 + Math.abs(Math.sin(i * 1.35 + 0.4)) * 15;
          return (
            <div
              key={i}
              style={{
                width: 2.5,
                height: h,
                borderRadius: 2,
                background: active ? activeBarColor : inactiveBarColor,
                transition: 'background 0.1s',
              }}
            />
          );
        })}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: timerColor, flexShrink: 0, minWidth: 30, textAlign: 'right' }}>
        {formatClock(playing || currentTime ? currentTime : duration)}
      </span>
    </div>
  );
}

// ============================================================================
// 4. VIDEO BUBBLE — framed, rounded, shadowed player
// ============================================================================

/**
 * VideoBubble
 * @param {string} src - playable video URL
 *
 * No own/other distinction existed in either original (both callers used a
 * flat black frame regardless of sender), so that's preserved as-is — only
 * the border now reads from --glass-border instead of being borderless, to
 * keep it visually consistent with the rest of the glass-token system.
 */
export function VideoBubble({ src }) {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        border: '1px solid var(--glass-border)',
        background: '#000',
        maxWidth: 260,
      }}
    >
      <video src={src} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 320, display: 'block' }} />
    </div>
  );
}