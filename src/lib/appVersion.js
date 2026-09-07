/**
 * App version helpers for the Capacitor Android build and the
 * remote /apk/version.json check used by Edit Profile → Check for update.
 *
 * APP_VERSION is baked in at Vite build time via VITE_APP_VERSION
 * (set by CI to e.g. 0.1.0.42). Falls back to package default.
 *
 * On native (Capacitor), fetch must hit the live website — a relative
 * /apk/version.json would only read the copy bundled into the APK.
 */

export const APP_VERSION =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_VERSION) ||
  '0.1.0';

const PRODUCTION_VERSION_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VERSION_JSON_URL) ||
  'https://anonroom.in/apk/version.json';

export async function fetchLatestAppVersion() {
  // Prefer absolute production URL so the APK always checks the live site.
  // Fall back to same-origin for local web dev.
  const candidates = [
    PRODUCTION_VERSION_URL,
    '/apk/version.json',
  ];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      const data = await res.json();
      if (!data || typeof data.version !== 'string') {
        lastErr = new Error('Invalid version payload');
        continue;
      }
      return {
        version: data.version,
        apkUrl:
          typeof data.apkUrl === 'string' && data.apkUrl
            ? data.apkUrl
            : 'https://anonroom.in/apk/download/',
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not check for updates');
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
