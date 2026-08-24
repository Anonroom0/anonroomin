/**
 * ============================================================================
 * DIRECT MESSAGES MASTER VIEW (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * CHANGES IN THIS PASS (bringing DMs up to parity with GroupChat):
 * - Audio messages: custom waveform-style player (play/pause, scrub, timer)
 *   instead of the bare browser <audio> element.
 * - Video messages: framed in a rounded, shadowed player instead of a raw tag.
 * - guessMediaType now recognizes video/ and audio/ mime types (previously
 *   everything but images fell through to the generic "file" bucket).
 * - Attachment flow now goes through a preview/caption step before upload,
 *   with a 60s timeout so a bad connection fails loudly instead of spinning
 *   forever.
 * - Attachment sheet: Files / Image / Camera / Instagram (no Confessions —
 *   that feature stays scoped to group chats).
 * - Instagram sharing: asks ONLY for a username, then renders a profile card
 *   (avatar, name, verified badge, follower count) pulled from the
 *   instagram-scrape edge function.
 * - Admin Deletion, Pull-to-Refresh, Skeleton Loading, Silent Mentions kept
 *   from the previous pass.
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { createCooldown } from '../lib/rateLimit';
import MediaViewer from './MediaViewer';
import ProfileCard from './ProfileCard';
import AuthModal from './AuthModal';
import EmojiGifPicker from './EmojiGifPicker';
import { showToast, friendlyDbError } from '../lib/toast';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const MESSAGE_LIMIT = 200;
const REPLY_SNIPPET_LENGTH = 80;
const ADMIN_DISPLAY_NAME = 'ADMIN';
const UPLOAD_TIMEOUT_MS = 60000;

const BUBBLE_OWN = 'var(--blue)';
const BUBBLE_THEM = 'var(--glass-strong)';

// Chat canvas background
const CHAT_BACKGROUND_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230a84ff' fill-opacity='0.035'%3E%3Ccircle cx='6' cy='6' r='2'/%3E%3Ccircle cx='36' cy='24' r='2'/%3E%3Ccircle cx='18' cy='42' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")";

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Back: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  ),
  Attach: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  Send: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  ReplyAction: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  ),
  Close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  FileText: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  AdminShield: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Spinner: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner-animation">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  Smiley: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  ),
  ThreeDots: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
  SearchSmall: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Ghost: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  ),
  GhostSolid: (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  ),
  Trash: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Refresh: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  CheckCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--blue)" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" stroke="none" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  ),
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
  Camera: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Instagram: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
};

// ============================================================================
// 3. UTILITY & FORMATTING FUNCTIONS
// ============================================================================

function resolveIdentity(user) {
  if (user?.is_admin) {
    return { name: ADMIN_DISPLAY_NAME, avatarUrl: null, isAdmin: true };
  }
  return { name: user?.username || 'Unknown User', avatarUrl: user?.avatar_url || null, isAdmin: false };
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTime(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatClock(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatCount(n) {
  if (n === null || n === undefined) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// Recognizes image/video/audio mime prefixes; everything else falls back to
// the generic "file" bucket (rendered as a document link).
function guessMediaType(file) {
  if (!file) return 'file';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function generateReplySnippet(message) {
  if (!message) return 'Original message';
  if (message.instagram_username) return `📷 @${message.instagram_username}`;
  if (message.media_url) {
    if (message.media_type === 'image') return '📸 Photo';
    if (message.media_type === 'video') return '🎬 Video';
    if (message.media_type === 'audio') return '🎵 Voice message';
    if (message.media_type === 'gif') return '🎞️ GIF';
    if (message.media_type === 'sticker') return '🏷️ Sticker';
    return '📄 Attachment';
  }
  const text = message.text || '';
  if (text.length > REPLY_SNIPPET_LENGTH) return `${text.slice(0, REPLY_SNIPPET_LENGTH)}…`;
  return text;
}

function formatDayLabel(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function dayKey(dateString) {
  return new Date(dateString).toDateString();
}

// Calls the instagram-scrape edge function. Returns null on any failure so
// callers can show one clean toast instead of leaking error shapes.
async function scrapeInstagram(username) {
  try {
    const { data, error } = await supabase.functions.invoke('instagram-scrape', { body: { username } });
    if (error || !data || data.error) return null;
    return data;
  } catch {
    return null;
  }
}

// ============================================================================
// 4. SUB-COMPONENTS & PHYSICS ENGINE
// ============================================================================

const GlobalKeyframes = () => (
  <style>{`
    @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes pop-in { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes highlightPulse {
      0% { background-color: rgba(10, 132, 255, 0.4); transform: scale(1.02); }
      50% { background-color: rgba(10, 132, 255, 0.1); transform: scale(1); }
      100% { background-color: rgba(10, 132, 255, 0.4); transform: scale(1.02); }
    }
    .highlight-flash { animation: highlightPulse 0.6s ease-in-out 3; }
    .spinner-animation { animation: spin 1.2s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes spin-fast { 100% { transform: rotate(360deg); } }
    .refresh-spin { animation: spin-fast 0.8s linear infinite; }
    @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
    .shimmer-bg {
      animation: shimmer 2s infinite linear;
      background: linear-gradient(to right, rgba(0,0,0,0.04) 4%, rgba(0,0,0,0.08) 25%, rgba(0,0,0,0.04) 36%);
      background-size: 1000px 100%;
    }
    .no-copy-text {
      -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; -webkit-touch-callout: none;
    }
  `}</style>
);

function MessageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 16px', opacity: 0.7 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
        <div className="shimmer-bg" style={{ width: '60%', height: 56, borderRadius: 20, borderBottomRightRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="shimmer-bg" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        <div className="shimmer-bg" style={{ width: '40%', height: 40, borderRadius: 20, borderBottomLeftRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
        <div className="shimmer-bg" style={{ width: '50%', height: 72, borderRadius: 20, borderBottomRightRadius: 4 }} />
      </div>
    </div>
  );
}

function DMLiquidAvatar({ identity, size = 42, isAnon = false }) {
  const containerStyle = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--glass-border)',
    userSelect: 'none'
  };

  if (isAnon) {
    return (
      <div style={{ ...containerStyle, background: 'var(--glass-border)', color: 'var(--dim)' }}>
        <div style={{ transform: 'scale(0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {Vectors.GhostSolid}
        </div>
      </div>
    );
  }

  if (identity.isAdmin) {
    return (
      <div style={{ ...containerStyle, background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: '#fff', fontSize: size * 0.35, fontWeight: 800 }}>
        ADM
      </div>
    );
  }

  if (identity.avatarUrl) {
    return (
      <div style={containerStyle}>
        <img src={identity.avatarUrl} alt={identity.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  const colors = [
    'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  ];
  const colorIndex = (identity.name || '').length % colors.length;

  return (
    <div style={{ ...containerStyle, background: colors[colorIndex], color: '#ffffff', fontWeight: 700, fontSize: size * 0.4 }}>
      {getInitials(identity.name)}
    </div>
  );
}

// ---- Beautiful audio player: waveform bars, scrub, play/pause, timer -------
function AudioBubble({ src, isOwn }) {
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
  const activeColor = isOwn ? '#fff' : 'var(--blue)';
  const inactiveColor = isOwn ? 'rgba(255,255,255,0.35)' : 'var(--glass-border)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 230, padding: '2px 2px' }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button
        onClick={toggle}
        style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0, background: isOwn ? 'rgba(255,255,255,0.25)' : 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        {playing ? Vectors.Pause : Vectors.Play}
      </button>
      <div onClick={seek} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 26, cursor: 'pointer' }}>
        {Array.from({ length: barCount }).map((_, i) => {
          const active = (i / barCount) * 100 <= progress;
          const h = 5 + Math.abs(Math.sin(i * 1.35 + 0.4)) * 15;
          return (
            <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: active ? activeColor : inactiveColor, transition: 'background 0.1s' }} />
          );
        })}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--dim)', flexShrink: 0, minWidth: 30, textAlign: 'right' }}>
        {formatClock(playing || currentTime ? currentTime : duration)}
      </span>
    </div>
  );
}

// ---- Framed video player -----------------------------------------------
function VideoBubble({ src }) {
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', background: '#000', maxWidth: 260 }}>
      <video src={src} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 320, display: 'block' }} />
    </div>
  );
}

// ---- Instagram profile card ---------------------------------------------
function InstagramCard({ message, isOwn }) {
  const followers = formatCount(message.instagram_followers);
  return (
    <a
      href={`https://instagram.com/${message.instagram_username}`}
      target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, minWidth: 220, textDecoration: 'none', background: isOwn ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.04)' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOwn ? '#fff' : 'var(--blue)' }}>
        {message.instagram_pfp_url ? (
          <img src={message.instagram_pfp_url} alt={message.instagram_username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : Vectors.Instagram}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: isOwn ? '#fff' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{message.instagram_username}
          </span>
          {message.instagram_is_verified && <span style={{ color: 'var(--blue)', fontSize: 13 }}>✓</span>}
        </div>
        {message.instagram_full_name && (
          <div style={{ fontSize: 12, color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {message.instagram_full_name}
          </div>
        )}
        <div style={{ fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.7)' : 'var(--dim)', marginTop: 2 }}>
          {followers ? `${followers} followers` : 'View on Instagram'}
        </div>
      </div>
    </a>
  );
}

function AttachmentSheet({ open, onClose, onPickImage, onPickFile, onOpenCamera, onPickInstagram }) {
  if (!open) return null;
  const Item = ({ icon, label, onClick }) => (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', flex: 1 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>{icon}</div>
      <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{label}</span>
    </button>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--glass-strong)', backdropFilter: 'blur(30px)', borderRadius: '20px 20px 0 0', padding: '20px 16px', display: 'flex', gap: 8 }}>
        <Item icon={Vectors.FileText} label="Files" onClick={onPickFile} />
        <Item icon={Vectors.Smiley} label="Photo" onClick={onPickImage} />
        <Item icon={Vectors.Camera} label="Camera" onClick={onOpenCamera} />
        <Item icon={Vectors.Instagram} label="Instagram" onClick={onPickInstagram} />
      </div>
    </div>
  );
}

// Only asks for a username — the edge function does the rest.
function InstagramModal({ open, onClose, onSubmit, loading }) {
  const [username, setUsername] = useState('');
  if (!open) return null;
  return (
    <div onClick={loading ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--glass-strong)', backdropFilter: 'blur(30px)', borderRadius: '20px 20px 0 0', padding: 20 }}>
        <h3 style={{ margin: '0 0 4px', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>{Vectors.Instagram} Share Instagram Profile</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dim)' }}>Just the username — we'll pull the profile card automatically.</p>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', fontWeight: 700 }}>@</span>
          <input
            autoFocus type="text" value={username} disabled={loading}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, '').trim())}
            onKeyDown={(e) => { if (e.key === 'Enter' && username.trim()) onSubmit(username.trim()); }}
            placeholder="username"
            style={{ width: '100%', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '12px 14px 12px 28px', fontSize: 15, boxSizing: 'border-box', color: 'var(--ink)', background: 'var(--glass)' }}
          />
        </div>
        <button
          onClick={() => username.trim() && onSubmit(username.trim())}
          disabled={loading || !username.trim()}
          style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 16, border: 'none', background: loading ? 'var(--glass-border)' : 'var(--blue)', color: '#fff', fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {loading ? (<>{Vectors.Spinner} Fetching profile…</>) : 'Share Profile'}
        </button>
      </div>
    </div>
  );
}

// Custom hook for Long Press (Admin Selection)
function useLongPress(callback, ms = 500) {
  const timerRef = useRef();

  const start = useCallback((e, msg) => {
    timerRef.current = setTimeout(() => {
      callback(msg);
    }, ms);
  }, [callback, ms]);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchMove: stop
  };
}

// Custom hook for Pull-to-Refresh from TOP of screen
function usePullToRefresh(onRefresh, scrollRef) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(null);

  const handleTouchStart = (e) => {
    if (scrollRef.current) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (startY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    // Trigger only if pulling DOWN and we are near the visual top of the container.
    if (diff > 0 && e.touches[0].clientY < 200) {
      const resistance = diff * 0.4;
      setPullDistance(Math.min(resistance, 80));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(50);
      await onRefresh();
      setIsRefreshing(false);
    }
    setPullDistance(0);
    startY.current = null;
  };

  return { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd };
}

function SwipeableMessage({ children, onSwipe, disabled }) {
  const [translateX, setTranslateX] = useState(0);
  const touchStartX = useRef(null);

  const handleTouchStart = (e) => {
    if (disabled) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    if (disabled || touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;
    if (diff < 0 && diff > -70) setTranslateX(diff);
  };

  const handleTouchEnd = () => {
    if (disabled) return;
    if (translateX <= -40) onSwipe();
    setTranslateX(0);
    touchStartX.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${translateX}px)`,
        transition: translateX === 0 ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
        width: '100%', position: 'relative', touchAction: 'pan-y', willChange: 'transform',
      }}
    >
      <div style={{ position: 'absolute', top: '50%', right: -40, transform: 'translateY(-50%)', opacity: translateX < -20 ? 1 : 0, transition: 'opacity 0.2s', color: 'var(--dim)' }}>
        {Vectors.ReplyAction}
      </div>
      {children}
    </div>
  );
}

function SendButton({ canSend, sending, cooldownPercent }) {
  const isCoolingDown = cooldownPercent > 0;
  const ringSize = 44;
  const strokeWidth = 3;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - cooldownPercent / 100);

  return (
    <button
      type="submit"
      disabled={!canSend || sending || isCoolingDown}
      style={{
        position: 'relative', width: ringSize, height: ringSize, borderRadius: '50%', border: 'none', flexShrink: 0,
        background: isCoolingDown ? 'var(--glass)' : (canSend ? 'var(--blue)' : 'var(--glass-border)'),
        color: canSend ? '#fff' : 'var(--dim)', cursor: canSend && !isCoolingDown ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s',
      }}
    >
      {isCoolingDown ? (
        <>
          <svg width={ringSize} height={ringSize} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="var(--glass-border)" strokeWidth={strokeWidth} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="var(--blue)" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.2s linear' }} />
          </svg>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
        </>
      ) : (
        Vectors.Send
      )}
    </button>
  );
}

// ============================================================================
// 5. MAIN DIRECT MESSAGES COMPONENT EXPORT
// ============================================================================

export default function DirectMessages({ openThreadWithUserId, onBack, onThreadReady }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const isAdmin = profile?.is_admin === true;

  const [activeThread, setActiveThread] = useState(null);
  const [threadStatus, setThreadStatus] = useState('loading');

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const [viewerMedia, setViewerMedia] = useState(null);
  const [cooldownPercent, setCooldownPercent] = useState(0);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // New Features State
  const [hasUnreadMention, setHasUnreadMention] = useState(false);
  const [latestMentionId, setLatestMentionId] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Attachment preview / caption flow
  const [pendingFile, setPendingFile] = useState(null); // { file, previewUrl, type }
  const [caption, setCaption] = useState('');
  const [uploadSecondsLeft, setUploadSecondsLeft] = useState(60);

  // Attachment sheet + Instagram
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [instagramLoading, setInstagramLoading] = useState(false);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cooldownRef = useRef(null);

  // --------------------------------------------------------------------------
  // INITIALIZATION EFFECTS
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!openThreadWithUserId) return;

    if (!userId) {
      setThreadStatus('error');
      showToast("You must be logged in to view private direct messages.", 'error');
      return;
    }

    let isMounted = true;
    setThreadStatus('loading');

    async function initializeThread() {
      try {
        const { data: existingRows, error: findError } = await supabase
          .from('dm_threads')
          .select('id, user_a, user_b')
          .or(`and(user_a.eq.${userId},user_b.eq.${openThreadWithUserId}),and(user_a.eq.${openThreadWithUserId},user_b.eq.${userId})`)
          .limit(1);

        if (findError) throw findError;

        let threadRow = existingRows?.[0] || null;

        if (!threadRow) {
          const { data: created, error: createError } = await supabase
            .from('dm_threads')
            .insert({ user_a: userId, user_b: openThreadWithUserId })
            .select('id, user_a, user_b')
            .single();

          if (createError) throw createError;
          threadRow = created;
        }

        const { data: otherProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_admin')
          .eq('id', openThreadWithUserId)
          .maybeSingle();

        if (profileError) throw profileError;

        if (isMounted) {
          const resolvedOtherUser = otherProfile || { id: openThreadWithUserId, username: 'Unknown User' };
          setActiveThread({
            id: threadRow.id,
            otherUser: resolvedOtherUser,
          });
          setThreadStatus('ready');

          if (onThreadReady) {
            onThreadReady({ id: resolvedOtherUser.id, username: resolvedOtherUser.username });
          }
        }
      } catch (err) {
        console.error('Failed to load thread:', err);
        if (isMounted) {
          setThreadStatus('error');
          showToast(friendlyDbError(), 'error');
        }
      }
    }

    initializeThread();
    return () => { isMounted = false; };
  }, [userId, openThreadWithUserId, onThreadReady]);

  // Messages subscription & Unread Mention Tracking
  const fetchMessagesAndReceipts = useCallback(async () => {
    if (!activeThread?.id || !userId) return;

    let isMounted = true;

    const { data: receiptData } = await supabase
      .from('dm_read_receipts')
      .select('last_read_at')
      .eq('thread_id', activeThread.id)
      .eq('user_id', userId)
      .maybeSingle();

    const lastReadAt = receiptData?.last_read_at || '1970-01-01T00:00:00.000Z';

    const { data, error } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('thread_id', activeThread.id)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT);

    if (error) {
      console.error(error);
      showToast(friendlyDbError(), 'error');
    } else if (isMounted) {
      const fetchedMessages = data || [];
      setMessages(fetchedMessages);

      const unreadMention = fetchedMessages.find(
        m => m.mentioned_user_ids?.includes(userId) && new Date(m.created_at) > new Date(lastReadAt)
      );

      if (unreadMention) {
        setHasUnreadMention(true);
        setLatestMentionId(unreadMention.id);
      } else {
        supabase.from('dm_read_receipts').upsert({
          thread_id: activeThread.id,
          user_id: userId,
          last_read_at: new Date().toISOString()
        }).then();
      }
    }
    setMessagesLoading(false);
  }, [activeThread?.id, userId]);

  useEffect(() => {
    fetchMessagesAndReceipts();

    if (!activeThread?.id) return;

    const channel = supabase.channel(`dm_messages:${activeThread.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${activeThread.id}` }, (payload) => {

        const newMsg = payload.new;
        const isMentioned = userId && newMsg.mentioned_user_ids?.includes(userId);

        if (isMentioned) {
          setHasUnreadMention(true);
          setLatestMentionId(newMsg.id);
        }

        setMessages((prev) => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [newMsg, ...prev];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${activeThread.id}` }, (payload) => {
         setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeThread?.id, userId, fetchMessagesAndReceipts]);

  useEffect(() => {
    cooldownRef.current = createCooldown(
      (percent) => setCooldownPercent(percent),
      () => setCooldownPercent(0)
    );
    return () => { cooldownRef.current?.cancel(); };
  }, []);

  // Hook into our custom Pull-To-Refresh physics
  const { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchMessagesAndReceipts, scrollRef);

  // --------------------------------------------------------------------------
  // ADMIN DELETION LOGIC
  // --------------------------------------------------------------------------
  const toggleSelection = (msgId) => {
    if (!isAdmin) return;
    setSelectedMessages(prev =>
      prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
    );
  };

  const handleLongPress = (msg) => {
    if (isAdmin) toggleSelection(msg.id);
  };

  const longPressHook = useLongPress(handleLongPress, 500);

  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedMessages.length === 0) return;

    // Optimistic UI removal
    setMessages(prev => prev.filter(m => !selectedMessages.includes(m.id)));

    const { error } = await supabase
      .from('dm_messages')
      .delete()
      .in('id', selectedMessages);

    if (error) {
      console.error(error);
      showToast(friendlyDbError(), 'error');
      fetchMessagesAndReceipts(); // Revert on failure
    }

    setSelectedMessages([]);
  };

  function handleJumpToMention() {
    if (!latestMentionId) return;

    const element = document.getElementById(`dm-msg-${latestMentionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(latestMentionId);
      setTimeout(() => setHighlightedMsgId(null), 2000);
    }

    setHasUnreadMention(false);
    if (userId && activeThread?.id) {
      supabase.from('dm_read_receipts').upsert({
        thread_id: activeThread.id,
        user_id: userId,
        last_read_at: new Date().toISOString()
      }).then();
    }
  }

  async function resolveMentionedIds(outgoingText) {
    const mentionedUsernames = [...outgoingText.matchAll(/@([a-zA-Z0-9_]+)/g)].map(m => m[1].toLowerCase());
    if (mentionedUsernames.length === 0) return [];

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('username', mentionedUsernames);

    return data ? data.map(p => p.id) : [];
  }

  async function handleMentionClick(username) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .maybeSingle();

    if (data?.id) {
      setProfileCardUserId(data.id);
    }
    // Silently ignore if user is not found. No alert().
  }

  const renderMessageTextWithMentions = (messageText, isOwn) => {
    if (!messageText) return null;
    const parts = messageText.split(/(@[a-zA-Z0-9_]+)/g);

    return parts.map((part, i) => {
      if (part.startsWith('@') && part.length > 1) {
        const username = part.substring(1);
        return (
          <button
            key={i}
            onClick={() => handleMentionClick(username)}
            style={{
              color: isOwn ? '#cce4ff' : 'var(--blue)',
              textDecoration: 'underline',
              background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', fontSize: 'inherit'
            }}
          >
            {part}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // --------------------------------------------------------------------------
  // COMPOSER HELPERS
  // --------------------------------------------------------------------------
  const startReply = useCallback((message) => {
    const isOwn = message.sender_id === userId;
    // Hide true identity if message was anon
    const senderName = message.is_anon ? 'Anonymous' : (isOwn ? 'You' : resolveIdentity(activeThread?.otherUser).name);

    setReplyingTo({
      id: message.id,
      sender_name: senderName,
      text: message.text,
      media_url: message.media_url,
      media_type: message.media_type,
      instagram_username: message.instagram_username,
    });
  }, [userId, activeThread]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !userId || !activeThread || sending) return;

    if (cooldownPercent > 0) {
      showToast("Please wait a few seconds before sending another message.", 'info');
      return;
    }

    setSending(true);
    const mentionedIds = await resolveMentionedIds(trimmed);

    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      text: trimmed,
      reply_to_id: replyingTo?.id ?? null,
      mentioned_user_ids: mentionedIds,
      is_anon: false
    });

    setSending(false);
    if (error) {
      console.error(error);
      showToast(friendlyDbError(), 'error');
      return;
    }

    setText('');
    setReplyingTo(null);
    setPickerOpen(false);
    cooldownRef.current?.start();
  }

  // --------------------------------------------------------------------------
  // ATTACHMENT PREVIEW / CAPTION FLOW
  // --------------------------------------------------------------------------
  function handleAttachmentSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), type: guessMediaType(file) });
  }

  function cancelPendingAttachment() {
    if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setCaption('');
  }

  async function sendPendingAttachment() {
    if (!pendingFile || !userId || !activeThread || uploading) return;
    if (cooldownPercent > 0) {
      showToast('Please wait a few seconds before sending another message.', 'info');
      return;
    }

    setUploading(true);
    setUploadSecondsLeft(60);
    const tick = setInterval(() => setUploadSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);

    const { file, type } = pendingFile;
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `${userId}/dm-${Date.now()}-${safeName}`;

    try {
      const uploadPromise = supabase.storage.from('media').upload(path, file, { upsert: false, contentType: file.type || undefined });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), UPLOAD_TIMEOUT_MS));
      const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) throw new Error('NO_URL');

      const { error: insertError } = await supabase.from('dm_messages').insert({
        thread_id: activeThread.id,
        sender_id: userId,
        text: caption.trim() || null,
        media_url: publicUrl,
        media_type: type,
        reply_to_id: replyingTo?.id ?? null,
        is_anon: false,
      });
      if (insertError) throw insertError;

      URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setCaption('');
      setReplyingTo(null);
      cooldownRef.current?.start();
    } catch (err) {
      console.error(err);
      showToast(err.message === 'TIMEOUT' ? "Upload timed out — check your connection and try again." : "Couldn't send that file. Please try again.", 'error');
    } finally {
      clearInterval(tick);
      setUploading(false);
    }
  }

  async function handleMediaPicked(url, mediaType) {
    if (!userId || !activeThread || sending) return;

    if (cooldownPercent > 0) {
      showToast("Please wait a few seconds before sending another message.", 'info');
      return;
    }

    setPickerOpen(false);

    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      media_url: url,
      media_type: mediaType,
      reply_to_id: replyingTo?.id ?? null,
      is_anon: false
    });

    if (error) {
      console.error(error);
      showToast(friendlyDbError(), 'error');
      return;
    }

    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  function handleEmojiPicked(char) {
    setText((prev) => prev + char);
  }

  // --------------------------------------------------------------------------
  // INSTAGRAM
  // --------------------------------------------------------------------------
  async function handleInstagramSubmit(username) {
    if (!userId || !activeThread) return;
    setInstagramLoading(true);
    const data = await scrapeInstagram(username);
    setInstagramLoading(false);

    if (!data) {
      showToast("Couldn't find that Instagram profile. Double check the username.", 'error');
      return;
    }

    setInstagramModalOpen(false);
    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      instagram_username: data.username,
      instagram_pfp_url: data.pfp_url,
      instagram_full_name: data.full_name,
      instagram_bio: data.bio,
      instagram_followers: data.followers,
      instagram_following: data.following,
      instagram_posts: data.posts,
      instagram_is_verified: data.is_verified,
      instagram_is_private: data.is_private,
      reply_to_id: replyingTo?.id ?? null,
      is_anon: false,
    });

    if (error) {
      console.error(error);
      showToast(friendlyDbError(), 'error');
      return;
    }
    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  const filteredMessages = messages.filter((m) => {
    if (!isSearching || !chatSearchQuery.trim()) return true;
    const q = chatSearchQuery.trim().toLowerCase();
    if (q.startsWith('@') && q.length > 1) {
      const targetName = q.substring(1);
      return m.instagram_username?.toLowerCase() === targetName;
    }
    return m.text?.toLowerCase().includes(q);
  });

  if (threadStatus === 'loading') {
    return (
      <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--blue)' }}>{Vectors.Spinner}</div>
      </div>
    );
  }

  if (threadStatus === 'error' || !activeThread) {
    return (
      <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 16, padding: 24 }}>
        <p style={{ color: 'var(--dim)', fontWeight: 600 }}>Failed to load chat.</p>
        <button onClick={onBack} style={{ background: 'var(--blue)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
          Go Back
        </button>
      </div>
    );
  }

  const otherIdentity = resolveIdentity(activeThread.otherUser);

  return (
    <div className="no-copy-text" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden', zIndex: 1, userSelect: 'none', WebkitUserSelect: 'none' }}>
      <GlobalKeyframes />

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'var(--bg)' }}>
        <div style={{ position: 'absolute', top: '10%', left: '10%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,132,255,0.08), transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* SELECTION OR NORMAL HEADER */}
      {selectedMessages.length > 0 ? (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'var(--blue)', color: '#fff', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSelectedMessages([])} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', padding: '4px', marginLeft: '-8px' }}>
              {Vectors.Close}
            </button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{selectedMessages.length} Selected</span>
          </div>
          <button onClick={handleDeleteSelected} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            {Vectors.Trash} Delete
          </button>
        </header>
      ) : (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', background: 'var(--glass-strong)', backdropFilter: 'blur(30px) saturate(200%)', borderBottom: '1px solid var(--glass-border)', zIndex: 20 }}>
          <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--blue)', cursor: 'pointer', padding: '4px', marginLeft: '-8px' }}>
            {Vectors.Back}
          </button>

          <button onClick={() => setProfileCardUserId(activeThread.otherUser.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
            <DMLiquidAvatar identity={otherIdentity} size={42} />
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
            <button onClick={() => setProfileCardUserId(activeThread.otherUser.id)} style={{ fontWeight: 700, fontSize: 16, color: otherIdentity.isAdmin ? '#FF8C00' : 'var(--ink)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
              {otherIdentity.name}
              {otherIdentity.isAdmin && Vectors.AdminShield}
            </button>
            <span style={{ fontSize: 13, color: 'var(--blue)' }}>Online</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((v) => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                {Vectors.ThreeDots}
              </button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--glass-strong)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 30, minWidth: 160, padding: 6 }}>
                  <button onClick={() => { setIsSearching(true); setMenuOpen(false); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--ink)', textAlign: 'left', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {Vectors.SearchSmall} Search Chat
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.href); setMenuOpen(false); showToast('Link copied to clipboard!', 'info'); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--ink)', textAlign: 'left', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    Share link
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {isSearching && (
        <div style={{ background: 'var(--glass-strong)', borderBottom: '1px solid var(--glass-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 19 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', pointerEvents: 'none' }}>
              {Vectors.SearchSmall}
            </span>
            <input
              autoFocus
              type="text"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder="Search in chat..."
              style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 16, border: 'none', background: 'var(--glass-border)', color: 'var(--ink)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {chatSearchQuery && (
              <button onClick={() => setChatSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'var(--glass)', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 'bold', color: 'var(--dim)', cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>
          <button onClick={() => { setIsSearching(false); setChatSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            Cancel
          </button>
        </div>
      )}

      {/* HIDDEN PULL-TO-REFRESH SPINNER CONTAINER */}
      <div
        style={{
          position: 'absolute', top: 72, left: 0, right: 0, height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5,
          transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`,
          opacity: pullDistance > 10 ? 1 : 0,
          transition: isRefreshing ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          color: 'var(--blue)'
        }}
      >
        <div className={isRefreshing ? "refresh-spin" : ""} style={{ transform: `rotate(${pullDistance * 4}deg)` }}>
          {Vectors.Refresh}
        </div>
      </div>

      <div
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="custom-scrollbar"
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch', padding: '20px 16px', display: 'flex',
          flexDirection: 'column-reverse', zIndex: 10, minHeight: 0,
          backgroundColor: 'var(--bg)', backgroundImage: CHAT_BACKGROUND_IMAGE, backgroundRepeat: 'repeat',
          transform: `translateY(${pullDistance}px)`,
          transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
        }}
      >
        {messagesLoading && <MessageSkeleton />}

        {!messagesLoading && filteredMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--glass-border)', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: 'var(--dim)' }}>
              {isSearching ? 'No messages found.' : `Say hello to ${otherIdentity.name} 👋`}
            </div>
          </div>
        )}

        {!messagesLoading && filteredMessages.map((message, index) => {
          const isOwn = userId && message.sender_id === userId;
          const isAnonMsg = message.is_anon === true;
          const isInstagram = !!message.instagram_username;

          const olderMessage = filteredMessages[index + 1];
          const showDayDivider = !olderMessage || dayKey(message.created_at) !== dayKey(olderMessage.created_at);

          const repliedMessage = message.reply_to_id ? messages.find((m) => m.id === message.reply_to_id) || null : null;
          const isStickerOrGif = message.media_type === 'gif' || message.media_type === 'sticker';
          const isHighlighted = highlightedMsgId === message.id;
          const isSelected = selectedMessages.includes(message.id);

          return (
            <React.Fragment key={message.id}>
              <div
                {...longPressHook}
                onClick={() => {
                  if (selectedMessages.length > 0) toggleSelection(message.id);
                }}
              >
                <SwipeableMessage onSwipe={() => { if (selectedMessages.length === 0) startReply(message); }} disabled={isSearching || selectedMessages.length > 0}>
                  <div
                    id={`dm-msg-${message.id}`}
                    className={isHighlighted ? 'highlight-flash' : ''}
                    style={{
                      display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end',
                      gap: 8, marginBottom: 16, borderRadius: 16, padding: '4px 8px',
                      background: isSelected ? 'rgba(10, 132, 255, 0.15)' : 'transparent',
                      animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both',
                      transition: 'background 0.2s'
                    }}
                  >

                    {/* SELECTION CHECKMARK */}
                    {selectedMessages.length > 0 && isAdmin && (
                       <div style={{ margin: '0 8px 16px', color: isSelected ? 'var(--blue)' : 'var(--glass-border)' }}>
                         {isSelected ? Vectors.CheckCircle : <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid currentColor' }} />}
                       </div>
                    )}

                    {!isOwn && (
                      <div style={{ padding: 0, marginBottom: 20 }}>
                        <DMLiquidAvatar identity={otherIdentity} isAnon={isAnonMsg} size={36} />
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                      {!isOwn && isAnonMsg && (
                        <span style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, marginLeft: 6, color: 'var(--dim)' }}>
                          Anonymous
                        </span>
                      )}

                      <div style={{ maxWidth: '100%', padding: isInstagram ? '4px' : ((message.media_url && !isStickerOrGif) ? '4px' : (isStickerOrGif ? 0 : '10px 16px')), borderRadius: isStickerOrGif ? 0 : 20, borderBottomRightRadius: isStickerOrGif ? 0 : (isOwn ? 4 : 20), borderBottomLeftRadius: isStickerOrGif ? 0 : (isOwn ? 20 : 4), background: isStickerOrGif ? 'transparent' : (isOwn ? BUBBLE_OWN : BUBBLE_THEM), color: isOwn ? '#fff' : 'var(--ink)', boxShadow: isStickerOrGif ? 'none' : '0 2px 10px rgba(0,0,0,0.05)' }}>
                        {message.reply_to_id && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', marginBottom: 8, marginTop: (message.media_url || isInstagram) ? 4 : 0, borderRadius: 10, background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)', borderLeft: `3px solid ${isOwn ? '#fff' : 'var(--blue)'}` }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isOwn ? '#fff' : 'var(--blue)' }}>
                              {repliedMessage ? (repliedMessage.is_anon ? 'Anonymous' : (repliedMessage.sender_id === userId ? 'You' : otherIdentity.name)) : 'Original'}
                            </span>
                            <span className="no-copy-text" style={{ fontSize: 13, color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {generateReplySnippet(repliedMessage)}
                            </span>
                          </div>
                        )}

                        {isInstagram ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: message.text ? 6 : 0 }}>
                            <InstagramCard message={message} isOwn={isOwn} />
                            {message.text && (
                              <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>
                                {renderMessageTextWithMentions(message.text, isOwn)}
                              </span>
                            )}
                          </div>
                        ) : message.media_url ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: message.text ? 6 : 0 }}>
                            {isStickerOrGif ? (
                              <button onClick={() => setViewerMedia({ url: message.media_url, type: message.media_type })} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}>
                                <img src={message.media_url} alt={message.media_type === 'sticker' ? 'Sticker' : 'GIF'} style={{ maxWidth: 160, maxHeight: 160, display: 'block', borderRadius: 12 }} />
                              </button>
                            ) : message.media_type === 'image' ? (
                              <button onClick={() => setViewerMedia({ url: message.media_url, type: 'image' })} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block', width: '100%' }}>
                                <img src={message.media_url} alt="Attachment" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 16, display: 'block', objectFit: 'cover' }} />
                              </button>
                            ) : message.media_type === 'video' ? (
                              <VideoBubble src={message.media_url} />
                            ) : message.media_type === 'audio' ? (
                              <AudioBubble src={message.media_url} isOwn={isOwn} />
                            ) : (
                              <a href={message.media_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)', borderRadius: 16, textDecoration: 'none' }}>
                                <div style={{ color: isOwn ? '#fff' : 'var(--blue)' }}>{Vectors.FileText}</div>
                                <span style={{ color: isOwn ? '#fff' : 'var(--ink)', fontSize: 14, fontWeight: 600 }}>Document</span>
                              </a>
                            )}
                            {message.text && (
                              <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>
                                {renderMessageTextWithMentions(message.text, isOwn)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="no-copy-text" style={{ fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>
                            {renderMessageTextWithMentions(message.text, isOwn)}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4, marginInline: 4, fontWeight: 500 }}>
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                  </div>
                </SwipeableMessage>
              </div>

              {showDayDivider && !isSearching && (
                <div style={{ textAlign: 'center', margin: '24px 0 16px', position: 'sticky', top: 10, zIndex: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)', background: 'var(--glass-strong)', padding: '6px 14px', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    {formatDayLabel(message.created_at)}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {hasUnreadMention && (
        <button
          onClick={handleJumpToMention}
          style={{
            position: 'absolute', right: 16, bottom: 80, width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)', color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(10,132,255,0.3)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, cursor: 'pointer', animation: 'pop-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
        >
          @
        </button>
      )}

      <div className="safe-bottom" style={{ flexShrink: 0, zIndex: 20, position: 'sticky', bottom: 0 }}>
        {!session ? (
          <div style={{ padding: '16px', background: 'var(--glass-strong)', backdropFilter: 'blur(30px) saturate(200%)', borderTop: '1px solid var(--glass-border)' }}>
            <button onClick={() => setAuthOpen(true)} style={{ width: '100%', padding: '14px 0', borderRadius: 20, border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 24px rgba(10,132,255,0.3)' }}>
              Sign in to send message
            </button>
          </div>
        ) : (
        <>
        {/* Attachment preview + caption bar */}
        {pendingFile && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--glass-strong)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '12px 16px', zIndex: 21 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              {pendingFile.type === 'image' ? (
                <img src={pendingFile.previewUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              ) : pendingFile.type === 'video' ? (
                <video src={pendingFile.previewUrl} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              ) : pendingFile.type === 'audio' ? (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>{Vectors.Smiley}</div>
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>{Vectors.FileText}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</span>
                {uploading && <span style={{ fontSize: 12, color: 'var(--dim)' }}>Uploading… {uploadSecondsLeft}s</span>}
              </div>
              <button onClick={cancelPendingAttachment} disabled={uploading} style={{ border: 'none', background: 'var(--glass-border)', width: 28, height: 28, borderRadius: '50%', color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Vectors.Close}</button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" disabled={uploading} style={{ flex: 1, border: '1px solid var(--glass-border)', outline: 'none', background: 'var(--glass)', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: 'var(--ink)' }} />
              <button type="button" onClick={sendPendingAttachment} disabled={uploading} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: uploading ? 'var(--glass-border)' : 'var(--blue)', color: '#fff', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {uploading ? Vectors.Spinner : Vectors.Send}
              </button>
            </div>
          </div>
        )}

        {/* Reply preview bar */}
        <div style={{ position: 'absolute', bottom: pendingFile ? undefined : '100%', top: pendingFile ? '100%' : undefined, left: 0, right: 0, background: 'var(--glass-strong)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1)', transform: replyingTo && !pendingFile ? 'translateY(0)' : 'translateY(100%)', opacity: replyingTo && !pendingFile ? 1 : 0, visibility: replyingTo && !pendingFile ? 'visible' : 'hidden', zIndex: 19 }}>
          <div style={{ color: 'var(--blue)' }}>{Vectors.ReplyAction}</div>
          <div style={{ width: 3, height: 34, borderRadius: 2, background: 'var(--blue)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>Replying to {replyingTo?.sender_name}</span>
            <span style={{ fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(replyingTo)}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} style={{ border: 'none', background: 'var(--glass-border)', width: 28, height: 28, borderRadius: '50%', color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Close}</button>
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--glass-strong)', backdropFilter: 'blur(30px) saturate(200%)', borderTop: replyingTo ? 'none' : '1px solid var(--glass-border)', position: 'relative', zIndex: 20 }}>
          <EmojiGifPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onEmoji={handleEmojiPicked} onMedia={handleMediaPicked} />
          <button type="button" onClick={() => setAttachSheetOpen(true)} disabled={uploading || cooldownPercent > 0 || selectedMessages.length > 0} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--dim)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{uploading ? Vectors.Spinner : Vectors.Attach}</button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleAttachmentSelected}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={handleAttachmentSelected}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
          <button type="button" onClick={() => setPickerOpen((v) => !v)} disabled={uploading || selectedMessages.length > 0} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: pickerOpen ? 'var(--glass-border)' : 'transparent', color: pickerOpen ? 'var(--blue)' : 'var(--dim)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Smiley}</button>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setPickerOpen(false)} placeholder={uploading ? 'Uploading media...' : 'Message'} disabled={uploading || selectedMessages.length > 0} style={{ flex: 1, border: '1px solid var(--glass-border)', outline: 'none', background: 'var(--glass)', borderRadius: 24, padding: '12px 18px', fontSize: 15, color: 'var(--ink)', transition: 'border-color 0.2s' }} />
          <SendButton canSend={!!text.trim()} sending={sending || uploading} cooldownPercent={cooldownPercent} />
        </form>
        </>
        )}
      </div>

      <AttachmentSheet
        open={attachSheetOpen}
        onClose={() => setAttachSheetOpen(false)}
        onPickFile={() => { setAttachSheetOpen(false); fileInputRef.current?.click(); }}
        onPickImage={() => { setAttachSheetOpen(false); fileInputRef.current?.click(); }}
        onOpenCamera={() => { setAttachSheetOpen(false); cameraInputRef.current?.click(); }}
        onPickInstagram={() => { setAttachSheetOpen(false); setInstagramModalOpen(true); }}
      />
      <InstagramModal open={instagramModalOpen} onClose={() => !instagramLoading && setInstagramModalOpen(false)} onSubmit={handleInstagramSubmit} loading={instagramLoading} />

      <MediaViewer mediaUrl={viewerMedia?.url} mediaType={viewerMedia?.type} open={viewerMedia !== null} onClose={() => setViewerMedia(null)} />
      <ProfileCard userId={profileCardUserId} open={!!profileCardUserId} onClose={() => setProfileCardUserId(null)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
    </div>
  );
}
