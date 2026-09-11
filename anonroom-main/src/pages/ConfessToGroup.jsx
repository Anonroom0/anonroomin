/** ===========================================================================
 * CONFESS TO GROUP (STANDALONE PAGE — /confess/<slug>)
 * ============================================================================
 * Mounted directly by App.jsx at the root-domain path /confess/<slug>,
 * OUTSIDE any auth gate — exactly like QuestionThread's /q/<id>,
 * ConfessionsFeed's /confessions, and ResetPassword's /reset-password/<token>.
 * No sign-in, no session, no sidebar, no chat UI — just a slug, a textbox,
 * and a button. Anyone with the link can drop one anonymous confession into
 * that group without ever creating an account.
 *
 * Deliberately a different door than GroupChat.jsx's "New Confession" sheet
 * (which requires sign-in and posts through group_messages directly — see
 * 0003_group_confession_story_style.sql). This page instead writes into
 * public.anon_confession, a dedicated write-only mailbox for exactly this
 * route — a SECURITY DEFINER trigger then fans that out server-side into
 * group_messages (chat) and, from there, confessions (Stories), the exact
 * row shape StoriesBar.jsx already reads for a group's Stories ring. No
 * session and no chat access required either way.
 *
 * RLS: see supabase/migrations/0008_anon_confession_table.sql —
 * anon_confession_insert_anon (anon role, narrowly scoped: text-only, must
 * carry a visitor_id, group must have confessions_enabled) + a real
 * server-side rate-limit trigger keyed off that visitor_id (client-side
 * cooldowns alone don't mean anything on a fully unauthenticated public
 * endpoint). Older direct-to-group_messages/confessions policies
 * (0005/0007) are left in place, untouched, purely as a fallback below.
 *
 * Kept deliberately simple/chaotic rather than matching the rest of the
 * app's chrome: one card, one box, one button — nothing else to configure.
 *
 * Dependencies: React, Supabase, src/lib/subdomain.js, src/lib/visitorId.js,
 * src/lib/useViewportHeight.js
 * ========================================================================= */

import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { buildGroupPath, navigateInApp } from '../lib/subdomain';
import { getOrCreateVisitorId } from '../lib/visitorId';
import { useViewportHeight } from '../lib/useViewportHeight';
import { showToast } from '../lib/toast';
import { hapticSuccess, hapticError } from '../lib/haptics';
import { playRefreshComplete, playError } from '../lib/soundManager';
import BbssmBanner from '../components/shared/BbssmBanner';

const MAX_LENGTH = 500;

const Vectors = {
  Spiral: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 7.07 2.93" />
      <path d="M12 6a6 6 0 1 0 4.24 1.76" />
      <path d="M12 10a2 2 0 1 0 1.41.59" />
    </svg>
  ),
  Ghost: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 0-7 7v11l2.5-2 2.5 2 2-2 2 2 2.5-2 2.5 2V9a7 7 0 0 0-7-7z" />
    </svg>
  ),
  Lock: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
  Check: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
};

export default function ConfessToGroup({ groupSlug }) {
  // 'loading' | 'not-found' | 'closed' | 'form' | 'posting' | 'sent'
  const [stage, setStage] = useState('loading');
  const [group, setGroup] = useState(null);
  const [text, setText] = useState('');

  // Real visible height on mobile, so the textbox + button never end up
  // hidden behind the on-screen keyboard — see useViewportHeight.js.
  const { height: vh, offsetTop } = useViewportHeight();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('groups')
      .select('id, name, slug, cover_url, confessions_enabled')
      .eq('slug', groupSlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Logged rather than silently swallowed — a missing/incorrect
          // anon SELECT policy on public.groups (see
          // groups_select_public_confess in 0005_confess_group_anon.sql)
          // shows up here as an RLS/permission error, not as "no data",
          // and previously left no trace at all, making "the page just
          // says not found" impossible to tell apart from an actually
          // deleted/renamed group.
          console.error('Failed to resolve group for /confess page:', error);
        }
        if (error || !data) {
          setStage('not-found');
          return;
        }
        setGroup(data);
        setStage(data.confessions_enabled === false ? 'closed' : 'form');
      });
    return () => { cancelled = true; };
  }, [groupSlug]);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LENGTH;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend || stage === 'posting') return;
    setStage('posting');

    const visitorId = getOrCreateVisitorId();

    // Preferred path: insert into public.anon_confession, a dedicated
    // write-only mailbox for this exact route (see
    // 0008_anon_confession_table.sql). A SECURITY DEFINER trigger on that
    // table does the actual fan-out server-side: it inserts into
    // group_messages (is_confession: true) so the submission shows up
    // inline in the live chat, which in turn fires the existing
    // sync_group_confession_to_confessions() trigger (0001/0003) that
    // mirrors it into public.confessions for the group's Stories bar.
    // Both tables get written automatically, in one transaction, without
    // this page needing to touch either of them directly or juggle a
    // client-side fallback between them.
    const { error: anonConfessionError } = await supabase.from('anon_confession').insert({
      group_id: group.id,
      text: trimmed,
      visitor_id: visitorId,
    });

    let error = anonConfessionError;

    // Fallback: the older, narrower direct paths from
    // 0007_confess_via_group_messages.sql / 0005_confess_group_anon.sql.
    // Only reached if the anon_confession insert itself was rejected —
    // e.g. the migration above hasn't been applied yet to this project.
    // Once it fails past the group_messages insert, at least the
    // confessions-direct fallback still reaches Stories (StoriesBar.jsx
    // reads confessions directly).
    if (anonConfessionError && !anonConfessionError.message?.includes('rate_limited')) {
      console.error('anon_confession insert failed, falling back to group_messages:', anonConfessionError);
      const messageFallback = await supabase.from('group_messages').insert({
        group_id: group.id,
        user_id: null,
        is_anon: true,
        is_confession: true,
        sender_name: 'Anonymous',
        text: trimmed,
        visitor_id: visitorId,
      });
      error = messageFallback.error;

      if (error && !error.message?.includes('rate_limited')) {
        console.error('group_messages confession insert failed, falling back to confessions table:', error);
        const confessionsFallback = await supabase.from('confessions').insert({
          text: trimmed,
          visibility: 'group',
          group_id: group.id,
          is_anon: true,
          author_id: null,
          visitor_id: visitorId,
        });
        error = confessionsFallback.error;
      }
    }

    if (error) {
      hapticError();
      playError();
      // The rate-limit trigger (see 0005/0007's migrations) raises a plain
      // Postgres exception with this message prefix — surface it as a
      // friendly, specific toast instead of a generic error.
      if (error.message?.includes('rate_limited')) {
        showToast("Slow down — you can post again in a few seconds.", 'error');
      } else {
        showToast("Couldn't send that. Please try again.", 'error');
      }
      setStage('form');
      return;
    }

    hapticSuccess();
    playRefreshComplete();
    setStage('sent');
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: vh ? `${vh}px` : '100dvh',
        transform: offsetTop ? `translateY(${offsetTop}px)` : undefined,
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
        background:
          'radial-gradient(circle at 20% 10%, rgba(47,111,255,0.18), transparent 55%), radial-gradient(circle at 85% 90%, rgba(47,111,255,0.10), transparent 50%), var(--ink)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BbssmBanner style={{ margin: 0 }} />
      <div
        className="pop-in"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--ink-2)',
          border: '1px solid var(--glass-border)',
          borderRadius: 28,
          padding: 30,
          boxShadow: 'var(--shadow-sheet)',
          boxSizing: 'border-box',
        }}
      >
        {stage === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '30px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--ember, var(--ember))' }}>{Vectors.Spinner}</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--dim)' }}>Finding the group…</p>
          </div>
        )}

        {stage === 'not-found' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--ember)' }}>{Vectors.Ghost}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--paper)' }}>No group here</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
              This confession link doesn't point at a real group anymore. Double-check the link, or ask whoever shared it for a fresh one.
            </p>
          </div>
        )}

        {stage === 'closed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--ember)' }}>{Vectors.Lock}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--paper)' }}>Confessions are closed</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
              {group?.name || 'This group'} isn't taking anonymous confessions right now.
            </p>
          </div>
        )}

        {stage === 'sent' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
            <div style={{ color: '#22C55E' }}>{Vectors.Check}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--paper)' }}>Sent into the void 🌀</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
              Nobody knows it was you. It'll show up in {group?.name || 'the group'}'s stories.
            </p>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
              <button
                onClick={() => { setText(''); setStage('form'); }}
                style={{ flex: 1, padding: '13px 0', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--paper)', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}
              >
                Send another
              </button>
              <button
                type="button"
                onClick={() => navigateInApp(buildGroupPath(groupSlug))}
                style={{ flex: 1, padding: '13px 0', borderRadius: 16, border: 'none', background: 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 14.5, textAlign: 'center', cursor: 'pointer' }}
              >
                View group
              </button>
            </div>
          </div>
        )}

        {(stage === 'form' || stage === 'posting') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-block', color: 'var(--ember)', transform: 'rotate(-6deg)', marginBottom: 4 }}>{Vectors.Spiral}</div>
              <h1 style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 900, color: 'var(--paper)', letterSpacing: '-0.02em' }}>
                Confess to {group?.name || 'the group'}
              </h1>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--dim)' }}>
                100% anonymous. No account, no name, no trace. Just say it.
              </p>
            </div>

            <textarea
              autoFocus
              name="anon-confession-text"
              autoComplete="off-nope"
              autoCorrect="off"
              spellCheck="true"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              value={text}
              disabled={stage === 'posting'}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Type your confession here… nobody will know it was you."
              rows={5}
              style={{
                width: '100%',
                resize: 'none',
                border: '1px solid var(--glass-border)',
                background: 'var(--ink-2)',
                borderRadius: 20,
                padding: 16,
                fontSize: 16,
                fontFamily: 'inherit',
                color: 'var(--paper)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: 'var(--dim)', marginTop: -10 }}>
              {trimmed.length}/{MAX_LENGTH}
            </div>

            <button
              type="submit"
              disabled={!canSend || stage === 'posting'}
              style={{
                width: '100%',
                padding: '16px 0',
                borderRadius: 20,
                border: 'none',
                background: !canSend ? 'var(--ink-2)' : 'var(--ember)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 16,
                cursor: !canSend || stage === 'posting' ? 'default' : 'pointer',
                opacity: stage === 'posting' ? 0.8 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {stage === 'posting' ? <>{Vectors.Spinner} Sending…</> : 'Post Confession'}
            </button>

            <p style={{ margin: 0, fontSize: 11.5, color: '#5C5C66', textAlign: 'center', lineHeight: 1.4 }}>
              Be a decent human. Confessions can be removed by group admins.
            </p>
          </form>
        )}
      </div>
      </div>
    </div>
  );
}
