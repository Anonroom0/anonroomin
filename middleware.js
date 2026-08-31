// Vercel Edge Middleware — root-level, framework-agnostic (works for a
// plain Vite/static deploy, not just Next.js).
//
// Why this exists instead of relying only on vercel.json's declarative
// `has: [{ type: "host", ... }]` rewrite: that rewrite keeps not firing in
// production (administrator.anonroom.in/ serves the home page, only
// /admin.html works directly), which points at the host-conditioned
// rewrite not being evaluated the way it should for this project/plan.
// Middleware inspects the real Host header at request time instead, so it
// isn't dependent on that declarative matching working correctly.
//
// Place this file at the PROJECT ROOT (same level as vercel.json,
// package.json) — Vercel auto-detects middleware.js there, no extra config
// needed, and no changes to vercel.json's rewrites are required (this runs
// before them).

export const config = {
  matcher: '/:path*',
};

export default function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  if (host === 'administrator.anonroom.in' && url.pathname !== '/admin.html') {
    url.pathname = '/admin.html';
    return Response.redirect(url, 307);
  }
}
