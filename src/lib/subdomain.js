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
// or null if the current path doesn't match that shape.
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

export function buildQuestionPath(id) {
  return `/q/${encodeURIComponent(id)}`;
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
