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
// short id back to a row should still handle the rare case of >1 result by
// picking the most recent one, rather than assuming uniqueness outright.
//
// RESOLUTION: every table with shareable links (questions, group_messages,
// dm_messages, confessions) now has its own real `link_id` text column,
// populated automatically by a database trigger using this exact recipe
// (see supabase/migrations/0002_link_id_routing.sql). Resolving a short id
// back to a row is a plain `.eq('link_id', shortId)` lookup against that
// column — no uuid->text casting or ILIKE wildcard involved. Old links
// shared before this column existed carry the full uuid instead (see
// isShortId below) and should still be resolved with `.eq('id', value)`.
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
//
// DEPRECATED: superseded by each table's `link_id` column (see the
// RESOLUTION note above) — callers should do `.eq('link_id', shortId)`
// instead of this cast+ILIKE prefix match. Kept only so any code that still
// imports it doesn't break; no call site in this codebase uses it anymore.
//
// THE WILDCARD CHARACTER MUST BE '*', NOT '%'. PostgREST reserves '%' for
// standard URI percent-encoding, so for like/ilike it repurposes '*' as the
// pattern wildcard instead (see PostgREST's "Pattern Matching" docs) — a
// literal '%' in the value is matched as a literal percent sign, not a
// wildcard. Every short-id lookup built with a trailing '%' therefore
// searched for an id that literally ends in the character '%', which no
// row ever does, so it always came back empty ("not found") no matter how
// correct the short id was. This was the root cause of /q/<shortid> (and
// anything else built on this helper) failing to resolve.
export function shortIdPrefixFilter(column, shortId) {
  return { column: `${column}::text`, operator: 'ilike', value: `${shortId}*` };
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

// True when the current page is a specific group's subdomain (or, on
// local/dev hosts, the ?group= query-param equivalent) rather than the
// root app. Permission prompts (location, push notifications) are
// intentionally root-domain-only — see LocationBanner in App.jsx and
// subscribeToPush() in pushNotifications.js — since a visitor's first-ever
// touch with the site is very often a shared group link straight to
// slug.anonroom.in, and immediately hitting them with browser permission
// dialogs there makes for a much worse first impression than on the root
// app, where they've already chosen to engage more deeply.
export function isGroupSubdomain() {
  return Boolean(getGroupSlugFromHost());
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

// ----------------------------------------------------------------------------
// STORY VIEWER ROUTING (root domain, /stories/<type>[/<slug>])
// ----------------------------------------------------------------------------
// Mirrors the /q/<id> and /confessions patterns above so opening a story is a
// real, deep-linkable route (back button closes it, a shared link reopens
// the same channel) instead of pure unaddressable local state.
//
// 'group' channels are addressed by slug (the same slug the group's own
// subdomain uses) since a group's id isn't otherwise exposed in any URL;
// the two virtual channels ('public-confessions' / 'public-questions') have
// no per-item id, so their path is just the type with no second segment.
export function buildStoryPath(channel) {
  if (!channel) return ROOT_PATH;
  if (channel.type === 'group') {
    return `/stories/group/${encodeURIComponent(channel.slug || channel.id)}`;
  }
  return `/stories/${channel.type}`;
}

// Returns { type, slug } for the current path if it matches /stories/...,
// or null otherwise. `slug` is only present (and only meaningful) for
// type === 'group'.
export function getStoryTargetFromPath() {
  const segments = normalizedPathSegments();
  if (segments[0] !== 'stories' || !segments[1]) return null;
  const type = decodeURIComponent(segments[1]);
  if (type === 'group') {
    if (!segments[2]) return null;
    return { type, slug: decodeURIComponent(segments[2]) };
  }
  if (type === 'public-confessions' || type === 'public-questions') {
    return { type, slug: null };
  }
  return null;
}

// ----------------------------------------------------------------------------
// PASSWORD RESET ROUTING (root domain, /reset-password/<token_hash>)
// ----------------------------------------------------------------------------
// The email template links straight to /reset-password/{{ .TokenHash }}
// (see supabase/reset-password-email-template.html) instead of using
// Supabase's own {{ .ConfirmationURL }} redirect chain. That redirect chain
// is what caused the "link just logs me in on the home screen" bug: it
// bounces through the Supabase project's own domain first and only lands on
// OUR /reset-password page if this exact URL is also present in the
// Supabase Dashboard's Auth -> URL Configuration -> Redirect URLs allow
// list; if it's missing there (easy to forget, and there's no error when it
// is), Supabase silently falls back to the project's bare Site URL instead,
// which establishes a normal session with no reset UI in sight — indistinguishable
// from "the link just logged me in".
//
// Calling supabase.auth.verifyOtp({ token_hash, type: 'recovery' }) directly
// (see ResetPassword.jsx) sidesteps that whole redirect chain: it's a
// straight client -> Supabase API call using the token in the path, so nothing
// depends on the Redirect URLs allow list, and the link in the inbox is a
// clean anonroom.in/reset-password/<token> instead of a long, ugly
// ConfirmationURL.

export function getResetPasswordPath() {
  return '/reset-password';
}

// True for both the bare /reset-password path (legacy links / defensive
// fallback) and /reset-password/<token_hash>.
export function isResetPasswordPath() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments[0] === 'reset-password';
}

// Pulls the token hash out of /reset-password/<token_hash>. Returns null for
// the bare /reset-password path (no token present).
export function getResetPasswordTokenHash() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'reset-password' || !segments[1]) return null;
  return decodeURIComponent(segments[1]);
}
