import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import AuthModal from './AuthModal';
import ProfileCard from './ProfileCard';
import MediaViewer from './MediaViewer';
import DirectMessages from './DirectMessages';
import { RATE_LIMIT_MS, createCooldown } from '../lib/rateLimit';
import { getGroupSlugFromHost } from '../lib/subdomain';

const MESSAGE_LIMIT = 200;

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDayLabel(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function dayKey(dateString) {
  return new Date(dateString).toDateString();
}

function guessMediaType(file) {
  return file.type.startsWith('image/') ? 'image' : 'file';
}

export default function GroupChat() {
  const { session } = useAuth();
  const [slug, setSlug] = useState(null);
  const [group, setGroup] = useState(null);
  const [groupStatus, setGroupStatus] = useState('loading'); // 'loading' | 'ready' | 'not-found' | 'error'
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cooldownPercent, setCooldownPercent] = useState(0);
  const [toast, setToast] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [viewerMedia, setViewerMedia] = useState(null); // { url, type }
  const [dmThreadUserId, setDmThreadUserId] = useState(null);

  const cooldownRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    setSlug(getGroupSlugFromHost());
  }, []);

  // Resolve the group row for this slug.
  useEffect(() => {
    if (!slug) return;
    let isMounted = true;
    setGroupStatus('loading');

    supabase
      .from('groups')
      .select('id, slug, name, description, cover_url, created_at')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn('Failed to load group:', error.message);
          setGroupStatus('error');
          return;
        }
        if (!data) {
          setGroupStatus('not-found');
          return;
        }
        setGroup(data);
        setGroupStatus('ready');
      });

    return () => {
      isMounted = false;
    };
  }, [slug]);

  // Load messages + subscribe to realtime inserts for this group.
  useEffect(() => {
    if (!group?.id) return;
    let isMounted = true;
    setMessagesLoading(true);

    supabase
      .from('group_messages')
      .select('id, group_id, user_id, sender_name, text, media_url, media_type, created_at')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_LIMIT)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) console.warn('Failed to load messages:', error.message);
        setMessages(data || []);
        setMessagesLoading(false);
      });

    const channel = supabase
      .channel(`group_messages:${group.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` },
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
  }, [group?.id]);

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
    if (!trimmed || !session?.user || cooldownPercent > 0 || sending) return;

    setSending(true);
    const { error } = await supabase.from('group_messages').insert({
      group_id: group.id,
      user_id: session.user.id,
      sender_name: session.user.user_metadata?.username || 'anonymous',
      text: trimmed,
    });
    setSending(false);

    if (error) {
      if (error.message?.startsWith('RATE_LIMIT')) {
        showToast('Slow down a little — wait a few seconds before sending again.');
      } else {
        showToast('Message failed to send. Try again.');
        console.warn('Failed to send message:', error.message);
      }
      return;
    }

    setText('');
    cooldownRef.current?.start();
  }

  async function handleAttachmentSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session?.user || cooldownPercent > 0 || uploading) return;

    setUploading(true);
    const path = `${session.user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);

    if (uploadError) {
      setUploading(false);
      showToast('Upload failed. Try again.');
      console.warn('Failed to upload media:', uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
    const mediaType = guessMediaType(file);

    const { error: insertError } = await supabase.from('group_messages').insert({
      group_id: group.id,
      user_id: session.user.id,
      sender_name: session.user.user_metadata?.username || 'anonymous',
      media_url: publicUrlData.publicUrl,
      media_type: mediaType,
    });

    setUploading(false);

    if (insertError) {
      if (insertError.message?.startsWith('RATE_LIMIT')) {
        showToast('Slow down a little — wait a few seconds before sending again.');
      } else {
        showToast('Message failed to send. Try again.');
        console.warn('Failed to send media message:', insertError.message);
      }
      return;
    }

    cooldownRef.current?.start();
  }

  // ---- Render states -------------------------------------------------

  if (groupStatus === 'loading' || !slug) {
    return <CenteredMessage text="Loading…" />;
  }

  if (groupStatus === 'not-found') {
    return <CenteredMessage text="Group not found." showHomeLink />;
  }

  if (groupStatus === 'error') {
    return <CenteredMessage text="Something went wrong loading this group." showHomeLink />;
  }

  const ownUserId = session?.user?.id;
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
        <a href="https://anonroom.in" style={{ color: 'var(--blue)', fontSize: 20, textDecoration: 'none' }}>
          ←
        </a>
        {group.cover_url ? (
          <img src={group.cover_url} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              width: 34, height: 34, borderRadius: 9, background: 'var(--bubble-them)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            #
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 16 }}>{group.name}</span>
          {group.description && (
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>{group.description}</span>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messagesLoading && <CenteredMessage text="Loading messages…" inline />}

        {!messagesLoading && messages.length === 0 && (
          <CenteredMessage text="No messages yet. Say hello 👋" inline />
        )}

        {!messagesLoading &&
          messages.map((message) => {
            const isOwn = ownUserId && message.user_id === ownUserId;
            const key = dayKey(message.created_at);
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
                      {formatDayLabel(message.created_at)}
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
                  {!isOwn && (
                    <button
                      onClick={() => setProfileCardUserId(message.user_id)}
                      style={{
                        border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 12, fontWeight: 600, color: 'var(--dim)', marginBottom: 3, marginLeft: 4,
                      }}
                    >
                      {message.sender_name}
                    </button>
                  )}

                  <div
                    style={{
                      maxWidth: '75%', padding: message.media_url ? 4 : '10px 14px',
                      borderRadius: 16,
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

      {/* Composer / sign-in banner */}
      {session ? (
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
      ) : (
        <div
          className="glass-strong"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderRadius: 0, position: 'sticky', bottom: 0,
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--ink)' }}>Sign in to send a message</span>
          <button onClick={() => setAuthOpen(true)} style={primaryButtonStyle}>
            Sign In
          </button>
        </div>
      )}

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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />

      <ProfileCard
        userId={profileCardUserId}
        open={profileCardUserId !== null}
        onClose={() => setProfileCardUserId(null)}
        onMessage={(userId) => {
          if (!session) {
            setAuthOpen(true);
            return;
          }
          setDmThreadUserId(userId);
        }}
      />

      <MediaViewer
        mediaUrl={viewerMedia?.url}
        mediaType={viewerMedia?.type}
        open={viewerMedia !== null}
        onClose={() => setViewerMedia(null)}
      />

      {dmThreadUserId && (
        <div
          onClick={() => setDmThreadUserId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-strong pop-in"
            style={{ width: 420, maxWidth: '100%', maxHeight: '80vh', padding: 20, position: 'relative' }}
          >
            <button
              onClick={() => setDmThreadUserId(null)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%',
                border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer', zIndex: 1,
              }}
            >
              ✕
            </button>
            <DirectMessages openThreadWithUserId={dmThreadUserId} />
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredMessage({ text, showHomeLink, inline }) {
  return (
    <div
      style={
        inline
          ? { textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '24px 0' }
          : { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg)' }
      }
    >
      <p style={{ margin: 0, color: 'var(--dim)', fontSize: inline ? 14 : 16 }}>{text}</p>
      {showHomeLink && (
        <a href="https://anonroom.in" style={{ color: 'var(--blue)', fontSize: 14, textDecoration: 'none' }}>
          ← Back to anonroom.in
        </a>
      )}
    </div>
  );
}

const primaryButtonStyle = {
  padding: '8px 18px', borderRadius: 10, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
