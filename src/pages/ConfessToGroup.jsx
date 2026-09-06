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
 * (which requires sign-in and posts through group_messages so it shows up
 * inline in the live chat — see 0003_group_confession_story_style.sql). This
 * page instead writes straight into public.confessions with
 * visibility: 'group', author_id: null, is_anon: true — the exact row shape
 * StoriesBar.jsx already reads for a group's Stories ring, so a submission
 * here shows up as a Story for the group, same as any other group
 * confession, with no session and no chat access required.
 *
 * RLS: see supabase/migrations/0005_confess_group_anon.sql —
 * confessions_insert_group_anon (anon role, narrowly scoped: text-only,
 * no media, no story customization, must carry a visitor_id, group must
 * have confessions_enabled) + a real server-side rate-limit trigger keyed
 * off that visitor_id (client-side cooldowns alone don't mean anything on a
 * fully unauthenticated public endpoint).
 *
 * Kept deliberately simple/chaotic rather than matching the rest of the
 * app's chrome: one card, one box, one button — nothing else to configure.
 *
 * Dependencies: React, Supabase, src/lib/subdomain.js, src/lib/visitorId.js,
 * src/lib/useViewportHeight.js
 * ========================================================================= */

import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { getGroupUrl } from '../lib/subdomain';
import { getOrCreateVisitorId } from '../lib/visitorId';
import { useViewportHeight } from '../lib/useViewportHeight';
import { showToast } from '../lib/toast';
import { hapticSuccess, hapticError } from '../lib/haptics';
import { playRefreshComplete, playError } from '../lib/soundManager';

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

    const { error } = await supabase.from('confessions').insert({
      text: trimmed,
      visibility: 'group',
      group_id: group.id,
      is_anon: true,
      author_id: null,
      visitor_id: getOrCreateVisitorId(),
    });

    if (error) {
      hapticError();
      playError();
      // The rate-limit trigger (see 0005_confess_group_anon.sql) raises a
      // plain Postgres exception with this message prefix — surface it as
      // a friendly, specific toast instead of a generic error.
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
          'radial-gradient(circle at 20% 10%, rgba(255,107,53,0.18), transparent 55%), radial-gradient(circle at 85% 90%, rgba(255,107,53,0.10), transparent 50%), #0C0D10',
      }}
    >
      <div
        className="pop-in"
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#1C1D24',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 28,
          padding: 30,
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          boxSizing: 'border-box',
        }}
      >
        {stage === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '30px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--ember, #FF6B35)' }}>{Vectors.Spinner}</div>
            <p style={{ margin: 0, fontSize: 14, color: '#8B8B96' }}>Finding the group…</p>
          </div>
        )}

        {stage === 'not-found' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
            <div style={{ color: '#FF6B35' }}>{Vectors.Ghost}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: '#F4F3F0' }}>No group here</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#8B8B96' }}>
              This confession link doesn't point at a real group anymore. Double-check the link, or ask whoever shared it for a fresh one.
            </p>
          </div>
        )}

        {stage === 'closed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
            <div style={{ color: '#FF6B35' }}>{Vectors.Lock}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: '#F4F3F0' }}>Confessions are closed</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#8B8B96' }}>
              {group?.name || 'This group'} isn't taking anonymous confessions right now.
            </p>
          </div>
        )}

        {stage === 'sent' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
            <div style={{ color: '#22C55E' }}>{Vectors.Check}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: '#F4F3F0' }}>Sent into the void 🌀</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#8B8B96' }}>
              Nobody knows it was you. It'll show up in {group?.name || 'the group'}'s stories.
            </p>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
              <button
                onClick={() => { setText(''); setStage('form'); }}
                style={{ flex: 1, padding: '13px 0', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#F4F3F0', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}
              >
                Send another
              </button>
              <a
                href={getGroupUrl(groupSlug)}
                style={{ flex: 1, padding: '13px 0', borderRadius: 16, border: 'none', background: '#FF6B35', color: '#fff', fontWeight: 700, fontSize: 14.5, textAlign: 'center', textDecoration: 'none' }}
              >
                View group
              </a>
            </div>
          </div>
        )}

        {(stage === 'form' || stage === 'posting') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-block', color: '#FF6B35', transform: 'rotate(-6deg)', marginBottom: 4 }}>{Vectors.Spiral}</div>
              <h1 style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 900, color: '#F4F3F0', letterSpacing: '-0.02em' }}>
                Confess to {group?.name || 'the group'}
              </h1>
              <p style={{ margin: 0, fontSize: 13.5, color: '#8B8B96' }}>
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
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#15161B',
                borderRadius: 20,
                padding: 16,
                fontSize: 16,
                fontFamily: 'inherit',
                color: '#F4F3F0',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: '#8B8B96', marginTop: -10 }}>
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
                background: !canSend ? '#2A2B36' : '#FF6B35',
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
  );
}
