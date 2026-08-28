/** ===========================================================================
 * HAPTICS MANAGER
 * ============================================================================
 * Thin wrapper around navigator.vibrate() so every tactile buzz in the app
 * goes through one place instead of scattered inline navigator.vibrate()
 * calls. Mirrors soundManager.js's shape (isMuted/setMuted + named
 * play*-style helpers) so the two can be wired up together at the same
 * interaction points.
 *
 * navigator.vibrate is unsupported on iOS Safari and in some desktop
 * browsers — every helper here checks for it first and is a silent no-op
 * where it's missing, so it's always safe to call.
 * ========================================================================= */

const MUTE_STORAGE_KEY = 'anonroom_haptics_muted';

let mutedCache = readMutedFromStorage();

function readMutedFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
}

export function isHapticsMuted() {
  return mutedCache;
}

export function setHapticsMuted(muted) {
  mutedCache = !!muted;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(mutedCache));
  }
}

function vibrate(pattern) {
  if (mutedCache) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if called outside a user gesture — never let a
    // haptic failure break the interaction it's attached to.
  }
}

/** Lightest possible tick — generic button/row taps, tab switches. */
export function hapticTap() {
  vibrate(8);
}

/** Slightly firmer pulse — sending a message, posting a confession/question. */
export function hapticSend() {
  vibrate(12);
}

/** Two-pulse confirmation — successful action (saved, refreshed, copied). */
export function hapticSuccess() {
  vibrate([10, 40, 10]);
}

/** Selection/toggle change — reaction picked, switch flipped, message selected. */
export function hapticSelect() {
  vibrate(6);
}

/** Sharper double-buzz — errors, denials, destructive confirmations. */
export function hapticError() {
  vibrate([20, 30, 20]);
}
