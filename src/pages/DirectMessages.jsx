import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { RATE_LIMIT_MS, createCooldown } from '../lib/rateLimit';
import MediaViewer from './MediaViewer';

const REPLY_SNIPPET_LENGTH = 80;
const SUPPORT_LABEL = 'Anonroom Support';

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function relativeTime(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function guessMediaType(file) {
  return file.type.startsWith('image/') ? 'image' : 'file';
}

function replySnippet(message) {
  if (!message) return 'Original message';
  if (message.media_type) return '📄 Attachment';
  const text = message.text || '';
  return text.length > REPLY_SNIPPET_LENGTH ? `${text.slice(0, REPLY_SNIPPET_LENGTH)}…` : text;
}

// Never exposes a real username/avatar for admin accounts — callers should
// only ever render the fields returned here, not the raw profile object.
function displayIdentity(user) {
  if (user?.is_admin) {
    return { name: SUPPORT_LABEL, avatarUrl: null, isSupport: true };
  }
  return { name: user?.username || 'Unknown user', avatarUrl: user?.avatar_url || null, isSupport: false };
}

function IdentityAvatar({ identity, size = 32 }) {
  if (identity.isSupport) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: '50%', background: 'var(--ink)', color: '#fff',
          fontSize: size * 0.44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        🎧
      </div>
    );
  }
  if (identity.avatarUrl) {
    return (
      <img
        src={identity.avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--blue)', color: '#fff',
        fontWeight: 700, fontSize: size * 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials(identity.name)}
    </div>
  );
}

export default function DirectMessages({ openThreadWithUserId }) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThread, setActiveThread] = useState(null); // { id, otherUser }
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cooldownPercent, setCooldownPercent] = useState(0);
  const [toast, setToast] = useState('');
  const [viewerMedia, setViewerMedia] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // { id, sender_name, text, media_type }
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  const cooldownRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // ---- Inbox: load threads for the current user -----------------------
  useEffect(() => {
    if (!userId) {
      setThreadsLoading(false);
      return;
    }
    let isMounted = true;
    setThreadsLoading(true);

    async function loadThreads() {
      const { data: threadRows, error: threadsError } = await supabase
        .from('dm_threads')
        .select('id, user_a, user_b, created_at')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (threadsError) {
        console.warn('Failed to load dm threads:', threadsError.message);
        setThreads([]);
        setThreadsLoading(false);
        return;
      }

      const otherIds = (threadRows || []).map((t) => (t.user_a === userId ? t.user_b : t.user_a));
      let profilesById = {};

      if (otherIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_admin')
          .in('id', otherIds);

        if (profilesError) {
          console.warn('Failed to load participant profiles:', profilesError.message);
        } else {
          profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
        }
      }

      if (!isMounted) return;

      const enriched = (threadRows || []).map((t) => {
        const otherId = t.user_a === userId ? t.user_b : t.user_a;
        return { ...t, otherUser: profilesById[otherId] || { id: otherId, username: 'Unknown user' } };
      });

      setThreads(enriched);
      setThreadsLoading(false);
    }

    loadThreads();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // ---- Jump straight into a thread with a given user, creating if needed
  useEffect(() => {
    if (!userId || !openThreadWithUserId) return;
    let isMounted = true;

    async function openOrCreateThread() {
      const { data: existing, error: findError } = await supabase
        .from('dm_threads')
        .select('id, user_a, user_b')
        .or(
          `and(user_a.eq.${userId},user_b.eq.${openThreadWithUserId}),and(user_a.eq.${openThreadWithUserId},user_b.eq.${userId})`
        )
        .maybeSingle();

      if (findError) {
        console.warn('Failed to look up dm thread:', findError.message);
        return;
      }

      let threadRow = existing;

      if (!threadRow) {
        const { data: created, error: createError } = await supabase
          .from('dm_threads')
          .insert({ user_a: userId, user_b: openThreadWithUserId })
          .select('id, user_a, user_b')
          .single();

        if (createError) {
          console.warn('Failed to create dm thread:', createError.message);
          return;
        }
        threadRow = created;
      }

      const { data: otherProfile } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, is_admin')
        .eq('id', openThreadWithUserId)
        .maybeSingle();

      if (!isMounted) return;
      setActiveThread({ id: threadRow.id, otherUser: otherProfile || { id: openThreadWithUserId, username: 'Unknown user' } });
    }

    openOrCreateThread();
    return () => {
      isMounted = false;
    };
  }, [userId, openThreadWithUserId]);

  // ---- Thread view: load messages + subscribe ---------------------------
  useEffect(() => {
    if (!activeThread?.id) return;
    let isMounted = true;
    setMessagesLoading(true);

    supabase
      .from('dm_messages')
      .select('id, thread_id, sender_id, text, media_url, media_type, is_group_request, reply_to_id, created_at')
      .eq('thread_id', activeThread.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) console.warn('Failed to load dm messages:', error.message);
        setMessages(data || []);
        setMessagesLoading(false);
      });

    const channel = supabase
      .channel(`dm_messages:${activeThread.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${activeThread.id}` },
        (payload) => {
          if (!isMounted) return;
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeThread?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    cooldownRef.current = createCooldown(
      (percent) => setCooldownPercent(percent),
      () => setCooldownPercent(0)
    );
    return () => cooldownRef.current?.cancel();
  }, []);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(''), 3000);
  }

  function startReply(message) {
    const isOwn = message.sender_id === userId;
    setReplyingTo({
      id: message.id,
      sender_name: isOwn
        ? (session?.user?.user_metadata?.username || 'You')
        : displayIdentity(activeThread?.otherUser).name,
      text: message.text,
      media_type: message.media_type,
    });
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !userId || !activeThread || cooldownPercent > 0 || sending) return;

    setSending(true);
    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      text: trimmed,
      reply_to_id: replyingTo?.id ?? null,
    });
    setSending(false);

    if (error) {
      if (error.message?.startsWith('RATE_LIMIT')) {
        showToast('Slow down a little — wait a few seconds before sending again.');
      } else {
        showToast('Message failed to send. Try again.');
        console.warn('Failed to send dm:', error.message);
      }
      return;
    }

    setText('');
    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  async function handleAttachmentSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId || !activeThread || cooldownPercent > 0 || uploading) return;

    setUploading(true);
    const path = `${userId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);

    if (uploadError) {
      setUploading(false);
      showToast('Upload failed. Try again.');
      console.warn('Failed to upload media:', uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);

    const { error: insertError } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      media_url: publicUrlData.publicUrl,
      media_type: guessMediaType(file),
      reply_to_id: replyingTo?.id ?? null,
    });

    setUploading(false);

    if (insertError) {
      if (insertError.message?.startsWith('RATE_LIMIT')) {
        showToast('Slow down a little — wait a few seconds before sending again.');
      } else {
        showToast('Message failed to send. Try again.');
        console.warn('Failed to send media dm:', insertError.message);
      }
      return;
    }

    setReplyingTo(null);
    cooldownRef.current?.start();
  }

  // ---- Render -----------------------------------------------------------

  if (!session) {
    return (
      <div
        style={{
          minHeight: '100vh', background: 'var(--bg)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>
          Sign in to view your messages.
        </p>
      </div>
    );
  }

  if (activeThread) {
    const otherIdentity = displayIdentity(activeThread.otherUser);
    let lastDayKey = null;

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header
          className="glass-strong"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
            borderRadius: 0, position: 'sticky', top: 0, zIndex: 10,
          }}
        >
          <button
            onClick={() => setActiveThread(null)}
            aria-label="Back to conversations"
            style={{ border: 'none', background: 'none', color: 'var(--blue)', fontSize: 20, cursor: 'pointer', padding: 0 }}
          >
            ←
          </button>
          <IdentityAvatar identity={otherIdentity} size={34} />
          <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 16 }}>{otherIdentity.name}</span>
        </header>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {messagesLoading && (
            <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '24px 0' }}>Loading…</p>
          )}
          {!messagesLoading && messages.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '24px 0' }}>
              No messages yet. Say hello 👋
            </p>
          )}

          {!messagesLoading &&
            messages.map((message) => {
              const isOwn = message.sender_id === userId;
              const key = new Date(message.created_at).toDateString();
              const showDayDivider = key !== lastDayKey;
              lastDayKey = key;

              const repliedMessage = message.reply_to_id
                ? messages.find((m) => m.id === message.reply_to_id) || null
                : null;
              const isHovered = hoveredMessageId === message.id;

              return (
                <div key={message.id}>
                  {showDayDivider && (
                    <div style={{ textAlign: 'center', margin: '16px 0 8px' }}>
                      <span
                        style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--dim)', background: 'rgba(0,0,0,0.04)',
                          padding: '4px 10px', borderRadius: 8,
                        }}
                      >
                        {new Date(message.created_at).toLocaleDateString([], {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  <div
                    className="pop-in"
                    onMouseEnter={() => setHoveredMessageId(message.id)}
                    onMouseLeave={() => setHoveredMessageId((current) => (current === message.id ? null : current))}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex', alignItems: 'flex-end', gap: 4,
                        flexDirection: isOwn ? 'row-reverse' : 'row',
                        maxWidth: '85%',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '100%', padding: message.media_url ? 4 : '10px 14px', borderRadius: 16,
                          borderBottomRightRadius: isOwn ? 4 : 16,
                          borderBottomLeftRadius: isOwn ? 16 : 4,
                          background: isOwn ? 'var(--blue)' : 'var(--bubble-them)',
                          color: isOwn ? '#fff' : 'var(--ink)',
                        }}
                      >
                        {message.reply_to_id && (
                          <div
                            style={{
                              display: 'flex', flexDirection: 'column', gap: 1,
                              padding: '5px 9px', marginBottom: 6,
                              borderRadius: 8,
                              background: isOwn ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)',
                              borderLeft: '3px solid var(--blue)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11.5, fontWeight: 700,
                                color: isOwn ? 'rgba(255,255,255,0.9)' : 'var(--blue)',
                              }}
                            >
                              {repliedMessage
                                ? (repliedMessage.sender_id === userId
                                    ? (session?.user?.user_metadata?.username || 'You')
                                    : otherIdentity.name)
                                : 'Original message'}
                            </span>
                            <span
                              style={{
                                fontSize: 12, color: isOwn ? 'rgba(255,255,255,0.75)' : 'var(--dim)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                maxWidth: 220,
                              }}
                            >
                              {replySnippet(repliedMessage)}
                            </span>
                          </div>
                        )}

                        {message.media_url ? (
                          <button
                            onClick={() =>
                              setViewerMedia({ url: message.media_url, type: message.media_type || 'file' })
                            }
                            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
                          >
                            {message.media_type === 'image' ? (
                              <img
                                src={message.media_url}
                                alt=""
                                style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, display: 'block' }}
                              />
                            ) : (
                              <span
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                  color: isOwn ? '#fff' : 'var(--ink)', fontSize: 13,
                                }}
                              >
                                📄 Attachment
                              </span>
                            )}
                          </button>
                        ) : (
                          <span style={{ fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {message.text}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => startReply(message)}
                        aria-label="Reply"
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
                          fontSize: 14, padding: 4, color: 'var(--dim)', lineHeight: 1,
                          opacity: isHovered ? 1 : 0.45,
                          transition: 'opacity 140ms ease',
                        }}
                      >
                        ↩︎
                      </button>
                    </div>

                    <span style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3, marginInline: 4 }}>
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Reply preview strip */}
        {replyingTo && (
          <div
            className="glass-strong"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
              borderRadius: 0, borderTop: '1px solid var(--glass-border)',
            }}
          >
            <div style={{ width: 3, height: 30, borderRadius: 2, background: 'var(--blue)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>
                Replying to {replyingTo.sender_name}
              </span>
              <span
                style={{
                  fontSize: 12.5, color: 'var(--dim)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {replySnippet(replyingTo)}
              </span>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              style={{
                border: 'none', background: 'rgba(0,0,0,0.06)', width: 24, height: 24, borderRadius: '50%',
                color: 'var(--ink)', cursor: 'pointer', fontSize: 12, flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="glass-strong"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            borderRadius: 0, position: 'sticky', bottom: 0,
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || cooldownPercent > 0}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: 'rgba(0,0,0,0.06)', fontSize: 16, cursor: 'pointer', flexShrink: 0,
            }}
          >
            📎
          </button>
          <input ref={fileInputRef} type="file" hidden onChange={handleAttachmentSelected} />

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={uploading ? 'Uploading…' : 'Message'}
            disabled={uploading}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.7)',
              borderRadius: 20, padding: '10px 16px', fontSize: 15, color: 'var(--ink)',
            }}
          />

          <button
            type="submit"
            disabled={!text.trim() || sending || uploading || cooldownPercent > 0}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: cooldownPercent > 0
                ? `conic-gradient(var(--blue) ${cooldownPercent}%, rgba(10,132,255,0.15) 0)`
                : 'var(--blue)',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {cooldownPercent > 0 ? (
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg)' }} />
            ) : (
              '↑'
            )}
          </button>
        </form>

        {toast && (
          <div
            style={{
              position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(28,28,30,0.85)', color: '#fff', padding: '10px 18px',
              borderRadius: 12, fontSize: 13, zIndex: 50,
            }}
          >
            {toast}
          </div>
        )}

        <MediaViewer
          mediaUrl={viewerMedia?.url}
          mediaType={viewerMedia?.type}
          open={viewerMedia !== null}
          onClose={() => setViewerMedia(null)}
        />
      </div>
    );
  }

  // ---- Inbox --------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-strong"
        style={{
          display: 'flex', alignItems: 'center', padding: '14px 20px',
          borderRadius: 0, position: 'sticky', top: 0, zIndex: 10,
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 17, letterSpacing: -0.2 }}>Messages</span>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
        {threadsLoading && (
          <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Loading…</p>
        )}

        {!threadsLoading && threads.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '24px 0' }}>
            No conversations yet.
          </p>
        )}

        {!threadsLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {threads.map((thread) => {
              const identity = displayIdentity(thread.otherUser);
              return (
                <button
                  key={thread.id}
                  onClick={() => setActiveThread({ id: thread.id, otherUser: thread.otherUser })}
                  className="glass-panel"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
                  }}
                >
                  <IdentityAvatar identity={identity} size={40} />
                  <span style={{ fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{identity.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>{relativeTime(thread.created_at)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
