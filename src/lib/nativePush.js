/** ===========================================================================
 * NATIVE PUSH NOTIFICATION HELPERS (Android APK / Capacitor only)
 * ============================================================================
 * Parallel to pushNotifications.js (browser Web Push/VAPID), but for the
 * wrapped Android app: uses Capacitor's PushNotifications plugin to get an
 * FCM token and persists it to Supabase so send-push's FCM branch can target
 * this device. No-ops entirely on web — safe to import/call unconditionally
 * from app init code that runs on both platforms.
 *
 * Exports:
 *   - initNativePush(userId, { onNotificationTap }): sets up permissions,
 *     registration, and listeners. Call once after login.
 *   - teardownNativePush(): removes all listeners (call on logout).
 * ========================================================================= */

import { Capacitor } from '@capacitor/core';
import supabase from './supabaseClient';

let registeredListeners = [];

/**
 * Persists (or refreshes) the current device's FCM token for this user.
 * One row per token — if the same physical device re-registers (token
 * rotated by FCM), the old row for that token is simply replaced; stale
 * tokens from other devices are left alone and cleaned up server-side
 * when a send to them fails (handled in the send-push edge function).
 */
async function saveFcmToken(userId, token) {
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

  if (error) {
    console.error('[nativePush] Failed to save FCM token:', error);
  }
}

/**
 * Sets up native push for the current user. Safe to call on web (it just
 * returns immediately) so call sites don't need their own platform check.
 *
 * @param {string} userId
 * @param {{ onNotificationTap?: (data: Record<string, string>) => void }} [opts]
 *   onNotificationTap fires when the user taps a system notification (app
 *   was backgrounded/killed). Step 9 wires this to the router for deep
 *   linking into the right chat/group.
 */
export async function initNativePush(userId, opts = {}) {
  if (!Capacitor.isNativePlatform()) return;
  if (!userId) return;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  const permStatus = await PushNotifications.checkPermissions();
  let granted = permStatus.receive === 'granted';

  if (permStatus.receive === 'prompt') {
    const requested = await PushNotifications.requestPermissions();
    granted = requested.receive === 'granted';
  }

  if (!granted) {
    console.warn('[nativePush] Notification permission denied');
    return;
  }

  const registrationListener = await PushNotifications.addListener(
    'registration',
    (token) => {
      saveFcmToken(userId, token.value);
    }
  );

  const registrationErrorListener = await PushNotifications.addListener(
    'registrationError',
    (err) => {
      console.error('[nativePush] Registration error:', err);
    }
  );

  // App is in foreground when this fires — no system notification is
  // shown automatically, so surface it however the UI layer wants
  // (toast/badge). Left as a no-op here; wire up a callback if needed.
  const receivedListener = await PushNotifications.addListener(
    'pushNotificationReceived',
    (notification) => {
      console.log('[nativePush] Foreground notification:', notification);
    }
  );

  const actionListener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      const data = action.notification?.data ?? {};
      opts.onNotificationTap?.(data);
    }
  );

  registeredListeners = [
    registrationListener,
    registrationErrorListener,
    receivedListener,
    actionListener,
  ];

  await PushNotifications.register();
}

/** Call on logout to stop listening (does not delete the saved token row). */
export async function teardownNativePush() {
  if (!Capacitor.isNativePlatform()) return;
  await Promise.all(registeredListeners.map((l) => l.remove()));
  registeredListeners = [];
}