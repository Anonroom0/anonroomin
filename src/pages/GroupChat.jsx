/**
 * ============================================================================
 * GROUP CHAT MASTER VIEW (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component acts as the master chat pane for Group Conversations.
 *
 * CHANGES IN THIS PASS:
 * - Added `@username` mentions parsing, UUID resolution, and clickable links.
 * - Added Chat Search (keywords) & Member Filtering (type @username to filter).
 * - Clicking the header now opens a GroupCard.
 * - Auto-updates `group_read_receipts` on load so the home screen `@` badge clears.
 * - Message bubble text is non-selectable (user-select: none).
 * - Emoji / GIF / Sticker picker (see EmojiGifPicker.jsx, powered by Tenor's
 *   free API for GIFs/stickers; emoji is a static local list, no API needed)
 * - Chat canvas now renders a subtle background image/pattern layer
 * - Send button replaced with a nicer radial cooldown ring
 * - New: an `onGroupResolved` callback fires once the group-by-slug lookup
 *   settles (with the row on success, or null on a bad/missing slug), so
 *   Home can sync/validate whatever route got us here — see the chat reply
 *   for how Home uses this.
 *
 * NOTE ON ROUTING: this component no longer needs to know or care HOW it
 * got mounted (sidebar click, a mobile /g/<slug> link, or landing straight
 * on the group's own subdomain) — Home resolves all three to the same
 * `groupSlug` prop, and this component just renders whatever group that
 * resolves to, same as it always has.
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
import GroupCard from './GroupCard';
import AuthModal from './AuthModal';
import EmojiGifPicker from './EmojiGifPicker';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const MESSAGE_LIMIT = 200;
const REPLY_SNIPPET_LENGTH = 80;
const ADMIN_DISPLAY_NAME = 'ADMIN';

const BUBBLE_OWN = 'var(--blue, #0a84ff)';
const BUBBLE_THEM = 'var(--glass-strong, rgba(255, 255, 255, 0.85))';

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
  ThreeDots: (
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
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
  SearchSmall: (
    <svg 
      width="16" 
      height="16" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
};

// ============================================================================
// 3. UTILITY & FORMATTING FUNCTIONS
// ============================================================================

function isSenderAdmin(message) {
  return message.sender_name === ADMIN_DISPLAY_NAME || message.is_admin === true;
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

function GroupLiquidAvatar({ url, name, size = 42, isAdmin = false }) {
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

  if (isAdmin) {
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

  if (url) {
    return (
      <div style={containerStyle}>
        <img
          src={url}
          alt={name}
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
  const colorIndex = (name || '').length % colors.length;

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
      {getInitials(name)}
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

/**
 * Redesigned send / cooldown control — a radial progress ring instead of the
 * old dot-in-a-conic-gradient.
 */
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
      aria-label={isCoolingDown ? 'Please wait before sending again' : 'Send message'}
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
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--blue)',
            }}
          />
        </>
      ) : (
        Vectors.Send
      )}
    </button>
  );
}

// ============================================================================
// 5. MAIN GROUP CHAT COMPONENT EXPORT
// ============================================================================

export default function GroupChat({ groupSlug, onBack, onGroupResolved }) {
  const { session, profile } = useAuth();
  const ownUserId = session?.user?.id;

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

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
  const [authOpen, setAuthOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  
  // NEW: Search, Menus, and Group Card
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [groupCardOpen, setGroupCardOpen] = useState(false);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cooldownRef = useRef(null);

  // --------------------------------------------------------------------------
  // INITIALIZATION EFFECTS
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!groupSlug) {
      return;
    }

    let isMounted = true;
    setGroupStatus('loading');

    async function initializeGroup() {
      try {
        const { data, error } = await supabase
          .from('groups')
          .select('*')
          .eq('slug', groupSlug)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (isMounted) {
          if (!data) {
            setGroupStatus('error');
            if (onGroupResolved) {
              onGroupResolved(null);
            }
          } else {
            setGroup(data);
            setGroupStatus('ready');
            if (onGroupResolved) {
              onGroupResolved(data);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load group:', err);
        if (isMounted) {
          setGroupStatus('error');
          if (onGroupResolved) {
            onGroupResolved(null);
          }
        }
      }
    }

    initializeGroup();

    return () => {
      isMounted = false;
    };
    // onGroupResolved is a routing callback passed fresh from Home each
    // render — re-running this fetch off its identity would refetch the
    // same group for no reason, so it's intentionally left out here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSlug]);

  useEffect(() => {
    if (!group?.id) {
      return;
    }

    let isMounted = true;
    setMessagesLoading(true);
    
    // NEW: Update read receipt immediately on opening the group
    if (ownUserId) {
      supabase.from('group_read_receipts').upsert({
        group_id: group.id,
        user_id: ownUserId,
        last_read_at: new Date().toISOString()
      }).then();
    }

    async function fetchMessages() {
      const { data, error } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true })
        .limit(MESSAGE_LIMIT);

      if (!error && isMounted) {
        setMessages(data || []);
        setMessagesLoading(false);
      }
    }

    fetchMessages();

    const channel = supabase.channel(`group_messages:${group.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${group.id}`,
        },
        (payload) => {
          if (!isMounted) {
            return;
          }
          setMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) {
              return prev;
            }
            return [...prev, payload.new];
          });
          
          // NEW: Update read receipt if we are actively viewing the chat when a message arrives
          if (ownUserId) {
            supabase.from('group_read_receipts').upsert({
              group_id: group.id,
              user_id: ownUserId,
              last_read_at: new Date().toISOString()
            }).then();
          }
        }
      ).subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [group?.id, ownUserId]);

  useEffect(() => {
    if (scrollRef.current && !isSearching) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, replyingTo, isSearching]);

  useEffect(() => {
    cooldownRef.current = createCooldown(
      (percent) => setCooldownPercent(percent),
      () => setCooldownPercent(0)
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
  
  // Scans outgoing text for @usernames and gets their UUIDs to pass to DB
  async function resolveMentionedIds(outgoingText) {
    const mentionedUsernames = [...outgoingText.matchAll(/@([a-zA-Z0-9_]+)/g)].map(m => m[1]);
    if (mentionedUsernames.length === 0) return [];
    
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('username', mentionedUsernames);
      
    return data ? data.map(p => p.id) : [];
  }

  // Looks up user ID and pops open the profile card when @username is clicked
  async function handleMentionClick(username) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
      
    if (data?.id) {
      setProfileCardUserId(data.id);
    } else {
      alert("User not found.");
    }
  }

  // Intercepts message text mapping to turn @usernames into clickable buttons
  const renderMessageTextWithMentions = (messageText) => {
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
              color: 'var(--blue)', 
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
    setReplyingTo({
      id: message.id,
      sender_name: message.sender_name,
      text: message.text,
      media_url: message.media_url,
      media_type: message.media_type,
    });
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();

    if (!trimmed || !session?.user || !group || cooldownPercent > 0 || sending) {
      return;
    }

    setSending(true);

    const senderName = profile?.is_admin
      ? ADMIN_DISPLAY_NAME
      : (profile?.username || 'Anonymous');
      
    const mentionedIds = await resolveMentionedIds(trimmed);

    const { error } = await supabase.from('group_messages').insert({
      group_id: group.id,
      user_id: session.user.id,
      sender_name: senderName,
      text: trimmed,
      reply_to_id: replyingTo?.id ?? null,
      mentioned_user_ids: mentionedIds // Include array of pings
    });

    setSending(false);

    if (error) {
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

    if (!file || !session?.user || !group || cooldownPercent > 0 || uploading) {
      return;
    }

    setUploading(true);

    const path = `${session.user.id}/group-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);

    if (uploadError) {
      setUploading(false);
      alert('Upload failed.');
      return;
    }

    const publicUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
    const senderName = profile?.is_admin ? ADMIN_DISPLAY_NAME : (profile?.username || 'Anonymous');

    await supabase.from('group_messages').insert({
      group_id: group.id,
      user_id: session.user.id,
      sender_name: senderName,
      media_url: publicUrl,
      media_type: guessMediaType(file),
      reply_to_id: replyingTo?.id ?? null,
    });

    setUploading(false);
    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  /** Sends a GIF or sticker picked from EmojiGifPicker as its own message. */
  async function handleMediaPicked(url, mediaType) {
    if (!session?.user || !group || cooldownPercent > 0 || sending) {
      return;
    }
    setPickerOpen(false);

    const senderName = profile?.is_admin ? ADMIN_DISPLAY_NAME : (profile?.username || 'Anonymous');

    const { error } = await supabase.from('group_messages').insert({
      group_id: group.id,
      user_id: session.user.id,
      sender_name: senderName,
      media_url: url,
      media_type: mediaType, // 'gif' | 'sticker'
      reply_to_id: replyingTo?.id ?? null,
    });

    if (error) {
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
  // IN-CHAT FILTERING (SEARCH KEYWORDS OR @MEMBER)
  // --------------------------------------------------------------------------
  const filteredMessages = messages.filter((m) => {
    if (!isSearching || !chatSearchQuery.trim()) return true;
    const q = chatSearchQuery.trim().toLowerCase();
    
    // If search string starts with @, strict filter to see messages from that sender only
    if (q.startsWith('@') && q.length > 1) {
      const targetName = q.substring(1);
      return m.sender_name?.toLowerCase() === targetName;
    }
    
    // Standard keyword match
    return m.text?.toLowerCase().includes(q) || m.sender_name?.toLowerCase().includes(q);
  });

  // --------------------------------------------------------------------------
  // RENDER GUARDS
  // --------------------------------------------------------------------------

  if (groupStatus === 'loading') {
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

  if (groupStatus === 'error') {
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
          userSelect: 'none',
          WebkitUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        <p style={{ color: 'var(--dim)' }}>Failed to load group.</p>
        <button
          onClick={onBack}
          style={{
            background: 'var(--blue)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

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
          onClick={() => setGroupCardOpen(true)}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flex: 1,
            textAlign: 'left'
          }}
        >
          <GroupLiquidAvatar
            url={group.cover_url}
            name={group.name}
            size={42}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: 'var(--ink)',
              }}
            >
              {group.name}
            </span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--dim)',
              }}
            >
              {group.description || 'Public Group'}
            </span>
          </div>
        </button>

        {/* Three dot share/search menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--ink)',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%'
            }}
            aria-label="Group options"
          >
            {Vectors.ThreeDots}
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              background: 'var(--glass-strong)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 30,
              minWidth: 160,
              padding: 6
            }}>
              <button
                onClick={() => {
                  setIsSearching(true);
                  setMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {Vectors.SearchSmall} Search Chat
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setMenuOpen(false);
                  alert('Link copied to clipboard!');
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Share link
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Embedded Search Bar (Only visible when isSearching is true) */}
      {isSearching && (
        <div style={{ 
          background: 'var(--glass-strong)', 
          borderBottom: '1px solid var(--glass-border)', 
          padding: '10px 16px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10, 
          zIndex: 19 
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ 
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', pointerEvents: 'none' 
            }}>
              {Vectors.SearchSmall}
            </span>
            <input
              autoFocus
              type="text"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder="Search or type @username to filter..."
              style={{ 
                width: '100%', padding: '8px 12px 8px 36px', borderRadius: 16, border: 'none', 
                background: 'var(--glass-border)', color: 'var(--ink)', fontSize: 14, outline: 'none', boxSizing: 'border-box' 
              }}
            />
            {chatSearchQuery && (
              <button 
                onClick={() => setChatSearchQuery('')} 
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'var(--glass)', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 'bold', color: 'var(--dim)', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
          <button 
            onClick={() => { setIsSearching(false); setChatSearchQuery(''); }} 
            style={{ background: 'none', border: 'none', color: 'var(--blue)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >
            Cancel
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
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

        {!messagesLoading && filteredMessages.length === 0 && (
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
              {isSearching ? 'No messages found.' : 'Say hello to the group 👋'}
            </div>
          </div>
        )}

        {!messagesLoading && filteredMessages.map((message) => {
          const isOwn = ownUserId && message.user_id === ownUserId;
          const isAdminMsg = isSenderAdmin(message);

          const key = dayKey(message.created_at);
          const showDayDivider = key !== lastDayKey;
          lastDayKey = key;

          const repliedMessage = message.reply_to_id
            ? messages.find((m) => m.id === message.reply_to_id) || null
            : null;

          const isStickerOrGif = message.media_type === 'gif' || message.media_type === 'sticker';

          return (
            <React.Fragment key={message.id}>

              {showDayDivider && !isSearching && (
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

              <SwipeableMessage
                onSwipe={() => startReply(message)}
                disabled={isSearching}
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

                  {!isOwn && (
                    <button
                      onClick={() => setProfileCardUserId(message.user_id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        marginBottom: 20,
                      }}
                    >
                      <GroupLiquidAvatar
                        name={message.sender_name}
                        isAdmin={isAdminMsg}
                        size={36}
                      />
                    </button>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isOwn ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                    }}
                  >

                    {!isOwn && (
                      <button
                        onClick={() => setProfileCardUserId(message.user_id)}
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          marginBottom: 4,
                          marginLeft: 6,
                          color: isAdminMsg ? '#FF8C00' : 'var(--blue)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        {isAdminMsg ? ADMIN_DISPLAY_NAME : message.sender_name}
                        {isAdminMsg && Vectors.AdminShield}
                      </button>
                    )}

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
                            {repliedMessage ? repliedMessage.sender_name : 'Original'}
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
                          {renderMessageTextWithMentions(message.text)}
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
            </React.Fragment>
          );
        })}
      </div>

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
      
      {/* NEW: Group Card Integration */}
      {groupCardOpen && (
        <GroupCard 
          groupSlug={groupSlug} 
          open={groupCardOpen} 
          onClose={() => setGroupCardOpen(false)} 
        />
      )}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialTab="signin"
        onVerified={() => setAuthOpen(false)}
      />
    </div>
  );
}
