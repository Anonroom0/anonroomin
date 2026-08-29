import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.warn(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// ----------------------------------------------------------------------------
// CROSS-SUBDOMAIN AUTHENTICATION CONFIGURATION
// ----------------------------------------------------------------------------
// We determine the root domain dynamically. If we are on anonroom.in or
// slug.anonroom.in, the cookie domain is set to ".anonroom.in" so the login
// session is shared across all group subdomains.

const hostname = window.location.hostname;
let cookieDomain = hostname;

if (hostname.includes('anonroom.in')) {
  cookieDomain = '.anonroom.in';
} else if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
  cookieDomain = hostname; // Local development fallback
}

// Browsers cap a single cookie at ~4096 bytes (name+value+attributes) and
// silently drop or truncate the write past that — document.cookie never
// throws, so there's no signal when it happens. A full Supabase session
// (access token + refresh token + user record) can exceed that, especially
// once a token refresh grows it. If a write like that gets silently
// dropped, the OLD, now-expired token stays cached and keeps getting sent
// as the Authorization header on every future request — which PostgREST
// rejects with 401 before RLS is even evaluated, indefinitely, until the
// cookie is manually cleared. That's the failure mode this guards against:
// validate on read (never resend something corrupt/truncated) and cap +
// verify on write (never cache something the browser silently rejected).
const MAX_COOKIE_VALUE_BYTES = 3800; // headroom under the ~4096 byte cap for name+attrs

function removeCookie(key) {
  document.cookie = `${key}=; path=/; domain=${cookieDomain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: {
        getItem: (key) => {
          const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
          if (!match) return null;

          let raw;
          try {
            raw = decodeURIComponent(match[2]);
          } catch {
            // Malformed percent-encoding — definitely not a value we wrote.
            removeCookie(key);
            return null;
          }

          // Validate before ever handing this back to supabase-js: a
          // truncated write leaves invalid JSON, and resending it as a
          // session is exactly how a stale/expired token gets stuck in
          // permanent rotation. Treat anything that doesn't parse as "no
          // session" (falls back to the anon key) instead of a bad one.
          try {
            JSON.parse(raw);
          } catch {
            removeCookie(key);
            return null;
          }

          return raw;
        },
        setItem: (key, value) => {
          const encoded = encodeURIComponent(value);
          if (encoded.length > MAX_COOKIE_VALUE_BYTES) {
            // Don't write something the browser is likely to truncate
            // anyway — that would leave corrupt JSON behind. Clear any
            // previous value instead so the client falls back to
            // establishing a fresh session rather than replaying a stale
            // access token forever.
            console.warn(`Supabase session cookie "${key}" exceeds safe size (${encoded.length} bytes); clearing instead of risking truncation.`);
            removeCookie(key);
            return;
          }
          document.cookie = `${key}=${encoded}; path=/; domain=${cookieDomain}; max-age=31536000; SameSite=Lax; Secure`;
        },
        removeItem: (key) => {
          removeCookie(key);
        }
      }
    }
  }
);

export default supabase;
