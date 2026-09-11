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
 * anon_confession_insert_anon (anon role, narrowly scoped: must carry a
 * visitor_id, group must have confessions_enabled) + a real server-side
 * rate-limit trigger keyed off that visitor_id (client-side cooldowns alone
 * don't mean anything on a fully unauthenticated public endpoint). Older
 * direct-to-group_messages/confessions policies (0005/0007) are left in
 * place, untouched, purely as a fallback below.
 *
 * Media attach mirrors the upload the "New Confession" sheet in
 * GroupChat.jsx uses (upload to the `media` storage bucket, then carry the
 * resulting public URL + type on the same row) — the anon_confession table
 * was originally text-only, so if this project's migration hasn't picked up
 * media_url/media_type on that table yet, the media_url/media_type simply
 * won't be accepted and the existing group_messages/confessions fallback
 * below (which already supports both columns) carries it instead.
 *
 * Dependencies: React, Supabase, src/lib/subdomain.js, src/lib/visitorId.js,
 * src/lib/useViewportHeight.js, src/components/shared/LiquidAvatar.jsx
 * ========================================================================= */

import React, { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { buildGroupPath, navigateInApp } from '../lib/subdomain';
import { getOrCreateVisitorId } from '../lib/visitorId';
import { useViewportHeight } from '../lib/useViewportHeight';
import { showToast } from '../lib/toast';
import { hapticSuccess, hapticError, hapticSelect } from '../lib/haptics';
import { playRefreshComplete, playError } from '../lib/soundManager';
import LiquidAvatar from '../components/shared/LiquidAvatar';

const MAX_LENGTH = 500;
const UPLOAD_TIMEOUT_MS = 60000;

// Cycled in the textarea's placeholder while it's empty, purely to make an
// empty box feel like an invitation instead of a blank test. Kept light and
// everyday on purpose — nothing that assumes anything upsetting or private.
const EXAMPLE_PROMPTS = [
  "I still watch cartoons before bed…",
  "I talk to my pet like it understands every word…",
  "I've rewatched the same movie more times than I'll admit…",
  "I get nervous before every test, even when I studied…",
  "I sometimes eat cereal for dinner…",
  "I still have a nightlight and I'm not sorry…",
];

const Vectors = {
  Heart: (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
    </svg>
  ),
  Ghost: (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 0-7 7v11l2.5-2 2.5 2 2-2 2 2 2.5-2 2.5 2V9a7 7 0 0 0-7-7z" />
    </svg>
  ),
  Lock: (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Spinner: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin">
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  Check: (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Photo: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Shield: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

function guessMediaType(file) {
  if (!file) return 'file';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

export default function ConfessToGroup({ groupSlug }) {
  // 'loading' | 'not-found' | 'closed' | 'form' | 'posting' | 'sent'
  const [stage, setStage] = useState('loading');
  const [group, setGroup] = useState(null);
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null); // { file, previewUrl, type }
  const [mediaUploading, setMediaUploading] = useState(false);
  const [uploadSecondsLeft, setUploadSecondsLeft] = useState(60);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [examplePlaceholder, setExamplePlaceholder] = useState(EXAMPLE_PROMPTS[0]);

  const fileInputRef = useRef(null);

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

  // Rotating example prompt — only while the box is genuinely empty, so it
  // never competes with something someone is actually mid-typing.
  useEffect(() => {
    if (stage !== 'form' || text.length > 0) return undefined;
    const t = setInterval(() => {
      setExampleIndex((i) => {
        const next = (i + 1) % EXAMPLE_PROMPTS.length;
        setExamplePlaceholder(EXAMPLE_PROMPTS[next]);
        return next;
      });
    }, 3200);
    return () => clearInterval(t);
  }, [stage, text.length]);

  useEffect(() => {
    return () => { if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl); };
  }, [pendingMedia]);

  const trimmed = text.trim();
  const canSend = (trimmed.length > 0 || !!pendingMedia) && trimmed.length <= MAX_LENGTH;

  function handleMediaChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    hapticSelect?.();
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia({ file, previewUrl: URL.createObjectURL(file), type: guessMediaType(file) });
  }

  function removePendingMedia() {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend || stage === 'posting') return;
    setStage('posting');

    const visitorId = getOrCreateVisitorId();

    // Media, if attached, uploads first — same public `media` bucket and
    // upload pattern GroupChat.jsx's composer and confession sheet use, just
    // scoped under an `anon/` prefix instead of a signed-in user id, since
    // there's no session here to key the path on.
    let mediaUrl = null;
    let mediaType = null;
    if (pendingMedia) {
      setMediaUploading(true);
      setUploadSecondsLeft(60);
      const tick = setInterval(() => setUploadSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
      try {
        const path = `anon/${visitorId}-${Date.now()}-${pendingMedia.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
        const uploadPromise = supabase.storage.from('media').upload(path, pendingMedia.file, { upsert: false, contentType: pendingMedia.file.type || undefined });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), UPLOAD_TIMEOUT_MS));
        const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
        if (!publicUrlData?.publicUrl) throw new Error('NO_URL');
        mediaUrl = publicUrlData.publicUrl;
        mediaType = pendingMedia.type;
      } catch (err) {
        clearInterval(tick);
        setMediaUploading(false);
        hapticError();
        playError();
        showToast(err.message === 'TIMEOUT' ? "That upload timed out — check your connection and try again." : "Couldn't attach that. Please try again.", 'error');
        setStage('form');
        return;
      }
      clearInterval(tick);
      setMediaUploading(false);
    }

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
    // Preferred path: public.anon_confession (SECURITY DEFINER trigger fans
    // out into group_messages + confessions). Retry without media columns if
    // the project hasn't added media_url/media_type yet (common 400 cause).
    let anonConfessionError = null;
    {
      const payload = {
        group_id: group.id,
        text: trimmed || null,
        visitor_id: visitorId,
      };
      if (mediaUrl) {
        payload.media_url = mediaUrl;
        payload.media_type = mediaType;
      }
      let res = await supabase.from('anon_confession').insert(payload);
      anonConfessionError = res.error;
      // Column-missing / schema cache → retry text-only
      if (anonConfessionError && mediaUrl && /media_url|media_type|schema cache|Could not find/i.test(anonConfessionError.message || '')) {
        const { media_url: _u, media_type: _t, ...textOnly } = payload;
        res = await supabase.from('anon_confession').insert(textOnly);
        anonConfessionError = res.error;
      }
    }

    let error = anonConfessionError;

    // Fallback: older direct paths (0005/0007). Only if mailbox insert failed
    // for a non-rate-limit reason.
    if (anonConfessionError && !anonConfessionError.message?.includes('rate_limited')) {
      console.error('anon_confession insert failed, falling back to group_messages:', anonConfessionError);
      const messageFallback = await supabase.from('group_messages').insert({
        group_id: group.id,
        user_id: null,
        is_anon: true,
        is_confession: true,
        sender_name: 'Anonymous',
        text: trimmed || null,
        media_url: mediaUrl,
        media_type: mediaType,
        visitor_id: visitorId,
      });
      error = messageFallback.error;

      if (error && !error.message?.includes('rate_limited')) {
        console.error('group_messages confession insert failed, falling back to confessions table:', error);
        const confessionsFallback = await supabase.from('confessions').insert({
          text: trimmed || null,
          visibility: 'group',
          group_id: group.id,
          is_anon: true,
          author_id: null,
          photo_url: mediaUrl,
          visitor_id: visitorId,
        });
        error = confessionsFallback.error;
      }
    }

    if (error) {
      hapticError();
      playError();
      const msg = error.message || '';
      if (msg.includes('rate_limited')) {
        showToast("Slow down — you can post again in a few seconds.", 'error');
      } else if (/row-level security|RLS|permission denied|403/i.test(msg) || error.code === '42501') {
        showToast("Couldn't send — confessions may be restricted for this group. Try again or open the group signed in.", 'error');
      } else {
        showToast("Couldn't send that. Please try again.", 'error');
      }
      console.error('Confess submit failed:', error);
      setStage('form');
      return;
    }

    hapticSuccess();
    playRefreshComplete();
    setStage('sent');
  }

  function handleJoinGroup() {
    navigateInApp(buildGroupPath(groupSlug));
  }

  const showJoinBanner = (stage === 'form' || stage === 'posting' || stage === 'sent' || stage === 'closed') && !!group;

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
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif',
        background:
          'radial-gradient(circle at 20% 8%, rgba(47,111,255,0.14), transparent 55%), radial-gradient(circle at 85% 92%, rgba(47,111,255,0.08), transparent 50%), var(--ink)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* JOIN GROUP BANNER — a quiet, persistent invitation, not a modal
            interruption. Present whenever we actually have a resolved
            group; tapping it leaves this standalone page entirely and
            drops the person into the real group at /g/<slug>. */}
        {showJoinBanner && (
          <button
            type="button"
            onClick={handleJoinGroup}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 18,
              border: '1px solid var(--glass-border)',
              background: 'var(--ink-2)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.15s ease',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <LiquidAvatar identity={{ name: group.name, avatar_url: group.cover_url, is_admin: false }} size={34} kind="group" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {group.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>Join the group to see everyone's stories</div>
            </div>
            <span
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontWeight: 700, color: 'var(--ember)',
                padding: '7px 12px', borderRadius: 999,
                background: 'var(--ember-soft)',
              }}
            >
              Join {Vectors.ChevronRight}
            </span>
          </button>
        )}

        <div
          className="pop-in"
          style={{
            width: '100%',
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
              <div style={{ color: 'var(--ember)' }}>{Vectors.Spinner}</div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--dim)' }}>Finding the group…</p>
            </div>
          )}

          {stage === 'not-found' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ color: 'var(--dim)' }}>{Vectors.Ghost}</div>
              <h1 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, color: 'var(--paper)', letterSpacing: '-0.01em' }}>We couldn't find this group</h1>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
                This link doesn't point to an active group anymore. Double-check it, or ask whoever shared it for a new one.
              </p>
            </div>
          )}

          {stage === 'closed' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ color: 'var(--dim)' }}>{Vectors.Lock}</div>
              <h1 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, color: 'var(--paper)', letterSpacing: '-0.01em' }}>Confessions are turned off</h1>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
                {group?.name || 'This group'} isn't accepting anonymous messages right now. You're still welcome to join and say hello.
              </p>
            </div>
          )}

          {stage === 'sent' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ color: '#22C55E' }}>{Vectors.Check}</div>
              <h1 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, color: 'var(--paper)', letterSpacing: '-0.01em' }}>Sent anonymously</h1>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--dim)' }}>
                Your name isn't attached to this. It'll appear in {group?.name || 'the group'}'s stories shortly.
              </p>
              <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
                <button
                  onClick={() => { setText(''); removePendingMedia(); setStage('form'); }}
                  style={{ flex: 1, padding: '13px 0', borderRadius: 16, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--paper)', fontWeight: 600, fontSize: 14.5, cursor: 'pointer' }}
                >
                  Send another
                </button>
                <button
                  type="button"
                  onClick={handleJoinGroup}
                  style={{ flex: 1, padding: '13px 0', borderRadius: 16, border: 'none', background: 'var(--ember)', color: '#fff', fontWeight: 700, fontSize: 14.5, textAlign: 'center', cursor: 'pointer' }}
                >
                  View group
                </button>
              </div>
            </div>
          )}

          {(stage === 'form' || stage === 'posting') && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', color: 'var(--ember)', marginBottom: 6 }}>{Vectors.Heart}</div>
                <h1 style={{ margin: '4px 0 4px', fontSize: 21, fontWeight: 700, color: 'var(--paper)', letterSpacing: '-0.02em' }}>
                  Confess to {group?.name || 'the group'}
                </h1>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--dim)', lineHeight: 1.45 }}>
                  Share something anonymously — no account needed, and your name is never attached.
                </p>
              </div>

              <div style={{ borderRadius: 20, border: '1px solid var(--glass-border)', background: 'var(--ink-2)', overflow: 'hidden' }}>
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
                  placeholder={examplePlaceholder}
                  rows={pendingMedia ? 3 : 5}
                  style={{
                    width: '100%',
                    resize: 'none',
                    border: 'none',
                    background: 'transparent',
                    padding: '16px 16px 6px',
                    fontSize: 16,
                    fontFamily: 'inherit',
                    color: 'var(--paper)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'opacity 0.25s ease',
                  }}
                />

                {pendingMedia && (
                  <div style={{ position: 'relative', width: 84, height: 84, margin: '0 16px 12px' }}>
                    {pendingMedia.type === 'video' ? (
                      <video src={pendingMedia.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                    ) : (
                      <img src={pendingMedia.previewUrl} alt="Attachment preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                    )}
                    <button
                      type="button"
                      onClick={removePendingMedia}
                      disabled={stage === 'posting'}
                      style={{ position: 'absolute', top: -6, right: -6, background: 'var(--ink-2)', color: 'var(--paper)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: 24, height: 24, cursor: stage === 'posting' ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                    >
                      {Vectors.Close}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px 12px' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!pendingMedia || stage === 'posting'}
                    style={{
                      background: pendingMedia ? 'transparent' : 'rgba(255,255,255,0.06)',
                      border: 'none', borderRadius: 999, padding: '6px 12px',
                      color: pendingMedia ? 'rgba(255,255,255,0.2)' : 'var(--paper)',
                      cursor: (pendingMedia || stage === 'posting') ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
                    }}
                  >
                    {Vectors.Photo} {pendingMedia ? 'Photo added' : 'Add a photo'}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} style={{ display: 'none' }} />
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>{trimmed.length}/{MAX_LENGTH}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSend || stage === 'posting'}
                style={{
                  width: '100%',
                  padding: '15px 0',
                  borderRadius: 18,
                  border: 'none',
                  background: !canSend ? 'rgba(255,255,255,0.06)' : 'var(--ember)',
                  color: !canSend ? 'var(--dim)' : '#fff',
                  fontWeight: 700,
                  fontSize: 15.5,
                  letterSpacing: '-0.01em',
                  cursor: !canSend || stage === 'posting' ? 'default' : 'pointer',
                  transition: 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.15s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onMouseDown={(e) => { if (canSend) e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {stage === 'posting'
                  ? <>{Vectors.Spinner} {mediaUploading ? `Uploading… ${uploadSecondsLeft}s` : 'Sending…'}</>
                  : 'Send confession'}
              </button>

              <p style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, color: 'var(--dim)', textAlign: 'center', lineHeight: 1.4 }}>
                <span style={{ display: 'flex', color: 'var(--dim)' }}>{Vectors.Shield}</span>
                Be kind. Group admins can remove anything that breaks the rules.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
