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
 * Reply-to-story: when the signed-in viewer IS the question's author
 * (session.user.id === question.author_id), every reply bubble gets a small
 * share icon. Tapping it hands that single reply off to onShareReply, which
 * Home.jsx wires to <ShareStorySheet> OR handles it locally if mounted
 * standalone.
 *
 * Layout below is split into small, single-purpose sub-components (section
 * 4) rather than one long JSX tree in the return statement — PageSkeleton,
 * ErrorState, QuestionHeaderCard, MetaChips, ReplyBubble, EmptyReplies and
 * ComposerBar each own one part of the screen, so the main component (section
 * 5) reads as a sequence of named regions instead of nested markup to parse.
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
import { useViewportHeight } from '../lib/useViewportHeight';
import { getOrCreateVisitorId } from '../lib/visitorId';
import { ROOT_PATH, isShortId, navigateInApp } from '../lib/subdomain';
import { showToast, friendlyDbError } from '../lib/toast';
import { playSend } from '../lib/soundManager';
import { hapticSend } from '../lib/haptics';
import SendButton from '../components/shared/SendButton';
import AuthModal from './AuthModal';
import ShareStorySheet from '../components/questions/ShareStorySheet';
import BbssmBanner from '../components/shared/BbssmBanner';

// ============================================================================
// 1. CONSTANTS
// ============================================================================
const REPLY_LIMIT = 200; // mirrors GroupChat.jsx's MESSAGE_LIMIT
const MAX_TEXT_LENGTH = 500;
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif';

const TYPE_META = {
  personal: { label: 'Personal', gradient: 'linear-gradient(135deg, var(--ember) 0%, #ff9966 100%)' },
  general: { label: 'General', gradient: 'linear-gradient(135deg, var(--signal) 0%, #6be0d0 100%)' },
};

// ============================================================================
// 2. INLINE ICONS
// ============================================================================
const Icons = {
  Back: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  ),
  Ghost: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin">
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  User: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Share: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  AlertBubble: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Sparkle: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
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
// 4. SUB-COMPONENTS
// ============================================================================

/**
 * A single, page-owned <style> block for the shimmer sweep the skeleton
 * pieces below use. Scoped by class name only (no CSS modules in this
 * project), defined once here rather than depending on a global stylesheet
 * having it already — this file stays self-contained.
 */
function SkeletonStyles() {
  return (
    <style>{`
      @keyframes qt-shimmer {
        0% { background-position: -300px 0; }
        100% { background-position: 300px 0; }
      }
      .qt-shimmer {
        background: linear-gradient(
          90deg,
          var(--glass-border) 25%,
          rgba(255,255,255,0.10) 37%,
          var(--glass-border) 63%
        );
        background-size: 600px 100%;
        animation: qt-shimmer 1.6s ease-in-out infinite;
      }
    `}</style>
  );
}

function SkeletonBar({ width = '100%', height = 12, radius = 6, style }) {
  return <div className="qt-shimmer" style={{ width, height, borderRadius: radius, ...style }} />;
}

function SkeletonReplyBubble({ align = 'center', width = '92%' }) {
  return (
    <div style={{ display: 'flex', justifyContent: align, padding: '4px 16px', marginBottom: 14 }}>
      <div style={{ width, maxWidth: 460, padding: '14px 18px', borderRadius: 20, background: 'var(--glass-white)', border: '1px solid var(--glass-border)' }}>
        <SkeletonBar width="88%" height={11} />
        <SkeletonBar width="56%" height={11} style={{ marginTop: 8 }} />
      </div>
    </div>
  );
}

/**
 * Replaces the old full-screen "spinner and nothing else" loading state.
 * Renders the real shell of the page immediately — header bar, a shimmering
 * stand-in for the question card, a couple of shimmering reply bubbles, and
 * a disabled composer — so the layout that's about to appear is legible
 * from the first frame instead of jumping in all at once behind a spinner.
 */
function PageSkeleton({ pageHeight, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: pageHeight, width: '100%', overflow: 'hidden', background: 'var(--ink)', fontFamily: FONT_STACK }}>
      <SkeletonStyles />
      <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--glass-white)', borderBottom: '1px solid var(--glass-border)' }}>
        <button onClick={onBack} aria-label="Back" style={{ border: 'none', background: 'transparent', color: 'var(--paper)', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}>
          {Icons.Back}
        </button>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--paper)', flex: 1, letterSpacing: '-0.01em' }}>Anonymous Question</span>
        <SkeletonBar width={64} height={24} radius={999} />
      </header>

      <div style={{ margin: '16px 16px 8px', padding: '20px 22px', borderRadius: 22, background: 'var(--glass-white)', border: '1px solid var(--glass-border)', flexShrink: 0 }}>
        <SkeletonBar width={84} height={20} radius={999} />
        <SkeletonBar width="94%" height={16} style={{ marginTop: 16 }} />
        <SkeletonBar width="68%" height={16} style={{ marginTop: 9 }} />
        <SkeletonBar width={44} height={11} style={{ marginTop: 16 }} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 8, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <SkeletonReplyBubble width="70%" />
        <SkeletonReplyBubble width="85%" />
        <SkeletonReplyBubble width="60%" />
      </div>

      <div style={{ flexShrink: 0, padding: '12px', borderTop: '1px solid var(--separator)', background: 'var(--composer-bg, var(--header-bg))' }}>
        <SkeletonBar height={44} radius={22} />
      </div>
    </div>
  );
}

function ErrorState({ onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--ink)', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: FONT_STACK, padding: 24, boxSizing: 'border-box', textAlign: 'center' }}>
      <div style={{ color: 'var(--dim)' }}>{Icons.AlertBubble}</div>
      <div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--paper)', letterSpacing: '-0.01em' }}>This question couldn't be found</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--dim)', lineHeight: 1.5 }}>It may have been removed, or the link may be out of date.</p>
      </div>
      <button
        onClick={onBack}
        style={{ background: 'var(--ember)', color: '#fff', border: 'none', padding: '13px 26px', borderRadius: 18, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
      >
        Back to AnonRoom
      </button>
    </div>
  );
}

function QuestionHeaderCard({ question, isPrivate, isAuthor }) {
  const normalizedType = (question?.question_type || question?.type || 'general').toLowerCase();
  const typeMeta = TYPE_META[normalizedType] || TYPE_META.general;

  return (
    <div
      className="pop-in"
      style={{
        margin: '16px 16px 8px',
        padding: '20px 22px',
        borderRadius: 22,
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(115%)',
        WebkitBackdropFilter: 'blur(20px) saturate(115%)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
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
          opacity: 0.16,
          filter: 'blur(34px)',
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
            fontWeight: 700,
            letterSpacing: 0.2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
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

      <p style={{ margin: '15px 0 0', fontSize: 18, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 600, letterSpacing: '-0.01em', position: 'relative' }}>
        {extractQuestionBodyText(question)}
      </p>
      <span style={{ display: 'block', marginTop: 13, fontSize: 12, color: 'var(--dim)', position: 'relative' }}>
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
          border: `1px solid ${isOwn ? 'rgba(47,111,255,0.25)' : 'var(--glass-border)'}`,
          backdropFilter: 'blur(20px) saturate(115%)',
          WebkitBackdropFilter: 'blur(20px) saturate(115%)',
          boxShadow: 'var(--shadow-float)',
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
              letterSpacing: 0.2,
              marginBottom: 6,
            }}
          >
            {Icons.Ghost} You (anonymous)
          </span>
        )}
        <p style={{ margin: 0, paddingRight: canShare ? 34 : 0, fontSize: 15, fontWeight: 500, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
              transition: 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.88)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {Icons.Share}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyReplies({ isPrivate, isAuthor }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ color: 'var(--dim)' }}>{Icons.Sparkle}</div>
        <div style={{ background: 'var(--glass-border)', display: 'inline-block', padding: '8px 16px', borderRadius: 20, fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>
          No responses yet
        </div>
        <p style={{ margin: 0, maxWidth: 240, fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.45 }}>
          {isPrivate
            ? (isAuthor
                ? 'Responses to this question are private — only you can see them.'
                : 'Your response will only be visible to the question owner.')
            : 'Be the first to share an honest, anonymous response.'}
        </p>
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

/** The small row of status chips sitting just above the composer input. */
function MetaChips({ isPrivate, showConfessionsChip }) {
  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 0', flexWrap: 'nowrap', overflow: 'hidden' }}>
      <span style={{ ...chipStyle, background: 'var(--glass)', color: 'var(--dim)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
        {Icons.Ghost} Anonymous
      </span>
      {isPrivate && (
        <span style={{ ...chipStyle, background: 'var(--glass)', color: 'var(--dim)' }}>
          {Icons.Lock} Private
        </span>
      )}
      {showConfessionsChip && (
        <span style={{ ...chipStyle, background: 'var(--ember-soft)', color: 'var(--ember)' }}>
          + Confessions
        </span>
      )}
    </div>
  );
}

/**
 * The whole sticky bottom bar — meta chips + reply input — as one region.
 * Kept as a component (rather than inline JSX in the main return) so the
 * composer's own layout concerns don't compete with the message-list JSX
 * around it.
 */
function ComposerBar({
  isPrivate,
  isAuthor,
  addToConfessions,
  onToggleConfessions,
  replyText,
  onChangeReplyText,
  onFocusInput,
  sending,
  onSubmit,
}) {
  return (
    <div
      className="safe-bottom"
      style={{
        flexShrink: 0,
        zIndex: 20,
        position: 'sticky',
        bottom: 0,
        width: '100%',
        background: 'var(--composer-bg, var(--header-bg))',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderTop: '1px solid var(--separator)',
      }}
    >
      <MetaChips isPrivate={isPrivate} showConfessionsChip={isAuthor && addToConfessions} />

      <form
        onSubmit={onSubmit}
        autoComplete="off-nope"
        data-form-type="other"
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', boxSizing: 'border-box' }}
      >
        {isAuthor && (
          <button
            type="button"
            onClick={onToggleConfessions}
            aria-pressed={addToConfessions}
            title={addToConfessions ? 'Will also post to Confessions' : 'Also add this reply to Confessions'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: '50%',
              flexShrink: 0,
              border: 'none',
              background: addToConfessions ? 'var(--ember)' : 'var(--surface-2, var(--glass-border))',
              color: addToConfessions ? '#fff' : 'var(--dim)',
              cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {Icons.Ghost}
          </button>
        )}
        <input
          type="search"
          name="question-reply-f"
          autoComplete="off-nope"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-lpignore="true"
          data-1p-ignore
          data-form-type="other"
          value={replyText}
          onChange={(e) => onChangeReplyText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          maxLength={MAX_TEXT_LENGTH}
          onFocus={onFocusInput}
          placeholder="Anonymous reply…"
          aria-label="Reply"
          disabled={sending}
          style={{
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--separator)',
            outline: 'none',
            background: 'var(--surface)',
            color: 'var(--paper)',
            borderRadius: 22,
            padding: '12px 16px',
            fontSize: 16,
            fontFamily: 'inherit',
          }}
        />
        <div style={{ flexShrink: 0 }}>
          <SendButton canSend={!!replyText.trim()} sending={sending} cooldownPercent={0} />
        </div>
      </form>
    </div>
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

  // Prefer measured visual-viewport height so the composer stays above the
  // keyboard without extra --keyboard-inset padding (which double-counts and
  // stretches the bar to the top of the screen). Fall back to 100% if the
  // parent already constrains height (e.g. Home right panel).
  const { height: viewportHeight, offsetTop: viewportOffsetTop } = useViewportHeight();
  const pageHeight = viewportHeight ? `${viewportHeight}px` : '100dvh';

  const scrollRef = useRef(null);

  // The reply list is DOM-newest-first (replies fetched with
  // ascending:false, new ones prepended — see the realtime INSERT handler
  // below) rendered with flex-direction: column-reverse, so scrollTop 0
  // means "pinned to the latest reply at the bottom" — the standard
  // reversed-flex chat trick, needing no scroll-to-bottom JS on ordinary
  // message arrival.
  //
  // That pin can go stale the moment the on-screen keyboard opens/closes,
  // though: the visual viewport resizes (via useViewportHeight, up in
  // Home.jsx's RIGHT PANEL) a frame or more after the keyboard animation
  // starts, so scrollRef briefly keeps whatever scrollTop it had against
  // the OLD, taller layout. Once the container repaints at its new,
  // shorter height, that stale offset can leave a gap of blank space
  // below the composer that's technically still "in scroll range" even
  // though there's nothing there — which reads as "the page scrolls below
  // the input bar." Re-pinning to scrollTop 0 right as the keyboard opens
  // (and again on close) keeps the list glued to its latest-message
  // position through the resize instead of leaving that stale gap.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    function handleViewportResize() {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, []);

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
    navigateInApp(ROOT_PATH);
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
        // Always recorded now (see 0005_confessions_author_id_always.sql) —
        // isAuthor being true here means ownUserId is set.
        author_id: ownUserId,
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
    return <PageSkeleton pageHeight={pageHeight} onBack={handleBack} />;
  }

  if (questionStatus === 'error') {
    return (
      <div style={{ height: pageHeight, width: '100%' }}>
        <ErrorState onBack={handleBack} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: pageHeight,
        width: '100%',
        overflow: 'hidden',
        fontFamily: FONT_STACK,
        background: 'radial-gradient(circle at 50% 0%, rgba(59,130,246,0.06), transparent 55%), var(--ink)',
        transform: viewportOffsetTop ? `translateY(${viewportOffsetTop}px)` : undefined,
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
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--paper)', flex: 1, letterSpacing: '-0.01em' }}>Anonymous Question</span>

        <IdentityPill session={session} profile={profile} onSignUp={() => setAuthOpen(true)} />
      </header>

      <QuestionHeaderCard question={question} isPrivate={isPrivate} isAuthor={isAuthor} />

      {/* --- START BANNER --- */}
      <BbssmBanner />
      {/* --- END BANNER --- */}

      <div
        ref={scrollRef}
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          display: 'flex',
          flexDirection: 'column-reverse',
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {repliesLoading && (
          <>
            <SkeletonStyles />
            <SkeletonReplyBubble width="70%" />
            <SkeletonReplyBubble width="85%" />
            <SkeletonReplyBubble width="60%" />
            <SkeletonReplyBubble width="78%" />
          </>
        )}

        {!repliesLoading && replies.length === 0 && <EmptyReplies isPrivate={isPrivate} isAuthor={isAuthor} />}

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

      <ComposerBar
        isPrivate={isPrivate}
        isAuthor={isAuthor}
        addToConfessions={addToConfessions}
        onToggleConfessions={() => setAddToConfessions((v) => !v)}
        replyText={replyText}
        onChangeReplyText={setReplyText}
        onFocusInput={() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
        sending={sending}
        onSubmit={handleSendReply}
      />

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
