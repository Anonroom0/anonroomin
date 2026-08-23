/**
 * ============================================================================
 * DIRECT MESSAGES MASTER VIEW (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component acts as the master chat pane for Private 1-on-1 Conversations.
 *
 * CHANGES IN THIS PASS:
 * - Native `column-reverse` CSS routing (renders from bottom without JS scrolling).
 * - Universal Case-Insensitive Mentions: Forces `.toLowerCase()` for strict uniqueness.
 * - Mention Highlighting: White/Light blue underline for mentions inside own bubbles.
 * - Floating Mentions Button: New `@` FAB appears on unread pings.
 * - Auto-updates `dm_read_receipts` on load so the home screen `@` badge clears.
 * - Message bubble text is non-selectable (user-select: none).
 * - Fully uncompressed code with no shortened lines.
 *
 * Dependencies: React, Supabase, AuthContext, EmojiGifPicker
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

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const MESSAGE_LIMIT = 200;
const REPLY_SNIPPET_LENGTH = 80;
const ADMIN_DISPLAY_NAME = 'ADMIN';

const BUBBLE_OWN = 'var(--blue)';
const BUBBLE_THEM = 'var(--glass-strong)';

// Chat canvas background.
const CHAT_BACKGROUND_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230a84ff' fill-opacity='0.035'%3E%3Ccircle cx='6' cy='6' r='2'/%3E%3Ccircle cx='36' cy='24' r='2'/%3E%3Ccircle cx='18' cy='42' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")";

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY (APPLE / TELEGRAM STYLE)
// ============================================================================
const Vectors = {
  Back: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  ),
  Attach: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  Send: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  ReplyAction: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  ),
  Close: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  FileText: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  AdminShield: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Spinner: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="spinner-animation"
    >
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
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
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
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTime(dateString) {
  if (!dateString) {
    return '';
  }
  return new Date(dateString).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function guessMediaType(file) {
  if (!file) {
    return 'file';
  }
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  return 'file';
}

function generateReplySnippet(message) {
  if (!message) {
    return 'Original message';
  }
  if (message.media_url) {
    if (message.media_type === 'image') {
      return '📸 Photo';
    } else if (message.media_type === 'gif') {
      return '🎞️ GIF';
    } else if (message.media_type === 'sticker') {
      return '🏷️ Sticker';
    } else {
      return '📄 Attachment';
    }
  }
  const text = message.text || '';
  if (text.length > REPLY_SNIPPET_LENGTH) {
    return `${text.slice(0, REPLY_SNIPPET_LENGTH)}…`;
  }
  return text;
}

function formatDayLabel(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a, b) => {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  };

  if (isSameDay(date, today)) {
    return 'Today';
  }
  if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function dayKey(dateString) {
  return new Date(dateString).toDateString();
}

// ============================================================================
// 4. SUB-COMPONENTS & PHYSICS ENGINE
// ============================================================================

const GlobalKeyframes = () => (
  <style>{`
    @keyframes chatFloat {
      0% {
        transform: translate(0, 0) scale(1);
      }
      50% {
        transform: translate(5%, -5%) scale(1.1);
      }
      100% {
        transform: translate(0, 0) scale(1);
      }
    }
    @keyframes slideUpFade {
      0% {
        opacity: 0;
        transform: translateY(10px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes pop-in {
      0% { transform: scale(0.5); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    .spinner-animation {
      animation: spin 1.2s linear infinite;
    }
    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }
    .no-copy-text {
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
  `}</style>
);

function LiquidAvatar({ identity, size = 42 }) {
  const containerStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 0 1px var(--glass-border)',
  };

  if (identity.isAdmin) {
    return (
      <div
        style={{
          ...containerStyle,
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          color: '#fff',
          fontSize: size * 0.35,
          fontWeight: 800,
        }}
      >
        ADM
      </div>
    );
  }

  if (identity.avatarUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={identity.avatarUrl}
          alt={identity.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
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
    <div
      style={{
        ...containerStyle,
        background: colors[colorIndex],
        color: '#ffffff',
        fontWeight: 700,
        fontSize: size * 0.4,
      }}
    >
      {getInitials(identity.name)}
    </div>
  );
}

function SwipeableMessage({ children, onSwipe, disabled }) {
  const [translateX, setTranslateX] = useState(0);
  const touchStartX = useRef(null);

  const handleTouchStart = (e) => {
    if (disabled) {
      return;
    }
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    if (disabled || touchStartX.current === null) {
      return;
    }
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;

    if (diff < 0 && diff > -70) {
      setTranslateX(diff);
    }
  };

  const handleTouchEnd = () => {
    if (disabled) {
      return;
    }
    if (translateX <= -40) {
      onSwipe();
    }
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
        width: '100%',
        position: 'relative',
        touchAction: 'pan-y',
        willChange: 'transform',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: -40,
          transform: 'translateY(-50%)',
          opacity: translateX < -20 ? 1 : 0,
          transition: 'opacity 0.2s',
          color: 'var(--dim)',
        }}
      >
        {Vectors.ReplyAction}
      </div>
      {children}
    </div>
  );
}

function SendButton({ canSend, sending, cooldownPercent, cooldownSecondsLeft }) {
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
      aria-label={isCoolingDown ? `Wait ${cooldownSecondsLeft}s` : 'Send message'}
      style={{
        position: 'relative',
        width: ringSize,
        height: ringSize,
        borderRadius: '50%',
        border: 'none',
        flexShrink: 0,
        background: isCoolingDown
          ? 'var(--glass)'
          : (canSend ? 'var(--blue)' : 'var(--glass-border)'),
        color: canSend ? '#fff' : 'var(--dim)',
        cursor: canSend && !isCoolingDown ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
      }}
    >
      {isCoolingDown ? (
        <>
          <svg
            width={ringSize}
            height={ringSize}
            style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
          >
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="var(--glass-border)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="var(--blue)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
            {cooldownSecondsLeft}
          </span>
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
  const { session } = useAuth();
  const userId = session?.user?.id;

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  const [activeThread, setActiveThread] = useState(null);
  const [threadStatus, setThreadStatus] = useState('loading');
  const [dbErrorDetails, setDbErrorDetails] = useState(null); 

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const [viewerMedia, setViewerMedia] = useState(null);
  const [cooldownPercent, setCooldownPercent] = useState(0);
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  
  // Floating '@' Unread Mention State
  const [hasUnreadMention, setHasUnreadMention] = useState(false);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cooldownRef = useRef(null);
  const cooldownTotalMsRef = useRef(0);

  // --------------------------------------------------------------------------
  // INITIALIZATION EFFECTS
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!openThreadWithUserId) {
      return;
    }

    if (!userId) {
      setThreadStatus('error');
      setDbErrorDetails("You must be logged in to view private direct messages.");
      return;
    }

    let isMounted = true;
    setThreadStatus('loading');
    setDbErrorDetails(null);

    async function initializeThread() {
      try {
        const { data: existingRows, error: findError } = await supabase
          .from('dm_threads')
          .select('id, user_a, user_b')
          .or(`and(user_a.eq.${userId},user_b.eq.${openThreadWithUserId}),and(user_a.eq.${openThreadWithUserId},user_b.eq.${userId})`)
          .limit(1);

        if (findError) {
          throw findError;
        }

        let threadRow = existingRows?.[0] || null;

        if (!threadRow) {
          const { data: created, error: createError } = await supabase
            .from('dm_threads')
            .insert({ user_a: userId, user_b: openThreadWithUserId })
            .select('id, user_a, user_b')
            .single();

          if (createError) {
            throw createError;
          }
          threadRow = created;
        }

        const { data: otherProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_admin')
          .eq('id', openThreadWithUserId)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

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
          setDbErrorDetails(err.message || JSON.stringify(err, null, 2));
        }
      }
    }

    initializeThread();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openThreadWithUserId]);

  // Messages subscription & Read Receipts (Descending Order for Column-Reverse)
  useEffect(() => {
    if (!activeThread?.id) {
      return;
    }

    let isMounted = true;
    setMessagesLoading(true);

    // Initial Read Receipt Upsert
    if (userId) {
      supabase.from('dm_read_receipts').upsert({
        thread_id: activeThread.id,
        user_id: userId,
        last_read_at: new Date().toISOString()
      }).then();
    }

    async function fetchMessages() {
      // NOTE: FETCHING FALSE ASCENDING SO NEWEST IS AT INDEX 0
      const { data, error } = await supabase
        .from('dm_messages')
        .select('*, profiles(avatar_url)') // JOIN: Fetch the Avatar URL for PFPs
        .eq('thread_id', activeThread.id)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);

      if (error) {
        setDbErrorDetails(error.message || JSON.stringify(error));
      } else if (isMounted) {
        setMessages(data || []);
      }
      setMessagesLoading(false);
    }

    fetchMessages();

    const channel = supabase.channel(`dm_messages:${activeThread.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `thread_id=eq.${activeThread.id}`,
        },
        (payload) => {
          if (!isMounted) {
            return;
          }
          
          // Check for mentions in realtime payloads
          if (userId && payload.new.mentioned_user_ids?.includes(userId)) {
            setHasUnreadMention(true);
          }

          setMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) {
              return prev;
            }
            // ADD TO FRONT OF ARRAY (Newest at index 0 for column-reverse)
            return [payload.new, ...prev];
          });
          
          // Update Read Receipt on new message received
          if (userId) {
            supabase.from('dm_read_receipts').upsert({
              thread_id: activeThread.id,
              user_id: userId,
              last_read_at: new Date().toISOString()
            }).then();
          }
        }
      ).subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeThread?.id, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, replyingTo]);

  useEffect(() => {
    cooldownRef.current = createCooldown(
      (percent) => {
        setCooldownPercent(percent);
        const totalMs = cooldownTotalMsRef.current || 0;
        setCooldownSecondsLeft(Math.max(0, Math.ceil((totalMs * percent) / 100000)));
      },
      () => {
        setCooldownPercent(0);
        setCooldownSecondsLeft(0);
      }
    );

    return () => {
      if (cooldownRef.current) {
        cooldownRef.current.cancel();
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // MENTION RESOLUTION & RENDERING LOGIC
  // --------------------------------------------------------------------------
  
  // Extracts @usernames, forces lower case, and looks up their UUID
  async function resolveMentionedIds(outgoingText) {
    const mentionedUsernames = [...outgoingText.matchAll(/@([a-zA-Z0-9_]+)/g)].map(m => m[1].toLowerCase());
    
    if (mentionedUsernames.length === 0) {
      return [];
    }
    
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('username', mentionedUsernames); // Matches lowercased registered usernames
      
    return data ? data.map(p => p.id) : [];
  }

  // Opens profile card when @username is clicked
  async function handleMentionClick(username) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase()) // Force lowercase lookup
      .maybeSingle();
      
    if (data?.id) {
      setProfileCardUserId(data.id);
    } else {
      alert("User not found.");
    }
  }

  // Parses text to render clickable mentions. Changes color if in an own-message blue bubble.
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
              color: isOwn ? '#cce4ff' : 'var(--blue)', // Light blue/white if inside own bubble
              textDecoration: 'underline',
              background: 'none', 
              border: 'none', 
              padding: 0, 
              fontWeight: 700, 
              cursor: 'pointer', 
              fontSize: 'inherit' 
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
  // INTERACTION HANDLERS
  // --------------------------------------------------------------------------

  const startReply = useCallback((message) => {
    const isOwn = message.sender_id === userId;
    const senderName = isOwn
      ? 'You'
      : resolveIdentity(activeThread?.otherUser).name;

    setReplyingTo({
      id: message.id,
      sender_name: senderName,
      text: message.text,
      media_url: message.media_url,
      media_type: message.media_type,
    });
  }, [userId, activeThread]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();

    if (!trimmed || !userId || !activeThread || cooldownPercent > 0 || sending) {
      return;
    }

    setSending(true);
    
    // Capture any mentioned users strictly
    const mentionedIds = await resolveMentionedIds(trimmed);

    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      text: trimmed,
      reply_to_id: replyingTo?.id ?? null,
      mentioned_user_ids: mentionedIds
    });

    setSending(false);

    if (error) {
      setDbErrorDetails(error.message);
      alert(error.message);
      return;
    }

    setText('');
    setReplyingTo(null);
    setPickerOpen(false);
    cooldownRef.current?.start();
  }

  async function handleAttachmentSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file || !userId || !activeThread || cooldownPercent > 0 || uploading) {
      return;
    }

    setUploading(true);

    const path = `${userId}/dm-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);

    if (uploadError) {
      setUploading(false);
      setDbErrorDetails(uploadError.message);
      alert('Upload failed.');
      return;
    }

    const publicUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;

    const { error: insertError } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      media_url: publicUrl,
      media_type: guessMediaType(file),
      reply_to_id: replyingTo?.id ?? null,
    });

    if (insertError) {
      setDbErrorDetails(insertError.message);
    }

    setUploading(false);
    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  async function handleMediaPicked(url, mediaType) {
    if (!userId || !activeThread || cooldownPercent > 0 || sending) {
      return;
    }
    
    setPickerOpen(false);

    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      media_url: url,
      media_type: mediaType, // 'gif' | 'sticker'
      reply_to_id: replyingTo?.id ?? null,
    });

    if (error) {
      setDbErrorDetails(error.message);
      alert(error.message);
      return;
    }

    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  function handleEmojiPicked(char) {
    setText((prev) => prev + char);
  }

  // --------------------------------------------------------------------------
  // RENDER GUARDS
  // --------------------------------------------------------------------------

  if (threadStatus === 'loading') {
    return (
      <div
        className="no-copy-text"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        <div style={{ color: 'var(--blue)' }}>
          {Vectors.Spinner}
        </div>
      </div>
    );
  }

  if (threadStatus === 'error' || !activeThread) {
    return (
      <div
        className="no-copy-text"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        <p style={{ color: 'var(--dim)', fontWeight: 600 }}>Failed to load chat.</p>
        
        {dbErrorDetails && (
          <div style={{ 
            background: 'rgba(255, 59, 48, 0.1)', 
            border: '1px solid rgba(255, 59, 48, 0.3)', 
            padding: 14, 
            borderRadius: 12, 
            maxWidth: 450, 
            width: '100%', 
            color: '#ff3b30', 
            fontSize: 13, 
            fontFamily: 'monospace', 
            wordBreak: 'break-all' 
          }}>
            <strong>Database Error:</strong> {dbErrorDetails}
          </div>
        )}

        <button
          onClick={onBack}
          style={{
            background: 'var(--blue)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 12,
            cursor: 'pointer',
            fontWeight: 700
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const otherIdentity = resolveIdentity(activeThread.otherUser);
  let lastDayKey = null;

  // --------------------------------------------------------------------------
  // MAIN COMPONENT RENDER
  // --------------------------------------------------------------------------
  return (
    <div
      className="no-copy-text"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        zIndex: 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        msUserSelect: 'none'
      }}
    >
      <GlobalKeyframes />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: 'var(--bg)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '40vw',
            height: '40vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(10,132,255,0.08), transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '12px 20px',
          background: 'var(--glass-strong)',
          backdropFilter: 'blur(30px) saturate(200%)',
          borderBottom: '1px solid var(--glass-border)',
          zIndex: 20,
        }}
      >
        <button
          onClick={onBack}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--blue)',
            cursor: 'pointer',
            padding: '4px',
            marginLeft: '-8px',
          }}
        >
          {Vectors.Back}
        </button>

        <button
          onClick={() => setProfileCardUserId(activeThread.otherUser.id)}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <LiquidAvatar
            identity={otherIdentity}
            size={42}
          />
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <button
            onClick={() => setProfileCardUserId(activeThread.otherUser.id)}
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: otherIdentity.isAdmin ? '#FF8C00' : 'var(--ink)',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {otherIdentity.name}
            {otherIdentity.isAdmin && Vectors.AdminShield}
          </button>
          <span
            style={{
              fontSize: 13,
              color: 'var(--blue)',
            }}
          >
            Online
          </span>
        </div>
      </header>

      {dbErrorDetails && (
        <div style={{ background: 'rgba(255, 59, 48, 0.12)', borderBottom: '1px solid rgba(255, 59, 48, 0.3)', padding: '8px 16px', color: '#ff3b30', fontSize: 12, fontFamily: 'monospace', zIndex: 25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span><strong>DB Error:</strong> {dbErrorDetails}</span>
          <button onClick={() => setDbErrorDetails(null)} style={{ background: 'transparent', border: 'none', color: '#ff3b30', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column-reverse', // NATIVE BOTTOM RENDERING! (Newest is at index 0 = bottom)
          zIndex: 10,
          minHeight: 0,
          backgroundColor: 'var(--bg)',
          backgroundImage: CHAT_BACKGROUND_IMAGE,
          backgroundRepeat: 'repeat',
        }}
      >
        {messagesLoading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--blue)',
            }}
          >
            {Vectors.Spinner}
          </div>
        )}

        {!messagesLoading && messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                background: 'var(--glass-border)',
                padding: '8px 16px',
                borderRadius: 20,
                fontSize: 14,
                color: 'var(--dim)',
              }}
            >
              Say hello to {otherIdentity.name} 👋
            </div>
          </div>
        )}

        {!messagesLoading && messages.map((message, index) => {
          const isOwn = userId && message.sender_id === userId;

          // Because of column-reverse, index 0 is newest. To know if the day changed, 
          // we check the chronological "previous" message, which is index + 1 in this array.
          const olderMessage = messages[index + 1];
          const showDayDivider = !olderMessage || dayKey(message.created_at) !== dayKey(olderMessage.created_at);

          const repliedMessage = message.reply_to_id
            ? messages.find((m) => m.id === message.reply_to_id) || null
            : null;

          const isStickerOrGif = message.media_type === 'gif' || message.media_type === 'sticker';

          return (
            <React.Fragment key={message.id}>

              <SwipeableMessage
                onSwipe={() => startReply(message)}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isOwn ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 8,
                    marginBottom: 16,
                    animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both',
                  }}
                >

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isOwn ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                    }}
                  >

                    <div
                      style={{
                        maxWidth: '100%',
                        padding: (message.media_url && !isStickerOrGif) ? '4px' : (isStickerOrGif ? 0 : '10px 16px'),
                        borderRadius: isStickerOrGif ? 0 : 20,
                        borderBottomRightRadius: isStickerOrGif ? 0 : (isOwn ? 4 : 20),
                        borderBottomLeftRadius: isStickerOrGif ? 0 : (isOwn ? 20 : 4),
                        background: isStickerOrGif ? 'transparent' : (isOwn ? BUBBLE_OWN : BUBBLE_THEM),
                        color: isOwn ? '#fff' : 'var(--ink)',
                        boxShadow: isStickerOrGif ? 'none' : '0 2px 10px rgba(0,0,0,0.05)',
                      }}
                    >

                      {message.reply_to_id && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            padding: '6px 10px',
                            marginBottom: 8,
                            marginTop: message.media_url ? 4 : 0,
                            borderRadius: 10,
                            background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                            borderLeft: `3px solid ${isOwn ? '#fff' : 'var(--blue)'}`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: isOwn ? '#fff' : 'var(--blue)',
                            }}
                          >
                            {repliedMessage ? (repliedMessage.sender_id === userId ? 'You' : otherIdentity.name) : 'Original'}
                          </span>
                          <span
                            className="no-copy-text"
                            style={{
                              fontSize: 13,
                              color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--dim)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {generateReplySnippet(repliedMessage)}
                          </span>
                        </div>
                      )}

                      {message.media_url ? (
                        isStickerOrGif ? (
                          <button
                            onClick={() => setViewerMedia({ url: message.media_url, type: message.media_type })}
                            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
                          >
                            <img
                              src={message.media_url}
                              alt={message.media_type === 'sticker' ? 'Sticker' : 'GIF'}
                              style={{ maxWidth: 160, maxHeight: 160, display: 'block', borderRadius: 12 }}
                            />
                          </button>
                        ) : (
                          <button
                            onClick={() => setViewerMedia({
                              url: message.media_url,
                              type: message.media_type || 'file',
                            })}
                            style={{
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              display: 'block',
                              width: '100%',
                            }}
                          >
                            {message.media_type === 'image' ? (
                              <img
                                src={message.media_url}
                                alt="Attachment"
                                style={{
                                  maxWidth: 260,
                                  maxHeight: 260,
                                  borderRadius: 16,
                                  display: 'block',
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '12px 16px',
                                  background: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)',
                                  borderRadius: 16,
                                }}
                              >
                                <div style={{ color: isOwn ? '#fff' : 'var(--blue)' }}>
                                  {Vectors.FileText}
                                </div>
                                <span style={{ color: isOwn ? '#fff' : 'var(--ink)', fontSize: 14, fontWeight: 600 }}>
                                  Document
                                </span>
                              </div>
                            )}
                          </button>
                        )
                      ) : (
                        <span
                          className="no-copy-text"
                          style={{
                            fontSize: 15,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.4,
                          }}
                        >
                          {/* NEW: Render text with blue clickable mentions */}
                          {renderMessageTextWithMentions(message.text, isOwn)}
                        </span>
                      )}
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--dim)',
                        marginTop: 4,
                        marginInline: 4,
                        fontWeight: 500,
                      }}
                    >
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                </div>
              </SwipeableMessage>
              
              {/* Day divider renders AFTER the message in DOM so column-reverse pushes it visually ABOVE the message */}
              {showDayDivider && (
                <div
                  style={{
                    textAlign: 'center',
                    margin: '24px 0 16px',
                    position: 'sticky',
                    top: 10,
                    zIndex: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--dim)',
                      background: 'var(--glass-strong)',
                      padding: '6px 14px',
                      borderRadius: 14,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    {formatDayLabel(message.created_at)}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Floating Action Button for Unread Mentions */}
      {hasUnreadMention && (
        <button
          onClick={() => setHasUnreadMention(false)}
          style={{
            position: 'absolute', 
            right: 16, 
            bottom: 80, 
            width: 40, 
            height: 40, 
            borderRadius: '50%', 
            background: 'var(--blue)', 
            color: '#fff', 
            border: 'none', 
            boxShadow: '0 4px 12px rgba(10,132,255,0.3)', 
            zIndex: 30, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontWeight: 800, 
            fontSize: 18, 
            cursor: 'pointer', 
            animation: 'pop-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
        >
          @
        </button>
      )}

      <div
        className="safe-bottom"
        style={{
          flexShrink: 0,
          zIndex: 20,
          position: 'sticky',
          bottom: 0,
        }}
      >
        {!session ? (
          <div
            style={{
              padding: '16px',
              background: 'var(--glass-strong)',
              backdropFilter: 'blur(30px) saturate(200%)',
              borderTop: '1px solid var(--glass-border)',
            }}
          >
            <button
              onClick={() => setAuthOpen(true)}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 20,
                border: 'none',
                background: 'var(--blue)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(10,132,255,0.3)',
              }}
            >
              Sign in to send message
            </button>
          </div>
        ) : (
        <>
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            background: 'var(--glass-strong)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            padding: '10px 16px',
            gap: 12,
            transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
            transform: replyingTo ? 'translateY(0)' : 'translateY(100%)',
            opacity: replyingTo ? 1 : 0,
            visibility: replyingTo ? 'visible' : 'hidden',
            zIndex: 19,
          }}
        >
          <div style={{ color: 'var(--blue)' }}>
            {Vectors.ReplyAction}
          </div>
          <div style={{ width: 3, height: 34, borderRadius: 2, background: 'var(--blue)', flexShrink: 0 }} />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>
              Replying to {replyingTo?.sender_name}
            </span>
            <span style={{ fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {generateReplySnippet(replyingTo)}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            style={{
              border: 'none',
              background: 'var(--glass-border)',
              width: 28,
              height: 28,
              borderRadius: '50%',
              color: 'var(--ink)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {Vectors.Close}
          </button>
        </div>

        <form
          onSubmit={handleSend}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: 'var(--glass-strong)',
            backdropFilter: 'blur(30px) saturate(200%)',
            borderTop: replyingTo ? 'none' : '1px solid var(--glass-border)',
            position: 'relative',
            zIndex: 20,
          }}
        >
          <EmojiGifPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onEmoji={handleEmojiPicked}
            onMedia={handleMediaPicked}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || cooldownPercent > 0}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'var(--dim)',
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {uploading ? Vectors.Spinner : Vectors.Attach}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleAttachmentSelected}
          />

          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={uploading}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: pickerOpen ? 'var(--glass-border)' : 'transparent',
              color: pickerOpen ? 'var(--blue)' : 'var(--dim)',
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {Vectors.Smiley}
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setPickerOpen(false)}
            placeholder={uploading ? 'Uploading media...' : 'Message'}
            disabled={uploading}
            style={{
              flex: 1,
              border: '1px solid var(--glass-border)',
              outline: 'none',
              background: 'var(--glass)',
              borderRadius: 24,
              padding: '12px 18px',
              fontSize: 15,
              color: 'var(--ink)',
              transition: 'border-color 0.2s',
            }}
          />

          <SendButton
            canSend={!!text.trim()}
            sending={sending || uploading}
            cooldownPercent={cooldownPercent}
            cooldownSecondsLeft={cooldownSecondsLeft}
          />
        </form>
        </>
        )}
      </div>

      <MediaViewer
        mediaUrl={viewerMedia?.url}
        mediaType={viewerMedia?.type}
        open={viewerMedia !== null}
        onClose={() => setViewerMedia(null)}
      />

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialTab="signin"
        onVerified={() => setAuthOpen(false)}
      />
    </div>
  );
}
