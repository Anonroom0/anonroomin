/** ===========================================================================
 * CREATE CONFESSION MODAL
 * ============================================================================
 * <CreateConfessionModal open onClose onCreated={(confession) => {}} /> — a
 * GlassPanel "sheet" mirroring CreateQuestionModal.jsx's shape, but for
 * posting straight into the public confessions feed. Tapping "Add
 * Confession" on the Ask Me tab (see Home.jsx) opens this; submitting
 * inserts directly into `confessions` with group_id: null, visibility:
 * 'public' — the exact same row shape the public feed itself reads (see
 * ConfessionsFeed.jsx's own composer).
 *
 * Anonymity: `confessions_insert_own`'s RLS check requires author_id =
 * auth.uid() on every insert, anon or not (see
 * 0005_confessions_author_id_always.sql) — author_id is always recorded so
 * moderators can trace a confession back to its poster, but is_anon is what
 * the toggle here actually drives, and it's what every reader (feed, group
 * inline, story) uses to decide whether to show the poster's name/avatar.
 * ========================================================================= */

import { useState, useRef, useEffect } from 'react';
import GlassPanel from '../shared/GlassPanel';
import SendButton from '../shared/SendButton';
import GlassToggle from '../shared/GlassToggle';
import { useAuth } from '../../lib/authContext';
import supabase from '../../lib/supabaseClient';
import { showToast, friendlyDbError } from '../../lib/toast';
import { hapticTap, hapticSend, hapticSuccess, hapticError, hapticSelect, hapticImpact } from '../../lib/haptics';
import { playTap, playSend, playRefreshComplete, playError } from '../../lib/soundManager';
import { generateStoryImage } from '../../lib/storyImageGenerator';
import { BACKGROUND_STRUCTURES, ACCENT_COLORS, BODY_SHAPES, BODY_SCALES } from '../../lib/storyStylePresets';

const MAX_CONFESSION_LENGTH = 500;

function randomPresetId(list) {
  return list[Math.floor(Math.random() * list.length)].id;
}

function randomStoryStyle() {
  return {
    backgroundId: randomPresetId(BACKGROUND_STRUCTURES),
    colorId: randomPresetId(ACCENT_COLORS),
    shapeId: randomPresetId(BODY_SHAPES),
    scaleId: randomPresetId(BODY_SCALES),
  };
}

const Vectors = {
  Close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Photo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Palette: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.3c1.9 0 3.4-1.6 3.2-3.5C20 6.6 16.4 2 12 2z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export default function CreateConfessionModal({ open, onClose, onCreated }) {
  if (!open) return null;

  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <CreateConfessionModalContent
        onCreated={(confession) => {
          onCreated?.(confession);
          onClose?.();
        }}
      />
    </GlassPanel>
  );
}

function CreateConfessionModalContent({ onCreated }) {
  const { session } = useAuth();

  const [text, setText] = useState('');
  const [isAnon, setIsAnon] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  // Customize: picks a Background/Colour/Shape/Size combo (same preset
  // lists ShareStorySheet uses) to store as small JSON on the confession
  // row rather than rendering + uploading a PNG up front — see
  // storyStylePresets.js and the 0002 migration. `storyStyle` null means
  // "not customized"; the confession posts as a plain text/photo bubble.
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [storyStyle, setStoryStyle] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);
  const previewTokenRef = useRef(0);

  const trimmedText = text.trim();
  // Allow sending if there is either text OR an attachment, and text isn't too long
  const canSend = (trimmedText.length > 0 || pendingFile) && trimmedText.length <= MAX_CONFESSION_LENGTH;

  // Cleanup object URL when component unmounts or file changes to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    };
  }, [pendingFile]);

  // Live preview of the customized story card — renders through the exact
  // same generateStoryImage() pipeline the actual story viewer will use, so
  // what's shown here is exactly what other people will see, just rendered
  // on demand instead of pre-baked into an uploaded image.
  useEffect(() => {
    if (!customizeOpen || !storyStyle) {
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
      setPreviewUrl(null);
      return undefined;
    }
    const token = ++previewTokenRef.current;
    setPreviewLoading(true);
    generateStoryImage({
      kind: 'reply',
      questionText: '',
      replyText: trimmedText || 'Your confession will appear here…',
      backgroundId: storyStyle.backgroundId,
      colorId: storyStyle.colorId,
      shapeId: storyStyle.shapeId,
      scaleId: storyStyle.scaleId,
      template: 'basic',
    })
      .then((blob) => {
        if (previewTokenRef.current !== token) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewLoading(false);
      })
      .catch(() => {
        if (previewTokenRef.current !== token) return;
        setPreviewLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customizeOpen, storyStyle, trimmedText]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function handleToggleCustomize() {
    hapticTap();
    playTap();
    if (customizeOpen) {
      setCustomizeOpen(false);
      return;
    }
    setCustomizeOpen(true);
    if (!storyStyle) setStoryStyle(randomStoryStyle());
  }

  function handleShuffleStyle() {
    hapticImpact();
    playTap();
    setStoryStyle(randomStoryStyle());
  }

  function handleRemoveCustomization() {
    hapticTap();
    playTap();
    setStoryStyle(null);
    setCustomizeOpen(false);
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // Reset input so the same file can be selected again if removed
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    setPendingFile({
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo,
    });
  }

  function removeFile() {
    if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
  }

  async function handleCreate() {
    if (!canSend || isSubmitting || !session?.user) return;
    hapticSend();
    playSend();
    setIsSubmitting(true);

    try {
      let uploadedUrl = null;

      // 1. Upload media if present
      if (pendingFile) {
        const { file } = pendingFile;
        // Clean filename to prevent storage path issues
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const path = `${session.user.id}/confession-${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage.from('media').upload(path, file);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(path);
        uploadedUrl = publicUrlData?.publicUrl;
      }

      // 2. Insert confession record
      const { data, error } = await supabase
        .from('confessions')
        .insert({
          text: trimmedText || null, // Convert empty string to null for clean DB
          photo_url: uploadedUrl,
          group_id: null,
          visibility: 'public',
          is_anon: isAnon,
          // Always recorded, even when posting anonymously — is_anon is
          // what drives hiding the name/avatar in the UI, not whether the
          // row remembers who posted it (matches confessions_insert_own's
          // RLS check, see 0005_confessions_author_id_always.sql).
          author_id: session.user.id,
          // Only the preset ids — no rendered image is uploaded anywhere;
          // the story viewer renders this on demand (see 0002 migration).
          story_style: storyStyle && trimmedText ? storyStyle : null,
        })
        .select()
        .single();

      if (error) throw error;

      setText('');
      removeFile();
      setStoryStyle(null);
      setCustomizeOpen(false);
      onCreated(data);
      playRefreshComplete(); hapticSuccess();
      showToast('Confession posted', 'success');
    } catch (error) {
      console.error('Error creating confession:', error.message);
      playError(); hapticError();
      showToast(friendlyDbError('Could not post your confession. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 20px 28px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--paper)' }}>Add Confession</div>

      <div
        style={{
          borderRadius: 20,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-white)',
          backdropFilter: 'blur(20px) saturate(115%)',
          padding: '4px 4px 0',
        }}
      >
        <textarea
          name="add-confession-composer"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore
          data-form-type="other"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CONFESSION_LENGTH))}
          placeholder="Post it straight to the public confessions feed…"
          rows={pendingFile ? 3 : 5}
          style={{
            width: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--paper)',
            fontSize: 16,
            fontFamily: 'inherit',
            padding: '14px 16px 4px',
            boxSizing: 'border-box',
          }}
        />

        {/* Media Preview Thumbnail */}
        {pendingFile && (
          <div style={{ position: 'relative', width: 80, height: 80, margin: '0 16px 12px' }}>
            {pendingFile.isVideo ? (
              <video src={pendingFile.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
            ) : (
              <img src={pendingFile.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} alt="Preview" />
            )}
            <button
              onClick={() => { hapticTap(); playTap(); removeFile(); }}
              disabled={isSubmitting}
              style={{
                position: 'absolute', top: -6, right: -6, background: '#2A2B36', color: '#F4F3F0',
                border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}
            >
              {Vectors.Close}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 10px' }}>
          {/* File Upload Button */}
          <button
            type="button"
            onClick={() => { hapticTap(); playTap(); fileInputRef.current?.click(); }}
            disabled={isSubmitting || pendingFile} // Disable if already uploading or file selected
            style={{
              background: 'transparent', border: 'none', color: pendingFile ? 'rgba(255,255,255,0.1)' : 'var(--dim)',
              cursor: pendingFile ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              padding: 0, fontSize: 13, fontWeight: 600, transition: 'color 0.2s'
            }}
          >
            {Vectors.Photo} {pendingFile ? 'Media Added' : 'Add Media'}
          </button>

          <input 
            type="file" 
            accept="image/*,video/*" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileSelect} 
          />

          {/* Customize — pick a story style for this confession without
              rendering/uploading an image; see the panel below. */}
          <button
            type="button"
            onClick={handleToggleCustomize}
            disabled={isSubmitting || trimmedText.length === 0}
            style={{
              background: storyStyle ? 'rgba(255,107,53,0.14)' : 'transparent',
              border: 'none',
              borderRadius: 999,
              padding: '5px 10px',
              color: trimmedText.length === 0 ? 'rgba(255,255,255,0.15)' : storyStyle ? 'var(--ember)' : 'var(--dim)',
              cursor: trimmedText.length === 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 700, transition: 'color 0.2s, background 0.2s',
            }}
          >
            {Vectors.Palette} {storyStyle ? 'Customized' : 'Customize'}
          </button>

          {/* Character Count */}
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            {trimmedText.length}/{MAX_CONFESSION_LENGTH}
          </div>
        </div>
      </div>

      {customizeOpen && storyStyle && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: 16,
            borderRadius: 20,
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-white)',
            backdropFilter: 'blur(20px) saturate(115%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--paper)' }}>Story style</span>
            <div style={{ display: 'flex', gap: 14 }}>
              <button type="button" onClick={handleShuffleStyle} style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 13, fontWeight: 800, padding: 0 }}>
                Shuffle
              </button>
              <button type="button" onClick={handleRemoveCustomization} style={{ border: 'none', background: 'transparent', color: 'var(--dim)', fontSize: 13, fontWeight: 700, padding: 0 }}>
                Remove
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 96,
                aspectRatio: '1080 / 1920',
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--ink-2)',
                border: '1px solid var(--glass-border)',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {previewUrl && (
                <img src={previewUrl} alt="Story preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: previewLoading ? 0.5 : 1, transition: 'opacity 150ms ease' }} />
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              {[
                { label: 'Background', list: BACKGROUND_STRUCTURES, key: 'backgroundId' },
                { label: 'Colour', list: ACCENT_COLORS, key: 'colorId' },
                { label: 'Shape', list: BODY_SHAPES, key: 'shapeId' },
                { label: 'Size', list: BODY_SCALES, key: 'scaleId' },
              ].map(({ label, list, key }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--dim)' }}>{label}</span>
                  <select
                    value={storyStyle[key]}
                    onChange={(e) => { hapticSelect(); playTap(); setStoryStyle((prev) => ({ ...prev, [key]: e.target.value })); }}
                    style={{
                      flex: 1, maxWidth: 150, background: 'var(--ink-2)', color: 'var(--paper)',
                      border: '1px solid var(--glass-border)', borderRadius: 10, padding: '6px 10px',
                      fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {list.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: 'var(--ink-2)', color: 'var(--paper)' }}>{p.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)', lineHeight: 1.4 }}>
            Only this style choice is saved — the story image itself is rendered by the app when someone views it, so posting doesn't upload an extra picture.
          </p>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          borderRadius: 20,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-white)',
          backdropFilter: 'blur(20px) saturate(115%)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--paper)' }}>
            Post anonymously
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--dim)', marginTop: 2, lineHeight: 1.35 }}>
            {isAnon ? 'Your name won\u2019t be attached to this confession.' : 'This will show your name.'}
          </span>
        </div>
        <GlassToggle checked={isAnon} onChange={setIsAnon} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
        <span style={{ color: 'var(--dim)', fontSize: 14 }}>
          {isSubmitting ? 'Posting…' : 'Post'}
        </span>
        <SendButton canSend={canSend} sending={isSubmitting} onClick={handleCreate} />
      </div>
    </div>
  );
}
