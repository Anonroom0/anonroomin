/**
 * App version helpers for the Capacitor Android build and the
 * /apk/version.json remote check used by Edit Profile → Check for update.
 *
 * Keep APP_VERSION in sync with package.json "version" when you cut a release.
 * CI can overwrite public/apk/version.json (and the download page APK href)
 * without touching this constant — the installed app compares itself to
 * whatever version.json reports.
 */

export const APP_VERSION = '0.1.0';

export async function fetchLatestAppVersion() {
  const res = await fetch(`/apk/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not check for updates');
  const data = await res.json();
  if (!data || typeof data.version !== 'string') {
    throw new Error('Invalid version payload');
  }
  return {
    version: data.version,
    apkUrl: typeof data.apkUrl === 'string' && data.apkUrl ? data.apkUrl : '/apk/download/',
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
