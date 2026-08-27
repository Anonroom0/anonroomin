/**
 * ============================================================================
 * QUESTION THREAD (STANDALONE ANONYMOUS Q&A PAGE — /q/<id>)
 * ============================================================================
 * Mounted directly by App.jsx at the root-domain path /q/<id>, OUTSIDE any
 * auth gate — this page must fully work for a signed-out visitor. It shows
 * one `questions` row as a header card, then a GroupChat-style scrollable,
 * realtime-subscribed (same postgres_changes INSERT/DELETE pattern
 * GroupChat.jsx uses) list of that question's `question_replies`.
 *
 * Identity display: replies always render as centered, anonymous-looking
 * bubbles — display parity with NGL. This holds regardless of a reply row's
 * stored `is_anon` value; unlike GroupChat's messages, there is no
 * "authenticated senders show their name" branch here at all. New replies
 * are inserted marked `is_anon: true` for the same reason: nothing about a
 * replier is ever meant to surface in this UI, logged in or not.
 *
 * Reply composer works for every visitor: signed-in viewers attach
 * `replier_id`; signed-out visitors get a stable `visitor_id` from
 * getOrCreateVisitorId() instead. No sign-in wall is ever shown here.
 *
 * Author-only "Add to confessions": when the signed-in viewer IS the
 * question's author (session.user.id === question.author_id), the composer
 * exposes a toggle that — alongside the normal reply insert — also inserts
 * the same text into the standalone `confessions` table (visibility
 * 'public', group_id null). This is a different table/flow than GroupChat's
 * in-chat "is_confession" group_messages, matching the global confessions
 * feed the app already routes to at /confessions.
 *
 * Dependencies: React, Supabase, AuthContext, src/lib/visitorId.js,
 * src/lib/subdomain.js, src/components/MessageSkeleton.jsx,
 * src/components/SendButton.jsx
 * ============================================================================
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { getOrCreateVisitorId } from '../lib/visitorId';
import { ROOT_PATH, isShortId, shortIdPrefixFilter } from '../lib/subdomain';
import { showToast, friendlyDbError } from '../lib/toast';
import MessageSkeleton from '../components/shared/MessageSkeleton';
import SendButton from '../components/shared/SendButton';

// ============================================================================
// 1. CONSTANTS
// ============================================================================
const REPLY_LIMIT = 200; // mirrors GroupChat.jsx's MESSAGE_LIMIT

const TYPE_META = {
  personal: { label: 'Personal' },
  general: { label: 'General' },
};

// ============================================================================
// 2. INLINE ICONS
// ============================================================================
const Icons = {
  Back: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  ),
  // Reuses the app's existing anonymous/"ghost" motif (GroupChat.jsx uses
  // the same shape both for its anon-mode toggle and its confession entry
  // point), so this toggle reads consistently with that vocabulary.
  Ghost: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  ),
  Spinner: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
};

// ============================================================================
// 3. HELPERS
// ============================================================================

/** Short relative time — "now" / "12m" / "3h" / "5d" / "Mar 4". */
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Column name is a judgment call, same fallback chain used in
// QuestionCard.jsx — the `questions`/`question_replies` schema wasn't
// attached, so this hedges across the most likely body-text columns rather
// than assuming one and rendering blank if it's wrong.
function extractBodyText(row) {
  return row?.body ?? row?.content ?? row?.text ?? row?.question_text ?? '';
}

// ============================================================================
// 4. SUB-COMPONENTS
// ============================================================================

function QuestionHeaderCard({ question }) {
  const normalizedType = (question?.type || 'general').toLowerCase();
  const typeMeta = TYPE_META[normalizedType] || TYPE_META.general;

  return (
    <div
      style={{
        margin: '16px 16px 8px',
        padding: '18px 20px',
        borderRadius: 20, // token: cards/rows radius
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(115%)',
        WebkitBackdropFilter: 'blur(20px) saturate(115%)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        color: 'var(--paper)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: 999,
          background: 'var(--glass-border)',
          color: 'var(--dim)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {typeMeta.label}
      </span>
      <p style={{ margin: '10px 0 0', fontSize: 17, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {extractBodyText(question)}
      </p>
      <span style={{ display: 'block', marginTop: 10, fontSize: 12, color: 'var(--dim)' }}>
        {formatRelativeTime(question?.created_at)}
      </span>
    </div>
  );
}

function ReplyBubble({ reply, isOwn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px', marginBottom: 14 }}>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          padding: '14px 18px',
          borderRadius: 20, // token: cards/rows radius
          background: isOwn ? 'var(--ink-2)' : 'var(--glass-white)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(20px) saturate(115%)',
          WebkitBackdropFilter: 'blur(20px) saturate(115%)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          color: 'var(--paper)',
          boxSizing: 'border-box',
        }}
      >
        {isOwn && (
          <span
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--dim)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            You
          </span>
        )}
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {extractBodyText(reply)}
        </p>
        <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>
          {formatRelativeTime(reply.created_at)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 5. MAIN COMPONENT
// ============================================================================

export default function QuestionThread({ questionId }) {
  const { session } = useAuth();
  const ownUserId = session?.user?.id || null;

  const [question, setQuestion] = useState(null);
  const [questionStatus, setQuestionStatus] = useState('loading');

  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(true);

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [addToConfessions, setAddToConfessions] = useState(false);
  const [visitorId, setVisitorId] = useState(null);

  const scrollRef = useRef(null);

  const isAuthor = !!(ownUserId && question?.author_id && ownUserId === question.author_id);

  // --------------------------------------------------------------------------
  // ANONYMOUS VISITOR ID (only needed when signed out)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!ownUserId) {
      setVisitorId(getOrCreateVisitorId());
    }
  }, [ownUserId]);

  // --------------------------------------------------------------------------
  // LOAD THE QUESTION
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    setQuestionStatus('loading');

    async function loadQuestion() {
      // /q/<id> now carries a short (8 hex char) id rather than the full
      // uuid — see toShortId() in subdomain.js. Old links shared before
      // that change still carry a full uuid, so both shapes are handled
      // here: an exact match for a real uuid, a prefix match (cast to text,
      // since uuid columns don't support LIKE/ILIKE directly) otherwise.
      let result;
      if (isShortId(questionId)) {
        const { column, operator, value } = shortIdPrefixFilter('id', questionId);
        result = await supabase.from('questions').select('*').filter(column, operator, value).order('created_at', { ascending: false }).limit(1).maybeSingle();
      } else {
        result = await supabase.from('questions').select('*').eq('id', questionId).maybeSingle();
      }
      const { data, error } = result;

      if (cancelled) return;
      if (error || !data) {
        setQuestionStatus('error');
      } else {
        setQuestion(data);
        setQuestionStatus('ready');
      }
    }

    loadQuestion();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  // --------------------------------------------------------------------------
  // LOAD + SUBSCRIBE TO REPLIES (same postgres_changes pattern as GroupChat)
  // --------------------------------------------------------------------------
  const fetchReplies = useCallback(async () => {
    if (!question?.id) return;
    const { data, error } = await supabase
      .from('question_replies')
      .select('*')
      .eq('question_id', question.id)
      .order('created_at', { ascending: false })
      .limit(REPLY_LIMIT);

    if (!error) {
      setReplies(data || []);
    }
    setRepliesLoading(false);
  }, [question?.id]);

  useEffect(() => {
    if (!question?.id) return;
    fetchReplies();

    const channel = supabase
      .channel(`question_replies:${question.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'question_replies', filter: `question_id=eq.${question.id}` },
        (payload) => {
          const newReply = payload.new;
          setReplies((prev) => (prev.some((r) => r.id === newReply.id) ? prev : [newReply, ...prev]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'question_replies', filter: `question_id=eq.${question.id}` },
        (payload) => {
          setReplies((prev) => prev.filter((r) => r.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [question?.id, fetchReplies]);

  // --------------------------------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------------------------------
  function handleBack() {
    // Full navigation rather than history.pushState: this page is mounted
    // directly by App.jsx outside Home.jsx's own route-resolution state, so
    // there's no local sidebar/detail state here that a pushState-only
    // change would update — a real navigation is the reliable choice.
    window.location.href = ROOT_PATH;
  }

  // --------------------------------------------------------------------------
  // REPLY COMPOSER
  // --------------------------------------------------------------------------
  function isOwnReply(reply) {
    if (ownUserId) return reply.replier_id === ownUserId;
    return !!visitorId && reply.visitor_id === visitorId;
  }

  async function handleSendReply(e) {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || !question?.id || sending) return;

    setSending(true);

    const replyPayload = {
      question_id: question.id,
      text: trimmed,
      replier_id: ownUserId || null,
      visitor_id: ownUserId ? null : visitorId || getOrCreateVisitorId(),
      // UI never surfaces who replied regardless of this flag (see header
      // comment), so replies are marked anonymous by default too.
      is_anon: true,
    };

    const { error: replyError } = await supabase.from('question_replies').insert(replyPayload);

    if (replyError) {
      console.error(replyError);
      showToast(friendlyDbError(), 'error');
      setSending(false);
      return;
    }

    if (isAuthor && addToConfessions) {
      const { error: confessionError } = await supabase.from('confessions').insert({
        text: trimmed,
        visibility: 'public',
        group_id: null,
        user_id: ownUserId,
        is_anon: true, // judgment call: confessions read as anonymous-by-default app-wide
      });
      if (confessionError) {
        console.error(confessionError);
        showToast("Reply sent, but couldn't add it to confessions.", 'error');
      }
    }

    setReplyText('');
    setAddToConfessions(false);
    setSending(false);
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  if (questionStatus === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', background: 'var(--ink)', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--dim)' }}>{Icons.Spinner}</div>
      </div>
    );
  }

  if (questionStatus === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', background: 'var(--ink)', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: 'var(--dim)', fontSize: 15 }}>This question couldn't be found.</p>
        <button
          onClick={handleBack}
          style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 20, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          Back to AnonRoom
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', background: 'var(--ink)' }}>
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'var(--glass-white)',
          backdropFilter: 'blur(20px) saturate(115%)',
          WebkitBackdropFilter: 'blur(20px) saturate(115%)',
          borderBottom: '1px solid var(--glass-border)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <button
          onClick={handleBack}
          aria-label="Back to AnonRoom"
          style={{ border: 'none', background: 'transparent', color: 'var(--paper)', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
        >
          {Icons.Back}
        </button>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--paper)' }}>Question</span>
      </header>

      <QuestionHeaderCard question={question} />

      <div
        ref={scrollRef}
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column-reverse', // newest reply pinned to the bottom, same trick GroupChat.jsx uses
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {repliesLoading && <MessageSkeleton variant="message" count={4} />}

        {!repliesLoading && replies.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--glass-border)', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: 'var(--dim)' }}>
              Be the first to reply
            </div>
          </div>
        )}

        {!repliesLoading &&
          replies.map((reply) => <ReplyBubble key={reply.id} reply={reply} isOwn={isOwnReply(reply)} />)}
      </div>

      <div style={{ flexShrink: 0, zIndex: 20, background: 'var(--glass-white)', backdropFilter: 'blur(20px) saturate(115%)', WebkitBackdropFilter: 'blur(20px) saturate(115%)', borderTop: '1px solid var(--glass-border)' }}>
        {isAuthor && addToConfessions && (
          <div style={{ padding: '8px 16px 0', fontSize: 12, color: 'var(--dim)' }}>
            This reply will also be posted to Confessions.
          </div>
        )}
        <form onSubmit={handleSendReply} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          {isAuthor && (
            <button
              type="button"
              onClick={() => setAddToConfessions((v) => !v)}
              aria-pressed={addToConfessions}
              title={addToConfessions ? 'Will also post to Confessions' : 'Also add this reply to Confessions'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                flexShrink: 0,
                border: 'none',
                background: addToConfessions ? 'var(--glass-border)' : 'transparent',
                color: addToConfessions ? 'var(--paper)' : 'var(--dim)',
                cursor: 'pointer',
              }}
            >
              {Icons.Ghost}
            </button>
          )}
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Send an anonymous reply…"
            aria-label="Reply"
            disabled={sending}
            style={{
              flex: 1,
              border: '1px solid var(--glass-border)',
              outline: 'none',
              background: 'var(--ink-2)',
              color: 'var(--paper)',
              borderRadius: 24,
              padding: '12px 18px',
              fontSize: 15,
            }}
          />
          <SendButton canSend={!!replyText.trim()} sending={sending} cooldownPercent={0} />
        </form>
      </div>
    </div>
  );
}
