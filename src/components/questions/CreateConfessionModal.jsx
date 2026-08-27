/** ===========================================================================
 * CREATE CONFESSION MODAL
 * ============================================================================
 * <CreateConfessionModal open onClose onCreated={(confession) => {}} /> — a
 * GlassPanel "sheet" mirroring CreateQuestionModal.jsx's shape, but for
 * posting straight into the public confessions feed. Tapping "Add
 * Confession" on the Ask Me tab (see Home.jsx) opens this; submitting
 * inserts directly into `confessions` with group_id: null, visibility:
 * 'public' — the exact same row shape the public feed itself reads (see
 * ConfessionsFeed.jsx's own composer). This is a text-only, no-photo
 * shortcut — ConfessionsFeed.jsx already has the full composer (with photo
 * upload) for anyone who needs that; this is the fast path.
 *
 * Anonymity: `confessions_insert_own`'s RLS check requires
 * (is_anon = true AND author_id IS NULL) OR (is_anon = false AND author_id =
 * auth.uid()) — so the toggle here directly drives which of those two
 * shapes gets inserted, exactly like GroupChat.jsx's own confession toggle.
 * ========================================================================= */

import { useState } from 'react';
import GlassPanel from '../shared/GlassPanel';
import SendButton from '../shared/SendButton';
import GlassToggle from '../shared/GlassToggle';
import { useAuth } from '../../lib/authContext';
import supabase from '../../lib/supabaseClient';
import { showToast, friendlyDbError } from '../../lib/toast';

const MAX_CONFESSION_LENGTH = 500;

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

  const trimmedText = text.trim();
  const canSend = trimmedText.length > 0 && trimmedText.length <= MAX_CONFESSION_LENGTH;

  async function handleCreate() {
    if (!canSend || isSubmitting || !session?.user) return;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('confessions')
        .insert({
          text: trimmedText,
          photo_url: null,
          group_id: null,
          visibility: 'public',
          is_anon: isAnon,
          author_id: isAnon ? null : session.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setText('');
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
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CONFESSION_LENGTH))}
          placeholder="Post it straight to the public confessions feed…"
          rows={5}
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
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--dim)', padding: '0 16px 10px' }}>
          {trimmedText.length}/{MAX_CONFESSION_LENGTH}
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
