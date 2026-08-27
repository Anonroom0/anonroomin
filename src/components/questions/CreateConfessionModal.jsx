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
 * Anonymity: `confessions_insert_own`'s RLS check requires
 * (is_anon = true AND author_id IS NULL) OR (is_anon = false AND author_id =
 * auth.uid()) — so the toggle here directly drives which of those two
 * shapes gets inserted, exactly like GroupChat.jsx's own confession toggle.
 * ========================================================================= */

import { useState, useRef, useEffect } from 'react';
import GlassPanel from '../shared/GlassPanel';
import SendButton from '../shared/SendButton';
import GlassToggle from '../shared/GlassToggle';
import { useAuth } from '../../lib/authContext';
import supabase from '../../lib/supabaseClient';
import { showToast, friendlyDbError } from '../../lib/toast';

const MAX_CONFESSION_LENGTH = 500;

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

  const fileInputRef = useRef(null);

  const trimmedText = text.trim();
  // Allow sending if there is either text OR an attachment, and text isn't too long
  const canSend = (trimmedText.length > 0 || pendingFile) && trimmedText.length <= MAX_CONFESSION_LENGTH;

  // Cleanup object URL when component unmounts or file changes to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    };
  }, [pendingFile]);

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
          author_id: isAnon ? null : session.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setText('');
      removeFile();
      onCreated(data);
      showToast('Confession posted', 'success');
    } catch (error) {
      console.error('Error creating confession:', error.message);
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
              onClick={removeFile}
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
            onClick={() => fileInputRef.current?.click()}
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

          {/* Character Count */}
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            {trimmedText.length}/{MAX_CONFESSION_LENGTH}
          </div>
        </div>
      </div>

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
