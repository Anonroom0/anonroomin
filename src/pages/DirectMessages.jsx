/**
 * ============================================================================
 * DIRECT MESSAGES MASTER VIEW (MATTE UI & FIXED RENDERING)
 * ============================================================================
 * CHANGES IN THIS PASS:
 * - MATCHED GROUP CHAT: Unified the visual language to use the Solid Matte 
 *   Hex palette (#1C1D24, #15161B, #0C0D10) instead of legacy glass variables.
 * - PROFESSIONAL COLORS: Sent messages use Deep Slate (#2A2B32) and received 
 *   messages use Matte Gray (#15161B).
 * - REACTION BAR INTEGRATION: Implemented the permanent ReactionBar below 
 *   message bubbles and the active popup override tray for clean Telegram-style 
 *   tapping.
 * - DESKTOP LAYOUT FIXED: Modals and Sheets now use `maxWidth: 500px` and 
 *   `justifyContent: 'center'` to prevent edge-to-edge stretching on large screens.
 * - KEPT DM SCOPE: Excluded Confessions and Anonymous features strictly.
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { toShortId, isShortId } from '../lib/subdomain';
import { createCooldown } from '../lib/rateLimit';
import MediaViewer from './MediaViewer';
import ProfileCard from './ProfileCard';
import AuthModal from './AuthModal';
import EmojiGifPicker from './EmojiGifPicker';
import ReactionBar from '../components/shared/ReactionBar';
import { showToast, friendlyDbError } from '../lib/toast';
import { playSend, playReceive } from '../lib/soundManager';
import { hapticSend, hapticSelect } from '../lib/haptics';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const MESSAGE_LIMIT = 20;
const MAX_TEXT_LENGTH = 500;
const REPLY_SNIPPET_LENGTH = 80;
const ADMIN_DISPLAY_NAME = 'ADMIN';
const UPLOAD_TIMEOUT_MS = 60000;

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Back: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>,
  Attach: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  Send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
  ReplyAction: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>,
  Close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  FileText: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  AdminShield: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Spinner: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner-animation"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
  Smiley: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
  ThreeDots: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>,
  SearchSmall: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  GhostSolid: <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" /></svg>,
  Trash: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Refresh: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  CheckCircle: <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF6B35" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" stroke="none" /><polyline points="8 12 11 15 16 9" /></svg>,
  Play: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3" /></svg>,
  Pause: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>,
  Camera: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  Instagram: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
};

// ============================================================================
// 3. UTILITY & FORMATTING FUNCTIONS
// ============================================================================

function resolveIdentity(user) {
  if (user?.is_admin) return { name: ADMIN_DISPLAY_NAME, avatarUrl: user?.avatar_url || null, isAdmin: true };
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
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function dayKey(dateString) {
  return new Date(dateString).toDateString();
}

// Resolves a #dm-msg-<id> URL fragment back to a real message id — the
// fragment can be an 8-char short id (see toShortId() in subdomain.js) or a
// full uuid (links shared before short ids existed). Mirrors
// resolveMessageIdFromHash in GroupChat.jsx.
function resolveMessageIdFromHash(hash, messages) {
  const match = /^#dm-msg-(.+)$/.exec(hash || '');
  if (!match) return null;
  const target = decodeURIComponent(match[1]);
  const exact = messages.find((m) => m.id === target);
  if (exact) return exact.id;
  const byPrefix = messages.find((m) => m.id.replace(/-/g, '').toLowerCase().startsWith(target.toLowerCase()));
  return byPrefix ? byPrefix.id : null;
}

async function scrapeInstagram(username) {
  try {
    const { data, error } = await supabase.functions.invoke('instagram-scrape', { body: { username } });
    if (error || !data || data.error) return null;
    return data;
  } catch { return null; }
}

// ============================================================================
// 4. SUB-COMPONENTS & PHYSICS ENGINE
// ============================================================================

const GlobalKeyframes = () => (
  <style>{`
    @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes pop-in { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes highlightPulse {
      0% { background-color: rgba(255, 107, 53, 0.4); transform: scale(1.02); }
      50% { background-color: rgba(255, 107, 53, 0.1); transform: scale(1); }
      100% { background-color: rgba(255, 107, 53, 0.4); transform: scale(1.02); }
    }
    .highlight-flash { animation: highlightPulse 0.6s ease-in-out 3; }
    .spinner-animation { animation: spin 1.2s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes spin-fast { 100% { transform: rotate(360deg); } }
    .refresh-spin { animation: spin-fast 0.8s linear infinite; }
    @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
    .shimmer-bg {
      animation: shimmer 2s infinite linear;
      background: linear-gradient(to right, #1C1D24 4%, #2A2B32 25%, #1C1D24 36%);
      background-size: 1000px 100%;
    }
    .no-copy-text {
      -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; -webkit-touch-callout: none;
    }
    .reaction-bar-matte-override button.add-btn,
    .reaction-bar-matte-override button[aria-label*="Add"],
    .reaction-bar-matte-override button:last-child {
      display: none !important;
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
    </div>
  );
}

function DMLiquidAvatar({ identity, size = 42, isAnon = false }) {
  const containerStyle = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
    userSelect: 'none'
  };

  if (isAnon) {
    return (
      <div style={{ ...containerStyle, background: '#15161B', color: '#8B8B96' }}>
        <div style={{ transform: 'scale(0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {Vectors.GhostSolid}
        </div>
      </div>
    );
  }

  if (identity.isAdmin && identity.avatarUrl) {
    // Admin's real photo, gold-ringed + shield-badged so it still reads
    // as "admin" without hiding the picture behind a flat "ADM" fallback.
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <div style={{ ...containerStyle, boxShadow: 'inset 0 0 0 2px var(--admin-1)' }}>
          <img src={identity.avatarUrl} alt={identity.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        {size >= 28 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', right: -2, bottom: -2,
              width: Math.max(14, Math.round(size * 0.36)), height: Math.max(14, Math.round(size * 0.36)),
              borderRadius: '50%', background: 'linear-gradient(135deg, var(--admin-1) 0%, var(--admin-2) 100%)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #0C0D10',
            }}
          >
            {Vectors.AdminShield}
          </div>
        )}
      </div>
    );
  }

  if (identity.isAdmin) {
    return (
      <div style={{ ...containerStyle, background: 'linear-gradient(135deg, var(--admin-1) 0%, var(--admin-2) 100%)', color: '#fff', fontSize: size * 0.35, fontWeight: 800 }}>
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

function AudioBubble({ src, isOwn }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => { setCurrentTime(el.currentTime); if (el.duration) setProgress((el.currentTime / el.duration) * 100); };
    const onLoaded = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };

    el.addEventListener('timeupdate', onTime); el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('play', onPlay); el.addEventListener('pause', onPause); el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime); el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('play', onPlay); el.removeEventListener('pause', onPause); el.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => { const el = audioRef.current; if (!el) return; playing ? el.pause() : el.play(); };
  const seek = (e) => {
    const el = audioRef.current; if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
  };

  const barCount = 26;
  const activeColor = isOwn ? '#fff' : '#FF6B35';
  const inactiveColor = isOwn ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 230, padding: '2px 2px' }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button onClick={toggle} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0, background: isOwn ? 'rgba(255,255,255,0.1)' : '#FF6B35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        {playing ? Vectors.Pause : Vectors.Play}
      </button>
      <div onClick={seek} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 26, cursor: 'pointer' }}>
        {Array.from({ length: barCount }).map((_, i) => {
          const active = (i / barCount) * 100 <= progress;
          const h = 5 + Math.abs(Math.sin(i * 1.35 + 0.4)) * 15;
          return <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: active ? activeColor : inactiveColor, transition: 'background 0.1s' }} />;
        })}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: isOwn ? 'rgba(255,255,255,0.85)' : '#8B8B96', flexShrink: 0, minWidth: 30, textAlign: 'right' }}>
        {formatClock(playing || currentTime ? currentTime : duration)}
      </span>
    </div>
  );
}

function VideoBubble({ src }) {
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', background: '#000', maxWidth: 260 }}>
      <video src={src} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 320, display: 'block' }} />
    </div>
  );
}

function InstagramCard({ message, isOwn }) {
  const followers = formatCount(message.instagram_followers);
  return (
    <a href={`https://instagram.com/${message.instagram_username}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, minWidth: 220, textDecoration: 'none', background: isOwn ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOwn ? '#fff' : '#FF6B35' }}>
        {message.instagram_pfp_url ? <img src={message.instagram_pfp_url} alt={message.instagram_username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : Vectors.Instagram}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#F4F3F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{message.instagram_username}</span>
          {message.instagram_is_verified && <span style={{ color: '#FF6B35', fontSize: 13 }}>✓</span>}
        </div>
        {message.instagram_full_name && <div style={{ fontSize: 12, color: isOwn ? 'rgba(255,255,255,0.85)' : '#8B8B96', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message.instagram_full_name}</div>}
        <div style={{ fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.7)' : '#8B8B96', marginTop: 2 }}>{followers ? `${followers} followers` : 'View on Instagram'}</div>
      </div>
    </a>
  );
}

function AttachmentSheet({ open, onClose, onOpenCamera, onPickInstagram }) {
  if (!open) return null;
  const Item = ({ icon, label, onClick }) => (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', flex: 1 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#15161B', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF6B35' }}>{icon}</div>
      <span style={{ fontSize: 12, color: '#F4F3F0', fontWeight: 600 }}>{label}</span>
    </button>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, margin: '0 auto', background: '#1C1D24', borderTop: '1px solid rgba(255,255,255,0.06)', borderRadius: '28px 28px 0 0', padding: '24px 20px', display: 'flex', gap: 8 }}>
        <Item icon={Vectors.Camera} label="Camera" onClick={onOpenCamera} />
        <Item icon={Vectors.Instagram} label="Instagram" onClick={onPickInstagram} />
      </div>
    </div>
  );
}

function InstagramModal({ open, onClose, onSubmit, loading }) {
  const [username, setUsername] = useState('');
  if (!open) return null;
  return (
    <div onClick={loading ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, margin: '0 auto', background: '#1C1D24', borderRadius: '28px 28px 0 0', padding: '24px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 6px', color: '#F4F3F0', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ color: '#FF6B35' }}>{Vectors.Instagram}</div> Share Instagram Profile</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#8B8B96' }}>Just the username — we'll pull the profile card automatically.</p>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', fontWeight: 700 }}>@</span>
          <input
            autoFocus type="text" name="dm-ig-username" autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" value={username} disabled={loading}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, '').trim())}
            onKeyDown={(e) => { if (e.key === 'Enter' && username.trim()) onSubmit(username.trim()); }}
            placeholder="username"
            style={{ width: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px 14px 14px 32px', fontSize: 15, boxSizing: 'border-box', color: '#F4F3F0', background: '#15161B', outline: 'none' }}
          />
        </div>
        <button
          onClick={() => username.trim() && onSubmit(username.trim())}
          disabled={loading || !username.trim()}
          style={{ width: '100%', marginTop: 16, padding: 16, borderRadius: 20, border: 'none', background: loading ? '#2A2B32' : '#FF6B35', color: '#fff', fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16 }}
        >
          {loading ? (<>{Vectors.Spinner} Fetching profile…</>) : 'Share Profile'}
        </button>
      </div>
    </div>
  );
}

function useLongPress(callback, ms = 500) {
  const timerRef = useRef();
  const start = useCallback((e, msg) => { timerRef.current = setTimeout(() => callback(msg), ms); }, [callback, ms]);
  const stop = useCallback(() => clearTimeout(timerRef.current), []);
  return { onTouchStart: start, onTouchEnd: stop, onTouchMove: stop };
}

function usePullToRefresh(onRefresh, scrollRef) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(null);

  const handleTouchStart = (e) => { if (scrollRef.current) startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e) => {
    if (startY.current === null) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0 && e.touches[0].clientY < 200) setPullDistance(Math.min(diff * 0.4, 80));
  };
  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true); setPullDistance(50); await onRefresh(); setIsRefreshing(false);
    }
    setPullDistance(0); startY.current = null;
  };
  return { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd };
}

function SwipeableMessage({ children, onSwipe, disabled }) {
  const [translateX, setTranslateX] = useState(0);
  const touchStartX = useRef(null);
  const handleTouchStart = (e) => { if (disabled) return; touchStartX.current = e.touches[0].clientX; };
  const handleTouchMove = (e) => {
    if (disabled || touchStartX.current === null) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff < 0 && diff > -70) setTranslateX(diff);
  };
  const handleTouchEnd = () => {
    if (disabled) return;
    if (translateX <= -40) onSwipe();
    setTranslateX(0); touchStartX.current = null;
  };

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ transform: `translateX(${translateX}px)`, transition: translateX === 0 ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none', width: '100%', position: 'relative', touchAction: 'pan-y', willChange: 'transform' }}>
      <div style={{ position: 'absolute', top: '50%', right: -40, transform: 'translateY(-50%)', opacity: translateX < -20 ? 1 : 0, transition: 'opacity 0.2s', color: '#8B8B96' }}>{Vectors.ReplyAction}</div>
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
        background: isCoolingDown ? '#15161B' : (canSend ? '#FF6B35' : '#2A2B32'),
        color: canSend ? '#fff' : '#8B8B96', cursor: canSend && !isCoolingDown ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s',
      }}
    >
      {isCoolingDown ? (
        <>
          <svg width={ringSize} height={ringSize} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#FF6B35" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.2s linear' }} />
          </svg>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF6B35' }} />
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
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

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

  const [hasUnreadMention, setHasUnreadMention] = useState(false);
  const [latestMentionId, setLatestMentionId] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [pendingJumpId, setPendingJumpId] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);

  const [pendingFile, setPendingFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploadSecondsLeft, setUploadSecondsLeft] = useState(60);

  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [instagramLoading, setInstagramLoading] = useState(false);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cooldownRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);

  // Mirror refs for the pagination guards below, so the scroll-triggered
  // loader always reads the latest values instead of whatever was captured
  // the moment the IntersectionObserver callback was created.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const hasMoreMessagesRef = useRef(true);
  useEffect(() => { hasMoreMessagesRef.current = hasMoreMessages; }, [hasMoreMessages]);
  const loadingMoreRef = useRef(false);
  useEffect(() => { loadingMoreRef.current = loadingMoreMessages; }, [loadingMoreMessages]);

  // Keep the latest onThreadReady in a ref instead of the effect's
  // dependency array. The parent (Home.jsx) shouldn't need to hand us a
  // perfectly stable function identity for this to work correctly — if it
  // ever passes a fresh inline callback again, reading it through a ref
  // means this effect still only reruns when openThreadWithUserId/userId
  // actually change, instead of re-fetching the thread (and flashing
  // loading -> ready) on every unrelated parent re-render.
  const onThreadReadyRef = useRef(onThreadReady);
  useEffect(() => { onThreadReadyRef.current = onThreadReady; }, [onThreadReady]);

  useEffect(() => {
    if (!openThreadWithUserId) return;
    if (!userId) { setThreadStatus('error'); showToast("You must be logged in to view private direct messages.", 'error'); return; }

    let isMounted = true;
    setThreadStatus('loading');

    async function initializeThread() {
      try {
        const { data: existingRows, error: findError } = await supabase.from('dm_threads').select('id, user_a, user_b').or(`and(user_a.eq.${userId},user_b.eq.${openThreadWithUserId}),and(user_a.eq.${openThreadWithUserId},user_b.eq.${userId})`).limit(1);
        if (findError) throw findError;

        let threadRow = existingRows?.[0] || null;
        if (!threadRow) {
          const { data: created, error: createError } = await supabase.from('dm_threads').insert({ user_a: userId, user_b: openThreadWithUserId }).select('id, user_a, user_b').single();
          if (createError) throw createError;
          threadRow = created;
        }

        const { data: otherProfile, error: profileError } = await supabase.from('profiles').select('id, username, avatar_url, is_admin').eq('id', openThreadWithUserId).maybeSingle();
        if (profileError) throw profileError;

        if (isMounted) {
          const resolvedOtherUser = otherProfile || { id: openThreadWithUserId, username: 'Unknown User' };
          setActiveThread({ id: threadRow.id, otherUser: resolvedOtherUser });
          setThreadStatus('ready');
          if (onThreadReadyRef.current) onThreadReadyRef.current({ id: resolvedOtherUser.id, username: resolvedOtherUser.username });
        }
      } catch (err) {
        console.error('Failed to load thread:', err);
        if (isMounted) { setThreadStatus('error'); showToast(friendlyDbError(), 'error'); }
      }
    }
    initializeThread();
    return () => { isMounted = false; };
  }, [userId, openThreadWithUserId]);

  const fetchMessagesAndReceipts = useCallback(async () => {
    if (!activeThread?.id || !userId) return;
    let isMounted = true;

    const { data: receiptData } = await supabase.from('dm_read_receipts').select('last_read_at').eq('thread_id', activeThread.id).eq('user_id', userId).maybeSingle();
    const lastReadAt = receiptData?.last_read_at || '1970-01-01T00:00:00.000Z';

    // Only the most recent MESSAGE_LIMIT (20) messages load up front; older
    // history is fetched on demand as the user scrolls up — see
    // loadOlderMessages below.
    const { data, error } = await supabase.from('dm_messages').select('*').eq('thread_id', activeThread.id).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT);

    if (error) { console.error(error); showToast(friendlyDbError(), 'error'); } 
    else if (isMounted) {
      const fetchedMessages = data || [];
      setMessages(fetchedMessages);
      setHasMoreMessages(fetchedMessages.length === MESSAGE_LIMIT);
      const unreadMention = fetchedMessages.find(m => m.mentioned_user_ids?.includes(userId) && new Date(m.created_at) > new Date(lastReadAt));
      if (unreadMention) { setHasUnreadMention(true); setLatestMentionId(unreadMention.id); } 
      else { supabase.from('dm_read_receipts').upsert({ thread_id: activeThread.id, user_id: userId, last_read_at: new Date().toISOString() }).then(); }
    }
    setMessagesLoading(false);
  }, [activeThread?.id, userId]);

  // Fetches the next page of older messages (everything before the oldest
  // one currently loaded) and appends it to the end of the `messages`
  // array — which, because the list is newest-first, lands it at the top
  // of what's on screen once column-reverse flips the visual order.
  const loadOlderMessages = useCallback(async () => {
    if (!activeThread?.id) return;
    if (loadingMoreRef.current || !hasMoreMessagesRef.current) return;
    const oldest = messagesRef.current[messagesRef.current.length - 1];
    if (!oldest) return;

    loadingMoreRef.current = true;
    setLoadingMoreMessages(true);
    try {
      const { data, error } = await supabase
        .from('dm_messages')
        .select('*')
        .eq('thread_id', activeThread.id)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;

      const older = data || [];
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [...prev, ...older.filter((m) => !existingIds.has(m.id))];
      });
      setHasMoreMessages(older.length === MESSAGE_LIMIT);
    } catch (err) {
      console.error('Failed to load older messages:', err);
      showToast(friendlyDbError(), 'error');
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [activeThread?.id]);

  useEffect(() => {
    fetchMessagesAndReceipts();
    if (!activeThread?.id) return;

    const channel = supabase.channel(`dm_messages:${activeThread.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${activeThread.id}` }, (payload) => {
        const newMsg = payload.new;
        const isMentioned = userId && newMsg.mentioned_user_ids?.includes(userId);
        if (isMentioned) { setHasUnreadMention(true); setLatestMentionId(newMsg.id); }
        if (newMsg.sender_id !== userId) playReceive();
        setMessages((prev) => prev.some(m => m.id === newMsg.id) ? prev : [newMsg, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${activeThread.id}` }, (payload) => {
         setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeThread?.id, userId, fetchMessagesAndReceipts]);

  useEffect(() => {
    cooldownRef.current = createCooldown((percent) => setCooldownPercent(percent), () => setCooldownPercent(0));
    return () => { cooldownRef.current?.cancel(); };
  }, []);

  // Deep-link support for a DM message's "Share link" action (see the share
  // actions below): once messages are loaded, check the URL's
  // #dm-msg-<id> fragment (short or full id) and, if it matches a
  // currently-loaded message, scroll to it and flash-highlight it.
  useEffect(() => {
    if (messagesLoading || !activeThread?.id) return;
    const hashMatch = /^#dm-msg-(.+)$/.exec(window.location.hash || '');
    if (!hashMatch) return;
    const rawTarget = decodeURIComponent(hashMatch[1]);
    let cancelled = false;

    async function resolveDeepLink() {
      const alreadyLoadedId = resolveMessageIdFromHash(window.location.hash, messagesRef.current);
      if (alreadyLoadedId) { setPendingJumpId(alreadyLoadedId); return; }

      // Short ids resolve against the real `link_id` column (populated by a
      // database trigger — see supabase/migrations/0002_link_id_routing.sql)
      // instead of casting `id` to text and ILIKE-prefix matching it.
      const lookup = isShortId(rawTarget)
        ? supabase.from('dm_messages').select('*').eq('thread_id', activeThread.id).eq('link_id', rawTarget).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : supabase.from('dm_messages').select('*').eq('thread_id', activeThread.id).eq('id', rawTarget).maybeSingle();

      const { data: row } = await lookup;
      if (cancelled || !row) return;

      const [{ data: olderCtx }, { data: newerCtx }] = await Promise.all([
        supabase.from('dm_messages').select('*').eq('thread_id', activeThread.id).lte('created_at', row.created_at).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT),
        supabase.from('dm_messages').select('*').eq('thread_id', activeThread.id).gt('created_at', row.created_at).order('created_at', { ascending: true }).limit(MESSAGE_LIMIT),
      ]);
      if (cancelled) return;

      const context = [...(olderCtx || []), ...(newerCtx || [])];
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const additions = context.filter((m) => !existingIds.has(m.id));
        if (additions.length === 0) return prev;
        return [...prev, ...additions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      });
      setHasMoreMessages(true);
      setPendingJumpId(row.id);
    }

    resolveDeepLink();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesLoading, activeThread?.id]);

  useEffect(() => {
    if (!pendingJumpId) return;
    const el = document.getElementById(`dm-msg-${pendingJumpId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(pendingJumpId);
    setPendingJumpId(null);
    const t = setTimeout(() => setHighlightedMsgId(null), 2000);
    return () => clearTimeout(t);
  }, [pendingJumpId, messages]);

  const { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchMessagesAndReceipts, scrollRef);

  // Infinite scroll: watch a sentinel rendered at the end of the message
  // list (visually the top, thanks to column-reverse). When it scrolls
  // into view, fetch the next page of older messages.
  useEffect(() => {
    if (!hasMoreMessages || messagesLoading || isSearching) return;
    const rootEl = scrollRef.current;
    const target = loadMoreSentinelRef.current;
    if (!rootEl || !target) return;

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadOlderMessages(); },
      { root: rootEl, rootMargin: '300px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreMessages, messagesLoading, isSearching, loadOlderMessages, activeThread?.id]);

  const toggleSelection = (msgId) => {
    if (!isAdmin) return;
    hapticSelect();
    setSelectedMessages(prev => prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]);
  };

  const handleLongPress = (msg) => { if (isAdmin) toggleSelection(msg.id); };
  const longPressHook = useLongPress(handleLongPress, 500);

  // Same "delete cleanly" logic as GroupChat.jsx's deleteMessagesSafely:
  // clear reply_to_id on anything replying to a message being deleted
  // (keeping that replying message, just dropping its reply preview),
  // remove that message's reactions, then delete the message itself. Doing
  // the unlink first is what makes the delete actually stick — previously
  // a stale reply_to_id could make the delete a no-op, which is why a
  // "deleted" message would come back after a refresh.
  const deleteMessagesSafely = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return;

    setMessages((prev) => prev
      .filter((m) => !ids.includes(m.id))
      .map((m) => (m.reply_to_id && ids.includes(m.reply_to_id) ? { ...m, reply_to_id: null } : m))
    );

    try {
      const { error: unlinkError } = await supabase.from('dm_messages').update({ reply_to_id: null }).in('reply_to_id', ids);
      if (unlinkError) throw unlinkError;

      const { error: reactionsError } = await supabase.from('reactions').delete().eq('target_type', 'dm_message').in('target_id', ids);
      if (reactionsError) throw reactionsError;

      const { error: deleteError } = await supabase.from('dm_messages').delete().in('id', ids);
      if (deleteError) throw deleteError;
    } catch (err) {
      console.error('Failed to delete message(s):', err);
      showToast(friendlyDbError(), 'error');
      fetchMessagesAndReceipts();
    }
  }, [fetchMessagesAndReceipts]);

  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedMessages.length === 0) return;
    const ids = [...selectedMessages];
    setSelectedMessages([]);
    await deleteMessagesSafely(ids);
  };

  function handleJumpToMention() {
    if (!latestMentionId) return;
    const element = document.getElementById(`dm-msg-${latestMentionId}`);
    if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightedMsgId(latestMentionId); setTimeout(() => setHighlightedMsgId(null), 2000); }
    setHasUnreadMention(false);
    if (userId && activeThread?.id) supabase.from('dm_read_receipts').upsert({ thread_id: activeThread.id, user_id: userId, last_read_at: new Date().toISOString() }).then();
  }

  async function resolveMentionedIds(outgoingText) {
    const mentionedUsernames = [...outgoingText.matchAll(/@([a-zA-Z0-9_]+)/g)].map(m => m[1].toLowerCase());
    if (mentionedUsernames.length === 0) return [];
    const { data } = await supabase.from('profiles').select('id').in('username', mentionedUsernames);
    return data ? data.map(p => p.id) : [];
  }

  async function handleMentionClick(username) {
    const { data } = await supabase.from('profiles').select('id').eq('username', username.toLowerCase()).maybeSingle();
    if (data?.id) setProfileCardUserId(data.id);
  }

  const renderMessageTextWithMentions = (messageText, isOwn) => {
    if (!messageText) return null;
    const parts = messageText.split(/(@[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@') && part.length > 1) {
        const username = part.substring(1);
        return <button key={i} onClick={() => handleMentionClick(username)} style={{ color: isOwn ? '#fff' : '#FF6B35', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', fontSize: 'inherit' }}>{part}</button>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const startReply = useCallback((message) => {
    const isOwn = message.sender_id === userId;
    const senderName = message.is_anon ? 'Anonymous' : (isOwn ? 'You' : resolveIdentity(activeThread?.otherUser).name);
    setReplyingTo({ id: message.id, sender_name: senderName, text: message.text, media_url: message.media_url, media_type: message.media_type, instagram_username: message.instagram_username });
  }, [userId, activeThread]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !userId || !activeThread || sending) return;
    if (cooldownPercent > 0) { showToast("Please wait a few seconds before sending another message.", 'info'); return; }

    setSending(true);
    const mentionedIds = await resolveMentionedIds(trimmed);
    const { error } = await supabase.from('dm_messages').insert({ thread_id: activeThread.id, sender_id: userId, text: trimmed, reply_to_id: replyingTo?.id ?? null, mentioned_user_ids: mentionedIds, is_anon: false });
    setSending(false);
    if (error) { console.error(error); showToast(friendlyDbError(), 'error'); return; }
    playSend(); hapticSend();
    setText(''); setReplyingTo(null); setPickerOpen(false); cooldownRef.current?.start();
  }

  function handleAttachmentSelected(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), type: guessMediaType(file) });
  }

  function cancelPendingAttachment() { if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); }

  async function sendPendingAttachment() {
    if (!pendingFile || !userId || !activeThread || uploading) return;
    if (cooldownPercent > 0) { showToast('Please wait a few seconds before sending another message.', 'info'); return; }

    setUploading(true); setUploadSecondsLeft(60);
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

      const { error: insertError } = await supabase.from('dm_messages').insert({ thread_id: activeThread.id, sender_id: userId, text: caption.trim() || null, media_url: publicUrl, media_type: type, reply_to_id: replyingTo?.id ?? null, is_anon: false });
      if (insertError) throw insertError;

      URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); setReplyingTo(null); cooldownRef.current?.start();
    } catch (err) {
      console.error(err); showToast(err.message === 'TIMEOUT' ? "Upload timed out — check your connection and try again." : "Couldn't send that file. Please try again.", 'error');
    } finally { clearInterval(tick); setUploading(false); }
  }

  async function handleMediaPicked(url, mediaType) {
    if (!userId || !activeThread || sending) return;
    if (cooldownPercent > 0) { showToast("Please wait a few seconds before sending another message.", 'info'); return; }
    setPickerOpen(false);
    const { error } = await supabase.from('dm_messages').insert({ thread_id: activeThread.id, sender_id: userId, media_url: url, media_type: mediaType, reply_to_id: replyingTo?.id ?? null, is_anon: false });
    if (error) { console.error(error); showToast(friendlyDbError(), 'error'); return; }
    setReplyingTo(null); cooldownRef.current?.start();
  }

  function handleEmojiPicked(char) { setText((prev) => prev + char); }

  async function handleInstagramSubmit(username) {
    if (!userId || !activeThread) return;
    setInstagramLoading(true);
    const data = await scrapeInstagram(username);
    setInstagramLoading(false);

    if (!data) { showToast("Couldn't find that Instagram profile. Double check the username.", 'error'); return; }
    setInstagramModalOpen(false);

    const insertPayload = data.fallback
      ? { thread_id: activeThread.id, sender_id: userId, instagram_username: data.username, reply_to_id: replyingTo?.id ?? null, is_anon: false }
      : { thread_id: activeThread.id, sender_id: userId, instagram_username: data.username, instagram_pfp_url: data.pfp_url, instagram_full_name: data.full_name, instagram_bio: data.bio, instagram_followers: data.followers, instagram_following: data.following, instagram_posts: data.posts, instagram_is_verified: data.is_verified, instagram_is_private: data.is_private, reply_to_id: replyingTo?.id ?? null, is_anon: false };

    const { error } = await supabase.from('dm_messages').insert(insertPayload);
    if (error) { console.error(error); showToast(friendlyDbError(), 'error'); return; }
    setReplyingTo(null); cooldownRef.current?.start();
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

  if (threadStatus === 'loading') return <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C0D10' }}><div style={{ color: '#FF6B35' }}>{Vectors.Spinner}</div></div>;
  if (threadStatus === 'error' || !activeThread) return <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C0D10', flexDirection: 'column', gap: 16, padding: 24 }}><p style={{ color: '#8B8B96', fontWeight: 600 }}>Failed to load chat.</p><button onClick={onBack} style={{ background: '#FF6B35', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>Go Back</button></div>;

  const otherIdentity = resolveIdentity(activeThread.otherUser);

  return (
    <div className="no-copy-text" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden', zIndex: 1, userSelect: 'none', WebkitUserSelect: 'none', background: '#0C0D10' }}>
      <GlobalKeyframes />

      {selectedMessages.length > 0 ? (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#FF6B35', color: '#fff', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSelectedMessages([])} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', padding: '4px', marginLeft: '-8px' }}>{Vectors.Close}</button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{selectedMessages.length} Selected</span>
          </div>
          <button onClick={handleDeleteSelected} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>{Vectors.Trash} Delete</button>
        </header>
      ) : (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 20 }}>
          <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: '#F4F3F0', cursor: 'pointer', padding: '4px', marginLeft: '-8px' }}>{Vectors.Back}</button>
          <button onClick={() => setProfileCardUserId(activeThread.otherUser.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
            <DMLiquidAvatar identity={otherIdentity} size={42} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
            <button onClick={() => setProfileCardUserId(activeThread.otherUser.id)} style={{ fontWeight: 700, fontSize: 16, color: otherIdentity.isAdmin ? 'var(--admin-1)' : '#F4F3F0', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
              {otherIdentity.name}
              {otherIdentity.isAdmin && Vectors.AdminShield}
            </button>
            <span style={{ fontSize: 13, color: '#8B8B96' }}>Online</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((v) => !v)} style={{ border: 'none', background: 'transparent', color: '#F4F3F0', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>{Vectors.ThreeDots}</button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#1C1D24', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 30, minWidth: 160, padding: 6 }}>
                  <button onClick={() => { setIsSearching(true); setMenuOpen(false); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: '#F4F3F0', textAlign: 'left', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{Vectors.SearchSmall} Search Chat</button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {isSearching && (
        <div style={{ background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 19 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', pointerEvents: 'none' }}>{Vectors.SearchSmall}</span>
            <input autoFocus type="search" name="dm-chat-search-f" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={chatSearchQuery} onChange={(e) => setChatSearchQuery(e.target.value)} placeholder="Search in chat..." style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 16, border: 'none', background: '#15161B', color: '#F4F3F0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => { setIsSearching(false); setChatSearchQuery(''); }} style={{ background: 'none', border: 'none', color: '#8B8B96', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
        </div>
      )}

      <div style={{ position: 'absolute', top: 72, left: 0, right: 0, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`, opacity: pullDistance > 10 ? 1 : 0, transition: isRefreshing ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none', color: '#FF6B35' }}>
        <div className={isRefreshing ? "refresh-spin" : ""} style={{ transform: `rotate(${pullDistance * 4}deg)` }}>{Vectors.Refresh}</div>
      </div>

      <div
        ref={scrollRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '20px 16px', display: 'flex', flexDirection: 'column-reverse', zIndex: 10, minHeight: 0, background: 'transparent', transform: `translateY(${pullDistance}px)`, transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}
      >
        {messagesLoading && <MessageSkeleton />}

        {!messagesLoading && filteredMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1C1D24', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: '#8B8B96', border: '1px solid rgba(255,255,255,0.06)' }}>
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

          const bubbleBackground = isStickerOrGif ? 'transparent' : (isOwn ? '#2A2B32' : '#15161B');
          const bubbleColor = '#F4F3F0';

          return (
            <React.Fragment key={message.id}>
              <div 
                {...longPressHook} 
                onClick={() => { 
                  if (selectedMessages.length > 0) toggleSelection(message.id); 
                  else setActiveReactionMsgId(activeReactionMsgId === message.id ? null : message.id);
                }}
                style={{ position: 'relative', width: '100%', padding: '0 8px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <SwipeableMessage onSwipe={() => { if (selectedMessages.length === 0) startReply(message); }} disabled={isSearching || selectedMessages.length > 0}>
                  <div
                    id={`dm-msg-${message.id}`}
                    className={isHighlighted ? 'highlight-flash' : ''}
                    style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: 16, borderRadius: 16, padding: '4px 8px', background: isSelected ? 'rgba(255, 107, 53, 0.15)' : 'transparent', animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both', transition: 'background 0.2s' }}
                  >
                    {selectedMessages.length > 0 && isAdmin && (
                       <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', margin: '0 0 8px', color: isSelected ? '#FF6B35' : 'rgba(255,255,255,0.1)' }}>
                         {isSelected ? Vectors.CheckCircle : <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid currentColor' }} />}
                       </div>
                    )}

                    {/* Avatar (+ "Anonymous" label) rendered in its own row
                        completely above the bubble, instead of sharing
                        vertical space with it via a negative-margin hack —
                        so it never overlaps message content. */}
                    {!isOwn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingLeft: 2 }}>
                        <DMLiquidAvatar identity={otherIdentity} isAnon={isAnonMsg} size={26} />
                        {isAnonMsg && <span style={{ fontSize: 13, fontWeight: 700, color: '#8B8B96' }}>Anonymous</span>}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '75%', marginLeft: isOwn ? 0 : 34, alignSelf: isOwn ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '100%', padding: isInstagram ? '4px' : ((message.media_url && !isStickerOrGif) ? '4px' : (isStickerOrGif ? 0 : '10px 16px')), borderRadius: isStickerOrGif ? 0 : 20, borderBottomRightRadius: isStickerOrGif ? 0 : (isOwn ? 4 : 20), borderBottomLeftRadius: isStickerOrGif ? 0 : (isOwn ? 20 : 4), background: bubbleBackground, color: bubbleColor, border: isStickerOrGif ? 'none' : (isOwn ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.04)'), boxShadow: isStickerOrGif ? 'none' : '0 6px 18px rgba(0,0,0,0.2)' }}>
                        {message.reply_to_id && (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              const targetEl = document.getElementById(`dm-msg-${message.reply_to_id}`);
                              if (targetEl) {
                                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                targetEl.classList.add('highlight-flash');
                                setTimeout(() => targetEl.classList.remove('highlight-flash'), 2000);
                              }
                            }}
                            style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', marginBottom: 8, marginTop: (message.media_url || isInstagram) ? 4 : 0, borderRadius: 10, background: '#15161B', borderLeft: `3px solid ${isOwn ? '#8B8B96' : '#FF6B35'}`, cursor: 'pointer' }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#F4F3F0' }}>{repliedMessage ? (repliedMessage.is_anon ? 'Anonymous' : (repliedMessage.sender_id === userId ? 'You' : otherIdentity.name)) : 'Original'}</span>
                            <span className="no-copy-text" style={{ fontSize: 13, color: '#8B8B96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(repliedMessage)}</span>
                          </div>
                        )}

                        {isInstagram ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: message.text ? 6 : 0 }}>
                            <InstagramCard message={message} isOwn={isOwn} />
                            {message.text && <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>{renderMessageTextWithMentions(message.text, isOwn)}</span>}
                          </div>
                        ) : message.media_url ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: message.text ? 6 : 0 }}>
                            {isStickerOrGif ? (
                              <button onClick={() => setViewerMedia({ url: message.media_url, type: message.media_type })} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}><img src={message.media_url} alt={message.media_type === 'sticker' ? 'Sticker' : 'GIF'} style={{ maxWidth: 160, maxHeight: 160, display: 'block', borderRadius: 12 }} /></button>
                            ) : message.media_type === 'image' ? (
                              <button onClick={() => setViewerMedia({ url: message.media_url, type: 'image' })} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block', width: '100%' }}><img src={message.media_url} alt="Attachment" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 16, display: 'block', objectFit: 'cover' }} /></button>
                            ) : message.media_type === 'video' ? (
                              <VideoBubble src={message.media_url} />
                            ) : message.media_type === 'audio' ? (
                              <AudioBubble src={message.media_url} isOwn={isOwn} />
                            ) : (
                              <a href={message.media_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)', borderRadius: 16, textDecoration: 'none' }}>
                                <div style={{ color: isOwn ? '#fff' : '#FF6B35' }}>{Vectors.FileText}</div><span style={{ color: isOwn ? '#fff' : '#F4F3F0', fontSize: 14, fontWeight: 600 }}>Document</span>
                              </a>
                            )}
                            {message.text && <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>{renderMessageTextWithMentions(message.text, isOwn)}</span>}
                          </div>
                        ) : (
                          <span className="no-copy-text" style={{ fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{renderMessageTextWithMentions(message.text, isOwn)}</span>
                        )}
                      </div>
                      
                      {/* Pulled up with a negative margin so the reaction
                          pills sit tucked into the bottom corner of the
                          bubble (Telegram-style) instead of floating in
                          their own full-width row below the timestamp. */}
                      <div style={{ marginBottom: 2, display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', width: '100%', paddingInline: 6, position: 'relative', zIndex: 2 }}>
                        <ReactionBar 
                           targetType="dm_message" 
                           targetId={message.id} 
                           userId={userId}
                           align={isOwn ? 'flex-end' : 'flex-start'}
                           pullUp={10}
                           showTray={activeReactionMsgId === message.id}
                           onCloseTray={() => setActiveReactionMsgId(null)}
                           actions={[
                             ...(isAdmin ? [{
                               key: 'delete',
                               label: 'Delete',
                               danger: true,
                               icon: <span style={{ display: 'flex' }}>{Vectors.Trash}</span>,
                               onClick: async () => { await deleteMessagesSafely([message.id]); },
                             }] : []),
                           ]}
                        />
                      </div>

                      <span style={{ fontSize: 11, color: '#8B8B96', marginTop: 4, marginInline: 4, fontWeight: 500 }}>{formatTime(message.created_at)}</span>
                    </div>
                  </div>
                </SwipeableMessage>
              </div>

              {showDayDivider && !isSearching && (
                <div style={{ textAlign: 'center', margin: '24px 0 16px', position: 'sticky', top: 16, zIndex: 15 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#8B8B96', background: '#1C1D24', padding: '6px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                    {formatDayLabel(message.created_at)}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Infinite-scroll trigger + circular loader. Sits after the mapped
            messages in the DOM, which — because the container uses
            flex-direction: column-reverse — puts it at the very top of the
            visible conversation, right where "load more" belongs. */}
        {!messagesLoading && !isSearching && hasMoreMessages && (
          <div ref={loadMoreSentinelRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', minHeight: 44 }}>
            {loadingMoreMessages && (
              <div style={{ color: '#FF6B35', display: 'flex' }}>{Vectors.Spinner}</div>
            )}
          </div>
        )}
      </div>

      {hasUnreadMention && (
        <button onClick={handleJumpToMention} style={{ position: 'absolute', right: 16, bottom: 80, width: 40, height: 40, borderRadius: '50%', background: '#FF6B35', color: '#fff', border: 'none', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, cursor: 'pointer', animation: 'pop-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>@</button>
      )}

      <div className="safe-bottom" style={{ flexShrink: 0, zIndex: 20, position: 'sticky', bottom: 0 }}>
        {!session ? (
          <div style={{ padding: '16px', background: '#1C1D24', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setAuthOpen(true)} style={{ width: '100%', padding: '14px 0', borderRadius: 20, border: 'none', background: '#FF6B35', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}>Sign in to send message</button>
          </div>
        ) : (
        <>
        {pendingFile && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1C1D24', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', zIndex: 21 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              {pendingFile.type === 'image' ? (
                <img src={pendingFile.previewUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              ) : pendingFile.type === 'video' ? (
                <video src={pendingFile.previewUrl} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              ) : pendingFile.type === 'audio' ? (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F4F3F0' }}>{Vectors.Smiley}</div>
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F4F3F0' }}>{Vectors.FileText}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F3F0', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</span>
                {uploading && <span style={{ fontSize: 12, color: '#8B8B96' }}>Uploading… {uploadSecondsLeft}s</span>}
              </div>
              <button onClick={cancelPendingAttachment} disabled={uploading} style={{ border: 'none', background: 'rgba(255,255,255,0.06)', width: 28, height: 28, borderRadius: '50%', color: '#F4F3F0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Vectors.Close}</button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="search" name="dm-media-caption-f" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, MAX_TEXT_LENGTH))} maxLength={MAX_TEXT_LENGTH} placeholder="Add a caption…" disabled={uploading} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', outline: 'none', background: '#15161B', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: '#F4F3F0' }} />
              <button type="button" onClick={sendPendingAttachment} disabled={uploading} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: uploading ? 'rgba(255,255,255,0.06)' : '#FF6B35', color: '#fff', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {uploading ? Vectors.Spinner : Vectors.Send}
              </button>
            </div>
          </div>
        )}

        <div style={{ position: 'absolute', bottom: pendingFile ? undefined : '100%', top: pendingFile ? '100%' : undefined, left: 0, right: 0, background: '#1C1D24', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1)', transform: replyingTo && !pendingFile ? 'translateY(0)' : 'translateY(100%)', opacity: replyingTo && !pendingFile ? 1 : 0, visibility: replyingTo && !pendingFile ? 'visible' : 'hidden', zIndex: 19 }}>
          <div style={{ color: '#8B8B96' }}>{Vectors.ReplyAction}</div>
          <div style={{ width: 3, height: 34, borderRadius: 2, background: '#8B8B96', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F3F0' }}>Replying to {replyingTo?.sender_name}</span>
            <span style={{ fontSize: 13, color: '#8B8B96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(replyingTo)}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} style={{ border: 'none', background: 'rgba(255,255,255,0.06)', width: 28, height: 28, borderRadius: '50%', color: '#F4F3F0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Close}</button>
        </div>

        <form onSubmit={handleSend} autoComplete="off-nope" data-form-type="other" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#1C1D24', borderTop: replyingTo ? 'none' : '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 20 }}>
          <EmojiGifPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onEmoji={handleEmojiPicked} onMedia={handleMediaPicked} />
          <button type="button" onClick={() => setAttachSheetOpen(true)} disabled={uploading || cooldownPercent > 0 || selectedMessages.length > 0} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: '#8B8B96', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{uploading ? Vectors.Spinner : Vectors.Attach}</button>
          
          <input ref={fileInputRef} type="file" accept="*/*" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
          <input ref={cameraInputRef} type="file" accept="image/*,video/*" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
          
          <button type="button" onClick={() => setPickerOpen((v) => !v)} disabled={uploading || selectedMessages.length > 0} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: pickerOpen ? 'rgba(255,255,255,0.06)' : 'transparent', color: pickerOpen ? '#F4F3F0' : '#8B8B96', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Smiley}</button>
          {/* type="search" is kept (not "text") purely as the anti-autofill
              hack this codebase uses throughout — see LiquidInput in
              EditProfile.jsx for the same trick. Left alone, that type makes
              mobile keyboards show a magnifying-glass "search" key instead
              of "send", and some mobile browsers don't submit the enclosing
              form on that key for a type="search" input. enterKeyHint="send"
              fixes the key's icon/label without touching the anti-autofill
              type, and the onKeyDown gives an explicit, guaranteed send path
              (calling the same handleSend used by the form's onSubmit/the
              send button) so Enter always works even on keyboards that
              ignore enterKeyHint. */}
          <input type="search" enterKeyHint="send" name="dm-message-f" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))} maxLength={MAX_TEXT_LENGTH} onFocus={() => setPickerOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!uploading && selectedMessages.length === 0) handleSend(e); } }} placeholder={uploading ? 'Uploading media...' : 'Message'} disabled={uploading || selectedMessages.length > 0} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', outline: 'none', background: '#15161B', borderRadius: 24, padding: '12px 18px', fontSize: 15, color: '#F4F3F0', transition: 'border-color 0.2s' }} />
          <SendButton canSend={!!text.trim()} sending={sending || uploading} cooldownPercent={cooldownPercent} />
        </form>
        </>
        )}
      </div>

      <AttachmentSheet open={attachSheetOpen} onClose={() => setAttachSheetOpen(false)} onOpenCamera={() => { setAttachSheetOpen(false); cameraInputRef.current?.click(); }} onPickInstagram={() => { setAttachSheetOpen(false); setInstagramModalOpen(true); }} />
      <InstagramModal open={instagramModalOpen} onClose={() => !instagramLoading && setInstagramModalOpen(false)} onSubmit={handleInstagramSubmit} loading={instagramLoading} />

      <MediaViewer mediaUrl={viewerMedia?.url} mediaType={viewerMedia?.type} open={viewerMedia !== null} onClose={() => setViewerMedia(null)} />
      <ProfileCard userId={profileCardUserId} open={!!profileCardUserId} onClose={() => setProfileCardUserId(null)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
    </div>
  );
}
