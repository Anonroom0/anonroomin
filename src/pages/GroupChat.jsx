/**
 * ============================================================================
 * GROUP CHAT MASTER VIEW (MATTE UI & FIXED RENDERING)
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { createCooldown } from '../lib/rateLimit';
import { showToast, friendlyDbError } from '../lib/toast';
import { playSend, playReceive } from '../lib/soundManager';
import { hapticSend, hapticSelect } from '../lib/haptics';
import { toShortId, isShortId, getCanonicalOrigin } from '../lib/subdomain';
import { useViewportHeight } from '../lib/useViewportHeight';

// Modals / Overlays
import MediaViewer from './MediaViewer';
import ProfileCard from './ProfileCard';
import GroupCard from './GroupCard';
import AuthModal from './AuthModal';
import EmojiGifPicker from './EmojiGifPicker';

// Shared Components
import GlassPanel from '../components/shared/GlassPanel';
import LiquidAvatar from '../components/shared/LiquidAvatar';
import MessageSkeleton from '../components/shared/MessageSkeleton';
import AttachmentSheet from '../components/shared/AttachmentSheet';
import ConfessionBubble from '../components/shared/ConfessionBubble';
import ReactionBar from '../components/shared/ReactionBar';
import SwipeableMessage from '../components/shared/SwipeableMessage';
import SendButton from '../components/shared/SendButton';
import { AudioBubble, VideoBubble } from '../components/shared/MediaBubble';
import InstagramCard from '../components/shared/InstagramCard';
import ShareStorySheet from '../components/questions/ShareStorySheet';
import { BACKGROUND_STRUCTURES, ACCENT_COLORS, BODY_SHAPES, BODY_SCALES } from '../lib/storyStylePresets';
import { generateConfessionCardImage } from '../lib/storyImageGenerator';

const MESSAGE_LIMIT = 20;
const REPLY_SNIPPET_LENGTH = 80;
const MAX_TEXT_LENGTH = 500;
const ADMIN_DISPLAY_NAME = 'ADMIN';
const UPLOAD_TIMEOUT_MS = 60000;

// Telegram-style per-sender name colors. Deterministic hash of the
// user's id (falls back to sender_name) picks a color from this palette,
// so a given person's name/reply-bar color stays stable across renders.
const SENDER_PALETTE = ['#E17076', '#F0A75B', '#7BC862', '#6EC9CB', '#65AADD', '#A695E7', '#EE7AAE'];
function getSenderColor(key) {
  if (!key) return SENDER_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return SENDER_PALETTE[hash % SENDER_PALETTE.length];
}

// Doodle wallpaper (Telegram-style) — kept as a helper for potential future
// use, but the chat surface itself renders a flat, borderless background
// now (see the removed wallpaper layer in the component below).
const WALLPAPER_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">' +
  '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
  '<circle cx="20" cy="30" r="6"/>' +
  '<path d="M50 20 L60 10 L70 20 L60 30 Z"/>' +
  '<path d="M120 40 q10 -15 20 0 q10 15 -10 15 q-20 0 -10 -15"/>' +
  '<rect x="150" y="60" width="14" height="10" rx="2"/>' +
  '<path d="M30 100 l8 8 l-8 8 l-8 -8 Z"/>' +
  '<path d="M90 120 c0 -10 10 -10 10 0 c0 10 -10 20 -10 20 c0 0 -10 -10 -10 -20 c0 -10 10 -10 10 0"/>' +
  '<path d="M170 130 l6 -10 l6 10 l-6 6 Z"/>' +
  '<circle cx="190" cy="180" r="5"/>' +
  '<path d="M40 180 h16 v10 h-16 Z"/>' +
  '<path d="M110 190 l5 8 l-10 0 Z"/>' +
  '<path d="M0 60 l6 6 l-6 6 l-6 -6 Z"/>' +
  '<circle cx="200" cy="30" r="4"/>' +
  '</g></svg>'
);

const Vectors = {
  ChevronDown: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  Lock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  Back: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>,
  Attach: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  Close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  FileText: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  AdminShield: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Spinner: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner-animation"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
  Smiley: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
  ThreeDots: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>,
  SearchSmall: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Ghost: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></svg>,
  Trash: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Pin: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 0-2H8a1 1 0 0 0 0 2 1 1 0 0 1 1 1z" /></svg>,
  Refresh: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  CheckCircle: <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--signal)" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" stroke="none" /><polyline points="8 12 11 15 16 9" /></svg>,
  Instagram: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
  ReplyAction: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>,
  Photo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>,
  Palette: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.3c1.9 0 3.4-1.6 3.2-3.5C20 6.6 16.4 2 12 2z" /><circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" /></svg>,
  Plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  GhostSm: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></svg>,
  PinSm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 0-2H8a1 1 0 0 0 0 2 1 1 0 0 1 1 1z" /></svg>,
  ListIcon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
};

function isSenderAdmin(message) { return message.sender_name === ADMIN_DISPLAY_NAME || message.is_admin === true; }
function formatTime(dateString) { return dateString ? new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
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
  return text.length > REPLY_SNIPPET_LENGTH ? `${text.slice(0, REPLY_SNIPPET_LENGTH)}…` : text;
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
function dayKey(dateString) { return new Date(dateString).toDateString(); }

// Resolves a #msg-<id> or #reply-<id> URL fragment back to a real message id.
function resolveMessageIdFromHash(hash, messages) {
  const match = /^#(?:msg|reply)-(.+)$/.exec(hash || '');
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

function randomPresetId(list) {
  return list[Math.floor(Math.random() * list.length)].id;
}

function randomStoryStyle() {
  return {
    backgroundId: randomPresetId(BACKGROUND_STRUCTURES),
    colorId: randomPresetId(ACCENT_COLORS),
    shapeId: randomPresetId(BODY_SHAPES),
    scaleId: randomPresetId(BODY_SCALES),
  };
}

function ConfessionModal({ open, onClose, onSubmit }) {
  const [text, setText] = useState(''); 
  const [anon, setAnon] = useState(true); 
  const [media, setMedia] = useState(null); 
  const mediaInputRef = useRef(null);

  // Customize — pick a Background/Colour/Shape/Size combo (same preset
  // lists ShareStorySheet/CreateConfessionModal use) to store as small JSON
  // on the message row rather than rendering + uploading a PNG up front —
  // see storyStylePresets.js and the 0003 migration. `storyStyle` null
  // means "not customized"; the confession renders as a plain bubble.
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [storyStyle, setStoryStyle] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef(null);
  const previewTokenRef = useRef(0);

  useEffect(() => {
    return () => { if (media) URL.revokeObjectURL(media.previewUrl); };
  }, [media]);

  // Live preview of the customized card — renders through the exact same
  // generateConfessionCardImage() pipeline the chat bubble itself will use
  // (see ConfessionBubble.jsx), so what's shown here is what the group will
  // actually see.
  useEffect(() => {
    if (!customizeOpen || !storyStyle) {
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
      setPreviewUrl(null);
      return undefined;
    }
    const token = ++previewTokenRef.current;
    setPreviewLoading(true);
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (typeof generateConfessionCardImage !== 'function') {
          throw new Error('generateConfessionCardImage unavailable');
        }
        return generateConfessionCardImage({
          text: text.trim() || 'Your confession will appear here…',
          backgroundId: storyStyle.backgroundId,
          colorId: storyStyle.colorId,
          shapeId: storyStyle.shapeId,
          scaleId: storyStyle.scaleId,
        });
      })
      .then((blob) => {
        if (cancelled || previewTokenRef.current !== token) return;
        if (!blob) { setPreviewLoading(false); return; }
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewLoading(false);
      })
      .catch((err) => {
        console.warn('Confession style preview failed:', err);
        if (!cancelled && previewTokenRef.current === token) setPreviewLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customizeOpen, storyStyle, text]);

  useEffect(() => {
    return () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); };
  }, []);

  if (!open) return null;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      setMedia({ file, isVideo: file.type.startsWith('video/'), previewUrl: URL.createObjectURL(file) });
    }
  }

  function handleToggleCustomize() {
    if (customizeOpen) { setCustomizeOpen(false); return; }
    setCustomizeOpen(true);
    if (!storyStyle) setStoryStyle(randomStoryStyle());
  }

  function handleShuffleStyle() { setStoryStyle(randomStoryStyle()); }
  function handleRemoveCustomization() { setStoryStyle(null); setCustomizeOpen(false); }

  function handleSubmit() {
    if (text.trim() || media) {
      onSubmit(text.trim(), anon, media?.file, storyStyle);
      setText(''); setMedia(null); setStoryStyle(null); setCustomizeOpen(false);
    }
  }

  // Mirrors CreateConfessionModal.jsx's (Ask Me tab) layout: rendered through
  // GlassPanel's portal-based sheet (so it repositions correctly above the
  // on-screen keyboard instead of a hand-rolled fixed overlay), with the
  // "Add Media" button living inline right under the textarea rather than
  // in a separate row that can end up hidden behind the keyboard.
  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 20px 28px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--paper)' }}>New Confession</div>

        <div style={{ borderRadius: 20, border: '1px solid var(--separator)', background: 'var(--ink-2)', padding: '4px 4px 0' }}>
          <textarea
            name="group-confession-composer"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            maxLength={MAX_TEXT_LENGTH}
            placeholder="Type your confession…"
            rows={media ? 3 : 5}
            style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--paper)', fontSize: 16, fontFamily: 'inherit', padding: '14px 16px 4px', boxSizing: 'border-box' }}
          />

          {media && (
            <div style={{ position: 'relative', width: 80, height: 80, margin: '0 16px 12px' }}>
              {media.isVideo ? (
                <video src={media.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
              ) : (
                <img src={media.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} alt="preview" />
              )}
              <button onClick={() => setMedia(null)} style={{ position: 'absolute', top: -6, right: -6, background: 'var(--ink-2)', color: 'var(--paper)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{Vectors.Close}</button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 10px' }}>
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={!!media}
              style={{ background: 'transparent', border: 'none', color: media ? 'rgba(255,255,255,0.1)' : 'var(--dim)', cursor: media ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontSize: 13, fontWeight: 600 }}
            >
              {Vectors.Photo} {media ? 'Media Added' : 'Add Media'}
            </button>
            <input type="file" accept="image/*,video/*" ref={mediaInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

            {/* Customize — pick a story style for this confession's bubble
                without rendering/uploading an image; see the panel below. */}
            <button
              type="button"
              onClick={handleToggleCustomize}
              disabled={text.trim().length === 0}
              style={{
                background: storyStyle ? 'rgba(47,111,255,0.14)' : 'transparent',
                border: 'none', borderRadius: 999, padding: '5px 10px',
                color: text.trim().length === 0 ? 'rgba(255,255,255,0.15)' : storyStyle ? 'var(--ember)' : 'var(--dim)',
                cursor: text.trim().length === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
              }}
            >
              {Vectors.Palette} {customizeOpen ? 'Hide style' : (storyStyle ? 'Customized' : 'Customize')}
            </button>

            <div style={{ fontSize: 12, color: 'var(--dim)' }}>{text.length}/{MAX_TEXT_LENGTH}</div>
          </div>
        </div>

        {customizeOpen && storyStyle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 20, border: '1px solid var(--separator)', background: 'var(--ink-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--paper)' }}>Bubble style</span>
              <div style={{ display: 'flex', gap: 14 }}>
                <button type="button" onClick={handleShuffleStyle} style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 13, fontWeight: 800, padding: 0 }}>Shuffle</button>
                <button type="button" onClick={handleRemoveCustomization} style={{ border: 'none', background: 'transparent', color: 'var(--dim)', fontSize: 13, fontWeight: 700, padding: 0 }}>Remove</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 96, aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: 'var(--ink-2)', border: '1px solid var(--separator)', flexShrink: 0, position: 'relative' }}>
                {previewUrl && (
                  <img src={previewUrl} alt="Bubble preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: previewLoading ? 0.5 : 1, transition: 'opacity 150ms ease' }} />
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                {[
                  { label: 'Background', list: BACKGROUND_STRUCTURES, key: 'backgroundId' },
                  { label: 'Colour', list: ACCENT_COLORS, key: 'colorId' },
                  { label: 'Shape', list: BODY_SHAPES, key: 'shapeId' },
                  { label: 'Size', list: BODY_SCALES, key: 'scaleId' },
                ].map(({ label, list, key }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--dim)' }}>{label}</span>
                    <select
                      value={storyStyle[key]}
                      onChange={(e) => setStoryStyle((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={{ flex: 1, maxWidth: 150, background: 'var(--ink-2)', color: 'var(--paper)', border: '1px solid var(--separator)', borderRadius: 10, padding: '6px 10px', fontSize: 13, fontWeight: 700 }}
                    >
                      {list.map((p) => (
                        <option key={p.id} value={p.id} style={{ background: 'var(--ink-2)', color: 'var(--paper)' }}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)', lineHeight: 1.4 }}>
              Only this style choice is saved — the group sees this rendered right inside the chat bubble, no label, just the shape and background.
            </p>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderRadius: 20, border: '1px solid var(--separator)', background: 'var(--ink-2)', cursor: 'pointer' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--paper)' }}>Post anonymously</span>
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
        </label>

        <button onClick={handleSubmit} style={{ width: '100%', padding: 16, borderRadius: 20, border: 'none', background: 'var(--ember)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>Post Confession</button>
      </div>
    </GlassPanel>
  );
}

function InstagramModal({ open, onClose, onSubmit, loading }) {
  const [username, setUsername] = useState('');
  // Sized against the real visible viewport (not the layout viewport) so
  // the sheet stays pinned above the on-screen keyboard instead of the
  // keyboard covering it — see useViewportHeight.js.
  const { height: vh, offsetTop } = useViewportHeight();
  if (!open) return null;
  return (
    <div
      onClick={loading ? undefined : onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: vh ? `${vh}px` : '100dvh',
        transform: offsetTop ? `translateY(${offsetTop}px)` : undefined,
        background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, margin: '0 auto', background: 'var(--ink-2)', borderRadius: '28px 28px 0 0', padding: '24px 20px', borderTop: '1px solid var(--separator)' }}>
        <h3 style={{ margin: '0 0 6px', color: 'var(--paper)', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ color: 'var(--ember)' }}>{Vectors.Instagram}</div> Share Instagram Profile</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--dim)' }}>Just the username — we'll pull the profile card automatically.</p>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', fontWeight: 700 }}>@</span>
          <input autoFocus type="search" name="group-ig-username-f" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={username} disabled={loading} onChange={(e) => setUsername(e.target.value.replace(/^@/, '').trim())} onKeyDown={(e) => { if (e.key === 'Enter' && username.trim()) onSubmit(username.trim()); }} placeholder="username" style={{ width: '100%', border: '1px solid var(--separator)', borderRadius: 18, padding: '14px 14px 14px 32px', fontSize: 15, boxSizing: 'border-box', color: 'var(--paper)', background: 'var(--ink-2)', outline: 'none' }} />
        </div>
        <button onClick={() => username.trim() && onSubmit(username.trim())} disabled={loading || !username.trim()} style={{ width: '100%', marginTop: 16, padding: 16, borderRadius: 22, border: 'none', background: loading ? 'var(--ink-2)' : 'var(--ember)', color: '#fff', fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16 }}>{loading ? (<>{Vectors.Spinner} Fetching profile…</>) : 'Share Profile'}</button>
      </div>
    </div>
  );
}

// Telegram-style top banner: a colored accent bar, a bold colored label
// ("Pinned Message" / "Confession"), a dimmed one-line preview, an optional
// extra action slot (used for the "+" add-confession button), and a
// list button that opens the full MessageListOverlay of every pinned
// message / confession in the group — not just the current one.
function TelegramBanner({ label, accentColor, previewText, onTap, onOpenList, rightExtra }) {
  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', margin: '6px 10px 0', borderRadius: 18,
        background: 'var(--banner-bg, var(--glass-white))',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <div style={{ width: 3, height: 32, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>{label}</span>
        <span className="no-copy-text" style={{ fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewText}</span>
      </div>
      {rightExtra}
      <button
        onClick={(e) => { e.stopPropagation(); onOpenList(); }}
        title="View all"
        style={{ border: 'none', background: 'transparent', color: accentColor, cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}
      >
        {Vectors.ListIcon}
      </button>
    </div>
  );
}

// Bottom-sheet listing every pinned message / confession in the group so
// the person can jump straight to any of them, not just cycle one at a
// time via the banner tap.
function MessageListOverlay({ open, title, accentColor, messages, onClose, onSelect }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 55, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 500, maxHeight: '70vh', margin: '0 auto', background: 'var(--ink-2)', borderRadius: '28px 28px 0 0', border: '1px solid var(--separator)', borderBottom: 'none', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 10px' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: accentColor }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.06)', width: 28, height: 28, borderRadius: '50%', color: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Close}</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 8px 12px' }}>
          {messages.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Nothing here yet.</div>
          )}
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', border: 'none', background: 'transparent', borderRadius: 18, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ width: 3, height: 30, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: m.is_anon ? 'var(--dim)' : getSenderColor(m.user_id || m.sender_name) }}>
                  {m.is_anon ? 'Anonymous' : m.sender_name}
                </span>
                <span className="no-copy-text" style={{ fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(m)}</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0 }}>{formatTime(m.created_at)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function useLongPress(callback, ms = 480) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  const start = useCallback((e) => {
    firedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      callback();
    }, ms);
  }, [callback, ms]);
  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const wasLongPress = useCallback(() => firedRef.current, []);
  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchMove: stop,
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onContextMenu: (e) => { e.preventDefault(); },
    wasLongPress,
  };
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

export default function GroupChat({ groupSlug, onBack, onGroupResolved, onDeleteGroup, onLeaveGroup }) {
  const { session, profile } = useAuth();
  const ownUserId = session?.user?.id;
  const isAdmin = profile?.is_admin === true;

  const [group, setGroup] = useState(null);
  // Channel mode: group.is_channel === true means only admins can send.
  // null/false (the default, and every group that predates this column)
  // behaves exactly as before — nothing changes for regular groups.
  const isChannelLocked = group?.is_channel === true && !isAdmin;
  const [groupStatus, setGroupStatus] = useState('loading');

  const [messages, setMessages] = useState([]);
  const [typingName, setTypingName] = useState(null);
  const typingTimeoutRef = useRef(null);
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
  const [groupCardOpen, setGroupCardOpen] = useState(false);

  const [authOpen, setAuthOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Google's Android-level Autofill service scans editable fields as soon as
  // they're in the DOM, which is what puts the "key" icon / credential
  // chooser above the keyboard on this box even though it only ever holds a
  // plain message. Starting the field readOnly hides it from that scan;
  // flipping readOnly off on focus (before the keyboard opens, same tick)
  // makes it type normally with no assistance bar attached. Re-locking on
  // blur means the next scan (if the OS ever re-scans) still finds it
  // readOnly. This is on top of, not instead of, the existing
  // type="search"/autoComplete="off-nope"/data-lpignore anti-autofill hack.
  const [composerLocked, setComposerLocked] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notchOpen, setNotchOpen] = useState(false);
  const menuRef = useRef(null);
  // Close the 3-dot header menu when clicking/tapping outside it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false); setNotchOpen(false);
      }
    }
    // pointerdown captures both mouse and touch; use capture so it runs
    // before other stopPropagation handlers in the chat tree.
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', handleOutside, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', handleOutside, true);
    };
  }, [menuOpen]);


  const [isSearching, setIsSearching] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  const [hasUnreadMention, setHasUnreadMention] = useState(false);
  const [latestMentionId, setLatestMentionId] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [pendingJumpId, setPendingJumpId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [isAnonMode, setIsAnonMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  // Lightweight cache of reply targets that aren't in the currently-loaded
  // MESSAGE_LIMIT window — so reply previews show the real snippet instead
  // of "Original message" until the user scrolls far enough to paginate them in.
  const [replyCache, setReplyCache] = useState({});
  
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);
  // Holds the flat { id, text, sender_name, avatar_url, is_anon, media_url,
  // media_type } shape ShareStorySheet's mode="message" expects —
  // normalized from either a group_messages row or a confession-flagged one
  // (see "Share as Story" action below), or null when the sheet is closed.
  const [sharingMessage, setSharingMessage] = useState(null);

  const [pendingFile, setPendingFile] = useState(null); 
  const [caption, setCaption] = useState('');
  const [uploadSecondsLeft, setUploadSecondsLeft] = useState(60);

  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [confessionModalOpen, setConfessionModalOpen] = useState(false);
  const [confessionNavIndex, setConfessionNavIndex] = useState(-1);
  const [pinNavIndex, setPinNavIndex] = useState(-1);
  const [pinning, setPinning] = useState(false);
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [instagramLoading, setInstagramLoading] = useState(false);
  // Full "view all" bottom sheets for the pinned-message and confession
  // banners (see TelegramBanner's list button below).
  const [pinnedListOpen, setPinnedListOpen] = useState(false);
  const [confessionListOpen, setConfessionListOpen] = useState(false);


  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cooldownRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const messageInputRef = useRef(null);
  // Tracks the id of whichever message currently sits at the front of the
  // (newest-first) messages array, so the scroll-to-bottom effect below can
  // tell "a brand new message just arrived" apart from "older history got
  // paginated in at the tail" or "an existing message's fields changed" —
  // both of which also change `messages` but shouldn't yank the scroll
  // position.
  const lastNewestMessageIdRef = useRef(null);

  // Mirror refs for the pagination guards below, so the scroll-triggered
  // loader always reads the latest values instead of whatever was captured
  // the moment the IntersectionObserver callback was created.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const hasMoreMessagesRef = useRef(true);
  useEffect(() => { hasMoreMessagesRef.current = hasMoreMessages; }, [hasMoreMessages]);
  const loadingMoreRef = useRef(false);
  useEffect(() => { loadingMoreRef.current = loadingMoreMessages; }, [loadingMoreMessages]);

  // See the matching comment in DirectMessages.jsx — reading the callback
  // through a ref (rather than the effect's dependency array) means a fresh
  // inline function from the parent on every render no longer re-triggers
  // the group lookup, which is what was making the group screen visibly
  // reload a few times right after opening it.
  const onGroupResolvedRef = useRef(onGroupResolved);
  useEffect(() => { onGroupResolvedRef.current = onGroupResolved; }, [onGroupResolved]);

  const startReply = useCallback((message) => {
    const replyName = message.is_anon ? 'Anonymous' : (message.instagram_username ? `@${message.instagram_username}` : message.sender_name);
    setReplyingTo({ id: message.id, sender_name: replyName, text: message.text, media_url: message.media_url, media_type: message.media_type, instagram_username: message.instagram_username });
  }, []);

  useEffect(() => {
    if (!groupSlug) return;
    let isMounted = true;
    setGroupStatus('loading');
    // See the matching comment in DirectMessages.jsx's thread-switch effect
    // — clearing these up front (rather than only once the new group
    // resolves) is what stops the previous group's messages from flashing
    // on screen while the new one is still loading.
    setGroup(null);
    setMessages([]);
    setMessagesLoading(true);
    setHasMoreMessages(true);
    setReplyingTo(null);
    setSelectedMessages([]);
    setReplyCache({});
    setHighlightedMsgId(null);
    setHasUnreadMention(false);
    setLatestMentionId(null);
    setIsSearching(false);
    setChatSearchQuery('');
    setMenuOpen(false);
    setNotchOpen(false);

    async function initializeGroup() {
      try {
        const { data, error } = await supabase.from('groups').select('*').eq('slug', groupSlug).maybeSingle();
        if (error) throw error;
        if (isMounted) {
          if (!data) { setGroupStatus('error'); if (onGroupResolvedRef.current) onGroupResolvedRef.current(null); } 
          else { setGroup(data); setGroupStatus('ready'); if (onGroupResolvedRef.current) onGroupResolvedRef.current(data); }
        }
      } catch (err) {
        console.error('Failed to load group:', err);
        if (isMounted) { setGroupStatus('error'); if (onGroupResolvedRef.current) onGroupResolvedRef.current(null); }
      }
    }
    initializeGroup();
    return () => { isMounted = false; };
  }, [groupSlug]);

  // Resolves confession_id for any confession-flagged messages in a batch
  // (shared by the initial load and the older-messages pagination fetch
  // below, so both paths render ConfessionBubble correctly).
  const attachConfessionIds = useCallback(async (batch) => {
    const confessionMsgIds = batch.filter((m) => m.is_confession).map((m) => m.id);
    if (confessionMsgIds.length === 0) return batch;
    const { data: confs } = await supabase.from('confessions').select('id, source_message_id').in('source_message_id', confessionMsgIds);
    if (!confs) return batch;
    return batch.map((m) => {
      if (m.is_confession) { const match = confs.find((c) => c.source_message_id === m.id); return { ...m, confession_id: match?.id }; }
      return m;
    });
  }, []);

  const fetchMessagesAndReceipts = useCallback(async () => {
    if (!group?.id) return;
    let isMounted = true;

    // Guests browsing a group without signing in have no ownUserId at all
    // (that's a real, permanent state here — see the "Sign in to send
    // message" composer below — not just "not loaded yet"), and this same
    // effect also fires once ownUserId first resolves for an in-progress
    // login. Either way, a read-receipt lookup makes no sense without a
    // user id: skip the query rather than sending user_id=eq.undefined,
    // which Postgres rejects outright (can't cast the literal string
    // "undefined" to uuid).
    let lastReadAt = '1970-01-01T00:00:00.000Z';
    if (ownUserId) {
      // group_threads is both membership ("joined this channel") and read
      // state now — this select doubles as "am I already joined?" but we
      // don't need that here, just last_read_at for the unread-mention math
      // below. The upsert a few lines down creates the row (= joins the
      // channel) the first time this runs for a given user+group.
      const { data: receiptData } = await supabase.from('group_threads').select('last_read_at').eq('group_id', group.id).eq('user_id', ownUserId).maybeSingle();
      lastReadAt = receiptData?.last_read_at || lastReadAt;
    }

    // Only the most recent MESSAGE_LIMIT (20) messages load up front; older
    // history is fetched on demand as the user scrolls up — see
    // loadOlderMessages below.
    const { data, error } = await supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT);

    if (!error && isMounted) {
      const fetchedMessages = await attachConfessionIds(data || []);

      setMessages(fetchedMessages);
      setHasMoreMessages(fetchedMessages.length === MESSAGE_LIMIT);
      setMessagesLoading(false);

      if (ownUserId) {
        const unreadMention = fetchedMessages.find((m) => m.mentioned_user_ids?.includes(ownUserId) && new Date(m.created_at) > new Date(lastReadAt));
        if (unreadMention) { setHasUnreadMention(true); setLatestMentionId(unreadMention.id); } 
        else {
          // Upsert-only-passing-last_read_at is deliberate: on first run
          // (no row yet) this INSERTs and joined_at/unread_count/mention
          // take their column defaults (now(), 0, false) — i.e. opening a
          // group you haven't joined joins it. On every later run it's a
          // plain UPDATE of last_read_at, which a DB trigger uses to zero
          // unread_count/mention (see 0009_group_threads_and_dm_counters.sql)
          // without ever touching joined_at.
          supabase.from('group_threads').upsert({ group_id: group.id, user_id: ownUserId, last_read_at: new Date().toISOString() }, { onConflict: 'group_id,user_id' }).then();
        }
      }
    }
  }, [group?.id, ownUserId, attachConfessionIds]);

  // Fetches the next page of older messages (everything before the oldest
  // one currently loaded) and appends it to the end of the `messages`
  // array — which, because the list is newest-first, lands it at the top
  // of what's on screen once column-reverse flips the visual order.
  const loadOlderMessages = useCallback(async () => {
    if (!group?.id) return;
    if (loadingMoreRef.current || !hasMoreMessagesRef.current) return;
    const oldest = messagesRef.current[messagesRef.current.length - 1];
    if (!oldest) return;

    loadingMoreRef.current = true;
    setLoadingMoreMessages(true);
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select('*, profiles(avatar_url)')
        .eq('group_id', group.id)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;

      const older = await attachConfessionIds(data || []);
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
  }, [group?.id, attachConfessionIds]);

  useEffect(() => {
    fetchMessagesAndReceipts();
    if (!group?.id) return;

    const channel = supabase.channel(`group_messages:${group.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, async (payload) => {
        let newMsg = payload.new;
        if (!newMsg.is_anon && newMsg.user_id) {
          const { data: pData } = await supabase.from('profiles').select('avatar_url').eq('id', newMsg.user_id).single();
          newMsg.profiles = pData;
        }
        if (newMsg.is_confession) {
          setTimeout(async () => {
            const { data: cData } = await supabase.from('confessions').select('id').eq('source_message_id', newMsg.id).maybeSingle();
            if (cData) setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, confession_id: cData.id } : m));
          }, 800);
        }

        const isMentioned = ownUserId && newMsg.mentioned_user_ids?.includes(ownUserId);
        if (isMentioned) { setHasUnreadMention(true); setLatestMentionId(newMsg.id); }
        // Our own sends already get playSend()/hapticSend() AND an instant
        // optimistic bubble in handleSend()/handleMediaPicked() (reconciled
        // by real id once the insert responds) — only play the incoming
        // tone for messages from someone else, and the `some(...)` dedup
        // below means this echo of our own row is a no-op once reconciled.
        if (newMsg.user_id !== ownUserId) playReceive();
        setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [newMsg, ...prev]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      // Without this, an admin's Pin/Unpin (handleTogglePinSelected above)
      // only ever updated their own optimistic local state — every OTHER
      // viewer of the group never learned the row changed at all, since
      // this channel previously only listened for INSERT/DELETE. That's a
      // second, independent reason "pin isn't working" could show up: the
      // admin who pinned it sees it pinned, but nobody else does until they
      // happen to reload.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)));
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        setTypingName(payload?.name || null);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingName(null), 4000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [group?.id, ownUserId, fetchMessagesAndReceipts]);

  useEffect(() => {
    cooldownRef.current = createCooldown((percent) => setCooldownPercent(percent), () => setCooldownPercent(0));
    return () => { cooldownRef.current?.cancel(); };
  }, []);

  // Deep-link support for "Share link" on a message (see the share actions
  // below): once messages are loaded, check the URL's #msg-<id> fragment
  // (short or full id — see resolveMessageIdFromHash). If it matches a
  // currently-loaded message, just scroll/highlight it. Otherwise (the
  // linked message is older than the initial MESSAGE_LIMIT batch) fetch it
  // directly — a short id resolves against the real `link_id` column (see
  // supabase/migrations/0002_link_id_routing.sql), a full uuid resolves
  // against `id` — then pull ~MESSAGE_LIMIT messages on either side of it so
  // it opens with real context instead of alone, merge that into `messages`,
  // and jump to it. Older history above that context still lazy-loads via
  // the normal infinite-scroll observer below. Mirrors resolveDeepLink in
  // DirectMessages.jsx.
  useEffect(() => {
    if (messagesLoading || !group?.id) return;
    const hashMatch = /^#(msg|reply)-(.+)$/.exec(window.location.hash || '');
    if (!hashMatch) return;
    const action = hashMatch[1];
    const rawTarget = decodeURIComponent(hashMatch[2]);
    let cancelled = false;

    async function resolveDeepLink() {
      const alreadyLoadedId = resolveMessageIdFromHash(window.location.hash, messagesRef.current);
      if (alreadyLoadedId) { 
        setPendingJumpId(alreadyLoadedId); 
        setPendingAction(action);
        return; 
      }

      const lookup = isShortId(rawTarget)
        ? supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).eq('link_id', rawTarget).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).eq('id', rawTarget).maybeSingle();

      const { data: row } = await lookup;
      if (cancelled || !row) return;

      const [{ data: olderCtx }, { data: newerCtx }] = await Promise.all([
        supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).lte('created_at', row.created_at).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT),
        supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).gt('created_at', row.created_at).order('created_at', { ascending: true }).limit(MESSAGE_LIMIT),
      ]);
      if (cancelled) return;

      const context = await attachConfessionIds([...(olderCtx || []), ...(newerCtx || [])]);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const additions = context.filter((m) => !existingIds.has(m.id));
        if (additions.length === 0) return prev;
        return [...prev, ...additions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      });
      setHasMoreMessages(true);
      setPendingJumpId(row.id);
      setPendingAction(action);
    }

    resolveDeepLink();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesLoading, group?.id]);

  useEffect(() => {
    if (!pendingJumpId) return;
    const el = document.getElementById(`msg-${pendingJumpId}`);
    if (!el) return;
    
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(pendingJumpId);
    
    if (pendingAction === 'reply') {
      const msgToReply = messages.find(m => m.id === pendingJumpId);
      if (msgToReply) startReply(msgToReply);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    
    setPendingJumpId(null);
    setPendingAction(null);
    const t = setTimeout(() => setHighlightedMsgId(null), 2000);
    return () => clearTimeout(t);
  }, [pendingJumpId, pendingAction, messages, startReply]);

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
  }, [hasMoreMessages, messagesLoading, isSearching, loadOlderMessages, group?.id]);

  // Scroll to the newest message every time one actually arrives — whether
  // it's the local optimistic bubble from sending, the realtime INSERT echo
  // reconciling it, or a message from someone else coming in live. The list
  // is rendered `flex-direction: column-reverse` with newest-first data (see
  // the MESSAGES LIST container below), so "scrolled to the bottom" means
  // scrollTop === 0 here, not scrollHeight.
  //
  // Compares message[0]'s id rather than just watching `messages.length` so
  // this doesn't also fire (and yank the scroll position away from wherever
  // someone's mid-read) when older history gets appended at the *tail* via
  // pagination/deep-link context-loading, or when an existing message is
  // merely edited/updated in place.
  useEffect(() => {
    const newestId = messages[0]?.id ?? null;
    if (newestId && newestId !== lastNewestMessageIdRef.current) {
      const isFirstLoad = lastNewestMessageIdRef.current === null;
      lastNewestMessageIdRef.current = newestId;
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: 0, behavior: isFirstLoad ? 'auto' : 'smooth' });
    }
  }, [messages]);

  // Pull any reply_to targets that aren't in the current messages window
  // into replyCache so the inline quote can show a real snippet.
  useEffect(() => {
    if (!group?.id || messages.length === 0) return;
    const loadedIds = new Set(messages.map((m) => m.id));
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const missing = [];
    for (const m of messages) {
      // Optimistic temp-* ids are not real UUIDs — never send them to Postgres.
      if (m.reply_to_id && uuidRe.test(m.reply_to_id) && !loadedIds.has(m.reply_to_id) && !replyCache[m.reply_to_id]) {
        missing.push(m.reply_to_id);
      }
    }
    const unique = [...new Set(missing)];
    if (unique.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('group_messages')
        .select('id, text, sender_name, is_anon, media_url, media_type, instagram_username, user_id')
        .eq('group_id', group.id)
        .in('id', unique);
      if (cancelled || error || !data) return;
      setReplyCache((prev) => {
        const next = { ...prev };
        for (const row of data) next[row.id] = row;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // replyCache intentionally omitted from deps — we only want to run when
    // messages change, and the !replyCache[id] guard prevents re-fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, messages]);

  const toggleSelection = (msgId) => { if (!isAdmin) return; hapticSelect(); setSelectedMessages((prev) => (prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId])); };
  // Long-press opens the reaction tray only. Selection is available from the
  // tray's "Select" action (admin), not from long-press itself.
  const longPressTargetRef = useRef(null);
  const handleLongPressOpenReaction = useCallback(() => {
    const msgId = longPressTargetRef.current;
    if (!msgId) return;
    hapticSelect();
    setActiveReactionMsgId(msgId);
  }, []);
  const longPressHook = useLongPress(handleLongPressOpenReaction, 480);

  // Jump/highlight helper shared by the pinned & confession banners and
  // their "view all" list sheets below.
  const jumpToMessage = useCallback(async (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(id);
      setTimeout(() => setHighlightedMsgId(null), 2000);
      return;
    }
    // Target isn't in the current window — fetch it + nearby context (same
    // path as deep-link resolution) then scroll once it's merged in.
    if (!group?.id || !id) return;
    try {
      const { data: row } = await supabase
        .from('group_messages')
        .select('*, profiles(avatar_url)')
        .eq('group_id', group.id)
        .eq('id', id)
        .maybeSingle();
      if (!row) return;
      const [{ data: olderCtx }, { data: newerCtx }] = await Promise.all([
        supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).lte('created_at', row.created_at).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT),
        supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).gt('created_at', row.created_at).order('created_at', { ascending: true }).limit(MESSAGE_LIMIT),
      ]);
      const context = await attachConfessionIds([...(olderCtx || []), ...(newerCtx || [])]);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const additions = context.filter((m) => !existingIds.has(m.id));
        if (additions.length === 0) return prev;
        return [...prev, ...additions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      });
      setPendingJumpId(row.id);
    } catch (err) {
      console.error('Failed to jump to message:', err);
    }
  }, [group?.id, attachConfessionIds]);

  // Deletes one or more group_messages rows *and* everything that would
  // otherwise block or orphan that delete:
  //   1. Any message that REPLIES to one being deleted has its reply_to_id
  //      cleared first — this just drops the "replying to" preview, it
  //      never deletes the replying message itself.
  //   2. Reactions attached to the deleted message(s) are removed too.
  //      (Confession-flagged messages react under targetType="confession"
  //      keyed by confession_id rather than the message id — see the
  //      ReactionBar usage below — so both target shapes are cleaned up.)
  // Without step 1, a stale reply_to_id pointing at a deleted message could
  // make the delete itself fail (or, if it silently succeeded, could leave
  // replies pointing at nothing) — which is what caused deleted messages to
  // reappear once the view refetched: the delete never actually committed.
  const deleteMessagesSafely = useCallback(async (msgsToDelete) => {
    if (!msgsToDelete || msgsToDelete.length === 0) return;
    const ids = msgsToDelete.map((m) => m.id);
    const groupMessageReactionIds = msgsToDelete.filter((m) => !m.is_confession).map((m) => m.id);
    const confessionReactionIds = msgsToDelete.filter((m) => m.is_confession).map((m) => m.confession_id || m.id);

    // Optimistic local update: drop the deleted messages, and strip the
    // reply link (not the message) from anything still visible that replied
    // to one of them.
    setMessages((prev) => prev
      .filter((m) => !ids.includes(m.id))
      .map((m) => (m.reply_to_id && ids.includes(m.reply_to_id) ? { ...m, reply_to_id: null } : m))
    );

    try {
      const { error: unlinkError } = await supabase.from('group_messages').update({ reply_to_id: null }).in('reply_to_id', ids);
      if (unlinkError) throw unlinkError;

      if (groupMessageReactionIds.length > 0) {
        const { error: reactionsError } = await supabase.from('reactions').delete().eq('target_type', 'group_message').in('target_id', groupMessageReactionIds);
        if (reactionsError) throw reactionsError;
      }
      if (confessionReactionIds.length > 0) {
        const { error: confReactionsError } = await supabase.from('reactions').delete().eq('target_type', 'confession').in('target_id', confessionReactionIds);
        if (confReactionsError) throw confReactionsError;
      }

      // .select('id') makes Postgres return the rows that were actually
      // deleted. Without it, a delete that RLS silently narrows to zero
      // matching rows (e.g. an admin deleting a message they don't own, if
      // the policy doesn't carry an admin exception) comes back with no
      // error and empty data — indistinguishable from a real success. The
      // optimistic update above would then have already hidden it locally,
      // so nothing looked wrong until the next refetch brought it back.
      // Checking the returned row count turns that silent no-op into a
      // real, visible failure that reverts the optimistic UI instead.
      const { data: deletedRows, error: deleteError } = await supabase.from('group_messages').delete().in('id', ids).select('id');
      if (deleteError) throw deleteError;
      if (!deletedRows || deletedRows.length !== ids.length) {
        throw new Error('Delete was blocked (permissions) — no rows were removed.');
      }
    } catch (err) {
      console.error('Failed to delete message(s):', err);
      showToast(friendlyDbError(), 'error');
      fetchMessagesAndReceipts();
    }
  }, [fetchMessagesAndReceipts]);

  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedMessages.length === 0) return;
    const msgsToDelete = messages.filter((m) => selectedMessages.includes(m.id));
    setSelectedMessages([]);
    await deleteMessagesSafely(msgsToDelete);
  };

  // Pin/unpin a single selected message. Admin-only (see
  // 0006_group_message_pins.sql's RLS policy — the same global
  // `profiles.is_admin` flag that already gates message deletion above).
  // Only offered when exactly one message is selected, since "pin" is a
  // per-message toggle, not a bulk action like delete.

  const handleTogglePinMessage = async (msg) => {
    if (!isAdmin || !msg || pinning) return;
    const nextPinned = !msg.is_pinned;
    setPinning(true);
    setActiveReactionMsgId(null);
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: nextPinned } : m)));
    const { data, error } = await supabase
      .from('group_messages')
      .update({ is_pinned: nextPinned })
      .eq('id', msg.id)
      .select('id, is_pinned');
    setPinning(false);
    if (error || !data || data.length === 0) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: !nextPinned } : m)));
      showToast('Could not update pin', 'error');
      return;
    }
    showToast(nextPinned ? 'Message pinned' : 'Message unpinned', 'info');
  };

  const handleTogglePinSelected = async () => {
    if (!isAdmin || selectedMessages.length !== 1 || pinning) return;
    const msg = messages.find((m) => m.id === selectedMessages[0]);
    if (!msg) return;
    const nextPinned = !msg.is_pinned;
    setPinning(true);
    setSelectedMessages([]);
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: nextPinned } : m)));
    // Same footgun as handleDeleteSelected above: an UPDATE blocked by RLS
    // (e.g. profiles.is_admin not actually true server-side, or a stale
    // client-side session) returns success with zero rows affected, NOT an
    // error — so without checking the returned row(s), a blocked pin looked
    // "successful" in the optimistic UI and then silently reverted on the
    // next fetch, which is exactly what "pin isn't working" looks like.
    // Requesting the row back and checking it actually came back turns that
    // silent no-op into a real, visible failure instead.
    const { data: updatedRows, error } = await supabase
      .from('group_messages')
      .update({ is_pinned: nextPinned })
      .eq('id', msg.id)
      .select('id, is_pinned');
    setPinning(false);
    if (error || !updatedRows || updatedRows.length === 0) {
      console.error('Failed to toggle pin:', error || 'update matched 0 rows (blocked by RLS)');
      showToast(friendlyDbError(), 'error');
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: !nextPinned } : m)));
      return;
    }
    showToast(nextPinned ? 'Message pinned' : 'Message unpinned', 'info');
  };

  const currentSenderName = () => (isAnonMode ? 'Anonymous' : (profile?.is_admin ? ADMIN_DISPLAY_NAME : (profile?.username || 'Anonymous')));

  // Swaps a temp optimistic message for its canonical DB row — see the
  // matching helper/comment in DirectMessages.jsx. Guards against the
  // realtime INSERT echo (above) having already added the real row first.
  function reconcileOptimisticMessage(tempId, finalRow) {
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      if (finalRow && withoutTemp.some((m) => m.id === finalRow.id)) return withoutTemp;
      return finalRow ? [finalRow, ...withoutTemp] : withoutTemp;
    });
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !session?.user || !group || sending) return;
    if (isChannelLocked) { showToast('Only admins can send messages in this channel.', 'info'); return; }
    if (cooldownPercent > 0) { showToast('Please wait a few seconds before sending another message.', 'info'); return; }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Never pass an optimistic temp-* id as reply_to_id — Postgres rejects non-UUIDs.
    const rawReplyId = replyingTo?.id ?? null;
    const replyToId = rawReplyId && !String(rawReplyId).startsWith('temp-') ? rawReplyId : null;
    const senderName = currentSenderName();
    const optimisticMsg = {
      id: tempId, group_id: group.id, user_id: session.user.id, sender_name: senderName, text: trimmed,
      media_url: null, media_type: null, reply_to_id: replyToId, mentioned_user_ids: [], is_anon: isAnonMode,
      is_confession: false, created_at: new Date().toISOString(),
      profiles: isAnonMode ? null : { avatar_url: profile?.avatar_url || null },
      _pending: true,
    };
    // Show the bubble immediately — the mention lookup + insert + realtime
    // round trips below no longer block the sender from seeing their own
    // message appear.
    setMessages((prev) => [optimisticMsg, ...prev]);
    setText(''); setReplyingTo(null); setPickerOpen(false);
    playSend(); hapticSend(); cooldownRef.current?.start();

    setSending(true);
    try {
      const mentionedUsernames = [...trimmed.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1].toLowerCase());
      let mentionedIds = [];
      if (mentionedUsernames.length > 0) {
        const { data } = await supabase.from('profiles').select('id').in('username', mentionedUsernames);
        if (data) mentionedIds = data.map((p) => p.id);
      }

      const { data, error } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: senderName, text: trimmed, reply_to_id: replyToId, mentioned_user_ids: mentionedIds, is_anon: isAnonMode }).select('*, profiles(avatar_url)').single();
      if (error) throw error;
      reconcileOptimisticMessage(tempId, data);
    } catch (err) {
      console.error(err);
      showToast(friendlyDbError(), 'error');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
    } finally {
      setSending(false);
    }
  }

  function handleAttachmentSelected(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), type: guessMediaType(file) });
  }

  function cancelPendingAttachment() { if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); }

  async function sendPendingAttachment() {
    if (!pendingFile || !session?.user || !group || uploading) return;
    if (isChannelLocked) { showToast('Only admins can send messages in this channel.', 'info'); return; }
    if (cooldownPercent > 0) { showToast('Please wait a few seconds before sending another message.', 'info'); return; }
    setUploading(true); setUploadSecondsLeft(60);
    const tick = setInterval(() => setUploadSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    const { file, type } = pendingFile;
    const path = `${session.user.id}/group-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

    try {
      const uploadPromise = supabase.storage.from('media').upload(path, file, { upsert: false, contentType: file.type || undefined });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), UPLOAD_TIMEOUT_MS));
      const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
      if (!publicUrlData?.publicUrl) throw new Error('NO_URL');

      const { error: insertError } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), text: caption.trim() || null, media_url: publicUrlData.publicUrl, media_type: type, reply_to_id: (replyingTo?.id && !String(replyingTo.id).startsWith('temp-')) ? replyingTo.id : null, is_anon: isAnonMode });
      if (insertError) throw insertError;
      URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); setReplyingTo(null); cooldownRef.current?.start();
    } catch (err) {
      showToast(err.message === 'TIMEOUT' ? "Upload timed out — check your connection and try again." : "Couldn't send that file. Please try again.", 'error');
    } finally { clearInterval(tick); setUploading(false); }
  }

  async function handleMediaPicked(url, mediaType) {
    if (!session?.user || !group || sending) return;
    if (isChannelLocked) { showToast('Only admins can send messages in this channel.', 'info'); return; }
    if (cooldownPercent > 0) { showToast('Please wait.', 'info'); return; }
    setPickerOpen(false);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyToId = replyingTo?.id ?? null;
    const senderName = currentSenderName();
    setMessages((prev) => [{ id: tempId, group_id: group.id, user_id: session.user.id, sender_name: senderName, text: null, media_url: url, media_type: mediaType, reply_to_id: replyToId, mentioned_user_ids: [], is_anon: isAnonMode, is_confession: false, created_at: new Date().toISOString(), profiles: isAnonMode ? null : { avatar_url: profile?.avatar_url || null }, _pending: true }, ...prev]);
    setReplyingTo(null); playSend(); hapticSend(); cooldownRef.current?.start();

    const { data, error } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: senderName, media_url: url, media_type: mediaType, reply_to_id: replyToId && !String(replyToId).startsWith('temp-') ? replyToId : null, is_anon: isAnonMode }).select('*, profiles(avatar_url)').single();
    if (error) {
      showToast(friendlyDbError(), 'error');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
      return;
    }
    reconcileOptimisticMessage(tempId, data);
  }

  async function handleConfessionSubmit(confessionText, anon, mediaFile, storyStyle) {
    setConfessionModalOpen(false);
    if (isChannelLocked) { showToast('Only admins can send messages in this channel.', 'info'); return; }
    let mediaUrl = null; let mediaType = null;
    
    if (mediaFile) {
      setUploading(true);
      const path = `${session.user.id}/confession-${Date.now()}-${mediaFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      try {
        await supabase.storage.from('media').upload(path, mediaFile);
        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
        mediaUrl = publicUrlData?.publicUrl; 
        mediaType = guessMediaType(mediaFile); 
      } catch (err) { showToast('Failed to upload media', 'error'); setUploading(false); return; }
      setUploading(false);
    }
    
    const senderName = anon ? 'Anonymous' : (profile?.is_admin ? ADMIN_DISPLAY_NAME : (profile?.username || 'Anonymous'));
    // Only the preset ids are stored — the shape+background is rendered on
    // demand, inline in the bubble, by ConfessionBubble.jsx (see
    // generateConfessionCardImage in storyImageGenerator.js). Only applies
    // when there's text (nothing to render a shape around otherwise).
    const { error } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: senderName, text: confessionText, is_anon: anon, is_confession: true, media_url: mediaUrl, media_type: mediaType, story_style: storyStyle && confessionText ? storyStyle : null });
    if (error) showToast(friendlyDbError(), 'error');
  }

  async function handleInstagramSubmit(username) {
    if (!session?.user || !group) return;
    if (isChannelLocked) { showToast('Only admins can send messages in this channel.', 'info'); return; }
    setInstagramLoading(true); const data = await scrapeInstagram(username); setInstagramLoading(false);
    if (!data) { showToast("Couldn't find that Instagram profile.", 'error'); return; }
    setInstagramModalOpen(false);
    const payload = data.fallback ? { group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), instagram_username: data.username, reply_to_id: (replyingTo?.id && !String(replyingTo.id).startsWith('temp-')) ? replyingTo.id : null, is_anon: isAnonMode } : { group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), instagram_username: data.username, reply_to_id: (replyingTo?.id && !String(replyingTo.id).startsWith('temp-')) ? replyingTo.id : null, is_anon: isAnonMode, instagram_pfp_url: data.pfp_url, instagram_full_name: data.full_name, instagram_bio: data.bio, instagram_followers: data.followers, instagram_following: data.following, instagram_posts: data.posts, instagram_is_verified: data.is_verified, instagram_is_private: data.is_private };
    const { error } = await supabase.from('group_messages').insert(payload);
    if (error) showToast(friendlyDbError(), 'error');
    else { setReplyingTo(null); cooldownRef.current?.start(); }
  }

  function handleJumpToMention() {
    if (!latestMentionId) return;
    const element = document.getElementById(`msg-${latestMentionId}`);
    if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightedMsgId(latestMentionId); setTimeout(() => setHighlightedMsgId(null), 2000); }
    setHasUnreadMention(false);
    if (ownUserId && group?.id) supabase.from('group_threads').upsert({ group_id: group.id, user_id: ownUserId, last_read_at: new Date().toISOString() }, { onConflict: 'group_id,user_id' }).then();
  }

  // `isAnonMsg` used to be read here as a closure variable, but this
  // function is defined at the component's top level while `isAnonMsg` is
  // only ever computed per-message inside the messages .map() below (see
  // "const isAnonMsg = message.is_anon === true;") — so it was never
  // actually in scope here. That's a plain `ReferenceError: isAnonMsg is
  // not defined`, thrown (and crashing the whole app, since nothing caught
  // it) the moment any message containing an "@mention" got rendered.
  // Threading it through as a parameter fixes that; every call site below
  // is already inside that same .map() block, so `isAnonMsg` is available
  // there to pass in.
  const renderMessageTextWithMentions = (messageText, isOwn, isAnonMsg) => {
    if (!messageText) return null;
    return messageText.split(/(@[a-zA-Z0-9_]+)/g).map((part, i) => {
      if (part.startsWith('@') && part.length > 1) {
        return (
          <button key={i} onClick={async (e) => {
            e.stopPropagation();
            const uname = part.substring(1).toLowerCase();
            const { data } = await supabase.from('profiles').select('id').eq('username', uname).maybeSingle();
            if (data?.id) { setProfileCardUserId(data.id); return; }
            // Bots share the same @name surface as real users
            const { data: bot } = await supabase.from('bots').select('id').ilike('name', uname).eq('active', true).maybeSingle();
            if (bot?.id) setProfileCardUserId(bot.id);
          }} style={{ color: (isOwn || isAnonMsg) ? 'var(--bubble-own-text)' : 'var(--ember)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', fontSize: 'inherit' }}>{part}</button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const filteredMessages = messages.filter((m) => {
    if (!isSearching || !chatSearchQuery.trim()) return true;
    const q = chatSearchQuery.trim().toLowerCase();
    if (q.startsWith('@') && q.length > 1) { const targetName = q.substring(1); return m.sender_name?.toLowerCase() === targetName || m.instagram_username?.toLowerCase() === targetName; }
    return m.text?.toLowerCase().includes(q) || m.sender_name?.toLowerCase().includes(q);
  });


  if (groupStatus === 'loading') return <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}><div style={{ color: 'var(--ember)' }}>{Vectors.Spinner}</div></div>;
  if (groupStatus === 'error') return <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', flexDirection: 'column', gap: 16 }}><p style={{ color: 'var(--dim)' }}>Failed to load group.</p><button onClick={onBack} style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 16, cursor: 'pointer' }}>Go Back</button></div>;

  const allPinnedMessages = messages.filter((m) => m.is_pinned);
  const allConfessionMessages = messages.filter((m) => m.is_confession);

  return (
    <div className="no-copy-text" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden', zIndex: 1, userSelect: 'none', WebkitUserSelect: 'none', background: 'var(--ink)' }}>

      {/* HEADER — rendered as its own floating rounded card, separated
          from the message list by margin rather than a full-bleed bar
          with a hairline border, so it reads as a distinct element. */}
      {selectedMessages.length > 0 ? (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', margin: '8px 10px 0', borderRadius: 22, background: 'var(--ember)', color: '#fff', zIndex: 20, boxShadow: '0 4px 18px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button onClick={() => setSelectedMessages([])} style={{ border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex' }}>{Vectors.Close}</button><span style={{ fontWeight: 700, fontSize: 16 }}>{selectedMessages.length} Selected</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {selectedMessages.length === 1 && (
              <button onClick={handleTogglePinSelected} disabled={pinning} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: pinning ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, opacity: pinning ? 0.6 : 1 }}>
                {Vectors.Pin} {messages.find((m) => m.id === selectedMessages[0])?.is_pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            <button onClick={handleDeleteSelected} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>{Vectors.Trash} Delete</button>
          </div>
        </header>
      ) : (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, margin: '8px 10px 0', zIndex: 20 }}>
          {/* Back button — separate round chip outside the header card. */}
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              border: '1px solid var(--glass-border)',
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--paper)',
              cursor: 'pointer',
              width: 42,
              height: 42,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            }}
          >
            {Vectors.Back}
          </button>
          <header style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 22, background: 'var(--header-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', boxShadow: '0 4px 18px rgba(0,0,0,0.18)' }}>
          <button onClick={() => setGroupCardOpen(true)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'left' }}>
            <LiquidAvatar identity={{ name: group.name, avatar_url: group.cover_url, is_admin: false }} size={36} kind="group" />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
              <span style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.description || 'Public Group'}</span>
            </div>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button onClick={() => setIsAnonMode(!isAnonMode)} style={{ border: 'none', background: isAnonMode ? 'rgba(59,130,246,0.18)' : 'transparent', color: isAnonMode ? 'var(--ember)' : 'var(--dim)', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'all 0.2s', backdropFilter: isAnonMode ? 'blur(8px)' : undefined }}>{Vectors.Ghost}</button>
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((v) => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--paper)', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>{Vectors.ThreeDots}</button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 30, minWidth: 190, padding: 6, background: 'var(--menu-bg)', borderRadius: 18, border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)' }}>
                  <button onClick={() => { setIsSearching(true); setMenuOpen(false); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--paper)', textAlign: 'left', borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{Vectors.SearchSmall} Search Chat</button>
                  <button onClick={() => { navigator.clipboard.writeText(`${getCanonicalOrigin()}${window.location.pathname}`); setMenuOpen(false); showToast('Link copied to clipboard!', 'info'); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--paper)', textAlign: 'left', borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Share link</button>
                  {session && onLeaveGroup && group && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onLeaveGroup(group);
                      }}
                      style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--paper)', textAlign: 'left', borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      {Vectors.Close} Leave group
                    </button>
                  )}
                  {isAdmin && onDeleteGroup && group && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        if (window.confirm(`Delete “${group.name}” for everyone? This cannot be undone.`)) {
                          onDeleteGroup(group);
                        }
                      }}
                      style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: '#FF6B6B', textAlign: 'left', borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      {Vectors.Trash} Delete group
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        </div>
      )}

      {/* SEARCH BAR */}
      {isSearching && (
        <div style={{ background: 'var(--header-bg)', margin: '8px 10px 0', borderRadius: 20, border: '1px solid var(--glass-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 19 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', pointerEvents: 'none' }}>{Vectors.SearchSmall}</span>
            <input autoFocus type="search" name="group-chat-search-f" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={chatSearchQuery} onChange={(e) => setChatSearchQuery(e.target.value)} placeholder="Search or type @username..." style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 16, border: 'none', background: 'var(--ink-2)', color: 'var(--paper)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => { setIsSearching(false); setChatSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
        </div>
      )}

      {/* PINNED MESSAGE / CONFESSION BANNERS — Telegram-style bars docked
          under the header. Each shows the active item (tap cycles through
          every pinned message / confession in the group) and a list
          button that opens MessageListOverlay with the full set. The
          confession banner also carries a "+" so posting a new confession
          doesn't require opening the attachment sheet. Hidden on channels
          (broadcast-only) and while the search bar is open.

          The pinned-message banner is intentionally shown to signed-out
          visitors too — pins are group content anyone browsing the group
          should be able to see, not a signed-in-only feature. The
          confession banner keeps requiring a session, since posting a
          confession does. */}
      {!group?.is_channel && !isSearching && (
        <div style={{ flexShrink: 0, zIndex: 19, display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 2 }}>
          {allPinnedMessages.length > 0 && (() => {
            const activeIdx = pinNavIndex >= 0 && pinNavIndex < allPinnedMessages.length ? pinNavIndex : 0;
            const active = allPinnedMessages[activeIdx];
            return (
              <TelegramBanner
                label={allPinnedMessages.length > 1 ? `Pinned Message (${activeIdx + 1}/${allPinnedMessages.length})` : 'Pinned Message'}
                accentColor="var(--ember)"
                previewText={generateReplySnippet(active)}
                onTap={() => {
                  const nextIdx = activeIdx + 1 >= allPinnedMessages.length ? 0 : activeIdx + 1;
                  setPinNavIndex(nextIdx);
                  jumpToMessage(allPinnedMessages[nextIdx].id);
                }}
                onOpenList={() => setPinnedListOpen(true)}
              />
            );
          })()}

          {!!session && (() => {
            const activeIdx = confessionNavIndex >= 0 && confessionNavIndex < allConfessionMessages.length ? confessionNavIndex : allConfessionMessages.length - 1;
            const active = allConfessionMessages[activeIdx] || null;
            return (
              <TelegramBanner
                label="Confession"
                accentColor="#A695E7"
                previewText={active ? generateReplySnippet(active) : 'No confessions yet — be the first'}
                onTap={() => {
                  if (allConfessionMessages.length === 0) { setConfessionModalOpen(true); return; }
                  const nextIdx = activeIdx + 1 >= allConfessionMessages.length ? 0 : activeIdx + 1;
                  setConfessionNavIndex(nextIdx);
                  jumpToMessage(allConfessionMessages[nextIdx].id);
                }}
                onOpenList={() => setConfessionListOpen(true)}
                rightExtra={
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfessionModalOpen(true); }}
                    title="Add confession"
                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(166,149,231,0.18)', color: '#A695E7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  >
                    {Vectors.Plus}
                  </button>
                }
              />
            );
          })()}
        </div>
      )}

      {/* REFRESH SPINNER */}
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`, opacity: pullDistance > 10 ? 1 : 0, transition: isRefreshing ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none', color: 'var(--ember)' }}>
        <div className={isRefreshing ? 'refresh-spin' : ''} style={{ transform: `rotate(${pullDistance * 4}deg)` }}>{Vectors.Refresh}</div>
      </div>

      {/* MESSAGES LIST */}
      <div
        ref={scrollRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '28px 8px 12px', display: 'flex', flexDirection: 'column-reverse', zIndex: 10, minHeight: 0, background: 'transparent', transform: `translateY(${pullDistance}px)`, transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}
      >
        {messagesLoading && messages.length === 0 && <MessageSkeleton variant="message" count={4} />}

        {!messagesLoading && filteredMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--ink-2)', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: 'var(--dim)', border: '1px solid var(--separator)' }}>
              {isSearching ? 'No messages found.' : 'Say hello to the group 👋'}
            </div>
          </div>
        )}

        {filteredMessages.map((message, index) => {
          const isOwn = ownUserId && message.user_id === ownUserId;
          const isAnonMsg = message.is_anon === true;
          const isAdminMsg = isSenderAdmin(message);
          const isConfession = message.is_confession === true;
          const isInstagram = !!message.instagram_username;
          // Telegram-style per-sender color, used for the name label,
          // avatar ring and this message's own reply-quote accent when
          // someone replies to it.
          const senderColor = isAdminMsg ? 'var(--admin-1)' : (isAnonMsg ? 'var(--dim)' : getSenderColor(message.user_id || message.sender_name));

          const olderMessage = filteredMessages[index + 1];
          const showDayDivider = !olderMessage || dayKey(message.created_at) !== dayKey(olderMessage.created_at);

          const repliedMessage = message.reply_to_id
            ? (messages.find((m) => m.id === message.reply_to_id) || replyCache[message.reply_to_id] || null)
            : null;
          const replyColor = repliedMessage && !repliedMessage.is_anon ? getSenderColor(repliedMessage.user_id || repliedMessage.sender_name) : 'var(--dim)';
          const isStickerOrGif = message.media_type === 'gif' || message.media_type === 'sticker';
          const senderAvatarUrl = message.profiles?.avatar_url || message.bot_avatar_url || null;

          const isHighlighted = highlightedMsgId === message.id;
          const isSelected = selectedMessages.includes(message.id);

          const bubbleBackground = isStickerOrGif
            ? 'transparent'
            : (isAnonMsg
                ? 'var(--bubble-anon)'
                : (isOwn ? 'var(--bubble-own)' : 'var(--bubble-other)'));
          const bubbleColor = isStickerOrGif
            ? 'var(--paper)'
            : (isAnonMsg
                ? 'var(--bubble-anon-text)'
                : (isOwn ? 'var(--bubble-own-text)' : 'var(--bubble-other-text)'));
          const bubbleBorder = isStickerOrGif
            ? 'none'
            : (isAnonMsg
                ? '1px solid var(--bubble-border-anon)'
                : (isOwn ? '1px solid var(--bubble-border-own)' : '1px solid var(--bubble-border-other)'));
          const bubbleGlass = isStickerOrGif ? undefined : 'blur(10px) saturate(140%)';

          return (
            <React.Fragment key={message.id}>
              <div 
                onTouchStart={(e) => { longPressTargetRef.current = message.id; longPressHook.onTouchStart(e); }}
                onTouchEnd={longPressHook.onTouchEnd}
                onTouchMove={longPressHook.onTouchMove}
                onMouseDown={(e) => { longPressTargetRef.current = message.id; longPressHook.onMouseDown(e); }}
                onMouseUp={longPressHook.onMouseUp}
                onMouseLeave={longPressHook.onMouseLeave}
                onContextMenu={longPressHook.onContextMenu}
                onClick={() => { 
                  if (longPressHook.wasLongPress()) return;
                  if (selectedMessages.length > 0) toggleSelection(message.id); 
                  else if (activeReactionMsgId === message.id) setActiveReactionMsgId(null);
                }}
                style={{ position: 'relative', width: '100%', padding: '0 4px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} 
              >
                <SwipeableMessage onSwipe={() => { if (selectedMessages.length === 0) startReply(message); }} disabled={isSearching || selectedMessages.length > 0}>
                  
                  {isConfession ? (
                     <div id={`msg-${message.id}`} className={isHighlighted ? 'highlight-flash' : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', margin: '16px 0', padding: '0 12px' }}>
                       <div style={{ width: '100%', maxWidth: 440, background: isSelected ? 'rgba(47,111,255, 0.15)' : 'transparent', borderRadius: 20 }}>
                         <ConfessionBubble confession={{ id: message.confession_id || message.id, text: message.text, photo_url: message.media_url, media_type: message.media_type, is_anon: message.is_anon, created_at: message.created_at, story_style: message.story_style, author_username: message.is_anon ? null : message.sender_name, author_avatar_url: message.is_anon ? null : (message.profiles?.avatar_url || null) }} onReply={() => { if (selectedMessages.length === 0) startReply(message); }} onPhotoClick={(c) => setViewerMedia({ url: c.photo_url || c.media_url, type: c.media_type || 'image' })} userId={ownUserId} size="inline" />
                         
                         <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', width: '100%' }}>
                           <ReactionBar 
                             targetType="confession" 
                             targetId={message.confession_id || message.id} 
                             userId={ownUserId} 
                             align="center"
                             showTray={activeReactionMsgId === message.id}
                             onCloseTray={() => setActiveReactionMsgId(null)}
                             actions={[
                               {
                                 key: 'share',
                                 label: 'Share',
                                 icon: <span style={{ display: 'flex', color: 'var(--dim)' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>,
                                 onClick: () => {
                                   const url = `${getCanonicalOrigin()}${window.location.pathname}#msg-${toShortId(message.id)}`;
                                   navigator.clipboard.writeText(url);
                                   showToast('Link copied to clipboard!', 'info');
                                 },
                               },
                               {
                                 key: 'share-story',
                                 label: 'Share as Story',
                                 icon: <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.Instagram}</span>,
                                 onClick: () => {
                                   setSharingMessage({
                                     id: message.confession_id || message.id,
                                     text: message.text || (message.media_type ? `Sent a ${message.media_type}` : ''),
                                     sender_name: message.is_anon ? 'Anonymous' : message.sender_name,
                                     avatar_url: message.is_anon ? null : (message.profiles?.avatar_url || null),
                                     is_anon: message.is_anon,
                                     is_confession: true,
                                     media_url: message.media_url || null,
                                     media_type: message.media_type || null,
                                     story_style: message.story_style || null,
                                   });
                                 },
                               },
                               ...(isAdmin ? [
                                 {
                                   key: 'select',
                                   label: 'Select',
                                   icon: <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.CheckCircle}</span>,
                                   onClick: () => { toggleSelection(message.id); },
                                 },
                                 {
                                   key: 'pin',
                                   label: message.is_pinned ? 'Unpin' : 'Pin',
                                   icon: <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.Pin}</span>,
                                   onClick: async () => { await handleTogglePinMessage(message); },
                                 },
                                 {
                                   key: 'delete',
                                   label: 'Delete',
                                   danger: true,
                                   icon: <span style={{ display: 'flex' }}>{Vectors.Trash}</span>,
                                   onClick: async () => { await deleteMessagesSafely([message]); },
                                 },
                               ] : []),
                             ]}
                           />
                         </div>
                       </div>
                     </div>
                  ) : (
                    <div id={`msg-${message.id}`} className={isHighlighted ? 'highlight-flash' : ''} style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: 10, borderRadius: 20, padding: '2px 2px', background: isSelected ? 'rgba(47,111,255, 0.15)' : 'transparent', animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both', transition: 'background 0.2s' }}>
                      {selectedMessages.length > 0 && isAdmin && (
                        <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', margin: '0 0 6px', color: isSelected ? 'var(--ember)' : 'rgba(255,255,255,0.1)' }}>
                          {isSelected ? Vectors.CheckCircle : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid currentColor' }} />}
                        </div>
                      )}

                      {/* Sender pfp + username — bots open like normal users */}
                      {!isOwn && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, paddingLeft: isOwn ? 0 : 2 }}>
                          <button onClick={(e) => { e.stopPropagation(); if (!isAnonMsg && selectedMessages.length === 0) setProfileCardUserId(message.is_bot ? (message.bot_id || message.user_id) : message.user_id); }} disabled={isAnonMsg || selectedMessages.length > 0 || (!message.user_id && !message.bot_id)} style={{ border: 'none', background: 'transparent', padding: 0, display: 'flex', cursor: isAnonMsg ? 'default' : 'pointer' }}>
                            <LiquidAvatar identity={{ name: message.sender_name, avatar_url: senderAvatarUrl, is_admin: isAdminMsg }} size={24} isAnon={isAnonMsg} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); if (!isAnonMsg && selectedMessages.length === 0) setProfileCardUserId(message.is_bot ? (message.bot_id || message.user_id) : message.user_id); }} disabled={isAnonMsg || selectedMessages.length > 0 || (!message.user_id && !message.bot_id)} style={{ fontSize: 12, fontWeight: 700, color: senderColor, display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', padding: 0, cursor: isAnonMsg ? 'default' : 'pointer' }}>
                            {isAnonMsg ? 'Anonymous' : (isAdminMsg ? ADMIN_DISPLAY_NAME : message.sender_name)} {isAdminMsg && !isAnonMsg && Vectors.AdminShield}
                          </button>
                        </div>
                      )}

                      {/* Tight edge margin on the near side; larger opposite gap (ratio ~1:4) */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '78%', marginLeft: isOwn ? 0 : 28, marginRight: isOwn ? 0 : 'auto', alignSelf: isOwn ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '100%', padding: isInstagram ? '3px' : ((message.media_url && !isStickerOrGif) ? '3px' : (isStickerOrGif ? 0 : '8px 12px')), borderRadius: isStickerOrGif ? 0 : 20, borderBottomRightRadius: isStickerOrGif ? 0 : (isOwn ? 6 : 20), borderBottomLeftRadius: isStickerOrGif ? 0 : (isOwn ? 20 : 6), background: bubbleBackground, color: bubbleColor, border: bubbleBorder, boxShadow: isStickerOrGif ? 'none' : '0 2px 8px rgba(0,0,0,0.18)', backdropFilter: bubbleGlass, WebkitBackdropFilter: bubbleGlass, fontSize: 14, lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {message.reply_to_id && (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                jumpToMessage(message.reply_to_id);
                              }}
                              style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', marginBottom: 8, marginTop: (message.media_url || isInstagram) ? 4 : 0, borderRadius: 14, background: 'var(--ink-2)', borderLeft: `3px solid ${replyColor}`, cursor: 'pointer' }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 700, color: replyColor }}>{repliedMessage ? (repliedMessage.is_anon ? 'Anonymous' : repliedMessage.sender_name) : 'Original'}</span>
                              <span className="no-copy-text" style={{ fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(repliedMessage)}</span>
                            </div>
                          )}

                          {isAnonMsg && isOwn && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ember)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                              {Vectors.Ghost} Sent Anonymously
                            </div>
                          )}

                          {isInstagram ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: message.text ? 6 : 0 }}>
                              <InstagramCard message={message} isOwn={isOwn} />
                              {message.text && <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>{renderMessageTextWithMentions(message.text, isOwn, isAnonMsg)}</span>}
                            </div>
                          ) : message.media_url ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: message.text ? 6 : 0 }}>
                              {isStickerOrGif ? (
                                <button onClick={(e) => { e.stopPropagation(); setViewerMedia({ url: message.media_url, type: message.media_type }); }} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}>
                                  <img src={message.media_url} alt="Sticker/GIF" style={{ maxWidth: 160, maxHeight: 160, display: 'block', borderRadius: 16 }} />
                                </button>
                              ) : message.media_type === 'image' ? (
                                <button onClick={(e) => { e.stopPropagation(); setViewerMedia({ url: message.media_url, type: 'image' }); }} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block', width: '100%' }}>
                                  <img src={message.media_url} alt="Attachment" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 18, display: 'block', objectFit: 'cover' }} />
                                </button>
                              ) : message.media_type === 'video' ? (
                                <VideoBubble src={message.media_url} />
                              ) : message.media_type === 'audio' ? (
                                <AudioBubble src={message.media_url} isOwn={isOwn} />
                              ) : (
                                <a href={message.media_url} onClick={e=>e.stopPropagation()} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--ink-2)', borderRadius: 18, textDecoration: 'none', border: '1px solid var(--separator)' }}>
                                  <div style={{ color: 'var(--paper)' }}>{Vectors.FileText}</div><span style={{ color: 'var(--paper)', fontSize: 14, fontWeight: 600 }}>Document</span>
                                </a>
                              )}
                              {message.text && <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>{renderMessageTextWithMentions(message.text, isOwn, isAnonMsg)}</span>}
                            </div>
                          ) : (
                            <span className="no-copy-text" style={{ fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{renderMessageTextWithMentions(message.text, isOwn, isAnonMsg)}</span>
                          )}
                        </div>
                        
                        {/* Pulled up with a negative margin so the reaction
                            pills sit tucked into the bottom corner of the
                            bubble (Telegram-style) instead of floating in
                            their own full-width row. */}
                        <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', width: '100%', paddingInline: 6, position: 'relative', zIndex: 2 }}>
                          <ReactionBar 
                             targetType="group_message" 
                             targetId={message.id} 
                             userId={ownUserId}
                             align={isOwn ? 'flex-end' : 'flex-start'}
                             pullUp={6}
                             showTray={activeReactionMsgId === message.id}
                             onCloseTray={() => setActiveReactionMsgId(null)}
                             actions={[
                               {
                                 key: 'share',
                                 label: 'Share',
                                 icon: <span style={{ display: 'flex', color: 'var(--dim)' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>,
                                 onClick: () => {
                                   const url = `${getCanonicalOrigin()}${window.location.pathname}#msg-${toShortId(message.id)}`;
                                   navigator.clipboard.writeText(url);
                                   showToast('Link copied to clipboard!', 'info');
                                 },
                               },
                               {
                                 key: 'share-story',
                                 label: 'Share as Story',
                                 icon: <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.Instagram}</span>,
                                 onClick: () => {
                                   setSharingMessage({
                                     id: message.id,
                                     text: message.text || (message.media_type ? `Sent a ${message.media_type}` : ''),
                                     sender_name: message.is_anon ? 'Anonymous' : (isSenderAdmin(message) ? ADMIN_DISPLAY_NAME : message.sender_name),
                                     avatar_url: message.is_anon ? null : senderAvatarUrl,
                                     is_anon: message.is_anon,
                                     media_url: message.media_url || null,
                                     media_type: message.media_type || null,
                                   });
                                 },
                               },
                               ...(isAdmin ? [
                                 {
                                   key: 'select',
                                   label: 'Select',
                                   icon: <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.CheckCircle}</span>,
                                   onClick: () => { toggleSelection(message.id); },
                                 },
                                 {
                                   key: 'pin',
                                   label: message.is_pinned ? 'Unpin' : 'Pin',
                                   icon: <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.Pin}</span>,
                                   onClick: async () => { await handleTogglePinMessage(message); },
                                 },
                                 {
                                   key: 'delete',
                                   label: 'Delete',
                                   danger: true,
                                   icon: <span style={{ display: 'flex' }}>{Vectors.Trash}</span>,
                                   onClick: async () => { await deleteMessagesSafely([message]); },
                                 },
                               ] : []),
                             ]}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: message._failed ? '#FF6B6B' : 'var(--dim)', marginInline: 4, fontWeight: 500 }}>
                            {message._pending ? 'Sending…' : message._failed ? 'Failed to send' : formatTime(message.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </SwipeableMessage>
              </div>

              {showDayDivider && !isSearching && (
                <div style={{ textAlign: 'center', margin: '14px 0 10px', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)', background: 'var(--glass-white)', padding: '4px 12px', borderRadius: 14, border: '1px solid var(--glass-border)' }}>
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
              <div style={{ color: 'var(--ember)', display: 'flex' }}>{Vectors.Spinner}</div>
            )}
          </div>
        )}
      </div>

      {hasUnreadMention && (
        <button onClick={handleJumpToMention} style={{ position: 'absolute', right: 16, bottom: 80, width: 40, height: 40, borderRadius: '50%', background: 'var(--ember)', color: '#fff', border: 'none', boxShadow: 'var(--shadow-float)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, cursor: 'pointer', animation: 'pop-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>@</button>
      )}

      {/* COMPOSER — a separate floating rounded card, detached from the
          screen edges by margin/padding rather than a full-bleed bar with
          a hairline top border, matching the header treatment above. */}
      <div className="safe-bottom" style={{ flexShrink: 0, zIndex: 20, position: 'sticky', bottom: 0, background: 'transparent', padding: '0 10px 8px', overflow: 'visible' }}>
        {!session ? (
          <div style={{ padding: '16px', background: 'var(--ink-2)', borderRadius: 22, border: '1px solid var(--glass-border)', boxShadow: '0 4px 18px rgba(0,0,0,0.18)' }}>
            <button onClick={() => setAuthOpen(true)} style={{ width: '100%', padding: '14px 0', borderRadius: 20, border: 'none', background: 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: 'var(--shadow-float)' }}>Sign in to send message</button>
            {group?.is_channel && (
              <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12.5, color: 'var(--dim)', fontWeight: 500 }}>
                Only admins can send messages in this channel
              </div>
            )}
          </div>
        ) : isChannelLocked ? (
          <div style={{ padding: '16px', background: 'var(--ink-2)', borderRadius: 22, border: '1px solid var(--glass-border)', boxShadow: '0 4px 18px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--dim)', fontSize: 14, fontWeight: 600 }}>
            {Vectors.Lock}
            <span>Only admins can send messages in this channel</span>
          </div>
        ) : (
          <div style={{ position: 'relative', overflow: 'visible' }}>
            {pendingFile && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8, background: 'var(--ink-2)', borderRadius: 22, border: '1px solid var(--glass-border)', boxShadow: '0 4px 18px rgba(0,0,0,0.2)', padding: '12px 16px', zIndex: 21 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  {pendingFile.type === 'image' ? <img src={pendingFile.previewUrl} alt="" style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover' }} /> : pendingFile.type === 'video' ? <video src={pendingFile.previewUrl} style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover' }} /> : pendingFile.type === 'audio' ? <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)' }}>{Vectors.Smiley}</div> : <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)' }}>{Vectors.FileText}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--paper)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</span>
                    {uploading && <span style={{ fontSize: 12, color: 'var(--dim)' }}>Uploading… {uploadSecondsLeft}s</span>}
                  </div>
                  <button onClick={cancelPendingAttachment} disabled={uploading} style={{ border: 'none', background: 'rgba(255,255,255,0.06)', width: 28, height: 28, borderRadius: '50%', color: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Vectors.Close}</button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="search" name="group-media-caption-f" autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, MAX_TEXT_LENGTH))} maxLength={MAX_TEXT_LENGTH} placeholder="Add a caption…" disabled={uploading} style={{ flex: 1, border: '1px solid var(--separator)', outline: 'none', background: 'var(--surface)', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: 'var(--paper)' }} />
                  <button type="button" onClick={sendPendingAttachment} disabled={uploading} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: uploading ? 'rgba(255,255,255,0.06)' : 'var(--ember)', color: '#fff', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{uploading ? Vectors.Spinner : Vectors.Attach}</button>
                </div>
              </div>
            )}

            <div style={{ position: 'absolute', bottom: pendingFile ? undefined : '100%', top: pendingFile ? '100%' : undefined, left: 0, right: 0, marginTop: pendingFile ? 8 : 0, marginBottom: pendingFile ? 0 : 8, background: 'var(--ink-2)', borderRadius: 22, border: '1px solid var(--glass-border)', boxShadow: '0 4px 18px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1)', transform: replyingTo && !pendingFile ? 'translateY(0)' : 'translateY(100%)', opacity: replyingTo && !pendingFile ? 1 : 0, visibility: replyingTo && !pendingFile ? 'visible' : 'hidden', zIndex: 19 }}>
              <div style={{ color: 'var(--dim)' }}>{Vectors.ReplyAction}</div>
              <div style={{ width: 3, height: 34, borderRadius: 2, background: 'var(--dim)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--paper)' }}>Replying to {replyingTo?.sender_name}</span>
                <span style={{ fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(replyingTo)}</span>
              </div>
              {/* Opposite side from the reply icon/border — only shown when
                  the message being replied to actually has an attachment,
                  so the sender can preview it without hunting for it
                  further up the chat. */}
              {replyingTo?.media_url && (
                <button
                  type="button"
                  onClick={() => setViewerMedia({ url: replyingTo.media_url, type: replyingTo.media_type })}
                  style={{ border: 'none', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, color: 'var(--paper)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                >
                  <span style={{ display: 'flex', width: 14, height: 14 }}>{Vectors.Attach}</span>
                  View attachment
                </button>
              )}
              <button onClick={() => setReplyingTo(null)} style={{ border: 'none', background: 'rgba(255,255,255,0.06)', width: 28, height: 28, borderRadius: '50%', color: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Vectors.Close}</button>
            </div>
               {typingName && (
                 <div style={{ position: 'absolute', top: -26, left: 16, fontSize: 12, color: 'var(--dim)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                   {typingName} is typing…
                 </div>
               )}

               {/* paddingBottom is a plain 12px, not the earlier
                   `calc(12px + var(--keyboard-inset))`. This page's whole
                   root is already resized against the real visible
                   viewport up in Home.jsx (see useViewportHeight.js) — the
                   composer sits `position: sticky; bottom: 0` inside a
                   container that's ALREADY shrunk to clear the keyboard.
                   Also padding the form's own bottom by the keyboard's
                   height on top of that double-compensated: the container
                   shrinks by the keyboard height AND the form grew taller
                   by the same amount, so the composer's solid-color area
                   visibly ballooned to swallow most of the remaining
                   screen the moment the keyboard opened. One source of
                   truth (the outer resize) is enough. */}
               <form onSubmit={handleSend} autoComplete="off-nope" data-form-type="other" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 10px', background: 'var(--composer-bg)', borderRadius: 26, border: '1px solid var(--glass-border)', boxShadow: '0 4px 18px rgba(0,0,0,0.18)', position: 'relative', zIndex: 20, overflow: 'visible', backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)', boxSizing: 'border-box', width: '100%', maxWidth: '100%' }}>
              <button type="button" onClick={() => setAttachSheetOpen(true)} disabled={uploading || cooldownPercent > 0 || selectedMessages.length > 0} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--dim)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>{uploading ? Vectors.Spinner : Vectors.Attach}</button>
              <input ref={fileInputRef} type="file" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
              <input ref={cameraInputRef} type="file" accept="image/*,video/*" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
              <button type="button" onClick={() => {
                setPickerOpen((v) => {
                  if (v) return false;
                  // Dismiss keyboard first; open dock after viewport settles
                  // so the bar doesn't jump up then drop when the keyboard closes.
                  messageInputRef.current?.blur();
                  if (typeof document !== 'undefined' && document.activeElement?.blur) {
                    document.activeElement.blur();
                  }
                  window.setTimeout(() => setPickerOpen(true), 180);
                  return false;
                });
              }} disabled={uploading || selectedMessages.length > 0} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: pickerOpen ? 'rgba(255,255,255,0.06)' : 'transparent', color: pickerOpen ? 'var(--paper)' : 'var(--dim)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>{Vectors.Smiley}</button>
              <textarea
                ref={messageInputRef}
                name="group-chat-message-f"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-lpignore="true"
                data-1p-ignore
                data-form-type="other"
                readOnly={composerLocked}
                value={text}
                rows={1}
                onChange={(e) => {
                  const v = e.target.value.slice(0, MAX_TEXT_LENGTH);
                  setText(v);
                  const el = e.target;
                  el.style.height = 'auto';
                  const maxH = 3 * 20 + 16; // ~3 lines
                  el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
                }}
                onPointerDown={() => { if (composerLocked) setComposerLocked(false); }}
                onTouchStart={() => { if (composerLocked) setComposerLocked(false); }}
                onFocus={() => { setComposerLocked(false); setPickerOpen(false); }}
                onBlur={() => setComposerLocked(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!uploading && selectedMessages.length === 0) {
                      handleSend(e);
                      e.currentTarget.focus();
                    }
                  }
                }}
                placeholder={uploading ? 'Uploading media...' : 'Message'}
                disabled={uploading || selectedMessages.length > 0}
                style={{
                  flex: 1, minWidth: 0, border: '1px solid var(--glass-border)', outline: 'none',
                  background: 'var(--input-bg)', borderRadius: 20,
                  padding: '8px 14px', fontSize: 16, color: 'var(--paper)',
                  lineHeight: '20px', resize: 'none', overflowY: 'auto',
                  maxHeight: 76, minHeight: 36,
                  WebkitUserSelect: 'text', userSelect: 'text',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  transition: 'border-color 0.2s', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              <div
                style={{
                  flexShrink: 0,
                  marginBottom: 2,
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: text.trim() && !sending && !uploading && cooldownPercent === 0
                    ? 'var(--ember)'
                    : 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--glass-border)',
                  backdropFilter: 'blur(20px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                  boxShadow: text.trim() && !sending && !uploading && cooldownPercent === 0
                    ? '0 4px 14px rgba(0,0,0,0.2)'
                    : '0 2px 8px rgba(0,0,0,0.1)',
                  transition: 'background 0.2s, box-shadow 0.2s',
                }}
              >
                <SendButton canSend={!!text.trim()} sending={sending || uploading} cooldownPercent={cooldownPercent} />
              </div>
            </form>
            {pickerOpen && (
              <div
                style={{
                  height: 'min(320px, 40dvh)',
                  flexShrink: 0,
                  marginTop: 8,
                  overflow: 'hidden',
                  borderRadius: '20px 20px 0 0',
                  border: '1px solid var(--glass-border)',
                  borderBottom: 'none',
                  background: 'var(--glass-white)',
                }}
              >
                <EmojiGifPicker
                  open={pickerOpen}
                  placement="dock"
                  onClose={() => setPickerOpen(false)}
                  onEmoji={(char) => setText((p) => p + char)}
                  onMedia={handleMediaPicked}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <AttachmentSheet open={attachSheetOpen} onClose={() => setAttachSheetOpen(false)} onOpenCamera={() => { setAttachSheetOpen(false); cameraInputRef.current?.click(); }} onPickInstagram={() => { setAttachSheetOpen(false); setInstagramModalOpen(true); }} onPickConfession={() => { setAttachSheetOpen(false); setConfessionModalOpen(true); }} />
      <ConfessionModal open={confessionModalOpen} onClose={() => setConfessionModalOpen(false)} onSubmit={handleConfessionSubmit} />
      <InstagramModal open={instagramModalOpen} onClose={() => !instagramLoading && setInstagramModalOpen(false)} onSubmit={handleInstagramSubmit} loading={instagramLoading} />
      <MessageListOverlay
        open={pinnedListOpen}
        title="Pinned Messages"
        accentColor="var(--ember)"
        messages={allPinnedMessages}
        onClose={() => setPinnedListOpen(false)}
        onSelect={(id) => { setPinnedListOpen(false); jumpToMessage(id); }}
      />
      <MessageListOverlay
        open={confessionListOpen}
        title="Confessions"
        accentColor="#A695E7"
        messages={allConfessionMessages}
        onClose={() => setConfessionListOpen(false)}
        onSelect={(id) => { setConfessionListOpen(false); jumpToMessage(id); }}
      />
      <MediaViewer mediaUrl={viewerMedia?.url} mediaType={viewerMedia?.type} open={viewerMedia !== null} onClose={() => setViewerMedia(null)} />
      <ProfileCard userId={profileCardUserId} open={!!profileCardUserId} onClose={() => setProfileCardUserId(null)} />
      {groupCardOpen && <GroupCard groupSlug={groupSlug} open={groupCardOpen} onClose={() => setGroupCardOpen(false)} />}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
      {sharingMessage && (
        // Confessions are now customizable too when shared as a story —
        // `customizable` is always true and `lockedStyle` is always null,
        // so ShareStorySheet lets the person pick a fresh style instead of
        // being locked to whatever the confession was originally posted
        // with. The confession's original story_style (if any) still rides
        // along as `initialStyle`, used only as the sheet's starting point.
        <ShareStorySheet
          mode="message"
          open={!!sharingMessage}
          onClose={() => setSharingMessage(null)}
          message={sharingMessage}
          customizable
          initialStyle={sharingMessage.story_style || null}
          lockedStyle={null}
        />
      )}
    </div>
  );
}
