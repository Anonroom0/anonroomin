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
 *
 * v2: the Vibration API has no amplitude control — a buzz can only be made
 * to feel "stronger" by holding it on longer and/or layering more pulses,
 * not by hitting it harder. Every pattern below was lengthened/thickened
 * from v1 (which used 6–20ms blips, too short to reliably register on a
 * lot of Android hardware and easy to miss entirely) so the whole app's
 * haptics read as firm and intentional instead of a faint tickle.
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

/** Generic button/row taps, tab switches — firm single buzz. */
export function hapticTap() {
  vibrate(20);
}

/** Sending a message, posting a confession/question — heavier confirmed thump. */
export function hapticSend() {
  vibrate(35);
}

/** Two-pulse confirmation — successful action (saved, refreshed, copied). */
export function hapticSuccess() {
  vibrate([30, 55, 30]);
}

/** Selection/toggle change — reaction picked, switch flipped, swatch tapped. Kept a notch lighter than hapticTap for rapid-fire browsing (color grids, style galleries). */
export function hapticSelect() {
  vibrate(15);
}

/** Sharp triple-buzz — errors, denials, destructive confirmations. */
export function hapticError() {
  vibrate([40, 45, 40, 45, 55]);
}

/** Heaviest single pulse — big/rare moments: sheet fully opened, share sent, admin action, long-press context menu armed. */
export function hapticImpact() {
  vibrate(50);
}

/** Soft double-tick — a sheet/modal sliding open or closed. */
export function hapticSheet() {
  vibrate([12, 30, 18]);
}
