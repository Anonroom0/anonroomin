/** ===========================================================================
 * REACTIONS
 * ============================================================================
 * Shared helpers for the polymorphic `reactions` table (target_type,
 * target_id, user_id, emoji), unique on (target_type, target_id, user_id) —
 * one reaction per user per target, changeable, toggle-off on repeat-tap.
 * Any component reacting to group messages, DM messages, or confessions
 * imports from here rather than re-deriving this logic locally.
 * ========================================================================= */

import supabase from './supabaseClient';

/**
 * Adds, changes, or removes the current user's reaction on a target.
 * - No existing row for (target_type, target_id, user_id) -> insert.
 * - Existing row with the SAME emoji -> delete (un-react).
 * - Existing row with a DIFFERENT emoji -> update to the new emoji.
 */
export async function toggleReaction({ targetType, targetId, userId, emoji }) {
  const { data: existing, error: selectError } = await supabase
    .from('reactions')
    .select('id, emoji')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    if (existing.emoji === emoji) {
      const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
      if (error) throw error;
      return { action: 'removed' };
    }

    const { error } = await supabase.from('reactions').update({ emoji }).eq('id', existing.id);
    if (error) throw error;
    return { action: 'changed' };
  }

  const { error } = await supabase.from('reactions').insert({
    target_type: targetType,
    target_id: targetId,
    user_id: userId,
    emoji,
  });
  if (error) throw error;
  return { action: 'added' };
}

/**
 * Aggregates all reactions on a target into per-emoji counts, plus whether
 * the current session's user is the one behind each emoji.
 * Returns e.g. [{ emoji: '🔥', count: 3, reactedByMe: true }, ...].
 */
export async function fetchReactionSummary(targetType, targetId) {
  const [{ data: rows, error }, { data: sessionData }] = await Promise.all([
    supabase
      .from('reactions')
      .select('emoji, user_id')
      .eq('target_type', targetType)
      .eq('target_id', targetId),
    supabase.auth.getSession(),
  ]);

  if (error) throw error;

  const currentUserId = sessionData?.session?.user?.id ?? null;
  const byEmoji = new Map();

  for (const row of rows || []) {
    const entry = byEmoji.get(row.emoji) || { emoji: row.emoji, count: 0, reactedByMe: false };
    entry.count += 1;
    if (currentUserId && row.user_id === currentUserId) {
      entry.reactedByMe = true;
    }
    byEmoji.set(row.emoji, entry);
  }

  return Array.from(byEmoji.values());
}

/**
 * Subscribes to realtime changes on the reactions table for one target and
 * invokes onChange() (no payload — callers re-fetch the summary) on any
 * insert/update/delete. Mirrors the channel-setup/cleanup pattern used in
 * GroupChat.jsx's message subscription.
 *
 * Realtime postgres_changes filters only support a single column=eq.value
 * condition, so this filters on target_id (the more selective column) and
 * double-checks target_type client-side before firing onChange, to stay
 * correct across targets that might share an id space.
 *
 * Returns the channel — callers should call supabase.removeChannel(channel)
 * on cleanup, exactly as GroupChat.jsx does for its own subscription.
 */
export function subscribeToReactions(targetType, targetId, onChange) {
  const channel = supabase
    .channel(`reactions:${targetType}:${targetId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'reactions', filter: `target_id=eq.${targetId}` },
      (payload) => {
        const row = payload.new?.target_type ? payload.new : payload.old;
        if (row?.target_type === targetType) {
          onChange();
        }
      }
    )
    .subscribe();

  return channel;
}
