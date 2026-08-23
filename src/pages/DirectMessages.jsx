import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { RATE_LIMIT_MS, createCooldown } from '../lib/rateLimit';
import MediaViewer from './MediaViewer';

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
          .select('id, username, avatar_url')
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
        .select('id, username, avatar_url')
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
      .select('id, thread_id, sender_id, text, media_url, media_type, is_group_request, created_at')
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

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !userId || !activeThread || cooldownPercent > 0 || sending) return;

    setSending(true);
    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: userId,
      text: trimmed,
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

    cooldownRef.current?.start();
  }

  // ---- Render -----------------------------------------------------------

  if (!session) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '40px 0' }}>
        Sign in to view your messages.
      </div>
    );
  }

  if (activeThread) {
    let lastDayKey = null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 14px' }}>
          <button
            onClick={() => setActiveThread(null)}
            style={{ border: 'none', background: 'none', color: 'var(--blue)', fontSize: 18, cursor: 'pointer' }}
          >
            ←
          </button>
          {activeThread.otherUser.avatar_url ? (
            <img
              src={activeThread.otherUser.avatar_url}
              alt=""
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--blue)', color: '#fff',
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {initials(activeThread.otherUser.username)}
            </div>
          )}
          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{activeThread.otherUser.username}</span>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 4px 8px' }}>
          {messagesLoading && <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Loading…</p>}
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
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '75%', padding: message.media_url ? 4 : '10px 14px', borderRadius: 16,
                        borderBottomRightRadius: isOwn ? 4 : 16,
                        borderBottomLeftRadius: isOwn ? 16 : 4,
                        background: isOwn ? 'var(--blue)' : 'var(--bubble-them)',
                        color: isOwn ? '#fff' : 'var(--ink)',
                      }}
                    >
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
                    <span style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3, marginInline: 4 }}>
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {threadsLoading && <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Loading…</p>}

      {!threadsLoading && threads.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '24px 0' }}>
          No conversations yet.
        </p>
      )}

      {!threadsLoading &&
        threads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => setActiveThread({ id: thread.id, otherUser: thread.otherUser })}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
            }}
          >
            {thread.otherUser.avatar_url ? (
              <img
                src={thread.otherUser.avatar_url}
                alt=""
                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)', color: '#fff',
                  fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {initials(thread.otherUser.username)}
              </div>
            )}
            <span style={{ fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{thread.otherUser.username}</span>
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>{relativeTime(thread.created_at)}</span>
          </button>
        ))}
    </div>
  );
}
