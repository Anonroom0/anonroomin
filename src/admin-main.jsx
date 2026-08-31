/**
 * ============================================================================
 * ADMIN PANEL — STANDALONE ENTRY POINT
 * ============================================================================
 * Bootstrapped by admin.html, completely independent of src/main.jsx /
 * src/App.jsx / src/pages/Home.jsx. This file — not App.jsx — is what
 * mounts <AdminPanel/>, so the admin panel is never rendered "inside" the
 * chat app: no shared component tree, no Home.jsx master/detail layout,
 * no GroupChat/DirectMessages mounting logic to interfere with.
 *
 * It still reuses the same AuthProvider + ToastContainer + tokens.css /
 * animations.css as the main app on purpose — that's what makes a session
 * created on anonroom.in "just work" here too (see supabaseClient.js's
 * cross-subdomain cookieDomain), and keeps toasts/typography consistent —
 * but nothing about the ROUTE DISPATCH in App.jsx runs on this page at all.
 *
 * Reachable via:
 *   - admin.html directly (e.g. local dev: http://localhost:5173/admin.html)
 *   - administrator.anonroom.in in production (rewritten to /admin.html —
 *     see vercel.json)
 *   - anonroom.in/admin in production (same rewrite, path-based fallback)
 * ============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './lib/authContext';
import ToastContainer from './components/ToastContainer';
import AdminPanel from './pages/AdminPanel';
import './styles/tokens.css';
import './styles/animations.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastContainer />
    <AuthProvider>
      <AdminPanel />
    </AuthProvider>
  </React.StrictMode>
);
