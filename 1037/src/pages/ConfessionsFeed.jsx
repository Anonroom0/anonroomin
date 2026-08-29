/** ===========================================================================
 * CONFESSIONS FEED — public confessions at anonroom.in/confessions
 * ============================================================================
 * <ConfessionsFeed focusConfessionId? />
 *
 * The public feed of confessions where group_id IS NULL, newest first, each
 * rendered through the shared <ConfessionBubble size="feed" /> (see
 * src/components/shared/ConfessionBubble.jsx) so the card shape, reactions,
 * and reply affordance stay identical to the confessions rendered inline in
 * GroupChat.jsx. This same component is reused as the body content for
 * Home.jsx's public-confessions story channel — it owns no outer chrome
 * beyond its own header, so it drops into either context.
 *
 * Posting: confessions here are always fully anonymous — there is no
 * "post as yourself" option like GroupChat.jsx's ConfessionModal has. The
 * floating "+" FAB opens a short radial menu (Write / Photo) driven by the
 * .fab-tap and .fab-radial-item classes from animations.css, which both
 * land on the same lightweight composer sheet — "Photo" just also pops the
 * gallery picker open immediately so the two feel like distinct shortcuts
 * even though they share one sheet underneath.
 *
 * Sharing / deep-linking: a confession card can be linked to directly
 * (?id=<confession_id> on this page's URL, or the focusConfessionId prop
 * when this component is mounted as a sub-view from Home.jsx). On mount,
 * if a target id is present, this scrolls that card into view and gives it
 * a brief highlight ring — the same scroll-to-and-flash approach
 * GroupChat.jsx uses to jump to a confession via its pin button, generalized
 * here off a stable id instead of a nav-cycle index.
 *
 * Dependencies: React, supabase client, authContext, ConfessionBubble,
 * AttachmentSheet, GlassPanel
 * ========================================================================= */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import { showToast, friendlyDbError } from '../lib/toast';
import ConfessionBubble from '../components/shared/ConfessionBubble';
import AttachmentSheet from '../components/shared/AttachmentSheet';
import GlassPanel from '../components/shared/GlassPanel';
import MediaViewer from './MediaViewer';

// ============================================================================
// 1. CONSTANTS
// ============================================================================
const FEED_LIMIT = 200;
const HIGHLIGHT_MS = 2000;
const UPLOAD_TIMEOUT_MS = 60000;

// ============================================================================
// 2. INLINE SVG VECTOR LIBRARY
// ============================================================================
const Vectors = {
  Plus: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Pencil: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  Photo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Spinner: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  Ghost: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10h.01" /><path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  ),
};

// ============================================================================
// 3. COMPOSER SHEET
// ============================================================================
function ComposerSheet({ open, onClose, initialPhotoIntent, onSubmit, submitting }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null); // { file, previewUrl }
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const cameraInputRef = useRef(null);

  // "Photo" radial shortcut pre-opens the gallery picker the moment the
  // sheet mounts, so it reads as a distinct one-tap action from "Write".
  useEffect(() => {
    if (open && initialPhotoIntent) setAttachSheetOpen(true);
    if (!open) {
      setText('');
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(null);
      setAttachSheetOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPhotoIntent]);

  if (!open) return null;

  function handlePhotoPicked(file) {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setAttachSheetOpen(false);
  }

  function removePhoto() {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
  }

  function handleCameraInputChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handlePhotoPicked(file);
  }

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    onSubmit({ text: trimmed, file: photo?.file || null });
  }

  return (
    <GlassPanel variant="sheet" onClose={submitting ? undefined : onClose}>
      <div style={{ padding: '4px 2px 2px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--paper)' }}>New Confession</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--dim)' }}>
          Posted anonymously — there's no way to attach your name here.
        </p>

        <textarea
          autoFocus
          name="confession-composer"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore
          data-form-type="other"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="What's on your mind…"
          disabled={submitting}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid var(--glass-border)',
            borderRadius: 16,
            padding: 14,
            fontSize: 15,
            lineHeight: 1.4,
            resize: 'none',
            background: 'var(--glass-white)',
            color: 'var(--paper)',
            outline: 'none',
          }}
        />

        {photo && (
          <div style={{ position: 'relative', marginTop: 12, width: 96, height: 96 * (5 / 4) }}>
            <img
              src={photo.previewUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14, display: 'block' }}
            />
            <button
              type="button"
              onClick={removePhoto}
              disabled={submitting}
              style={{
                position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: '50%',
                border: 'none', background: 'var(--ink-2)', color: 'var(--paper)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              }}
            >
              {Vectors.Close}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          {!photo && (
            <button
              type="button"
              onClick={() => setAttachSheetOpen(true)}
              disabled={submitting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--glass-border)',
                background: 'var(--glass-white)', color: 'var(--dim)', borderRadius: 20, padding: '9px 14px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {Vectors.Photo} Add photo
            </button>
          )}

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 20,
              padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: text.trim() && !submitting ? 'pointer' : 'default',
              background: text.trim() ? 'var(--ember)' : 'var(--glass-border)',
              color: text.trim() ? '#fff' : 'var(--dim)',
            }}
          >
            {submitting ? Vectors.Spinner : null}
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {/* Gallery-only photo picker. Camera and Instagram rows are always
          part of the shared AttachmentSheet shape (see its own file
          banner) even though neither is a natural fit for a text
          confession composer — Camera is wired to a real capture input so
          it still does something useful, and Instagram is a no-op here
          since profile-card sharing doesn't apply to a confession post.
          Judgment call: quietly closing the sheet beats presenting a row
          that visibly does nothing. */}
      <AttachmentSheet
        open={attachSheetOpen}
        onClose={() => setAttachSheetOpen(false)}
        onOpenCamera={() => { setAttachSheetOpen(false); cameraInputRef.current?.click(); }}
        onPickInstagram={() => setAttachSheetOpen(false)}
        onPickPhoto={handlePhotoPicked}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraInputChange}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none' }}
      />
    </GlassPanel>
  );
}

// ============================================================================
// 4. MAIN EXPORT
// ============================================================================

export default function ConfessionsFeed({ focusConfessionId }) {
  const { session } = useAuth();

  const [confessions, setConfessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fabOpen, setFabOpen] = useState(false);
  const [fabTapKey, setFabTapKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPhotoIntent, setComposerPhotoIntent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [highlightedId, setHighlightedId] = useState(null);
  const hasAutoScrolledRef = useRef(false);
  const [viewerMedia, setViewerMedia] = useState(null);

  // The share/deep-link target: an explicit prop wins (Home.jsx passing a
  // sub-view id), otherwise fall back to a ?id= query param so a bare
  // anonroom.in/confessions?id=<id> link also works when this page is
  // hit directly.
  const targetId = focusConfessionId
    || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null);

  // --------------------------------------------------------------------------
  // FETCH + REALTIME
  // --------------------------------------------------------------------------
  const fetchConfessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('confessions')
      .select('*')
      .is('group_id', null)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT);

    if (!error) {
      setConfessions(data || []);
    } else {
      console.error(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfessions();

    // postgres_changes filters only support column=eq.value, not IS NULL,
    // so this subscribes unfiltered and checks group_id client-side —
    // the group-scoped confessions inserted via GroupChat.jsx just get
    // silently ignored here.
    const channel = supabase
      .channel('public_confessions_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' }, (payload) => {
        const row = payload.new;
        if (row.group_id) return;
        setConfessions((prev) => (prev.some((c) => c.id === row.id) ? prev : [row, ...prev]));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchConfessions]);

  // --------------------------------------------------------------------------
  // SHARE / DEEP-LINK: scroll to + flash a specific confession on mount
  // --------------------------------------------------------------------------
  // targetId may be a full uuid (focusConfessionId prop, or an old-style
  // link) or an 8-char short id (see toShortId() in subdomain.js) — either
  // way this resolves it to the real loaded confession before scrolling.
  useEffect(() => {
    if (!targetId || loading || hasAutoScrolledRef.current) return;
    const normalizedTarget = targetId.replace(/-/g, '').toLowerCase();
    const match = confessions.find((c) => c.id === targetId || c.id.replace(/-/g, '').toLowerCase().startsWith(normalizedTarget));
    if (!match) {
      (async () => {
        // Short ids resolve against the real `link_id` column (populated by
        // a database trigger — see
        // supabase/migrations/0002_link_id_routing.sql) instead of casting
        // `id` to text and ILIKE-prefix matching it.
        const isShort = /^[0-9a-f]{1,32}$/i.test(normalizedTarget);
        const { data } = isShort
          ? await supabase.from('confessions').select('*').is('group_id', null)
              .eq('link_id', normalizedTarget).order('created_at', { ascending: false }).limit(1).maybeSingle()
          : await supabase.from('confessions').select('*').eq('id', targetId).maybeSingle();
        if (data) setConfessions((prev) => prev.some((c) => c.id === data.id) ? prev : [data, ...prev]);
      })();
      return;
    }

    hasAutoScrolledRef.current = true;
    // Wait a frame for the card to be in the DOM before measuring/scrolling.
    requestAnimationFrame(() => {
      const el = document.getElementById(`confession-${match.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedId(match.id);
        setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
      }
    });
  }, [targetId, loading, confessions]);

  // --------------------------------------------------------------------------
  // FAB
  // --------------------------------------------------------------------------
  function handleFabTap() {
    setFabTapKey((k) => k + 1);
    setFabOpen((v) => !v);
  }

  function openComposer(photoIntent) {
    setComposerPhotoIntent(photoIntent);
    setComposerOpen(true);
    setFabOpen(false);
  }

  // --------------------------------------------------------------------------
  // SUBMIT
  // --------------------------------------------------------------------------
  async function handleComposerSubmit({ text, file }) {
    setSubmitting(true);
    try {
      let photoUrl = null;

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const ownerSegment = session?.user?.id || 'anon';
        const path = `${ownerSegment}/confession-${Date.now()}-${safeName}`;

        const uploadPromise = supabase.storage.from('media').upload(path, file, { upsert: false, contentType: file.type || undefined });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), UPLOAD_TIMEOUT_MS));
        const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
        photoUrl = publicUrlData?.publicUrl || null;
      }

      // Confessions are always fully anonymous here: no author_id, is_anon
      // always true, group_id always null (this is the public feed).
      const { error: insertError } = await supabase.from('confessions').insert({
        text,
        photo_url: photoUrl,
        is_anon: true,
        author_id: null,
        group_id: null,
      });
      if (insertError) throw insertError;

      setComposerOpen(false);
    } catch (err) {
      console.error(err);
      showToast(err.message === 'TIMEOUT' ? "Upload timed out — check your connection and try again." : friendlyDbError(), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden', background: 'var(--ink)' }}>
      <header
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px',
          background: 'var(--ink-2)', borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <span style={{ color: 'var(--ember)', display: 'flex' }}>{Vectors.Ghost}</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--paper)' }}>Confessions</h1>
          <span style={{ fontSize: 13, color: 'var(--dim)' }}>Anonymous, always</span>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 16px 100px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
            Loading confessions…
          </div>
        )}

        {!loading && confessions.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 20px', textAlign: 'center' }}>
            <span style={{ color: 'var(--glass-border)' }}>{Vectors.Ghost}</span>
            <p style={{ margin: 0, color: 'var(--dim)', fontSize: 14 }}>
              No confessions yet. Be the first to say the thing.
            </p>
          </div>
        )}

        {!loading && confessions.map((confession) => {
          const isHighlighted = highlightedId === confession.id;
          return (
            <div
              key={confession.id}
              id={`confession-${confession.id}`}
              style={{
                borderRadius: 24,
                transition: 'box-shadow 300ms ease, background-color 300ms ease',
                boxShadow: isHighlighted ? '0 0 0 3px var(--ember)' : '0 0 0 0 transparent',
                background: isHighlighted ? 'color-mix(in srgb, var(--ember) 8%, transparent)' : 'transparent',
              }}
            >
              <ConfessionBubble confession={confession} size="feed" userId={session?.user?.id} onPhotoClick={(c) => setViewerMedia({ url: c.photo_url, type: 'image' })} />
            </div>
          );
        })}
      </div>

      {/* Radial quick-actions: Write / Photo, staggered in via .fab-radial-item */}
      {fabOpen && (
        <>
          <button
            type="button"
            onClick={() => openComposer(false)}
            className="fab-radial-item"
            style={{
              '--i': 0, '--tx': '0px', '--ty': '-76px',
              position: 'absolute', right: 22, bottom: 96, zIndex: 41,
              width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--glass-border)',
              background: 'var(--ink-2)', color: 'var(--paper)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            }}
            title="Write a confession"
          >
            {Vectors.Pencil}
          </button>
          <button
            type="button"
            onClick={() => openComposer(true)}
            className="fab-radial-item"
            style={{
              '--i': 1, '--tx': '-58px', '--ty': '-52px',
              position: 'absolute', right: 22, bottom: 96, zIndex: 41,
              width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--glass-border)',
              background: 'var(--ink-2)', color: 'var(--paper)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            }}
            title="Attach a photo"
          >
            {Vectors.Photo}
          </button>
        </>
      )}

      {fabOpen && (
        <div
          onClick={() => setFabOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 40 }}
        />
      )}

      <button
        key={fabTapKey}
        type="button"
        onClick={handleFabTap}
        className="fab-tap"
        style={{
          position: 'absolute', right: 20, bottom: 24, zIndex: 42,
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: 'var(--ember)', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {Vectors.Plus}
      </button>

      <ComposerSheet
        open={composerOpen}
        onClose={() => !submitting && setComposerOpen(false)}
        initialPhotoIntent={composerPhotoIntent}
        onSubmit={handleComposerSubmit}
        submitting={submitting}
      />

      <MediaViewer mediaUrl={viewerMedia?.url} mediaType={viewerMedia?.type} open={viewerMedia !== null} onClose={() => setViewerMedia(null)} />
    </div>
  );
}
