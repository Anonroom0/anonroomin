/**
 * src/lib/toast.js
 *
 * Tiny, dependency-free toast/notification utility.
 *
 * This module contains NO React and renders NOTHING itself. It simply
 * dispatches a CustomEvent on `window` whenever a toast should be shown.
 * A separate <ToastContainer /> component is responsible for listening
 * for that event and rendering the actual UI.
 *
 * Usage:
 *   import { showToast, friendlyDbError } from '../lib/toast';
 *
 *   showToast('Saved!', 'success');
 *   showToast(friendlyDbError()); // safe fallback for DB/Supabase errors
 */

// Name of the custom event that <ToastContainer /> listens for.
// Keep this in sync with the listener in the container component.
export const TOAST_EVENT_NAME = 'anonroom:toast';

/**
 * Generates a reasonably unique id for a toast.
 *
 * Prefers crypto.randomUUID() when available (modern browsers, secure
 * contexts). Falls back to a timestamp + random number combo so this
 * still works in older/non-secure environments.
 *
 * @returns {string} a unique-enough id for keying/removing a toast
 */
function generateToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: not cryptographically unique, but unique enough for
  // distinguishing toasts within a single browser session.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Shows a toast notification by dispatching a CustomEvent on `window`.
 *
 * This function does not render anything itself. It is purely a
 * message bus: any mounted <ToastContainer /> is expected to be
 * listening for the 'anonroom:toast' event and will handle displaying
 * (and eventually dismissing) the toast.
 *
 * @param {string} message - The text to display to the user.
 * @param {'error'|'success'|'info'} [type='error'] - The toast's visual/semantic type.
 */
export function showToast(message, type = 'error') {
  const id = generateToastId();

  const event = new CustomEvent(TOAST_EVENT_NAME, {
    detail: { id, message, type },
  });

  window.dispatchEvent(event);
}

/**
 * Returns a safe, user-friendly error message.
 *
 * IMPORTANT: Raw error text from Supabase/Postgres (e.g. error.message)
 * must never be shown directly to the user — it can leak internal
 * schema details, constraint names, or other implementation info.
 * Always call this helper (optionally with a custom fallback) instead
 * of passing a raw DB error message into showToast().
 *
 * Example:
 *   try {
 *     await supabase.from('rooms').insert(...);
 *   } catch (err) {
 *     showToast(friendlyDbError());
 *   }
 *
 * @param {string} [fallback="Something went wrong. Please try again."]
 * @returns {string} the fallback message, unchanged
 */
export function friendlyDbError(fallback = 'Something went wrong. Please try again.') {
  return fallback;
}
