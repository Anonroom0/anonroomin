const RESERVED_SEGMENTS = ['www', 'anonroom', 'localhost'];

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
