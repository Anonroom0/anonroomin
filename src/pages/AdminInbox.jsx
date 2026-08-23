import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AdminInbox() {
  const { session, profile, isAdmin, loading } = useAuth();
  const adminId = session?.user?.id;

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThread, setActiveThread] = useState(null); // { id, otherUser }
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSlug, setGroupSlug] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupCoverUrl, setGroupCoverUrl] = useState('');
  const [groupError, setGroupError] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createdGroupUrl, setCreatedGroupUrl] = useState('');
  const [toast, setToast] = useState('');

  const scrollRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(''), 3000);
  }

  // ---- Load threads involving the admin ---------------------------------
  useEffect(() => {
    if (!isAdmin || !adminId) {
      setThreadsLoading(false);
      return;
    }
    let isMounted = true;
    setThreadsLoading(true);

    async function loadThreads() {
      const { data: threadRows, error: threadsError } = await supabase
        .from('dm_threads')
        .select('id, user_a, user_b, created_at')
        .or(`user_a.eq.${adminId},user_b.eq.${adminId}`)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (threadsError) {
        console.warn('Failed to load admin threads:', threadsError.message);
        setThreads([]);
        setThreadsLoading(false);
        return;
      }

      const otherIds = (threadRows || []).map((t) => (t.user_a === adminId ? t.user_b : t.user_a));
      let profilesById = {};

      if (otherIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', otherIds);
        profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
      }

      const enriched = await Promise.all(
        (threadRows || []).map(async (t) => {
          const otherId = t.user_a === adminId ? t.user_b : t.user_a;
          const { data: latest } = await supabase
            .from('dm_messages')
            .select('is_group_request, created_at')
            .eq('thread_id', t.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...t,
            otherUser: profilesById[otherId] || { id: otherId, username: 'Unknown user' },
            isGroupRequest: latest?.is_group_request === true,
          };
        })
      );

      if (!isMounted) return;
      setThreads(enriched);
      setThreadsLoading(false);
    }

    loadThreads();
    return () => {
      isMounted = false;
    };
  }, [isAdmin, adminId]);

  // ---- Thread view: load + subscribe -------------------------------------
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
        if (error) console.warn('Failed to load thread messages:', error.message);
        setMessages(data || []);
        setMessagesLoading(false);
      });

    const channel = supabase
      .channel(`admin_dm_messages:${activeThread.id}`)
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

  async function handleReply(e) {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || !activeThread || !adminId || sending) return;

    setSending(true);
    const { error } = await supabase.from('dm_messages').insert({
      thread_id: activeThread.id,
      sender_id: adminId,
      text: trimmed,
    });
    setSending(false);

    if (error) {
      if (error.message?.startsWith('RATE_LIMIT')) {
        showToast('Slow down a little — wait a few seconds before sending again.');
      } else {
        showToast('Reply failed to send. Try again.');
        console.warn('Failed to send admin reply:', error.message);
      }
      return;
    }

    setReplyText('');
  }

  function resetGroupForm() {
    setGroupName('');
    setGroupSlug('');
    setGroupDescription('');
    setGroupCoverUrl('');
    setGroupError('');
    setCreatedGroupUrl('');
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    setGroupError('');
    setCreatedGroupUrl('');

    const trimmedName = groupName.trim();
    const trimmedSlug = groupSlug.trim().toLowerCase();

    if (!trimmedName) {
      setGroupError('Group name is required.');
      return;
    }
    if (!SLUG_PATTERN.test(trimmedSlug)) {
      setGroupError('Slug must be lowercase letters, numbers, and hyphens only (e.g. "my-group").');
      return;
    }

    setCreatingGroup(true);

    const { data: existing, error: checkError } = await supabase
      .from('groups')
      .select('id')
      .eq('slug', trimmedSlug)
      .maybeSingle();

    if (checkError) {
      setCreatingGroup(false);
      setGroupError('Could not verify slug availability. Try again.');
      console.warn('Slug check failed:', checkError.message);
      return;
    }
    if (existing) {
      setCreatingGroup(false);
      setGroupError('That slug is already taken.');
      return;
    }

    const { error: insertError } = await supabase.from('groups').insert({
      slug: trimmedSlug,
      name: trimmedName,
      description: groupDescription.trim() || null,
      cover_url: groupCoverUrl.trim() || null,
      created_by: adminId,
    });

    setCreatingGroup(false);

    if (insertError) {
      setGroupError(insertError.message);
      return;
    }

    setCreatedGroupUrl(`https://${trimmedSlug}.anonroom.in`);
    showToast('Group created!');
    setGroupName('');
    setGroupSlug('');
    setGroupDescription('');
    setGroupCoverUrl('');
  }

  // ---- Guard --------------------------------------------------------------
  if (loading) {
    return <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Loading…</p>;
  }

  if (!isAdmin) {
    // Real enforcement lives in the `groups` RLS insert policy — this is
    // just the UI-level guard so non-admins never see the admin screen.
    return (
      <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '40px 0' }}>
        Not authorized.
      </p>
    );
  }

  // ---- Thread view ----------------------------------------------------
  if (activeThread) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setActiveThread(null)}
            style={{ border: 'none', background: 'none', color: 'var(--blue)', fontSize: 18, cursor: 'pointer' }}
          >
            ←
          </button>
          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{activeThread.otherUser.username}</span>
        </div>

        <div ref={scrollRef} className="glass-panel" style={{ padding: 14, maxHeight: 420, overflowY: 'auto' }}>
          {messagesLoading && <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Loading…</p>}
          {!messagesLoading && messages.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>No messages yet.</p>
          )}
          {!messagesLoading &&
            messages.map((message) => {
              const isOwn = message.sender_id === adminId;
              return (
                <div
                  key={message.id}
                  className="pop-in"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: 10 }}
                >
                  <div
                    style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: 16,
                      borderBottomRightRadius: isOwn ? 4 : 16,
                      borderBottomLeftRadius: isOwn ? 16 : 4,
                      background: isOwn ? 'var(--blue)' : 'var(--bubble-them)',
                      color: isOwn ? '#fff' : 'var(--ink)',
                    }}
                  >
                    {message.is_group_request && (
                      <span
                        style={{
                          display: 'inline-block', fontSize: 10, fontWeight: 700, marginBottom: 4,
                          color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--blue)',
                        }}
                      >
                        GROUP REQUEST
                      </span>
                    )}
                    <div style={{ fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {message.text || (message.media_url ? '📄 Attachment' : '')}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{formatTime(message.created_at)}</span>
                </div>
              );
            })}
        </div>

        <form onSubmit={handleReply} style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply"
            style={{
              flex: 1, border: '1px solid var(--glass-border)', outline: 'none',
              background: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '10px 14px',
              fontSize: 15, color: 'var(--ink)',
            }}
          />
          <button type="submit" disabled={!replyText.trim() || sending} style={primaryButtonStyle}>
            Send
          </button>
        </form>
      </div>
    );
  }

  // ---- Inbox + Create Group --------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Admin Inbox</p>
        <button
          onClick={() => {
            setShowCreateGroup((v) => !v);
            resetGroupForm();
          }}
          style={secondaryButtonStyle}
        >
          {showCreateGroup ? 'Close' : '+ Create Group'}
        </button>
      </div>

      {showCreateGroup && (
        <form onSubmit={handleCreateGroup} className="glass-panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text" placeholder="Name" value={groupName}
            onChange={(e) => setGroupName(e.target.value)} style={inputStyle}
          />
          <input
            type="text" placeholder="Slug (e.g. my-group)" value={groupSlug}
            onChange={(e) => setGroupSlug(e.target.value)} style={inputStyle}
          />
          <textarea
            placeholder="Description (optional)" value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <input
            type="text" placeholder="Cover image URL (optional)" value={groupCoverUrl}
            onChange={(e) => setGroupCoverUrl(e.target.value)} style={inputStyle}
          />

          {groupError && <p style={{ margin: 0, fontSize: 13, color: 'var(--red)' }}>{groupError}</p>}
          {createdGroupUrl && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--green)' }}>
              Live at <a href={createdGroupUrl} style={{ color: 'var(--blue)' }}>{createdGroupUrl}</a>
            </p>
          )}

          <button type="submit" disabled={creatingGroup} style={primaryButtonStyle}>
            {creatingGroup ? 'Creating…' : 'Create Group'}
          </button>
        </form>
      )}

      {threadsLoading && <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Loading…</p>}

      {!threadsLoading && threads.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, padding: '16px 0' }}>
          No messages yet.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {threads.map((thread) => (
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
            {thread.isGroupRequest && (
              <span
                style={{
                  fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--blue)',
                  borderRadius: 8, padding: '3px 8px',
                }}
              >
                GROUP REQUEST
              </span>
            )}
          </button>
        ))}
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(28,28,30,0.85)', color: '#fff', padding: '10px 18px',
            borderRadius: 12, fontSize: 13, zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: '10px 14px', borderRadius: 10, border: '1px solid var(--glass-border)',
  background: 'rgba(255,255,255,0.7)', fontSize: 14, color: 'var(--ink)', outline: 'none',
};

const primaryButtonStyle = {
  padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

const secondaryButtonStyle = {
  padding: '8px 16px', borderRadius: 10, border: '1px solid var(--glass-border)',
  background: 'transparent', color: 'var(--blue)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
