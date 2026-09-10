// Vercel Edge Middleware — root-level, framework-agnostic (works for a
// plain Vite/static deploy, not just Next.js).
//
// v2 fix: the previous version used Response.redirect() and matched every
// path ('/:path*'). That redirected admin.html's OWN sub-resources too
// (its JS/CSS bundles under /assets/*, fetched from the same
// administrator.anonroom.in host) back to /admin.html instead of letting
// them load — which is what produced the black screen (the JS bundle
// never actually loaded, it kept getting served admin.html's markup
// instead) and the "still redirecting" loop-like behavior.
//
// This version:
//   - only acts on navigation-style paths (no file extension, not
//     /assets/*, not /api/*) so real asset requests pass through
//     untouched
//   - serves admin.html's content directly via fetch() instead of
//     Response.redirect(), so the URL bar stays on the original path
//     (e.g. "/") instead of visibly bouncing to /admin.html
//
// Place this file at the PROJECT ROOT (same level as vercel.json,
// package.json) — Vercel auto-detects middleware.js there, no extra
// config needed.

export const config = {
  matcher: '/:path*',
};

const PASSTHROUGH = /^\/(assets|api)\//;
const HAS_EXTENSION = /\.[a-zA-Z0-9]+$/;

export default async function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  if (host !== 'administrator.anonroom.in') return;
  if (url.pathname === '/admin.html') return;
  if (PASSTHROUGH.test(url.pathname)) return;
  if (HAS_EXTENSION.test(url.pathname)) return;

  const adminUrl = new URL('/admin.html', url);
  const res = await fetch(adminUrl, request);
  return new Response(res.body, res);
}
