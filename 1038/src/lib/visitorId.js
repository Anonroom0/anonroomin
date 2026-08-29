/** ===========================================================================
 * VISITOR ID
 * ============================================================================
 * Standalone cookie + localStorage "anonymous visitor id" helpers, extracted
 * out of App.jsx's LocationGate (where getCookieDomain / setCookie /
 * getCookie / the visitorId + isNewVisitor block used to live inline).
 *
 * Cookies (scoped to a shared parent domain) are the source of truth here,
 * the same way App.jsx uses a cookie — not localStorage — as the source of
 * truth for location-verification, because localStorage is scoped per-origin
 * and never shared between a group subdomain (slug.anonroom.in) and the root
 * domain (anonroom.in). localStorage is still written alongside the cookie
 * as a harmless bonus/fallback, matching the original inline behavior
 * exactly, and mirrors the same domain-detection pattern already used in
 * src/lib/supabaseClient.js.
 *
 * Consumers: App.jsx's LocationGate, and the anonymous question-reply flow
 * in QuestionThread.jsx (both need a stable per-visitor id without
 * requiring an account).
 * ========================================================================= */

const VISITOR_ID_COOKIE = 'anonroom_visitor_id';
const VISITOR_ID_STORAGE_KEY = 'anonroom_visitor_id';

export function getCookieDomain() {
  const hostname = window.location.hostname;
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

  if (hostname.includes('anonroom.in')) {
    return '.anonroom.in';
  }
  if (hostname === 'localhost' || isIPv4) {
    return hostname;
  }
  // Fallback for any other environment (e.g. preview deployments):
  // scope the cookie to the exact host rather than guessing a parent domain.
  return hostname;
}

export function setCookie(name, value, days = 365) {
  const domain = getCookieDomain();
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; domain=${domain}; max-age=${maxAge}; SameSite=Lax; Secure`;
}

export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Reads the visitor id from the cookie first (source of truth, shared
 * across subdomains), falls back to localStorage, and falls back to
 * minting a new crypto.randomUUID() if neither has one yet. Whatever the
 * result, it's written back to BOTH the cookie and localStorage so they
 * stay in sync, then returned.
 */
export function getOrCreateVisitorId() {
  let visitorId = getCookie(VISITOR_ID_COOKIE) || localStorage.getItem(VISITOR_ID_STORAGE_KEY);

  if (!visitorId) {
    visitorId = crypto.randomUUID();
  }

  setCookie(VISITOR_ID_COOKIE, visitorId);
  localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);

  return visitorId;
}
