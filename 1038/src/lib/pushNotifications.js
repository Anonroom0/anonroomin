/** ===========================================================================
 * PUSH NOTIFICATION HELPERS
 * ============================================================================
 * Single source of truth for browser push-subscription state and actions.
 * Previously this logic was duplicated inline in Home.jsx's first-run
 * notification prompt and EditProfile.jsx's notification toggle; both (plus
 * the newer NotificationSettingsPanel.jsx) now import from here instead of
 * re-implementing subscribe/unsubscribe/status checks themselves.
 *
 * Exports:
 *   - getPushStatus(): async status probe, no side effects.
 *   - subscribeToPush(userId): requests permission, subscribes, persists row.
 *   - unsubscribeFromPush(userId): tears down browser + db subscription.
 * ========================================================================= */

import supabase from './supabaseClient';
import { isGroupSubdomain } from './subdomain';

/**
 * Converts a URL-safe base64 VAPID public key into the Uint8Array shape the
 * Push API's `applicationServerKey` option expects. The inline code this
 * was extracted from passed the raw string through directly (with a
 * placeholder key, it never actually hit a real browser subscribe call);
 * a real VAPID key needs this conversion to work, so it's added here as
 * the judgment call this extraction surfaces.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Reads current push-notification status without changing anything.
 * Returns one of: 'unsupported' | 'default' | 'denied' | 'subscribed' | 'unsubscribed'.
 */
export async function getPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  if (Notification.permission === 'default') {
    return 'default';
  }

  // Permission is 'granted' at this point — check whether an active
  // browser subscription actually exists.
  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    return existingSubscription ? 'subscribed' : 'unsubscribed';
  } catch (err) {
    console.warn('Could not check push subscription:', err);
    return 'unsubscribed';
  }
}

/**
 * Requests notification permission (if needed), subscribes the browser to
 * push, and persists the subscription to push_subscriptions. Row shape
 * matches exactly what the inline Home.jsx / EditProfile.jsx code already
 * inserted — this does not change the schema assumption.
 *
 * Returns true on success, false if permission was denied or subscribing
 * failed for any other reason. Throws only on truly unexpected errors so
 * callers can decide how to surface failure (toast, silent, etc).
 */
 export async function subscribeToPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  // Never prompt for push permission from a group subdomain — see
  // isGroupSubdomain()'s comment in subdomain.js. This mirrors the
  // LocationBanner guard in App.jsx: permission prompts are root-domain-only.
  // Also technically necessary, not just a UX choice — the Push API scopes
  // subscriptions per-origin, so a subscription created here wouldn't be
  // reachable from the root app anyway; better to fail closed with a clear
  // reason than silently create an orphaned, unusable subscription.
  if (isGroupSubdomain()) {
    throw new Error('Push notifications can only be enabled from the main site, not from a group page.');
  }

  // Fail loud and specific here. Without this check, a missing/blank env
  // var falls through to urlBase64ToUint8Array(undefined), which throws a
  // generic "Cannot read properties of undefined (reading 'length')" deep
  // in a helper — a caller catching that has no way to tell "misconfigured
  // build" apart from "browser rejected the subscribe call". This is also
  // why the toggle can look like it silently does nothing: the panel's
  // catch block just re-probes status and flips the toggle back off.
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error(
      'VITE_VAPID_PUBLIC_KEY is not set — push notifications cannot be enabled until it is configured in the build environment.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const subJSON = subscription.toJSON();

  // FIX: Use upsert to prevent errors if the device re-subscribes 
  // Make sure 'endpoint' is set as a UNIQUE column in your Supabase table!
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subJSON.endpoint,
    p256dh: subJSON.keys.p256dh,
    auth: subJSON.keys.auth,
  }, { 
    onConflict: 'endpoint' 
  });

  if (error) {
    // The browser-level subscribe already succeeded by this point, so
    // getPushStatus() would report 'subscribed' even though nothing was
    // ever persisted — the toggle would show "on" while the server has no
    // way to actually reach this device. Unwind the browser subscription
    // too so the two states can't drift apart; the caller sees this as a
    // clean failure instead of a lying success.
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }

  return true;
}

export async function unsubscribeFromPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint; // Grab the endpoint before unsubscribing
    await subscription.unsubscribe();
    
    // FIX: Delete only this specific device's endpoint, not the whole user
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);
      
    if (error) throw error;
  }
}
