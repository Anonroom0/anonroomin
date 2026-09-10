/**
 * App version helpers for the Capacitor Android build.
 * Latest release is stored in public.app_releases (Supabase), not a static file.
 *
 * APP_VERSION is baked in at Vite build time via VITE_APP_VERSION
 * (CI sets e.g. 0.1.0.42). Falls back to the string below.
 */

import supabase from './supabaseClient';

export const APP_VERSION =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_VERSION) ||
  '0.1.1';

const PLATFORM_ID = 'android';

/**
 * @returns {Promise<{ version: string, apkUrl: string }>}
 */
export async function fetchLatestAppVersion() {
  const { data, error } = await supabase
    .from('app_releases')
    .select('version, apk_url')
    .eq('id', PLATFORM_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Could not check for updates');
  }
  if (!data || typeof data.version !== 'string' || !data.version.trim()) {
    throw new Error('No release row found');
  }

  return {
    version: data.version.trim(),
    apkUrl:
      (typeof data.apk_url === 'string' && data.apk_url.trim()) ||
      'https://anonroom.in/apk/download/',
  };
}

/** True when remote is strictly newer than local (semver-ish dotted ints). */
export function isNewerVersion(remote, local) {
  const parse = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(remote);
  const b = parse(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
