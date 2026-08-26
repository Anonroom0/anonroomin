/** ===========================================================================
 * CREATE QUESTION MODAL
 * ============================================================================
 * <CreateQuestionModal open onClose onCreated={(question) => {}} /> — a
 * GlassPanel "sheet" for composing a new question. Two prominent type
 * buttons ("Personal" / "General") gate the rest of the form: nothing else
 * is interactive until one is picked, matching "setting question_type
 * before the form is usable". A textarea holds the question text, and a
 * SendButton-styled "Create" action inserts the row (author_id = the
 * current session user) into `questions`.
 *
 * On successful creation this modal doesn't just close — it hands off
 * straight into ShareStorySheet (see src/components/questions/
 * ShareStorySheet.jsx) with the freshly-created question, so the person can
 * immediately turn it into a shareable story image. That handoff replaces
 * this component's own sheet content rather than stacking a second sheet on
 * top of it: internal `phase` flips from 'form' to 'sharing', and this
 * component renders ShareStorySheet directly (still gated by the same
 * `open` the parent passed in), rather than mounting two nested
 * GlassPanel-sheet backdrops at once.
 *
 * COLUMN NAME NOTE: `question_type` is the real column on `questions` per
 * this prompt (values used here: 'personal' | 'general'). ShareStorySheet
 * was written earlier without the real schema attached and guessed at a
 * `type` field internally (its QUESTION_TYPE_FIELD constant). Rather than
 * silently producing a row shape ShareStorySheet can't read, the row handed
 * to onCreated/ShareStorySheet below includes `type` as an alias of
 * `question_type` — a small compat shim, called out here so it's obvious to
 * remove once ShareStorySheet's QUESTION_TYPE_FIELD is updated to
 * 'question_type' to match the real schema.
 * ========================================================================= */

import { useState } from 'react';
import GlassPanel from '../GlassPanel';
import SendButton from '../SendButton';
import ShareStorySheet from './ShareStorySheet';
import { useAuth } from '../../lib/authContext';
import supabase from '../../lib/supabaseClient';
import { showToast, friendlyDbError } from '../../lib/toast';

const QUESTION_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'general', label: 'General' },
];

const MAX_QUESTION_LENGTH = 280;

export default function CreateQuestionModal({ open, onClose, onCreated }) {
  // Own mount/unmount is fully controlled by the parent via `open` (per the
  // spec's call shape) — resetting `phase`/`createdQuestion` back to their
  // initial values happens for free whenever the parent unmounts this
  // component between uses, so no explicit reset effect is needed here.
  const [phase, setPhase] = useState('form'); // 'form' | 'sharing'
  const [createdQuestion, setCreatedQuestion] = useState(null);

  if (!open) return null;

  if (phase === 'sharing' && createdQuestion) {
    return <ShareStorySheet open onClose={onClose} question={createdQuestion} />;
  }

  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <CreateQuestionModalContent
        onCreated={(question) => {
          setCreatedQuestion(question);
          setPhase('sharing');
          onCreated?.(question);
        }}
      />
    </GlassPanel>
  );
}

function CreateQuestionModalContent({ onCreated }) {
  const { session } = useAuth();

  const [questionType, setQuestionType] = useState(null);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedText = text.trim();
  const canSend = !!questionType && trimmedText.length > 0 && trimmedText.length <= MAX_QUESTION_LENGTH;

  async function handleCreate() {
    if (!canSend || isSubmitting || !session?.user) return;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('questions')
        .insert({
          author_id: session.user.id,
          question_type: questionType,
          text: trimmedText,
        })
        .select()
        .single();

      if (error) throw error;

      // See the file banner's COLUMN NAME NOTE — `type` is an alias of the
      // real `question_type` column, kept only so ShareStorySheet's current
      // (pre-schema) guess can still read the question's type.
      onCreated({ ...data, type: data.question_type });
    } catch (error) {
      console.error('Error creating question:', error.message);
      showToast(friendlyDbError('Could not create the question. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 20px 28px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--paper)' }}>Ask a Question</div>

      <div style={{ display: 'flex', gap: 10 }}>
        {QUESTION_TYPES.map(({ value, label }) => {
          const isActive = questionType === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setQuestionType(value)}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 20,
                border: `1px solid ${isActive ? 'var(--ember)' : 'var(--glass-border)'}`,
                background: isActive ? 'var(--ember)' : 'var(--glass-white)',
                color: isActive ? 'var(--ink)' : 'var(--paper)',
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          borderRadius: 20,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-white)',
          backdropFilter: 'blur(20px) saturate(115%)',
          padding: '4px 4px 0',
          // Disabled until a type is picked — grayed out and non-interactive
          // rather than hidden, so the two-step flow (type, then text) stays
          // visible the whole time.
          opacity: questionType ? 1 : 0.45,
          pointerEvents: questionType ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_QUESTION_LENGTH))}
          placeholder={
            questionType === 'personal'
              ? 'Ask something personal…'
              : questionType === 'general'
                ? 'Ask me anything…'
                : 'Pick a question type first…'
          }
          disabled={!questionType}
          rows={4}
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
        <div
          style={{
            textAlign: 'right',
            fontSize: 12,
            color: 'var(--dim)',
            padding: '0 16px 10px',
          }}
        >
          {trimmedText.length}/{MAX_QUESTION_LENGTH}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
        <span style={{ color: 'var(--dim)', fontSize: 14 }}>
          {isSubmitting ? 'Creating…' : 'Create'}
        </span>
        <SendButton canSend={canSend} sending={isSubmitting} onClick={handleCreate} />
      </div>
    </div>
  );
}
