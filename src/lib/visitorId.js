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
 * Consumers: App.jsx's LocationGate, the anonymous question-reply flow in
 * QuestionThread.jsx, and the anonymous confession flow in
 * ConfessToGroup.jsx (all three need a stable per-visitor id without
 * requiring an account).
 *
 * STANDARDIZED IDENTITY LIFECYCLE (see 0010_visitor_metadata_table.sql):
 * getOrCreateVisitorId() is the ONLY place a visitor_id is ever minted, and
 * as of this pass it's also the only place a visitor_metadata row is ever
 * CREATED — the instant a fresh id is minted, a bare row keyed on that id is
 * seeded via seedVisitorMetadata() below, regardless of which caller
 * triggered the mint (the location banner, a confession, or a question
 * reply). Previously, visitor_metadata was only ever inserted from inside
 * App.jsx's LocationBanner, gated on location being granted — so a visitor
 * who confessed or replied without ever granting location had no
 * visitor_metadata row at all, and the two were only "the same id" by
 * coincidence, never by a shared creation path. Now every visitor_id used
 * anywhere in the app is guaranteed a visitor_metadata row from birth;
 * App.jsx's LocationBanner just enriches that same row (upsert) with
 * lat/long/device info if and when location is later granted, instead of
 * racing a separate insert against it.
 * ========================================================================= */

import supabase from './supabaseClient';

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
 * Best-effort, fire-and-forget seed of a bare visitor_metadata row the
 * moment a visitor_id is minted — before any confession, reply, or location
 * grant ever touches it. onConflict + ignoreDuplicates makes this a no-op
 * if the row somehow already exists, so it's safe to call unconditionally
 * every time a NEW id is minted. Never awaited: identity creation shouldn't
 * block on (or fail because of) a metadata write.
 */
function seedVisitorMetadata(visitorId) {
  supabase
    .from('visitor_metadata')
    .upsert([{ visitor_id: visitorId }], { onConflict: 'visitor_id', ignoreDuplicates: true })
    .then(({ error }) => {
      if (error) {
        console.warn('Failed to seed visitor_metadata row:', error);
      }
    });
}

/**
 * Reads the visitor id from the cookie first (source of truth, shared
 * across subdomains), falls back to localStorage, and falls back to
 * minting a new crypto.randomUUID() if neither has one yet. Whatever the
 * result, it's written back to BOTH the cookie and localStorage so they
 * stay in sync, then returned.
 *
 * If (and only if) this call is what actually minted a brand-new id, a
 * bare visitor_metadata row is seeded for it in the same breath — see the
 * header comment above for why this replaces the old location-gated insert.
 */
export function getOrCreateVisitorId() {
  let visitorId = getCookie(VISITOR_ID_COOKIE) || localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  const isNewVisitorId = !visitorId;

  if (!visitorId) {
    visitorId = crypto.randomUUID();
  }

  setCookie(VISITOR_ID_COOKIE, visitorId);
  localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);

  if (isNewVisitorId) {
    seedVisitorMetadata(visitorId);
  }

  return visitorId;
}
