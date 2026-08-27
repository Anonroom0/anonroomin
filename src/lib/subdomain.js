/**
 * ============================================================================
 * SUBDOMAIN & PATH ROUTING HELPERS
 * ============================================================================
 */

const RESERVED_SEGMENTS = ['www', 'anonroom', 'localhost'];

// Reserved as the FIRST path segment on the root domain, so they never get
// mistaken for a username in the /<username> DM route. (Note: 'g' has been
// removed since mobile groups now use the subdomain route).
const RESERVED_PATH_SEGMENTS = ['api', 'assets', 'static', 'favicon.ico'];

export const ROOT_PATH = '/';

// ----------------------------------------------------------------------------
// SHORT ID HELPERS (for copyable links)
// ----------------------------------------------------------------------------
// Every table this app links to (questions, group_messages, dm_messages,
// confessions) keys off a real uuid, but a raw uuid in a shared link is long
// and ugly to read/type. Rather than adding a parallel "short_id" column
// (more migrations, another thing to keep in sync), the short id is derived
// straight FROM the uuid: strip the dashes and take the first 8 hex
// characters. uuid hex digits are already alphanumeric (0-9a-f), so this
// satisfies "an up-to-8-alphanumeric-character id" without inventing a new
// alphabet or a new column.
//
// 8 hex characters is 32 bits of the source uuid's randomness — collisions
// are astronomically unlikely at this app's scale, but a caller resolving a
// short id back to a row should still treat it as a PREFIX match (see
// shortIdPrefixFilter below) and handle the rare case of >1 result by
// picking the most recent one, rather than assuming uniqueness outright.
export function toShortId(uuid) {
  if (!uuid || typeof uuid !== 'string') return '';
  return uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
}

// True for a short id shaped like the ones toShortId() produces (bare hex,
// no dashes) — as opposed to a full uuid (which has dashes) — so callers can
// tell old-style full-uuid links (still valid, for anything shared before
// this change) apart from new short ones.
export function isShortId(value) {
  return typeof value === 'string' && /^[0-9a-f]{1,32}$/i.test(value) && !value.includes('-');
}

// Builds the {column, operator, value} triple a caller passes to
// supabase-js's `.filter(column, operator, value)` to resolve a short id
// back to its row. uuid columns don't support LIKE/ILIKE directly in
// Postgres, so this casts the column to text first — the `column::text`
// syntax is a PostgREST feature supabase-js's `.filter()` passes straight
// through.
export function shortIdPrefixFilter(column, shortId) {
  return { column: `${column}::text`, operator: 'ilike', value: `${shortId}%` };
}

// Resolves which group (if any) should render based on the current URL.
// Production: groupname.anonroom.in -> 'groupname'; anonroom.in / www -> null.
// Local/dev/IP hosts have no real subdomain to parse, so fall back to a
// ?group=slug query param instead (e.g. http://localhost:5173/?group=general).
export function getGroupSlugFromHost() {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  const isLocalOrDev =
    hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || // bare IPv4
    parts.length < 3;

  if (isLocalOrDev) {
    const params = new URLSearchParams(window.location.search);
    return params.get('group') || null;
  }

  const firstSegment = parts[0];
  if (RESERVED_SEGMENTS.includes(firstSegment)) {
    return null;
  }

  return firstSegment;
}

// Builds the URL for "leave this group and go back to the main app" (used
// by GroupChat's back button when it's mounted standalone on a
// slug.anonroom.in route with no sidebar to return to). On local/dev hosts
// this just drops the ?group= param instead of trying to rewrite a
// subdomain that doesn't really exist there.
export function getRootDomainUrl() {
  const { protocol, hostname, port } = window.location;
  const parts = hostname.split('.');

  const isLocalOrDev =
    hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    parts.length < 3;

  const portSuffix = port ? `:${port}` : '';

  if (isLocalOrDev) {
    return `${protocol}//${hostname}${portSuffix}/`;
  }

  const rootHost = parts.slice(1).join('.'); // drop the group segment
  return `${protocol}//${rootHost}${portSuffix}/`;
}

// Builds the URL for actually opening a group on its own subdomain
// (slug.anonroom.in) — this is what a click on a group in the sidebar
// should navigate the browser to on DESKTOP and MOBILE, exactly like typing that
// subdomain in by hand. On local/dev hosts, where wildcard subdomains
// don't resolve, this falls back to the ?group= query param on the
// current host instead.
export function getGroupUrl(slug) {
  const { protocol, hostname, port } = window.location;
  const parts = hostname.split('.');

  const isLocalOrDev =
    hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    parts.length < 3;

  const portSuffix = port ? `:${port}` : '';

  if (isLocalOrDev) {
    return `${protocol}//${hostname}${portSuffix}/?group=${encodeURIComponent(slug)}`;
  }

  // If we're already on some-group.anonroom.in or www.anonroom.in, strip
  // that leading segment; if we're on the bare 2-part root domain
  // (anonroom.in), there's no segment to strip.
  const rootHost = parts.length <= 2 ? hostname : parts.slice(1).join('.');

  return `${protocol}//${encodeURIComponent(slug)}.${rootHost}${portSuffix}/`;
}

// ----------------------------------------------------------------------------
// PATH-BASED ROUTING (root domain only)
// ----------------------------------------------------------------------------
// Desktop and mobile groups now BOTH live on their own subdomain (see getGroupUrl above)
// and therefore need a real cross-origin navigation. DMs instead open in place
// on the SAME origin, so they get plain same-origin paths that can be pushed/replaced
// with history.pushState without a reload:
//   DM:    anonroom.in/<username>
//
// A single leading segment is reserved for usernames, matching how the DM
// pane opens.

function normalizedPathSegments() {
  return window.location.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

// Returns the username for the root-level DM route (anonroom.in/<username>),
// or null if the current path doesn't match that shape.
export function getDmUsernameFromPath() {
  const segments = normalizedPathSegments();
  if (segments.length !== 1) {
    return null;
  }
  const [segment] = segments;
  if (RESERVED_PATH_SEGMENTS.includes(segment) || RESERVED_SEGMENTS.includes(segment)) {
    return null;
  }
  return decodeURIComponent(segment);
}

export function buildDmPath(username) {
  return `/${encodeURIComponent(username)}`;
}

// ----------------------------------------------------------------------------
// QUESTION-THREAD ROUTING (root domain, /q/<id>)
// ----------------------------------------------------------------------------
// Its own single-segment-under-/q/ parser rather than reusing
// normalizedPathSegments()/getDmUsernameFromPath()'s reserved-word logic —
// question ids live under an explicit /q/ prefix so they can never collide
// with the single-segment /<username> DM route above, and don't need
// RESERVED_PATH_SEGMENTS filtering as a result.

// Returns the id for the root-level question-thread route (anonroom.in/q/<id>),
// or null if the current path doesn't match that shape. This can be either
// an 8-char short id (new links) or a full uuid (anything shared before
// short ids existed) — QuestionThread.jsx's loader handles both.
export function getQuestionIdFromPath() {
  const path = window.location.pathname;
  if (!path.startsWith('/q/')) {
    return null;
  }
  const remainder = path.slice('/q/'.length);
  if (!remainder) {
    return null;
  }
  return decodeURIComponent(remainder);
}

// Builds a short, copyable /q/<id> path from a question's real uuid.
export function buildQuestionPath(id) {
  return `/q/${encodeURIComponent(toShortId(id))}`;
}

// ----------------------------------------------------------------------------
// CONFESSIONS FEED ROUTING (root domain, /confessions)
// ----------------------------------------------------------------------------

export function getConfessionsFeedPath() {
  return '/confessions';
}

export function isConfessionsFeedPath() {
  return window.location.pathname.replace(/^\/+|\/+$/g, '') === 'confessions';
}
