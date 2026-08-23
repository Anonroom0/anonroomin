/**
 * ============================================================================
 * GROUP CHAT MASTER VIEW (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component acts as the master chat pane for Group Conversations.
 * 
 * Corrected Features Included Inline:
 * - Touch-Physics Swipe-to-Reply (Telegram Style)
 * - Left/Right Message Alignment with Avatar (DP) display
 * - Clickable Avatar/Name to open Profile Card
 * - Fixed Bottom Input constraint (No more hiding/cut-off inputs)
 * - Liquid Glassmorphism Backgrounds
 * - Realtime Supabase Subscriptions
 * - Fully unminified, enterprise-grade formatting
 * 
 * Dependencies: React, Supabase, AuthContext
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { createCooldown } from '../lib/rateLimit';
import MediaViewer from './MediaViewer';
import ProfileCard from './ProfileCard';
import AuthModal from './AuthModal';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const MESSAGE_LIMIT = 200;
const REPLY_SNIPPET_LENGTH = 80;
const ADMIN_DISPLAY_NAME = 'ADMIN';

const BUBBLE_OWN = 'var(--blue, #0a84ff)';
const BUBBLE_THEM = 'var(--glass-strong, rgba(255, 255, 255, 0.85))';

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
  )
};

// ============================================================================
// 3. UTILITY & FORMATTING FUNCTIONS
// ============================================================================

/**
 * Validates if the message was sent by an administrator.
 */
function isSenderAdmin(message) {
  return message.sender_name === ADMIN_DISPLAY_NAME || message.is_admin === true;
}

/**
 * Extracts initials from a username for the placeholder avatar.
 */
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

/**
 * Formats a raw date string into a Telegram-style timestamp.
 */
function formatTime(dateString) {
  if (!dateString) {
    return '';
  }
  return new Date(dateString).toLocaleTimeString([], { 
    hour: 'numeric', 
    minute: '2-digit' 
  });
}

/**
 * Identifies the type of media attached to a message.
 */
function guessMediaType(file) {
  if (!file) {
    return 'file';
  }
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  return 'file';
}

/**
 * Generates a clean text snippet for the animated reply preview.
 */
function generateReplySnippet(message) {
  if (!message) {
    return 'Original message';
  }
  if (message.media_url) {
    if (message.media_type === 'image') {
      return '📸 Photo';
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

/**
 * Formats date into Apple style sticky pills ("Today", "Yesterday").
 */
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
    year: 'numeric' 
  });
}

/**
 * Generates a unique key for grouping messages by day.
 */
function dayKey(dateString) {
  return new Date(dateString).toDateString();
}

// ============================================================================
// 4. SUB-COMPONENTS & PHYSICS ENGINE
// ============================================================================

/**
 * Injects required CSS animations into the document head.
 */
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
  `}</style>
);

/**
 * Apple-style Avatar renderer handling Images, Initials, and Admin variants.
 */
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
          fontWeight: 800 
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
            objectFit: 'cover' 
          }} 
        />
      </div>
    );
  }

  const colors = [
    'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)', 
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', 
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', 
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
  ];
  const colorIndex = (name || '').length % colors.length;

  return (
    <div 
      style={{ 
        ...containerStyle, 
        background: colors[colorIndex], 
        color: '#ffffff', 
        fontWeight: 700, 
        fontSize: size * 0.4 
      }}
    >
      {getInitials(name)}
    </div>
  );
}

/**
 * SwipeableMessage Component (Telegram Touch Physics)
 * Wraps the message row and handles sliding left to trigger a reply.
 */
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
    
    // Allow swipe left only (negative diff) up to -70px constraint
    if (diff < 0 && diff > -70) {
      setTranslateX(diff);
    }
  };

  const handleTouchEnd = () => {
    if (disabled) {
      return;
    }
    // If swiped far enough left, trigger the callback
    if (translateX <= -40) {
      onSwipe();
    }
    // Spring physics bounce back
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
        position: 'relative'
      }}
    >
      {/* Hidden Reply Icon revealed by swipe action */}
      <div 
        style={{
          position: 'absolute', 
          top: '50%', 
          right: -40, 
          transform: 'translateY(-50%)',
          opacity: translateX < -20 ? 1 : 0, 
          transition: 'opacity 0.2s', 
          color: 'var(--dim)'
        }}
      >
        {Vectors.ReplyAction}
      </div>
      {children}
    </div>
  );
}

// ============================================================================
// 5. MAIN GROUP CHAT COMPONENT EXPORT
// ============================================================================

export default function GroupChat({ groupSlug, onBack }) {
  const { session, profile } = useAuth();
  
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  
  // Group Data State
  const [group, setGroup] = useState(null);
  const [groupStatus, setGroupStatus] = useState('loading'); 
  
  // Messages Array State
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  
  // Composer & Input State
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); 
  
  // Modals & UI States
  const [viewerMedia, setViewerMedia] = useState(null);
  const [cooldownPercent, setCooldownPercent] = useState(0);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  // Reference Hooks
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cooldownRef = useRef(null);

  // --------------------------------------------------------------------------
  // INITIALIZATION EFFECTS
  // --------------------------------------------------------------------------
  
  // 1. Fetch Group Information based on Slug
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
          } else {
            setGroup(data);
            setGroupStatus('ready');
          }
        }
      } catch (err) {
        console.error("Failed to load group:", err);
        if (isMounted) {
          setGroupStatus('error');
        }
      }
    }
    
    initializeGroup();
    
    return () => { 
      isMounted = false; 
    };
  }, [groupSlug]);

  // 2. Fetch Messages and setup Realtime Subscription
  useEffect(() => {
    if (!group?.id) {
      return;
    }
    
    let isMounted = true;
    setMessagesLoading(true);

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

    // Supabase Postgres Realtime Subscription for instant delivery
    const channel = supabase.channel(`group_messages:${group.id}`)
      .on(
        'postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'group_messages', 
          filter: `group_id=eq.${group.id}` 
        },
        (payload) => {
          if (!isMounted) {
            return;
          }
          setMessages((prev) => {
            // Prevent duplicate message rendering
            if (prev.some(m => m.id === payload.new.id)) {
              return prev;
            }
            return [...prev, payload.new];
          });
        }
      ).subscribe();

    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel); 
    };
  }, [group?.id]);

  // 3. Scroll Physics Engine
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ 
        top: scrollRef.current.scrollHeight, 
        behavior: 'smooth' 
      });
    }
  }, [messages, replyingTo]);

  // 4. Rate Limiter Cooldown
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
  // INTERACTION HANDLERS
  // --------------------------------------------------------------------------
  
  const startReply = useCallback((message) => {
    setReplyingTo({ 
      id: message.id, 
      sender_name: message.sender_name, 
      text: message.text, 
      media_url: message.media_url, 
      media_type: message.media_type 
    });
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    
    // Pre-flight checks
    if (!trimmed || !session?.user || !group || cooldownPercent > 0 || sending) {
      return;
    }

    setSending(true);
    
    // Inject correct display name context
    const senderName = profile?.is_admin 
      ? ADMIN_DISPLAY_NAME 
      : (profile?.username || 'Anonymous');

    const { error } = await supabase.from('group_messages').insert({
      group_id: group.id, 
      user_id: session.user.id, 
      sender_name: senderName, 
      text: trimmed, 
      reply_to_id: replyingTo?.id ?? null,
    });
    
    setSending(false);
    
    if (error) { 
      alert(error.message); 
      return; 
    }

    // Reset Composer state
    setText('');
    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  async function handleAttachmentSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    
    if (!file || !session?.user || !group || cooldownPercent > 0 || uploading) {
      return;
    }

    setUploading(true);
    
    // Direct upload to Supabase bucket
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

  // --------------------------------------------------------------------------
  // RENDER GUARDS
  // --------------------------------------------------------------------------
  
  if (groupStatus === 'loading') {
    return (
      <div 
        style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg)' 
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
        style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg)', 
          flexDirection: 'column', 
          gap: 16 
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
            cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  // Session constants
  const ownUserId = session?.user?.id;
  let lastDayKey = null;

  // --------------------------------------------------------------------------
  // MAIN COMPONENT RENDER
  // --------------------------------------------------------------------------
  return (
    <div 
      style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        position: 'relative', 
        height: '100%', 
        overflow: 'hidden', 
        zIndex: 1 
      }}
    >
      <GlobalKeyframes />
      
      {/* 
        =======================================================================
        BACKGROUND EFFECTS
        =======================================================================
      */}
      <div 
        aria-hidden="true" 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          zIndex: 0, 
          pointerEvents: 'none', 
          background: 'var(--bg)' 
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
            filter: 'blur(60px)' 
          }} 
        />
      </div>

      {/* 
        =======================================================================
        APPLE GLASS HEADER
        =======================================================================
      */}
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
          zIndex: 20 
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
            marginLeft: '-8px' 
          }}
        >
          {Vectors.Back}
        </button>
        
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
            flex: 1 
          }}
        >
          <span 
            style={{ 
              fontWeight: 700, 
              fontSize: 16, 
              color: 'var(--ink)' 
            }}
          >
            {group.name}
          </span>
          <span 
            style={{ 
              fontSize: 13, 
              color: 'var(--dim)' 
            }}
          >
            {group.description || 'Public Group'}
          </span>
        </div>
      </header>

      {/* 
        =======================================================================
        MESSAGE CANVAS (SCROLLABLE AREA)
        =======================================================================
      */}
      <div 
        ref={scrollRef} 
        className="custom-scrollbar" 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          overscrollBehavior: 'contain', 
          WebkitOverflowScrolling: 'touch',
          padding: '20px 16px', 
          display: 'flex', 
          flexDirection: 'column', 
          zIndex: 10,
          minHeight: 0,
        }}
      >
        {messagesLoading && (
          <div 
            style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: 'var(--blue)' 
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
              justifyContent: 'center' 
            }}
          >
            <div 
              style={{ 
                background: 'var(--glass-border)', 
                padding: '8px 16px', 
                borderRadius: 20, 
                fontSize: 14, 
                color: 'var(--dim)' 
              }}
            >
              Say hello to the group 👋
            </div>
          </div>
        )}

        {/* Message Loop Render */}
        {!messagesLoading && messages.map((message) => {
          const isOwn = ownUserId && message.user_id === ownUserId;
          const isAdminMsg = isSenderAdmin(message);
          
          const key = dayKey(message.created_at);
          const showDayDivider = key !== lastDayKey;
          lastDayKey = key;
          
          const repliedMessage = message.reply_to_id 
            ? messages.find((m) => m.id === message.reply_to_id) || null 
            : null;

          return (
            <React.Fragment key={message.id}>
              
              {/* Day Divider Pill */}
              {showDayDivider && (
                <div 
                  style={{ 
                    textAlign: 'center', 
                    margin: '24px 0 16px', 
                    position: 'sticky', 
                    top: 10, 
                    zIndex: 5 
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
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)' 
                    }}
                  >
                    {formatDayLabel(message.created_at)}
                  </span>
                </div>
              )}

              {/* Swipeable Wrapper for Touch Physics */}
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
                    animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both' 
                  }}
                >
                  
                  {/* Left Side: Avatar / DP for other users */}
                  {!isOwn && (
                    <button 
                      onClick={() => setProfileCardUserId(message.user_id)} 
                      style={{ 
                        border: 'none', 
                        background: 'transparent', 
                        padding: 0, 
                        cursor: 'pointer', 
                        marginBottom: 20 
                      }}
                    >
                      <GroupLiquidAvatar 
                        name={message.sender_name} 
                        isAdmin={isAdminMsg} 
                        size={36} 
                      />
                    </button>
                  )}

                  {/* Message Body Wrapper */}
                  <div 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: isOwn ? 'flex-end' : 'flex-start', 
                      maxWidth: '75%' 
                    }}
                  >
                    
                    {/* Username Header Above Bubble */}
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
                          cursor: 'pointer' 
                        }}
                      >
                        {isAdminMsg ? ADMIN_DISPLAY_NAME : message.sender_name}
                        {isAdminMsg && Vectors.AdminShield}
                      </button>
                    )}

                    {/* Chat Bubble Container */}
                    <div 
                      style={{ 
                        maxWidth: '100%', 
                        padding: message.media_url ? '4px' : '10px 16px', 
                        borderRadius: 20, 
                        borderBottomRightRadius: isOwn ? 4 : 20, 
                        borderBottomLeftRadius: isOwn ? 20 : 4, 
                        background: isOwn ? BUBBLE_OWN : BUBBLE_THEM, 
                        color: isOwn ? '#fff' : 'var(--ink)', 
                        boxShadow: '0 2px 10px rgba(0,0,0,0.05)' 
                      }}
                    >
                      
                      {/* Replied Message Snippet Inject */}
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
                            borderLeft: `3px solid ${isOwn ? '#fff' : 'var(--blue)'}` 
                          }}
                        >
                          <span 
                            style={{ 
                              fontSize: 12, 
                              fontWeight: 700, 
                              color: isOwn ? '#fff' : 'var(--blue)' 
                            }}
                          >
                            {repliedMessage ? repliedMessage.sender_name : 'Original'}
                          </span>
                          <span 
                            style={{ 
                              fontSize: 13, 
                              color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--dim)', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}
                          >
                            {generateReplySnippet(repliedMessage)}
                          </span>
                        </div>
                      )}

                      {/* Media Handling Logic */}
                      {message.media_url ? (
                        <button 
                          onClick={() => setViewerMedia({ 
                            url: message.media_url, 
                            type: message.media_type || 'file' 
                          })} 
                          style={{ 
                            border: 'none', 
                            background: 'none', 
                            padding: 0, 
                            cursor: 'pointer', 
                            display: 'block', 
                            width: '100%' 
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
                                objectFit: 'cover' 
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
                                borderRadius: 16 
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
                      ) : (
                        // Standard Text Rendering
                        <span 
                          style={{ 
                            fontSize: 15, 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word', 
                            lineHeight: 1.4 
                          }}
                        >
                          {message.text}
                        </span>
                      )}
                    </div>
                    
                    {/* Timestamp */}
                    <span 
                      style={{ 
                        fontSize: 11, 
                        color: 'var(--dim)', 
                        marginTop: 4, 
                        marginInline: 4, 
                        fontWeight: 500 
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

      {/* 
        =======================================================================
        COMPOSER MODULE (FIXED TO BOTTOM VIA FLEX-SHRINK: 0)
        =======================================================================
      */}
      <div 
        style={{ 
          flexShrink: 0, 
          zIndex: 20, 
          position: 'relative' 
        }}
      >
        {!session ? (
          /* Logged-out state: no composer at all, just a clear sign-in CTA */
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
        {/* Reply Strip Animation Pane */}
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
            zIndex: 19 
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
              justifyContent: 'center' 
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
              justifyContent: 'center' 
            }}
          >
            {Vectors.Close}
          </button>
        </div>

        {/* Native Form Input Controller */}
        <form 
          onSubmit={handleSend} 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            padding: '12px 16px', 
            background: 'var(--glass-strong)', 
            backdropFilter: 'blur(30px) saturate(200%)', 
            borderTop: replyingTo ? 'none' : '1px solid var(--glass-border)', 
            position: 'relative', 
            zIndex: 20 
          }}
        >
          {/* Attachment Button */}
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading || cooldownPercent > 0} 
            style={{ 
              width: 38, 
              height: 38, 
              borderRadius: '50%', 
              border: 'none', 
              background: 'transparent', 
              color: 'var(--dim)', 
              cursor: 'pointer', 
              flexShrink: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
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
          
          {/* Main Input Text Field */}
          <input 
            type="text" 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
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
              transition: 'border-color 0.2s' 
            }} 
          />
          
          {/* Action / Send Button */}
          <button 
            type="submit" 
            disabled={!text.trim() || sending || uploading || cooldownPercent > 0} 
            style={{ 
              width: 40, 
              height: 40, 
              borderRadius: '50%', 
              border: 'none', 
              flexShrink: 0, 
              background: cooldownPercent > 0 
                ? `conic-gradient(var(--blue) ${cooldownPercent}%, rgba(10,132,255,0.2) 0)` 
                : (text.trim() ? 'var(--blue)' : 'var(--glass-border)'), 
              color: text.trim() ? '#fff' : 'var(--dim)', 
              cursor: text.trim() && !cooldownPercent ? 'pointer' : 'default', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            {cooldownPercent > 0 ? (
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff' }} />
            ) : (
              Vectors.Send
            )}
          </button>
        </form>
        </>
        )}
      </div>

      {/* Media Viewer Global Hook */}
      <MediaViewer 
        mediaUrl={viewerMedia?.url} 
        mediaType={viewerMedia?.type} 
        open={viewerMedia !== null} 
        onClose={() => setViewerMedia(null)} 
      />
      
      {/* Profile Card Local Trigger */}
      <ProfileCard 
        userId={profileCardUserId} 
        open={!!profileCardUserId} 
        onClose={() => setProfileCardUserId(null)} 
      />

      {/* Sign-in Modal (opened from the "Sign in to send message" CTA) */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialTab="signin"
        onVerified={() => setAuthOpen(false)}
      />
    </div>
  );
}
