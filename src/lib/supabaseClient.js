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

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: {
        getItem: (key) => {
          const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
          return match ? match[2] : null;
        },
        setItem: (key, value) => {
          document.cookie = `${key}=${value}; path=/; domain=${cookieDomain}; max-age=31536000; SameSite=Lax; Secure`;
        },
        removeItem: (key) => {
          document.cookie = `${key}=; path=/; domain=${cookieDomain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      }
    }
  }
);

export default supabase;
