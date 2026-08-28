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
 * getOrCreateVisitorId() instead. No sign-in wall is ever shown here — a
 * small, optional "Sign up" pill is offered in the header for a signed-out
 * visitor who wants one, but nothing in the reply flow requires it.
 *
 * NEW: Reply-to-story. When the signed-in viewer IS the question's author
 * (session.user.id === question.author_id), every reply bubble gets a small
 * share icon. Tapping it hands that single reply off to onShareReply, which
 * Home.jsx wires to <ShareStorySheet> OR handles it locally if mounted standalone.
 *
 * KEYBOARD HANDLING: the root wrapper tracks window.visualViewport height
 * instead of trusting 100dvh — on iOS/Android the layout viewport doesn't
 * shrink when the keyboard opens, only the visual viewport does, which is
 * why the composer used to end up hidden behind the keyboard. See
 * useVisualViewportHeight() below.
 *
 * AUTOFILL HANDLING: the reply input is mounted readOnly and only becomes
 * editable on focus, uses a randomized `name` per mount, type="text" (not
 * "search", which invites native search-history suggestions), and
 * autoComplete="new-password" as the strongest available anti-autofill
 * signal. This is a public anonymous field — nothing should ever be
 * pre-filled into it by a password manager or browser autofill.
 *
 * Dependencies: React, Supabase, AuthContext, src/lib/visitorId.js,
 * src/lib/subdomain.js, src/components/MessageSkeleton.jsx,
 * src/components/SendButton.jsx, src/pages/AuthModal.jsx,
 * src/components/questions/ShareStorySheet.jsx
 * ============================================================================
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { getOrCreateVisitorId } from '../lib/visitorId';
import { ROOT_PATH, isShortId } from '../lib/subdomain';
import { showToast, friendlyDbError } from '../lib/toast';
import { playSend } from '../lib/soundManager';
import { hapticSend } from '../lib/haptics';
import MessageSkeleton from '../components/shared/MessageSkeleton';
import SendButton from '../components/shared/SendButton';
import AuthModal from './AuthModal';
import ShareStorySheet from '../components/questions/ShareStorySheet';

// ============================================================================
// 1. CONSTANTS
// ============================================================================
const REPLY_LIMIT = 200; // mirrors GroupChat.jsx's MESSAGE_LIMIT

const TYPE_META = {
  personal: { label: 'Personal', gradient: 'linear-gradient(135deg, var(--ember) 0%, #ff9966 100%)' },
  general: { label: 'General', gradient: 'linear-gradient(135deg, var(--signal) 0%, #6be0d0 100%)' },
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
  Ghost: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  ),
  Lock: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
  User: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Share: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
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

function extractQuestionBodyText(row) {
  return row?.text ?? row?.body ?? row?.content ?? row?.question_text ?? '';
}

function extractReplyBodyText(row) {
  return row?.reply_text ?? row?.text ?? row?.body ?? row?.content ?? '';
}

// ============================================================================
// 3b. VIEWPORT HOOK (keyboard-safe height)
// ============================================================================

/**
 * Tracks window.visualViewport.height instead of trusting 100dvh / 100vh.
 * On iOS Safari (and many Android browsers) the *layout* viewport does not
 * shrink when the on-screen keyboard opens — only the *visual* viewport
 * does. A container sized with 100dvh stays full-height and the keyboard
 * simply covers whatever is at the bottom (our composer). Sizing the root
 * wrapper to this value instead makes flex layout push the composer up
 * above the keyboard, since it's a flexShrink:0 child of a container that
 * has actually gotten shorter.
 */
function useVisualViewportHeight() {
  const getHeight = () =>
    typeof window !== 'undefined' && window.visualViewport
      ? window.visualViewport.height
      : typeof window !== 'undefined'
      ? window.innerHeight
      : 0;

  const [vh, setVh] = useState(getHeight);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const update = () => setVh(vv.height);
    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return vh;
}

// ============================================================================
// 4. SUB-COMPONENTS
// ============================================================================

function QuestionHeaderCard({ question, isPrivate, isAuthor }) {
  const normalizedType = (question?.question_type || question?.type || 'general').toLowerCase();
  const typeMeta = TYPE_META[normalizedType] || TYPE_META.general;

  return (
    <div
      style={{
        margin: '16px 16px 8px',
        padding: '20px 22px',
        borderRadius: 22,
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(115%)',
        WebkitBackdropFilter: 'blur(20px) saturate(115%)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        color: 'var(--paper)',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: typeMeta.gradient,
          opacity: 0.18,
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, position: 'relative' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            background: typeMeta.gradient,
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {typeMeta.label}
        </span>

        {isPrivate && (
          <span
            title={isAuthor ? 'Only you can see who replies' : 'Replies here are private'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 999,
              background: 'var(--glass-border)',
              color: 'var(--dim)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {Icons.Lock} Private replies
          </span>
        )}
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 18, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 700, position: 'relative' }}>
        {extractQuestionBodyText(question)}
      </p>
      <span style={{ display: 'block', marginTop: 12, fontSize: 12, color: 'var(--dim)', position: 'relative' }}>
        {formatRelativeTime(question?.created_at)}
      </span>
    </div>
  );
}

function ReplyBubble({ reply, isOwn, canShare, onShare }) {
  return (
    <div
      className={isOwn ? 'bubble-enter-outgoing' : 'bubble-enter'}
      style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px', marginBottom: 14 }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          padding: '14px 18px',
          borderRadius: 20,
          background: isOwn
            ? 'linear-gradient(135deg, var(--ink-2) 0%, #23242e 100%)'
            : 'var(--glass-white)',
          border: `1px solid ${isOwn ? 'rgba(255,107,53,0.25)' : 'var(--glass-border)'}`,
          backdropFilter: 'blur(20px) saturate(115%)',
          WebkitBackdropFilter: 'blur(20px) saturate(115%)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          color: 'var(--paper)',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {isOwn && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--ember)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            {Icons.Ghost} You (anonymous)
          </span>
        )}
        <p style={{ margin: 0, paddingRight: canShare ? 34 : 0, fontSize: 15, fontWeight: 600, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {extractReplyBodyText(reply)}
        </p>
        <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>
          {formatRelativeTime(reply.created_at)}
        </span>

        {canShare && (
          <button
            type="button"
            onClick={() => onShare?.(reply)}
            aria-label="Share this reply to your story"
            title="Share this reply to your story"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--glass-border)',
              color: 'var(--paper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {Icons.Share}
          </button>
        )}
      </div>
    </div>
  );
}

function IdentityPill({ session, profile, onSignUp }) {
  if (session?.user) {
    const label = profile?.username || 'Signed in';
    return (
      <span
        title={`Signed in as ${label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          background: 'var(--glass-border)',
          color: 'var(--paper)',
          fontSize: 12,
          fontWeight: 700,
          maxWidth: 160,
          overflow: 'hidden',
        }}
      >
        {Icons.User}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onSignUp}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 999,
        border: '1px solid var(--glass-border)',
        background: 'transparent',
        color: 'var(--dim)',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      Sign up
    </button>
  );
}

// ============================================================================
// 5. MAIN COMPONENT
// ============================================================================

export default function QuestionThread({ questionId, onBack, onShareReply }) {
  const { session, profile } = useAuth();
  const ownUserId = session?.user?.id || null;

  const [question, setQuestion] = useState(null);
  const [questionStatus, setQuestionStatus] = useState('loading');

  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(true);

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [addToConfessions, setAddToConfessions] = useState(false);
  const [visitorId, setVisitorId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  // Local state for standalone sharing
  const [sharingReplyLocal, setSharingReplyLocal] = useState(null);

  // Anti-autofill: field starts readOnly and only becomes editable once the
  // user actually focuses it. Combined with a randomized `name` below, this
  // stops browsers/password managers from populating it on mount.
  const [replyFieldLocked, setReplyFieldLocked] = useState(true);
  const replyFieldNameRef = useRef(`rf-${Math.random().toString(36).slice(2)}`);

  const scrollRef = useRef(null);
  const composerInputRef = useRef(null);

  // Keyboard-safe height for the whole page (see useVisualViewportHeight above).
  const viewportHeight = useVisualViewportHeight();

  const isAuthor = !!(ownUserId && question?.author_id && ownUserId === question.author_id);
  const isPrivate = !!question?.is_private;

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
      let result;
      if (isShortId(questionId)) {
        result = await supabase.from('questions').select('*').eq('link_id', questionId).order('created_at', { ascending: false }).limit(1).maybeSingle();
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
    if (onBack) {
      onBack();
      return;
    }
    window.location.href = ROOT_PATH;
  }

  // --------------------------------------------------------------------------
  // REPLY COMPOSER
  // --------------------------------------------------------------------------
  function isOwnReply(reply) {
    if (ownUserId) return reply.replier_id === ownUserId;
    return !!visitorId && reply.visitor_id === visitorId;
  }

  function handleComposerFocus() {
    setReplyFieldLocked(false);
    // Nudge the composer into view above the keyboard once it opens. The
    // rAF gives the keyboard-open resize a moment to fire first.
    requestAnimationFrame(() => {
      composerInputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }

  async function handleSendReply(e) {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || !question?.id || sending) return;

    setSending(true);

    const localId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localCreatedAt = new Date().toISOString();

    const replyPayload = {
      id: localId,
      question_id: question.id,
      reply_text: trimmed,
      replier_id: ownUserId || null,
      visitor_id: ownUserId ? null : visitorId || getOrCreateVisitorId(),
      is_anon: true,
      created_at: localCreatedAt,
    };

    const { error: replyError } = await supabase.from('question_replies').insert(replyPayload);

    if (replyError) {
      console.error(replyError);
      showToast(friendlyDbError(), 'error');
      setSending(false);
      return;
    }

    playSend();
    hapticSend();
    setReplies((prev) => (prev.some((r) => r.id === replyPayload.id) ? prev : [replyPayload, ...prev]));

    if (isAuthor && addToConfessions) {
      const questionExcerpt = extractQuestionBodyText(question).slice(0, 140).trim();
      const taggedText = questionExcerpt ? `❓ Re: "${questionExcerpt}"\n\n${trimmed}` : trimmed;
      const { error: confessionError } = await supabase.from('confessions').insert({
        text: taggedText,
        visibility: 'public',
        group_id: null,
        is_anon: true,
      });
      if (confessionError) {
        console.error(confessionError);
        showToast("Reply sent, but couldn't add it to confessions.", 'error');
      } else {
        showToast('Reply sent and added to Confessions', 'success');
      }
    }

    setReplyText('');
    setAddToConfessions(false);
    setSending(false);
  }

  // --------------------------------------------------------------------------
  // SHARE-TO-STORY (author only — see file banner)
  // --------------------------------------------------------------------------
  function handleShareReply(reply) {
    if (!isAuthor) return; // defensive

    // If mounted by Home.jsx, pass it up. Otherwise, open local sheet.
    if (onShareReply) {
      onShareReply(question, reply);
    } else {
      setSharingReplyLocal(reply);
    }
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Was: height: '100dvh'. On iOS/Android the layout viewport doesn't
        // shrink when the keyboard opens, so 100dvh left the composer
        // hidden under the keyboard. window.visualViewport.height does
        // shrink, so we track it live via useVisualViewportHeight().
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
        width: '100%',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 0%, rgba(255,107,53,0.06), transparent 55%), var(--ink)',
      }}
    >
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
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--paper)', flex: 1 }}>Anonymous Question</span>

        <IdentityPill session={session} profile={profile} onSignUp={() => setAuthOpen(true)} />
      </header>

      <QuestionHeaderCard question={question} isPrivate={isPrivate} isAuthor={isAuthor} />

      <div
        ref={scrollRef}
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column-reverse',
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {repliesLoading && <MessageSkeleton variant="message" count={4} />}

        {!repliesLoading && replies.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ background: 'var(--glass-border)', display: 'inline-block', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>
                No responses yet
              </div>
              <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.4 }}>
                {isPrivate
                  ? (isAuthor
                      ? 'Responses to this question are private — only you can see them.'
                      : 'Your response will only be visible to the question owner.')
                  : 'Be the first to share an honest, anonymous response.'}
              </p>
            </div>
          </div>
        )}

        {!repliesLoading &&
          replies.map((reply) => (
            <ReplyBubble
              key={reply.id}
              reply={reply}
              isOwn={isOwnReply(reply)}
              canShare={isAuthor}
              onShare={handleShareReply}
            />
          ))}
      </div>

      <div style={{ flexShrink: 0, zIndex: 20, background: 'var(--glass-white)', backdropFilter: 'blur(20px) saturate(115%)', WebkitBackdropFilter: 'blur(20px) saturate(115%)', borderTop: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 0' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'var(--glass-border)',
              color: 'var(--dim)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {Icons.Ghost} Your identity stays hidden
          </span>
          {isPrivate && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--glass-border)',
                color: 'var(--dim)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {Icons.Lock} Private
            </span>
          )}
        </div>

        {isAuthor && addToConfessions && (
          <div style={{ padding: '8px 16px 0', fontSize: 12, color: 'var(--dim)' }}>
            This reply will also be posted to Confessions.
          </div>
        )}
        <form onSubmit={handleSendReply} autoComplete="off" data-form-type="other" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
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
                background: addToConfessions ? 'var(--ember)' : 'var(--glass-border)',
                color: addToConfessions ? '#fff' : 'var(--dim)',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {Icons.Ghost}
            </button>
          )}
          <input
            ref={composerInputRef}
            type="text"
            name={replyFieldNameRef.current}
            readOnly={replyFieldLocked}
            onFocus={handleComposerFocus}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write an honest, anonymous response…"
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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signup" onVerified={() => setAuthOpen(false)} />

      {/* Renders locally when mounted standalone without Home.jsx overriding it */}
      {sharingReplyLocal && (
        <ShareStorySheet
          mode="reply"
          open={!!sharingReplyLocal}
          onClose={() => setSharingReplyLocal(null)}
          question={question}
          reply={sharingReplyLocal}
        />
      )}
    </div>
  );
}
