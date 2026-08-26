/**
 * ============================================================================
 * QUESTION CARD (ASK ME LIST ROW)
 * ============================================================================
 * A single row in Home.jsx's "Ask Me" subtab list: one anonymous question
 * received by the current user, truncated to two lines, with a Personal/
 * General type badge, a live reply count, and a relative timestamp.
 *
 * Interaction:
 *   - Tap/click the row  -> onOpen(question)  (caller mounts a chat-style
 *     reply thread for this question, visually parallel to opening a
 *     GroupChat thread — this component only renders the list row itself).
 *   - Long-press the row, OR tap the kebab icon -> onShare(question)
 *     (caller wires this to <ShareStorySheet>). Both are equivalent entry
 *     points into the same share action.
 *
 * Reply count: if the parent's list query already computed and attached
 * `question.reply_count` (cheapest — one query for the whole list), that
 * value is used as-is. Otherwise this component runs its own COUNT query
 * against question_replies for this question's id, since the prompt didn't
 * specify which side owns that aggregation — a reasonable judgment call so
 * the row is correct even when used standalone.
 *
 * Dependencies: React, Supabase
 * ============================================================================
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../../lib/supabaseClient';

// ============================================================================
// 1. CONSTANTS
// ============================================================================
const LONG_PRESS_MS = 500;

const TYPE_META = {
  personal: { label: 'Personal' },
  general: { label: 'General' },
};

// ============================================================================
// 2. INLINE ICONS (module scope so they aren't re-created every render)
// ============================================================================
const Icons = {
  Kebab: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  ),
  Reply: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Person: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Globe: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  QuestionMark: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
      <circle cx="12" cy="12" r="9" />
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

function formatReplyCountLabel(replyCount) {
  if (replyCount === null) return '···'; // still loading a live count
  if (replyCount === 0) return 'No replies yet';
  if (replyCount === 1) return '1 reply';
  return `${replyCount} replies`;
}

// ============================================================================
// 4. MAIN COMPONENT
// ============================================================================

export default function QuestionCard({ question, onOpen, onShare }) {
  // Column name is a judgment call — the schema for `questions` wasn't
  // attached, so this falls back across the most likely body-text columns
  // rather than assuming one and rendering blank if it's wrong.
  const questionText =
    question?.body ?? question?.content ?? question?.text ?? question?.question_text ?? '';

  const [replyCount, setReplyCount] = useState(
    typeof question?.reply_count === 'number' ? question.reply_count : null
  );
  const [isPressed, setIsPressed] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Parent already supplied a count — nothing to fetch.
    if (typeof question?.reply_count === 'number' || !question?.id) return undefined;

    async function fetchReplyCount() {
      const { count, error } = await supabase
        .from('question_replies')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', question.id);

      if (!cancelled && !error) setReplyCount(count || 0);
    }

    fetchReplyCount();
    return () => {
      cancelled = true;
    };
  }, [question?.id, question?.reply_count]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    longPressFired.current = false;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onShare?.(question);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, onShare, question]);

  const endPress = useCallback(() => {
    setIsPressed(false);
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const beginPress = useCallback(() => {
    setIsPressed(true);
    startLongPress();
  }, [startLongPress]);

  const handleRowClick = useCallback(() => {
    // A long-press that already fired shouldn't also open the thread once
    // the pointer/touch lifts and the browser's synthesized click follows.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onOpen?.(question);
  }, [onOpen, question]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleRowClick();
      }
    },
    [handleRowClick]
  );

  const handleKebabClick = useCallback(
    (e) => {
      e.stopPropagation();
      onShare?.(question);
    },
    [onShare, question]
  );

  if (!question) return null;

  const normalizedType = (question.type || 'general').toLowerCase();
  const typeMeta = TYPE_META[normalizedType] || TYPE_META.general;
  const TypeIcon = normalizedType === 'personal' ? Icons.Person : Icons.Globe;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${typeMeta.label} question: ${questionText}`}
      className="pop-in"
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      onMouseDown={beginPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={beginPress}
      onTouchEnd={endPress}
      onTouchMove={endPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        width: '100%',
        boxSizing: 'border-box',
        padding: '14px 16px',
        marginBottom: 10,
        borderRadius: 20, // token: cards/rows radius
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(115%)',
        WebkitBackdropFilter: 'blur(20px) saturate(115%)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        color: 'var(--paper)',
        cursor: 'pointer',
        textAlign: 'left',
        // Direct press-state transform, not a keyframe: no confirmed
        // animations.css class name was given for row press feedback, so
        // this is the minimal safe equivalent rather than a guessed class.
        transform: isPressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.12s ease-out',
        outline: isFocused ? '2px solid var(--paper)' : 'none',
        outlineOffset: 2,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: '50%', // token: avatar radius
          background: 'var(--ink-2)',
          border: '1px solid var(--glass-border)',
          color: 'var(--dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icons.QuestionMark}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'var(--glass-border)',
              color: 'var(--dim)',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            {TypeIcon}
            {typeMeta.label}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
              {formatRelativeTime(question.created_at)}
            </span>
            <button
              type="button"
              aria-label="Share this question"
              onClick={handleKebabClick}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                background: 'transparent',
                color: 'var(--dim)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {Icons.Kebab}
            </button>
          </div>
        </div>

        <p
          style={{
            margin: '0 0 8px 0',
            fontSize: 15,
            lineHeight: 1.4,
            color: 'var(--paper)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            wordBreak: 'break-word',
          }}
        >
          {questionText}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dim)' }}>
          {Icons.Reply}
          <span style={{ fontSize: 13, fontWeight: 500 }}>{formatReplyCountLabel(replyCount)}</span>
        </div>
      </div>
    </div>
  );
}
