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

// Modals / Overlays
import MediaViewer from './MediaViewer';
import ProfileCard from './ProfileCard';
import GroupCard from './GroupCard';
import AuthModal from './AuthModal';
import EmojiGifPicker from './EmojiGifPicker';

// Shared Components
import LiquidAvatar from '../components/shared/LiquidAvatar';
import MessageSkeleton from '../components/shared/MessageSkeleton';
import AttachmentSheet from '../components/shared/AttachmentSheet';
import ConfessionBubble from '../components/shared/ConfessionBubble';
import ReactionBar from '../components/shared/ReactionBar';
import SwipeableMessage from '../components/shared/SwipeableMessage';
import SendButton from '../components/shared/SendButton';
import { AudioBubble, VideoBubble } from '../components/shared/MediaBubble';
import InstagramCard from '../components/shared/InstagramCard';

const MESSAGE_LIMIT = 200;
const REPLY_SNIPPET_LENGTH = 80;
const ADMIN_DISPLAY_NAME = 'ADMIN';
const UPLOAD_TIMEOUT_MS = 60000;

const Vectors = {
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
  Refresh: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  CheckCircle: <svg width="20" height="20" viewBox="0 0 24 24" fill="#2FD8C4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" stroke="none" /><polyline points="8 12 11 15 16 9" /></svg>,
  Instagram: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
  ReplyAction: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>,
  Photo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
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

async function scrapeInstagram(username) {
  try {
    const { data, error } = await supabase.functions.invoke('instagram-scrape', { body: { username } });
    if (error || !data || data.error) return null;
    return data;
  } catch { return null; }
}

function ConfessionModal({ open, onClose, onSubmit }) {
  const [text, setText] = useState(''); const [anon, setAnon] = useState(true); const [photo, setPhoto] = useState(null); const photoInputRef = useRef(null);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, margin: '0 auto', background: '#1C1D24', borderRadius: '28px 28px 0 0', padding: '24px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', color: '#F4F3F0', fontSize: 20 }}>New Confession</h3>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Type your confession…" style={{ width: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 14, fontSize: 15, resize: 'none', boxSizing: 'border-box', background: '#15161B', color: '#F4F3F0', outline: 'none' }} />
        {photo && (
          <div style={{ position: 'relative', marginTop: 12, width: 80, height: 80 }}>
            <img src={URL.createObjectURL(photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} alt="preview" />
            <button onClick={() => setPhoto(null)} style={{ position: 'absolute', top: -6, right: -6, background: '#2A2B36', color: '#F4F3F0', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Close}</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#F4F3F0', cursor: 'pointer' }}>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Post anonymously
          </label>
          <button onClick={() => photoInputRef.current?.click()} style={{ background: '#2A2B36', border: 'none', color: '#F4F3F0', padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>{Vectors.Photo} Attach Photo</button>
          <input type="file" accept="image/*" ref={photoInputRef} style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) setPhoto(e.target.files[0]); e.target.value = ''; }} />
        </div>
        <button onClick={() => { if (text.trim() || photo) { onSubmit(text.trim(), anon, photo); setText(''); setPhoto(null); } }} style={{ width: '100%', padding: 16, borderRadius: 20, border: 'none', background: '#FF6B35', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>Post Confession</button>
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
          <input autoFocus type="text" value={username} disabled={loading} onChange={(e) => setUsername(e.target.value.replace(/^@/, '').trim())} onKeyDown={(e) => { if (e.key === 'Enter' && username.trim()) onSubmit(username.trim()); }} placeholder="username" style={{ width: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px 14px 14px 32px', fontSize: 15, boxSizing: 'border-box', color: '#F4F3F0', background: '#15161B', outline: 'none' }} />
        </div>
        <button onClick={() => username.trim() && onSubmit(username.trim())} disabled={loading || !username.trim()} style={{ width: '100%', marginTop: 16, padding: 16, borderRadius: 20, border: 'none', background: loading ? '#2A2B36' : '#FF6B35', color: '#fff', fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16 }}>{loading ? (<>{Vectors.Spinner} Fetching profile…</>) : 'Share Profile'}</button>
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

export default function GroupChat({ groupSlug, onBack, onGroupResolved }) {
  const { session, profile } = useAuth();
  const ownUserId = session?.user?.id;
  const isAdmin = profile?.is_admin === true;

  const [group, setGroup] = useState(null);
  const [groupStatus, setGroupStatus] = useState('loading');

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

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
  const [menuOpen, setMenuOpen] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  const [hasUnreadMention, setHasUnreadMention] = useState(false);
  const [latestMentionId, setLatestMentionId] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [isAnonMode, setIsAnonMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);

  const [pendingFile, setPendingFile] = useState(null); 
  const [caption, setCaption] = useState('');
  const [uploadSecondsLeft, setUploadSecondsLeft] = useState(60);

  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [confessionModalOpen, setConfessionModalOpen] = useState(false);
  const [confessionNavIndex, setConfessionNavIndex] = useState(-1);
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [instagramLoading, setInstagramLoading] = useState(false);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (!groupSlug) return;
    let isMounted = true;
    setGroupStatus('loading');

    async function initializeGroup() {
      try {
        const { data, error } = await supabase.from('groups').select('*').eq('slug', groupSlug).maybeSingle();
        if (error) throw error;
        if (isMounted) {
          if (!data) { setGroupStatus('error'); if (onGroupResolved) onGroupResolved(null); } 
          else { setGroup(data); setGroupStatus('ready'); if (onGroupResolved) onGroupResolved(data); }
        }
      } catch (err) {
        console.error('Failed to load group:', err);
        if (isMounted) { setGroupStatus('error'); if (onGroupResolved) onGroupResolved(null); }
      }
    }
    initializeGroup();
    return () => { isMounted = false; };
  }, [groupSlug, onGroupResolved]);

  const fetchMessagesAndReceipts = useCallback(async () => {
    if (!group?.id) return;
    let isMounted = true;

    const { data: receiptData } = await supabase.from('group_read_receipts').select('last_read_at').eq('group_id', group.id).eq('user_id', ownUserId).maybeSingle();
    const lastReadAt = receiptData?.last_read_at || '1970-01-01T00:00:00.000Z';

    const { data, error } = await supabase.from('group_messages').select('*, profiles(avatar_url)').eq('group_id', group.id).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT);

    if (!error && isMounted) {
      let fetchedMessages = data || [];
      const confessionMsgIds = fetchedMessages.filter(m => m.is_confession).map(m => m.id);
      if (confessionMsgIds.length > 0) {
        const { data: confs } = await supabase.from('confessions').select('id, source_message_id').in('source_message_id', confessionMsgIds);
        if (confs) {
          fetchedMessages = fetchedMessages.map(m => {
            if (m.is_confession) { const match = confs.find(c => c.source_message_id === m.id); return { ...m, confession_id: match?.id }; }
            return m;
          });
        }
      }

      setMessages(fetchedMessages);
      setMessagesLoading(false);

      if (ownUserId) {
        const unreadMention = fetchedMessages.find((m) => m.mentioned_user_ids?.includes(ownUserId) && new Date(m.created_at) > new Date(lastReadAt));
        if (unreadMention) { setHasUnreadMention(true); setLatestMentionId(unreadMention.id); } 
        else { supabase.from('group_read_receipts').upsert({ group_id: group.id, user_id: ownUserId, last_read_at: new Date().toISOString() }).then(); }
      }
    }
  }, [group?.id, ownUserId]);

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
        setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [newMsg, ...prev]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [group?.id, ownUserId, fetchMessagesAndReceipts]);

  useEffect(() => {
    cooldownRef.current = createCooldown((percent) => setCooldownPercent(percent), () => setCooldownPercent(0));
    return () => { cooldownRef.current?.cancel(); };
  }, []);

  const { pullDistance, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchMessagesAndReceipts, scrollRef);

  const toggleSelection = (msgId) => { if (!isAdmin) return; setSelectedMessages((prev) => (prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId])); };
  const handleLongPress = (msg) => { if (isAdmin) toggleSelection(msg.id); };
  const longPressHook = useLongPress(handleLongPress, 500);

  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedMessages.length === 0) return;
    setMessages((prev) => prev.filter((m) => !selectedMessages.includes(m.id)));
    const { error } = await supabase.from('group_messages').delete().in('id', selectedMessages);
    if (error) { console.error(error); showToast(friendlyDbError(), 'error'); fetchMessagesAndReceipts(); }
    setSelectedMessages([]);
  };

  const currentSenderName = () => (isAnonMode ? 'Anonymous' : (profile?.is_admin ? ADMIN_DISPLAY_NAME : (profile?.username || 'Anonymous')));

  const startReply = useCallback((message) => {
    const replyName = message.is_anon ? 'Anonymous' : (message.instagram_username ? `@${message.instagram_username}` : message.sender_name);
    setReplyingTo({ id: message.id, sender_name: replyName, text: message.text, media_url: message.media_url, media_type: message.media_type, instagram_username: message.instagram_username });
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !session?.user || !group || sending) return;
    if (cooldownPercent > 0) { showToast('Please wait a few seconds before sending another message.', 'info'); return; }

    setSending(true);
    const mentionedUsernames = [...trimmed.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1].toLowerCase());
    let mentionedIds = [];
    if (mentionedUsernames.length > 0) {
      const { data } = await supabase.from('profiles').select('id').in('username', mentionedUsernames);
      if (data) mentionedIds = data.map((p) => p.id);
    }

    const { error } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), text: trimmed, reply_to_id: replyingTo?.id ?? null, mentioned_user_ids: mentionedIds, is_anon: isAnonMode });
    setSending(false);
    if (error) { console.error(error); showToast(friendlyDbError(), 'error'); return; }
    setText(''); setReplyingTo(null); setPickerOpen(false); cooldownRef.current?.start();
  }

  function handleAttachmentSelected(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), type: guessMediaType(file) });
  }

  function cancelPendingAttachment() { if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); }

  async function sendPendingAttachment() {
    if (!pendingFile || !session?.user || !group || uploading) return;
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

      const { error: insertError } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), text: caption.trim() || null, media_url: publicUrlData.publicUrl, media_type: type, reply_to_id: replyingTo?.id ?? null, is_anon: isAnonMode });
      if (insertError) throw insertError;
      URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); setReplyingTo(null); cooldownRef.current?.start();
    } catch (err) {
      showToast(err.message === 'TIMEOUT' ? "Upload timed out — check your connection and try again." : "Couldn't send that file. Please try again.", 'error');
    } finally { clearInterval(tick); setUploading(false); }
  }

  async function handleMediaPicked(url, mediaType) {
    if (!session?.user || !group || sending) return;
    if (cooldownPercent > 0) { showToast('Please wait.', 'info'); return; }
    setPickerOpen(false);
    const { error } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), media_url: url, media_type: mediaType, reply_to_id: replyingTo?.id ?? null, is_anon: isAnonMode });
    if (error) showToast(friendlyDbError(), 'error');
    else { setReplyingTo(null); cooldownRef.current?.start(); }
  }

  async function handleConfessionSubmit(confessionText, anon, photoFile) {
    setConfessionModalOpen(false);
    let mediaUrl = null; let mediaType = null;
    if (photoFile) {
      setUploading(true);
      const path = `${session.user.id}/confession-${Date.now()}-${photoFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      try {
        await supabase.storage.from('media').upload(path, photoFile);
        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
        mediaUrl = publicUrlData?.publicUrl; mediaType = 'image';
      } catch (err) { showToast('Failed to upload photo', 'error'); setUploading(false); return; }
      setUploading(false);
    }
    const senderName = anon ? 'Anonymous' : (profile?.is_admin ? ADMIN_DISPLAY_NAME : (profile?.username || 'Anonymous'));
    const { error } = await supabase.from('group_messages').insert({ group_id: group.id, user_id: session.user.id, sender_name: senderName, text: confessionText, is_anon: anon, is_confession: true, media_url: mediaUrl, media_type: mediaType });
    if (error) showToast(friendlyDbError(), 'error');
  }

  async function handleInstagramSubmit(username) {
    if (!session?.user || !group) return;
    setInstagramLoading(true); const data = await scrapeInstagram(username); setInstagramLoading(false);
    if (!data) { showToast("Couldn't find that Instagram profile.", 'error'); return; }
    setInstagramModalOpen(false);
    const payload = data.fallback ? { group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), instagram_username: data.username, reply_to_id: replyingTo?.id ?? null, is_anon: isAnonMode } : { group_id: group.id, user_id: session.user.id, sender_name: currentSenderName(), instagram_username: data.username, reply_to_id: replyingTo?.id ?? null, is_anon: isAnonMode, instagram_pfp_url: data.pfp_url, instagram_full_name: data.full_name, instagram_bio: data.bio, instagram_followers: data.followers, instagram_following: data.following, instagram_posts: data.posts, instagram_is_verified: data.is_verified, instagram_is_private: data.is_private };
    const { error } = await supabase.from('group_messages').insert(payload);
    if (error) showToast(friendlyDbError(), 'error');
    else { setReplyingTo(null); cooldownRef.current?.start(); }
  }

  function handleJumpToMention() {
    if (!latestMentionId) return;
    const element = document.getElementById(`msg-${latestMentionId}`);
    if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightedMsgId(latestMentionId); setTimeout(() => setHighlightedMsgId(null), 2000); }
    setHasUnreadMention(false);
    if (ownUserId && group?.id) supabase.from('group_read_receipts').upsert({ group_id: group.id, user_id: ownUserId, last_read_at: new Date().toISOString() }).then();
  }

  const renderMessageTextWithMentions = (messageText, isOwn) => {
    if (!messageText) return null;
    return messageText.split(/(@[a-zA-Z0-9_]+)/g).map((part, i) => {
      if (part.startsWith('@') && part.length > 1) {
        return (
          <button key={i} onClick={async () => { const { data } = await supabase.from('profiles').select('id').eq('username', part.substring(1).toLowerCase()).maybeSingle(); if (data?.id) setProfileCardUserId(data.id); }} style={{ color: isOwn ? '#fff' : '#FF6B35', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', fontSize: 'inherit' }}>{part}</button>
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

  if (groupStatus === 'loading') return <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C0D10' }}><div style={{ color: '#FF6B35' }}>{Vectors.Spinner}</div></div>;
  if (groupStatus === 'error') return <div className="no-copy-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C0D10', flexDirection: 'column', gap: 16 }}><p style={{ color: '#8B8B96' }}>Failed to load group.</p><button onClick={onBack} style={{ background: '#FF6B35', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, cursor: 'pointer' }}>Go Back</button></div>;

  return (
    <div className="no-copy-text" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden', zIndex: 1, userSelect: 'none', WebkitUserSelect: 'none', background: '#0C0D10' }}>
      
      {/* HEADER */}
      {selectedMessages.length > 0 ? (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#FF6B35', color: '#fff', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button onClick={() => setSelectedMessages([])} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', padding: '4px', marginLeft: '-8px' }}>{Vectors.Close}</button><span style={{ fontWeight: 700, fontSize: 16 }}>{selectedMessages.length} Selected</span></div>
          <button onClick={handleDeleteSelected} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>{Vectors.Trash} Delete</button>
        </header>
      ) : (
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 20 }}>
          <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: '#F4F3F0', cursor: 'pointer', padding: '4px', marginLeft: '-8px' }}>{Vectors.Back}</button>
          <button onClick={() => setGroupCardOpen(true)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, flex: 1, textAlign: 'left' }}>
            <LiquidAvatar identity={{ name: group.name, avatar_url: group.cover_url, is_admin: false }} size={42} kind="group" />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#F4F3F0' }}>{group.name}</span>
              <span style={{ fontSize: 13, color: '#8B8B96' }}>{group.description || 'Public Group'}</span>
            </div>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setIsAnonMode(!isAnonMode)} style={{ border: 'none', background: isAnonMode ? '#2A2B36' : 'transparent', color: isAnonMode ? '#FF6B35' : '#8B8B96', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'all 0.2s' }}>{Vectors.Ghost}</button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((v) => !v)} style={{ border: 'none', background: 'transparent', color: '#F4F3F0', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>{Vectors.ThreeDots}</button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 30, minWidth: 160, padding: 6, background: '#1C1D24', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
                  <button onClick={() => { setIsSearching(true); setMenuOpen(false); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: '#F4F3F0', textAlign: 'left', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{Vectors.SearchSmall} Search Chat</button>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.href); setMenuOpen(false); showToast('Link copied to clipboard!', 'info'); }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: '#F4F3F0', textAlign: 'left', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Share link</button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* SEARCH BAR */}
      {isSearching && (
        <div style={{ background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 19 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', pointerEvents: 'none' }}>{Vectors.SearchSmall}</span>
            <input autoFocus type="text" value={chatSearchQuery} onChange={(e) => setChatSearchQuery(e.target.value)} placeholder="Search or type @username..." style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 16, border: 'none', background: '#15161B', color: '#F4F3F0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            {chatSearchQuery && <button onClick={() => setChatSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 'bold', color: '#F4F3F0', cursor: 'pointer' }}>✕</button>}
          </div>
          <button onClick={() => { setIsSearching(false); setChatSearchQuery(''); }} style={{ background: 'none', border: 'none', color: '#8B8B96', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
        </div>
      )}

      {messages.filter(m => m.is_confession).length > 0 && !isSearching && (
        <div style={{ padding: '8px 16px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 19, display: 'flex' }}>
          <button onClick={() => {
            const confs = messages.filter(m => m.is_confession);
            if (confs.length === 0) return;
            const nextIdx = confessionNavIndex + 1 >= confs.length ? 0 : confessionNavIndex + 1;
            setConfessionNavIndex(nextIdx);
            const el = document.getElementById(`msg-${confs[nextIdx].id}`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightedMsgId(confs[nextIdx].id); setTimeout(() => setHighlightedMsgId(null), 2000); }
          }} style={{ background: '#2A2B36', border: '1px solid rgba(255,255,255,0.06)', color: '#F4F3F0', borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            {Vectors.Ghost} Previous Confession
          </button>
        </div>
      )}

      {/* REFRESH SPINNER */}
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`, opacity: pullDistance > 10 ? 1 : 0, transition: isRefreshing ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none', color: '#FF6B35' }}>
        <div className={isRefreshing ? 'refresh-spin' : ''} style={{ transform: `rotate(${pullDistance * 4}deg)` }}>{Vectors.Refresh}</div>
      </div>

      {/* MESSAGES LIST */}
      <div
        ref={scrollRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '20px 16px', display: 'flex', flexDirection: 'column-reverse', zIndex: 10, minHeight: 0, background: 'transparent', transform: `translateY(${pullDistance}px)`, transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}
      >
        {messagesLoading && messages.length === 0 && <MessageSkeleton variant="message" count={4} />}

        {!messagesLoading && filteredMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1C1D24', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: '#8B8B96', border: '1px solid rgba(255,255,255,0.06)' }}>
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

          const olderMessage = filteredMessages[index + 1];
          const showDayDivider = !olderMessage || dayKey(message.created_at) !== dayKey(olderMessage.created_at);

          const repliedMessage = message.reply_to_id ? messages.find((m) => m.id === message.reply_to_id) || null : null;
          const isStickerOrGif = message.media_type === 'gif' || message.media_type === 'sticker';
          const senderAvatarUrl = message.profiles?.avatar_url || null;

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
                  
                  {isConfession ? (
                     <div id={`msg-${message.id}`} className={isHighlighted ? 'highlight-flash' : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', margin: '16px 0' }}>
                       <div style={{ width: '100%', maxWidth: 440, background: isSelected ? 'rgba(255,107,53, 0.15)' : 'transparent', borderRadius: 16 }}>
                         <ConfessionBubble confession={{ id: message.confession_id || message.id, text: message.text, photo_url: message.media_url, is_anon: message.is_anon, created_at: message.created_at }} onReply={() => { if (selectedMessages.length === 0) startReply(message); }} userId={ownUserId} size="inline" />
                         
                         <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', width: '100%' }}>
                           <ReactionBar 
                             targetType="confession" 
                             targetId={message.confession_id || message.id} 
                             userId={ownUserId} 
                             showTray={activeReactionMsgId === message.id}
                             onCloseTray={() => setActiveReactionMsgId(null)}
                           />
                         </div>
                       </div>
                     </div>
                  ) : (
                    <div id={`msg-${message.id}`} className={isHighlighted ? 'highlight-flash' : ''} style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 16, borderRadius: 16, padding: '4px 8px', background: isSelected ? 'rgba(255,107,53, 0.15)' : 'transparent', animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both', transition: 'background 0.2s' }}>
                      {selectedMessages.length > 0 && isAdmin && (
                        <div style={{ margin: '0 8px 16px', color: isSelected ? '#FF6B35' : 'rgba(255,255,255,0.1)' }}>
                          {isSelected ? Vectors.CheckCircle : <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid currentColor' }} />}
                        </div>
                      )}

                      {!isOwn && (
                        <button onClick={(e) => { e.stopPropagation(); if (!isAnonMsg && selectedMessages.length === 0) setProfileCardUserId(message.user_id); }} disabled={isAnonMsg || selectedMessages.length > 0} style={{ border: 'none', background: 'transparent', padding: 0, cursor: isAnonMsg ? 'default' : 'pointer', marginBottom: 20 }}>
                          <LiquidAvatar identity={{ name: message.sender_name, avatar_url: senderAvatarUrl, is_admin: isAdminMsg }} size={36} isAnon={isAnonMsg} />
                        </button>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        {!isOwn && (
                          <button onClick={(e) => { e.stopPropagation(); if (!isAnonMsg && selectedMessages.length === 0) setProfileCardUserId(message.user_id); }} disabled={isAnonMsg || selectedMessages.length > 0} style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, marginLeft: 6, color: isAdminMsg ? '#FFD700' : (isAnonMsg ? '#8B8B96' : '#F4F3F0'), display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', padding: 0, cursor: isAnonMsg ? 'default' : 'pointer' }}>
                            {isAnonMsg ? 'Anonymous' : (isAdminMsg ? ADMIN_DISPLAY_NAME : message.sender_name)} {isAdminMsg && !isAnonMsg && Vectors.AdminShield}
                          </button>
                        )}

                        <div style={{ maxWidth: '100%', padding: isInstagram ? '4px' : ((message.media_url && !isStickerOrGif) ? '4px' : (isStickerOrGif ? 0 : '10px 16px')), borderRadius: isStickerOrGif ? 0 : 20, borderBottomRightRadius: isStickerOrGif ? 0 : (isOwn ? 4 : 20), borderBottomLeftRadius: isStickerOrGif ? 0 : (isOwn ? 20 : 4), background: bubbleBackground, color: bubbleColor, border: isStickerOrGif ? 'none' : (isOwn ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.04)'), boxShadow: isStickerOrGif ? 'none' : '0 6px 18px rgba(0,0,0,0.2)' }}>
                          {message.reply_to_id && (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                const targetEl = document.getElementById(`msg-${message.reply_to_id}`);
                                if (targetEl) {
                                  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  targetEl.classList.add('highlight-flash');
                                  setTimeout(() => targetEl.classList.remove('highlight-flash'), 2000);
                                }
                              }}
                              style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', marginBottom: 8, marginTop: (message.media_url || isInstagram) ? 4 : 0, borderRadius: 10, background: '#15161B', borderLeft: `3px solid ${isOwn ? '#8B8B96' : '#FF6B35'}`, cursor: 'pointer' }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#F4F3F0' }}>{repliedMessage ? (repliedMessage.is_anon ? 'Anonymous' : repliedMessage.sender_name) : 'Original'}</span>
                              <span className="no-copy-text" style={{ fontSize: 13, color: '#8B8B96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{generateReplySnippet(repliedMessage)}</span>
                            </div>
                          )}

                          {isAnonMsg && isOwn && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#FF6B35', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                              {Vectors.Ghost} Sent Anonymously
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
                                <button onClick={(e) => { e.stopPropagation(); setViewerMedia({ url: message.media_url, type: message.media_type }); }} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}>
                                  <img src={message.media_url} alt="Sticker/GIF" style={{ maxWidth: 160, maxHeight: 160, display: 'block', borderRadius: 12 }} />
                                </button>
                              ) : message.media_type === 'image' ? (
                                <button onClick={(e) => { e.stopPropagation(); setViewerMedia({ url: message.media_url, type: 'image' }); }} disabled={selectedMessages.length > 0} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block', width: '100%' }}>
                                  <img src={message.media_url} alt="Attachment" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 16, display: 'block', objectFit: 'cover' }} />
                                </button>
                              ) : message.media_type === 'video' ? (
                                <VideoBubble src={message.media_url} />
                              ) : message.media_type === 'audio' ? (
                                <AudioBubble src={message.media_url} isOwn={isOwn} />
                              ) : (
                                <a href={message.media_url} onClick={e=>e.stopPropagation()} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#15161B', borderRadius: 16, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.06)' }}>
                                  <div style={{ color: '#F4F3F0' }}>{Vectors.FileText}</div><span style={{ color: '#F4F3F0', fontSize: 14, fontWeight: 600 }}>Document</span>
                                </a>
                              )}
                              {message.text && <span className="no-copy-text" style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '0 4px' }}>{renderMessageTextWithMentions(message.text, isOwn)}</span>}
                            </div>
                          ) : (
                            <span className="no-copy-text" style={{ fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{renderMessageTextWithMentions(message.text, isOwn)}</span>
                          )}
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#8B8B96', marginInline: 4, fontWeight: 500 }}>{formatTime(message.created_at)}</span>
                        </div>

                        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center', width: '100%' }}>
                          <ReactionBar 
                             targetType="group_message" 
                             targetId={message.id} 
                             userId={ownUserId}
                             showTray={activeReactionMsgId === message.id}
                             onCloseTray={() => setActiveReactionMsgId(null)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
      </div>

      {hasUnreadMention && (
        <button onClick={handleJumpToMention} style={{ position: 'absolute', right: 16, bottom: 80, width: 40, height: 40, borderRadius: '50%', background: '#FF6B35', color: '#fff', border: 'none', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, cursor: 'pointer', animation: 'pop-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>@</button>
      )}

      {/* COMPOSER */}
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
                  {pendingFile.type === 'image' ? <img src={pendingFile.previewUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} /> : pendingFile.type === 'video' ? <video src={pendingFile.previewUrl} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} /> : pendingFile.type === 'audio' ? <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F4F3F0' }}>{Vectors.Smiley}</div> : <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F4F3F0' }}>{Vectors.FileText}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F3F0', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</span>
                    {uploading && <span style={{ fontSize: 12, color: '#8B8B96' }}>Uploading… {uploadSecondsLeft}s</span>}
                  </div>
                  <button onClick={cancelPendingAttachment} disabled={uploading} style={{ border: 'none', background: 'rgba(255,255,255,0.06)', width: 28, height: 28, borderRadius: '50%', color: '#F4F3F0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Vectors.Close}</button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" disabled={uploading} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', outline: 'none', background: '#15161B', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: '#F4F3F0' }} />
                  <button type="button" onClick={sendPendingAttachment} disabled={uploading} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: uploading ? 'rgba(255,255,255,0.06)' : '#FF6B35', color: '#fff', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{uploading ? Vectors.Spinner : Vectors.Attach}</button>
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

            <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#1C1D24', borderTop: replyingTo ? 'none' : '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 20 }}>
              <EmojiGifPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onEmoji={(char) => setText(p=>p+char)} onMedia={handleMediaPicked} />
              <button type="button" onClick={() => setAttachSheetOpen(true)} disabled={uploading || cooldownPercent > 0 || selectedMessages.length > 0} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: '#8B8B96', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{uploading ? Vectors.Spinner : Vectors.Attach}</button>
              <input ref={fileInputRef} type="file" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
              <input ref={cameraInputRef} type="file" accept="image/*,video/*" onChange={handleAttachmentSelected} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }} />
              <button type="button" onClick={() => setPickerOpen((v) => !v)} disabled={uploading || selectedMessages.length > 0} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: pickerOpen ? 'rgba(255,255,255,0.06)' : 'transparent', color: pickerOpen ? '#F4F3F0' : '#8B8B96', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Vectors.Smiley}</button>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setPickerOpen(false)} placeholder={uploading ? 'Uploading media...' : 'Message'} disabled={uploading || selectedMessages.length > 0} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', outline: 'none', background: '#15161B', borderRadius: 24, padding: '12px 18px', fontSize: 15, color: '#F4F3F0', transition: 'border-color 0.2s' }} />
              <SendButton canSend={!!text.trim()} sending={sending || uploading} cooldownPercent={cooldownPercent} />
            </form>
          </>
        )}
      </div>

      <AttachmentSheet open={attachSheetOpen} onClose={() => setAttachSheetOpen(false)} onOpenCamera={() => { setAttachSheetOpen(false); cameraInputRef.current?.click(); }} onPickInstagram={() => { setAttachSheetOpen(false); setInstagramModalOpen(true); }} onPickConfession={() => { setAttachSheetOpen(false); setConfessionModalOpen(true); }} />
      <ConfessionModal open={confessionModalOpen} onClose={() => setConfessionModalOpen(false)} onSubmit={handleConfessionSubmit} />
      <InstagramModal open={instagramModalOpen} onClose={() => !instagramLoading && setInstagramModalOpen(false)} onSubmit={handleInstagramSubmit} loading={instagramLoading} />

      <MediaViewer mediaUrl={viewerMedia?.url} mediaType={viewerMedia?.type} open={viewerMedia !== null} onClose={() => setViewerMedia(null)} />
      <ProfileCard userId={profileCardUserId} open={!!profileCardUserId} onClose={() => setProfileCardUserId(null)} />
      {groupCardOpen && <GroupCard groupSlug={groupSlug} open={groupCardOpen} onClose={() => setGroupCardOpen(false)} />}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
    </div>
  );
}
