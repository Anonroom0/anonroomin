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
