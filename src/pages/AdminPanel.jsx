/**
 * ============================================================================
 * ADMIN PANEL — standalone page (admin.html -> src/admin-main.jsx)
 * ============================================================================
 * This is no longer mounted anywhere inside App.jsx or Home.jsx's component
 * tree — it has its own Vite entry point (admin.html -> admin-main.jsx),
 * which renders <AdminPanel/> directly. See admin-main.jsx's header comment
 * for the full standalone-page rationale and how administrator.anonroom.in
 * / anonroom.in/admin get routed to it in production (vercel.json).
 *
 * It still uses the exact same AuthProvider/session as the main site — the
 * cross-subdomain cookie set up in supabaseClient.js (cookieDomain =
 * '.anonroom.in') means a login on anonroom.in is already valid here with
 * no separate auth step. Every mutation below is also enforced server-side
 * via RLS (see supabase/migrations/0004_admin_panel_extensions.sql and
 * 0006_admin_panel_v2.sql), so the is_admin gate in this component is a UI
 * nicety, not the real access control — same pattern as EditProfile.jsx's
 * admin-only sections.
 *
 * This file defines its own tiny CSS (see <GlobalAdminStyle/> below) rather
 * than relying on Home.jsx's inline <style> block for things like the spin
 * keyframe — since this page's module graph never touches Home.jsx, that
 * CSS was never actually reaching it (a pre-existing gap: AuthModal.jsx's
 * spinner has the same className and had the same problem). Defining
 * .refresh-spin here fixes it for AuthModal too, since CSS classes are
 * global regardless of which component's <style> tag defined them.
 *
 * Tabs:
 *   - Dashboard:  headline counts across the whole app, at a glance
 *   - Groups:     list/create/edit groups, toggle channel mode, delete
 *   - Users:      search/sort/paginate profiles, promote/demote, ban, CSV export
 *   - Confessions: every confession, filterable, deletable
 *   - Questions:  every question, filterable, deletable (new — previously
 *                 only reachable one user at a time via their detail panel)
 *   - Storage:    browse/clean the 'media' bucket
 *   - Audit Log:  recent admin actions (new — needs migration 0006 applied)
 *   - Push:       send a test push notification
 * ============================================================================
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import AuthModal from './AuthModal';
import { AdminDmMonitor } from './DirectMessages';
import LiquidAvatar from '../components/shared/LiquidAvatar';
import { hapticTap, hapticSuccess, hapticError } from '../lib/haptics';
import { playTap, playRefreshComplete, playError, playClose } from '../lib/soundManager';
import { showToast, friendlyDbError } from '../lib/toast';
import ToastContainer from '../components/ToastContainer';

const MEDIA_BUCKET = 'media';

// ----------------------------------------------------------------------------
// ICONS
// ----------------------------------------------------------------------------
const Vectors = {
  Shield: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Spinner: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
  Grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  Users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Hash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>,
  Database: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
  Trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  File: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  Bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  ChevronRight: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  ChevronLeft: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  Photo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>,
  MessageSquare: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  HelpCircle: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  Clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Ban: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
  Edit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  Search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  LogOut: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  AlertTriangle: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  X: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

// ----------------------------------------------------------------------------
// SELF-CONTAINED GLOBAL STYLE — this page never renders Home.jsx, so it
// can't borrow Home.jsx's inline <style> block the way the main app's
// pages do. Everything this page (and AuthModal, which it also renders)
// needs is defined here instead.
// ----------------------------------------------------------------------------
function GlobalAdminStyle() {
  return (
    <style>{`
      @keyframes admin-spin-kf { to { transform: rotate(360deg); } }
      .refresh-spin, .admin-spin { animation: admin-spin-kf 0.8s linear infinite; transform-origin: center; }

      @keyframes admin-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .admin-fade-in { animation: admin-fade-in 0.18s ease-out; }

      @keyframes admin-rise-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .admin-rise-in { animation: admin-rise-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }

      @keyframes admin-pop-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
      .admin-pop-in { animation: admin-pop-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1); }

      @keyframes admin-shimmer { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
      .admin-skeleton {
        background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.04) 63%);
        background-size: 400px 100%;
        animation: admin-shimmer 1.4s ease-in-out infinite;
        border-radius: 10px;
      }

      .admin-scrollbar { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
      .admin-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
      .admin-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .admin-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }
      .admin-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

      .admin-row-hover { transition: background 0.12s ease, transform 0.12s ease; }
      .admin-row-hover:hover { background: rgba(255,255,255,0.03); }

      .admin-nav-btn { transition: background 0.15s ease, color 0.15s ease; }

      input, textarea, select, button { font-family: inherit; }
    `}</style>
  );
}

// ----------------------------------------------------------------------------
// SHARED PRIMITIVES
// ----------------------------------------------------------------------------
function LiquidSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 25, borderRadius: 999, border: 'none', flexShrink: 0,
        background: checked ? '#FF6B35' : 'rgba(255,255,255,0.14)',
        position: 'relative', cursor: disabled ? 'default' : 'pointer', transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 2.5, left: checked ? 19 : 2.5, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}

function Card({ children, style }) {
  return <div className="admin-rise-in" style={{ background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', ...style }}>{children}</div>;
}

function SectionLabel({ children }) {
  return <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</h3>;
}

function EmptyState({ children }) {
  return <div style={{ color: '#8B8B96', fontSize: 14, textAlign: 'center', padding: 28 }}>{children}</div>;
}

function SkeletonRows({ count = 4, height = 62 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => <div key={i} className="admin-skeleton" style={{ height }} />)}
    </div>
  );
}

// Generic centered overlay used by both the edit-group modal and
// ConfirmDialog below — one place for the backdrop/scrim/portal-less
// positioning logic instead of duplicating it per modal.
function Overlay({ onDismiss, children, maxWidth = 380 }) {
  return (
    <div
      className="admin-fade-in"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div className="admin-pop-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth, background: '#1C1D24', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </div>
  );
}

// Replaces window.confirm() everywhere in this rewrite — native browser
// confirm dialogs look completely out of place next to a custom UI, block
// the whole tab (no sound/haptic feedback, no styling), and can't show a
// danger-colored confirm button for destructive actions.
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  return (
    <Overlay onDismiss={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <div style={{ color: danger ? '#FF6B6B' : '#FF6B35', marginBottom: 4 }}>{Vectors.AlertTriangle}</div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#F4F3F0' }}>{title}</h3>
        <p style={{ margin: '2px 0 14px', fontSize: 13.5, color: '#8B8B96', lineHeight: 1.5 }}>{message}</p>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#F4F3F0', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={() => { hapticTap(); playTap(); onConfirm(); }}
          style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: danger ? '#E5484D' : '#FF6B35', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

// Small hook wrapping the ConfirmDialog dance (open/message/resolve) so
// each tab can just `await confirm({...})` instead of managing its own
// dialog state. Renders nothing itself — call .Dialog in JSX where the
// overlay should mount (anywhere in the tree works, it's position: fixed).
function useConfirm() {
  const [state, setState] = useState(null); // { title, message, confirmLabel, danger, resolve }
  const confirm = useCallback((opts) => new Promise((resolve) => {
    setState({ ...opts, resolve });
  }), []);
  const Dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onConfirm={() => { const r = state.resolve; setState(null); r(true); }}
      onCancel={() => { const r = state.resolve; setState(null); r(false); }}
    />
  ) : null;
  return [confirm, Dialog];
}

// Fire-and-forget write to admin_audit_log (migration 0006). Deliberately
// swallows errors — including "table does not exist" when that migration
// hasn't been applied yet — so a missing/unwritable audit log never blocks
// or degrades the actual admin action it's logging.
async function logAdminAction(actor, action, targetType, targetId, meta) {
  try {
    await supabase.from('admin_audit_log').insert({
      actor_id: actor?.id || null,
      actor_name: actor?.username || null,
      action, target_type: targetType, target_id: targetId ? String(targetId) : null,
      meta: meta || null,
    });
  } catch {
    // best-effort — see comment above
  }
}

// ----------------------------------------------------------------------------
// DASHBOARD TAB — headline counts, computed with exact-count HEAD requests
// (head: true, count: 'exact') so this never has to download actual rows
// just to size a stat card.
// ----------------------------------------------------------------------------
function StatCard({ icon, label, value, loading, accent }) {
  return (
    <Card style={{ flex: '1 1 140px', minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: accent || '#FF6B35', marginBottom: 10 }}>{icon}</div>
      {loading ? (
        <div className="admin-skeleton" style={{ height: 26, width: '60%', marginBottom: 6 }} />
      ) : (
        <div style={{ fontSize: 24, fontWeight: 800, color: '#F4F3F0', lineHeight: 1.1 }}>{value ?? '—'}</div>
      )}
      <div style={{ fontSize: 12.5, color: '#8B8B96', marginTop: 4 }}>{label}</div>
    </Card>
  );
}

function DashboardTab({ profile }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [users, admins, groups, channels, confessions, questions, dmThreads, newThisWeek, recent] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true),
      supabase.from('groups').select('id', { count: 'exact', head: true }),
      supabase.from('groups').select('id', { count: 'exact', head: true }).eq('is_channel', true),
      supabase.from('confessions').select('id', { count: 'exact', head: true }),
      supabase.from('questions').select('id', { count: 'exact', head: true }),
      supabase.from('dm_threads').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('profiles').select('id, username, avatar_url, is_admin, created_at').order('created_at', { ascending: false }).limit(5),
    ]);
    setStats({
      users: users.count ?? 0, admins: admins.count ?? 0, groups: groups.count ?? 0, channels: channels.count ?? 0,
      confessions: confessions.count ?? 0, questions: questions.count ?? 0, dmThreads: dmThreads.count ?? 0, newThisWeek: newThisWeek.count ?? 0,
    });
    setRecentUsers(recent.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.14), rgba(255,107,53,0.03))', border: '1px solid rgba(255,107,53,0.18)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F4F3F0' }}>Welcome back, @{profile?.username || 'admin'}</div>
        <div style={{ fontSize: 13, color: '#C9C8D3', marginTop: 4 }}>Here's what's happening across Anonroom right now.</div>
      </Card>

      <div>
        <SectionLabel>Overview</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <StatCard icon={Vectors.Users} label="Total users" value={stats?.users} loading={loading} />
          <StatCard icon={Vectors.Shield} label="Admins" value={stats?.admins} loading={loading} accent="#FFD700" />
          <StatCard icon={Vectors.Hash} label="Groups" value={stats?.groups} loading={loading} />
          <StatCard icon={Vectors.Bell} label="Channels" value={stats?.channels} loading={loading} />
          <StatCard icon={Vectors.MessageSquare} label="Confessions" value={stats?.confessions} loading={loading} />
          <StatCard icon={Vectors.HelpCircle} label="Questions" value={stats?.questions} loading={loading} />
          <StatCard icon={Vectors.MessageSquare} label="DM threads" value={stats?.dmThreads} loading={loading} accent="#2FD8C4" />
          <StatCard icon={Vectors.Plus} label="New users (7d)" value={stats?.newThisWeek} loading={loading} accent="#2FD8C4" />
        </div>
      </div>

      <div>
        <SectionLabel>Newest users</SectionLabel>
        {loading ? <SkeletonRows count={3} height={52} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentUsers.map((u) => (
              <Card key={u.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <LiquidAvatar identity={{ avatar_url: u.avatar_url, name: u.username, is_admin: u.is_admin }} size={34} kind="user" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: u.is_admin ? '#FF6B35' : '#F4F3F0' }}>@{u.username || 'unknown'}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8B8B96' }}>{new Date(u.created_at).toLocaleDateString()}</div>
                </div>
              </Card>
            ))}
            {recentUsers.length === 0 && <EmptyState>No users yet.</EmptyState>}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// GROUPS TAB
// ----------------------------------------------------------------------------
function EditGroupModal({ group, onClose, onSaved }) {
  const [name, setName] = useState(group.name || '');
  const [description, setDescription] = useState(group.description || '');
  const [slug, setSlug] = useState(group.slug || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    if (!trimmedName || !trimmedSlug) { showToast('Name and slug are required.', 'info'); return; }
    setSaving(true);
    const { error } = await supabase.from('groups').update({ name: trimmedName, slug: trimmedSlug, description: description.trim() || null }).eq('id', group.id);
    setSaving(false);
    if (error) { playError(); hapticError(); showToast(error.message?.includes('duplicate') ? 'That slug is already taken.' : friendlyDbError(), 'error'); return; }
    hapticSuccess(); playRefreshComplete(); showToast('Group updated.', 'success');
    onSaved({ ...group, name: trimmedName, slug: trimmedSlug, description: description.trim() || null });
  }

  return (
    <Overlay onDismiss={onClose} maxWidth={420}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#F4F3F0' }}>Edit group</h3>
        <button onClick={onClose} style={iconBtnStyle}>{Vectors.X}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={fieldLabelStyle}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <label style={fieldLabelStyle}>Slug</label>
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} style={inputStyle} />
        <label style={fieldLabelStyle}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle(saving), marginTop: 6 }}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Overlay>
  );
}

function GroupsTab({ actor }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [coverBusyId, setCoverBusyId] = useState(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', isChannel: false });
  const [slugTouched, setSlugTouched] = useState(false);
  const coverInputRef = useRef(null);
  const coverTargetIdRef = useRef(null); // which group's file input is currently open ('new' for the create-group form)
  const [newGroupCoverFile, setNewGroupCoverFile] = useState(null); // { file, previewUrl } picked before the group exists yet
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest'); // 'newest' | 'oldest' | 'name'
  const [editingGroup, setEditingGroup] = useState(null);
  const [confirm, ConfirmUI] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (error) showToast(friendlyDbError(), 'error'); else setGroups(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Uploads a picked file to the 'media' bucket and writes the resulting
  // public URL onto groups.cover_url — this is the column Home.jsx,
  // GroupCard.jsx, and GroupChat.jsx already read as the group's display
  // picture (added in 0004_admin_panel_extensions.sql), so no schema
  // change is needed for this feature. Relies on the same
  // media_admin_full_access storage policy StorageTab already depends on
  // (admins can write anywhere in the bucket with their own session).
  async function uploadGroupCover(groupId, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `group-covers/${groupId}-${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) throw new Error('Could not resolve image URL.');
    const { error: updateError } = await supabase.from('groups').update({ cover_url: publicUrl }).eq('id', groupId);
    if (updateError) throw updateError;
    return publicUrl;
  }

  function openCoverPicker(groupId) {
    coverTargetIdRef.current = groupId;
    coverInputRef.current?.click();
  }

  async function handleCoverFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = coverTargetIdRef.current;
    if (!file || !targetId) return;

    // Creating a new group: the row doesn't exist yet, so just stash the
    // file and preview — handleCreate() uploads it right after insert.
    if (targetId === 'new') {
      setNewGroupCoverFile({ file, previewUrl: URL.createObjectURL(file) });
      return;
    }

    setCoverBusyId(targetId);
    try {
      const publicUrl = await uploadGroupCover(targetId, file);
      hapticSuccess(); playRefreshComplete(); showToast('Group picture updated.', 'success');
      setGroups((gs) => gs.map((g) => (g.id === targetId ? { ...g, cover_url: publicUrl } : g)));
      logAdminAction(actor, 'group.cover_updated', 'group', targetId);
    } catch (err) {
      playError(); hapticError(); showToast(err?.message || 'Could not upload group picture.', 'error');
    } finally {
      setCoverBusyId(null);
    }
  }

  function handleNameChange(v) {
    setForm((f) => ({ ...f, name: v, slug: slugTouched ? f.slug : v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }));
  }

  async function handleCreate() {
    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    if (!name || !slug) { showToast('Name and slug are required.', 'info'); return; }
    setCreating(true);
    const { data, error } = await supabase.from('groups').insert({ name, slug, description: form.description.trim() || null, is_channel: form.isChannel }).select().single();
    if (error) { setCreating(false); playError(); hapticError(); showToast(error.message?.includes('duplicate') ? 'That slug is already taken.' : friendlyDbError(), 'error'); return; }

    let created = data;
    if (newGroupCoverFile) {
      try {
        const publicUrl = await uploadGroupCover(created.id, newGroupCoverFile.file);
        created = { ...created, cover_url: publicUrl };
      } catch (err) {
        showToast("Group created, but the picture didn't upload.", 'info');
      }
      URL.revokeObjectURL(newGroupCoverFile.previewUrl);
      setNewGroupCoverFile(null);
    }

    setCreating(false);
    hapticSuccess(); playRefreshComplete(); showToast('Group created.', 'success');
    setForm({ name: '', slug: '', description: '', isChannel: false }); setSlugTouched(false);
    setGroups((g) => [created, ...g]);
    logAdminAction(actor, 'group.created', 'group', created.id, { name, slug });
  }

  async function toggleChannel(group) {
    setBusyId(group.id);
    const { error } = await supabase.from('groups').update({ is_channel: !group.is_channel }).eq('id', group.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticTap();
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, is_channel: !g.is_channel } : g)));
    logAdminAction(actor, 'group.channel_toggled', 'group', group.id, { is_channel: !group.is_channel });
  }

  async function handleDelete(group) {
    const ok = await confirm({ title: 'Delete group?', message: `"${group.name}" and every message inside it will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBusyId(group.id);
    const { error } = await supabase.from('groups').delete().eq('id', group.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Group deleted.', 'success');
    setGroups((gs) => gs.filter((g) => g.id !== group.id));
    logAdminAction(actor, 'group.deleted', 'group', group.id, { name: group.name, slug: group.slug });
  }

  const visibleGroups = useMemo(() => {
    let list = groups;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((g) => g.name?.toLowerCase().includes(q) || g.slug?.toLowerCase().includes(q));
    list = [...list];
    if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'oldest') list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // 'newest' is already the load order (created_at desc)
    return list;
  }, [groups, query, sort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Shared hidden file input for every cover picker (create form +
          each group row) — coverTargetIdRef says which one is "open". */}
      <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverFileChange} />

      <Card>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#F4F3F0' }}>Create group</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => openCoverPicker('new')}
              style={{
                width: 52, height: 52, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.2)',
                background: newGroupCoverFile ? `url(${newGroupCoverFile.previewUrl}) center/cover` : '#1C1D24',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B8B96', cursor: 'pointer', flexShrink: 0, padding: 0,
              }}
              title="Upload group picture"
            >
              {!newGroupCoverFile && Vectors.Photo}
            </button>
            <span style={{ fontSize: 12.5, color: '#8B8B96' }}>{newGroupCoverFile ? 'Picture selected' : 'Group picture (optional)'}</span>
          </div>
          <input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Group name" style={inputStyle} />
          <input value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })); }} placeholder="slug" style={inputStyle} />
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" style={inputStyle} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
            <span style={{ fontSize: 14, color: '#F4F3F0' }}>Channel mode (admin-only posting)</span>
            <LiquidSwitch checked={form.isChannel} onChange={(v) => setForm((f) => ({ ...f, isChannel: v }))} />
          </div>
          <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.slug.trim()} style={primaryBtnStyle(creating || !form.name.trim() || !form.slug.trim())}>
            {creating ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </Card>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <SectionLabel>All groups ({visibleGroups.length}{query ? ` of ${groups.length}` : ''})</SectionLabel>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', display: 'flex' }}>{Vectors.Search}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search groups…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        {loading ? <SkeletonRows count={4} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleGroups.map((g) => (
              <Card key={g.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => openCoverPicker(g.id)}
                      disabled={coverBusyId === g.id}
                      style={{
                        width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0, padding: 0, cursor: 'pointer',
                        background: g.cover_url ? `url(${g.cover_url}) center/cover` : '#FF6B35',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                        opacity: coverBusyId === g.id ? 0.5 : 1,
                      }}
                      title="Change group picture"
                    >
                      {!g.cover_url && (coverBusyId === g.id ? Vectors.Spinner : Vectors.Photo)}
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#F4F3F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                      <div style={{ fontSize: 12.5, color: '#8B8B96' }}>/{g.slug}{g.is_channel ? ' · channel' : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <LiquidSwitch checked={!!g.is_channel} onChange={() => toggleChannel(g)} disabled={busyId === g.id} />
                    <button onClick={() => setEditingGroup(g)} style={iconBtnStyle} title="Edit group">{Vectors.Edit}</button>
                    <button onClick={() => handleDelete(g)} disabled={busyId === g.id} style={{ ...iconBtnStyle, color: '#FF6B6B' }} title="Delete group">{Vectors.Trash}</button>
                  </div>
                </div>
              </Card>
            ))}
            {visibleGroups.length === 0 && <EmptyState>{query ? 'No groups match your search.' : 'No groups yet.'}</EmptyState>}
          </div>
        )}
      </div>

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={(updated) => { setGroups((gs) => gs.map((g) => (g.id === updated.id ? updated : g))); setEditingGroup(null); logAdminAction(actor, 'group.edited', 'group', updated.id); }}
        />
      )}
      {ConfirmUI}
    </div>
  );
}

// ----------------------------------------------------------------------------
// USERS TAB
// ----------------------------------------------------------------------------
const USERS_PAGE_SIZE = 25;

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportUsersCsv(users) {
  const header = ['id', 'username', 'is_admin', 'is_banned', 'created_at'];
  const rows = users.map((u) => [u.id, u.username || '', !!u.is_admin, !!u.is_banned, u.created_at].map(csvEscape).join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `anonroom-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function UsersTab({ ownUserId, actor }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [sort, setSort] = useState('newest'); // 'newest' | 'oldest' | 'username'
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'admin' | 'banned'
  const [page, setPage] = useState(1);
  const [banColumnMissing, setBanColumnMissing] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [emailsByUserId, setEmailsByUserId] = useState({});
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [confirm, ConfirmUI] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase.from('profiles').select('id, username, avatar_url, is_admin, is_banned, created_at').order('created_at', { ascending: false });
    if (error) {
      // profiles.is_banned may not exist yet if migration 0006 hasn't been
      // applied — fall back to the base column set so the rest of the tab
      // still works, just without ban support.
      const fallback = await supabase.from('profiles').select('id, username, avatar_url, is_admin, created_at').order('created_at', { ascending: false });
      data = fallback.data; error = fallback.error;
      setBanColumnMissing(!fallback.error);
    } else {
      setBanColumnMissing(false);
    }
    if (error) showToast(friendlyDbError(), 'error'); else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [query, sort, roleFilter]);

  async function toggleAdmin(user) {
    if (user.id === ownUserId) { showToast("You can't change your own admin status here.", 'info'); return; }
    const ok = await confirm({ title: user.is_admin ? 'Remove admin?' : 'Grant admin?', message: `@${user.username || 'unknown'} will ${user.is_admin ? 'lose' : 'gain'} access to this admin panel.`, confirmLabel: user.is_admin ? 'Remove admin' : 'Make admin', danger: user.is_admin });
    if (!ok) return;
    setBusyId(user.id);
    const { error } = await supabase.from('profiles').update({ is_admin: !user.is_admin }).eq('id', user.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast(user.is_admin ? 'Admin removed.' : 'User promoted to admin.', 'success');
    setUsers((us) => us.map((u) => (u.id === user.id ? { ...u, is_admin: !u.is_admin } : u)));
    logAdminAction(actor, user.is_admin ? 'user.admin_removed' : 'user.admin_granted', 'user', user.id, { username: user.username });
  }

  async function toggleBanned(user) {
    if (user.id === ownUserId) { showToast("You can't ban your own account.", 'info'); return; }
    const ok = await confirm({ title: user.is_banned ? 'Unban user?' : 'Ban user?', message: user.is_banned ? `@${user.username || 'unknown'} will be able to use Anonroom again.` : `@${user.username || 'unknown'} will be suspended from using Anonroom.`, confirmLabel: user.is_banned ? 'Unban' : 'Ban', danger: !user.is_banned });
    if (!ok) return;
    setBusyId(user.id);
    const { error } = await supabase.from('profiles').update({ is_banned: !user.is_banned, banned_at: user.is_banned ? null : new Date().toISOString() }).eq('id', user.id);
    setBusyId(null);
    if (error) { showToast(error.message?.includes('is_banned') ? 'Run migration 0006_admin_panel_v2.sql to enable banning.' : friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast(user.is_banned ? 'User unbanned.' : 'User banned.', 'success');
    setUsers((us) => us.map((u) => (u.id === user.id ? { ...u, is_banned: !u.is_banned } : u)));
    logAdminAction(actor, user.is_banned ? 'user.unbanned' : 'user.banned', 'user', user.id, { username: user.username });
  }

  const filtered = useMemo(() => {
    let list = users;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((u) => u.username?.toLowerCase().includes(q));
    if (roleFilter === 'admin') list = list.filter((u) => u.is_admin);
    if (roleFilter === 'banned') list = list.filter((u) => u.is_banned);
    list = [...list];
    if (sort === 'oldest') list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sort === 'username') list.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    return list;
  }, [users, query, sort, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * USERS_PAGE_SIZE, pageSafe * USERS_PAGE_SIZE);

  // Table view fetches emails in one batched call (admin-get-user-email's
  // { userIds } mode) for whichever page is currently visible, rather than
  // one call per row — only runs while the table is actually shown, and
  // only for ids this tab hasn't already fetched.
  useEffect(() => {
    if (viewMode !== 'table') return;
    const idsNeeded = pageItems.map((u) => u.id).filter((id) => !(id in emailsByUserId));
    if (idsNeeded.length === 0) return;
    let cancelled = false;
    async function loadEmails() {
      setEmailsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const functionsUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
        const res = await fetch(`${functionsUrl}/admin-get-user-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ userIds: idsNeeded }),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data.emails) setEmailsByUserId((prev) => ({ ...prev, ...data.emails }));
      } catch {
        // best-effort — table just shows a placeholder for whichever rows failed
      } finally {
        if (!cancelled) setEmailsLoading(false);
      }
    }
    loadEmails();
    return () => { cancelled = true; };
  }, [viewMode, pageItems, emailsByUserId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', display: 'flex' }}>{Vectors.Search}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username…" style={{ ...inputStyle, paddingLeft: 34 }} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="username">Username A–Z</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'all', label: 'All' }, { id: 'admin', label: 'Admins' }, { id: 'banned', label: 'Banned' }].map((f) => (
            <button key={f.id} onClick={() => { hapticTap(); playTap(); setRoleFilter(f.id); }} style={pillBtnStyle(roleFilter === f.id)}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'cards', label: 'Cards' }, { id: 'table', label: 'Table' }].map((v) => (
            <button key={v.id} onClick={() => { hapticTap(); playTap(); setViewMode(v.id); }} style={pillBtnStyle(viewMode === v.id)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => exportUsersCsv(filtered)} disabled={filtered.length === 0} style={{ ...iconBtnStyle, width: 'auto', padding: '6px 12px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 600, color: filtered.length ? '#F4F3F0' : '#8B8B96' }}>
          {Vectors.Download} Export CSV
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#8B8B96' }}>{filtered.length} of {users.length} users{totalPages > 1 ? ` · page ${pageSafe} of ${totalPages}` : ''}</div>
      {banColumnMissing && (
        <div style={{ fontSize: 12, color: '#8B8B96', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 12px' }}>
          Ban/unban is disabled until <code>supabase/migrations/0006_admin_panel_v2.sql</code> is applied to this project.
        </div>
      )}

      {loading ? <SkeletonRows count={5} /> : viewMode === 'table' ? (
        <div className="admin-scrollbar" style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#15161B' }}>
                <th style={tableHeadStyle}>User</th>
                <th style={tableHeadStyle}>Username</th>
                <th style={tableHeadStyle}>Email</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => (
                <tr key={u.id} className="admin-row-hover" onClick={() => setDetailUser(u)} style={{ cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={tableCellStyle}><LiquidAvatar identity={{ avatar_url: u.avatar_url, name: u.username, is_admin: u.is_admin }} size={30} kind="user" /></td>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: u.is_admin ? '#FF6B35' : '#F4F3F0' }}>@{u.username || 'unknown'}</td>
                  <td style={{ ...tableCellStyle, color: '#C9C8D3' }}>
                    {u.id in emailsByUserId ? (emailsByUserId[u.id] || <span style={{ color: '#8B8B96' }}>—</span>) : (emailsLoading ? <span style={{ color: '#8B8B96' }}>Loading…</span> : <span style={{ color: '#8B8B96' }}>—</span>)}
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#8B8B96' }}>No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pageItems.map((u) => (
            <Card key={u.id} style={{ position: 'relative' }}>
              {/* Ban toggle lives in the card's top-right corner, separate from
                  the row below, so it's never confused with "open detail". */}
              {!banColumnMissing && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleBanned(u); }}
                  disabled={busyId === u.id || u.id === ownUserId}
                  title={u.is_banned ? 'Unban' : 'Ban'}
                  style={{ position: 'absolute', top: 10, right: 10, border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: busyId === u.id || u.id === ownUserId ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.is_banned ? '#2FD8C4' : '#FF6B6B', background: 'rgba(255,255,255,0.06)', opacity: u.id === ownUserId ? 0.4 : 1 }}
                >
                  {Vectors.Ban}
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: banColumnMissing ? 0 : 34 }}>
                <div onClick={() => setDetailUser(u)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <LiquidAvatar identity={{ avatar_url: u.avatar_url, name: u.username, is_admin: u.is_admin }} size={36} kind="user" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: u.is_admin ? '#FF6B35' : '#F4F3F0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      @{u.username || 'unknown'}
                      {u.is_banned && <span style={badgeStyle('#FF6B6B')}>Banned</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#8B8B96', marginTop: 2 }}>
                      {u.is_admin ? 'Admin' : 'Member'} · Joined {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {/* Make-admin control lives inside the row itself now, as a
                    compact switch, instead of a separate full-width button
                    underneath the card. */}
                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: '#8B8B96', fontWeight: 600 }}>Admin</span>
                  <LiquidSwitch checked={u.is_admin} onChange={() => toggleAdmin(u)} disabled={busyId === u.id || u.id === ownUserId} />
                </div>
                <div onClick={() => setDetailUser(u)} style={{ color: '#8B8B96', flexShrink: 0, cursor: 'pointer', display: 'flex' }}>{Vectors.ChevronRight}</div>
              </div>
            </Card>
          ))}
          {pageItems.length === 0 && <EmptyState>No users found.</EmptyState>}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1} style={{ ...iconBtnStyle, opacity: pageSafe <= 1 ? 0.4 : 1 }}>{Vectors.ChevronLeft}</button>
          <span style={{ fontSize: 13, color: '#8B8B96' }}>Page {pageSafe} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} style={{ ...iconBtnStyle, opacity: pageSafe >= totalPages ? 0.4 : 1 }}>{Vectors.ChevronRight}</button>
        </div>
      )}

      {detailUser && <UserDetailPanel user={detailUser} actor={actor} onClose={() => setDetailUser(null)} />}
      {ConfirmUI}
    </div>
  );
}

// ----------------------------------------------------------------------------
// USER DETAIL PANEL — clicking a user in the Users tab. Shows their thread
// relations (groups they've posted in, DM threads they're part of) plus the
// confessions and questions they've authored, with delete actions for both.
// Deletes rely on the existing confessions_delete_owner_or_admin /
// questions_delete_owner_or_admin RLS policies (migration 0001), which
// already allow an is_admin profile to delete anyone's row — same
// "server enforces it, this UI is just the button" pattern as the rest of
// this panel.
// ----------------------------------------------------------------------------
function UserDetailPanel({ user, actor, onClose }) {
  const [loading, setLoading] = useState(true);
  const [groupsIn, setGroupsIn] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [confessions, setConfessions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [email, setEmail] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailRevealed, setEmailRevealed] = useState(false);
  const [monitorThread, setMonitorThread] = useState(null); // { id, otherUsername } | null
  const [confirm, ConfirmUI] = useConfirm();

  // Fetched via the admin-get-user-email edge function on demand ONLY —
  // the client SDK has no access to auth.users.email, only a service-role
  // function does, so this used to fire automatically on every panel open.
  // Now it only runs when the admin actually taps "Show email", so opening
  // a user's detail panel never fires an edge-function call they didn't
  // ask for. Best-effort: a failure here just leaves the email off, it
  // doesn't block the rest of the panel.
  async function loadEmail() {
    setEmailRevealed(true);
    setEmailLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionsUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
      const res = await fetch(`${functionsUrl}/admin-get-user-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEmail(data.email || null);
    } catch {
      // best-effort — leave email as null
    } finally {
      setEmailLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [msgRes, dmRes, confRes, qRes] = await Promise.all([
        supabase.from('group_messages').select('group_id, groups(id, name, slug)').eq('user_id', user.id),
        supabase.from('dm_threads').select('id, user_a, user_b').or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
        supabase.from('confessions').select('*').eq('author_id', user.id).order('created_at', { ascending: false }),
        supabase.from('questions').select('*').eq('author_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;

      const uniqueGroups = [];
      const seenGroupIds = new Set();
      for (const row of msgRes.data || []) {
        if (row.groups && !seenGroupIds.has(row.groups.id)) { seenGroupIds.add(row.groups.id); uniqueGroups.push(row.groups); }
      }
      setGroupsIn(uniqueGroups);

      const otherIds = (dmRes.data || []).map((t) => (t.user_a === user.id ? t.user_b : t.user_a));
      let otherProfiles = {};
      if (otherIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username').in('id', otherIds);
        otherProfiles = Object.fromEntries((profs || []).map((p) => [p.id, p.username]));
      }
      setDmThreads((dmRes.data || []).map((t) => ({ id: t.id, otherUsername: otherProfiles[t.user_a === user.id ? t.user_b : t.user_a] || 'unknown' })));

      setConfessions(confRes.data || []);
      setQuestions(qRes.data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  async function deleteConfession(id) {
    const ok = await confirm({ title: 'Delete confession?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('confessions').delete().eq('id', id);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Confession deleted.', 'success');
    setConfessions((cs) => cs.filter((c) => c.id !== id));
    logAdminAction(actor, 'confession.deleted', 'confession', id, { via: 'user_detail', user: user.username });
  }

  async function deleteQuestion(id) {
    const ok = await confirm({ title: 'Delete question?', message: 'This will also delete its replies. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Question deleted.', 'success');
    setQuestions((qs) => qs.filter((q) => q.id !== id));
    logAdminAction(actor, 'question.deleted', 'question', id, { via: 'user_detail', user: user.username });
  }

  return (
    <div className="admin-fade-in" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0C0D10', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onClose} style={iconBtnStyle}>{Vectors.Back}</button>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#F4F3F0' }}>@{user.username || 'unknown'}</h1>
        {user.is_banned && <span style={badgeStyle('#FF6B6B')}>Banned</span>}
      </header>
      <div style={{ padding: '10px 20px 0' }}>
        {!emailRevealed ? (
          <button onClick={loadEmail} style={{ ...iconBtnStyle, width: 'auto', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: '#F4F3F0' }}>
            Show email
          </button>
        ) : emailLoading ? (
          <span style={{ fontSize: 12.5, color: '#8B8B96' }}>Loading email…</span>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F4F3F0' }}>{email || 'No email on file.'}</span>
        )}
      </div>

      <div className="admin-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 60px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading ? <SkeletonRows count={4} /> : (
            <>
              <div>
                <SectionLabel>Groups posted in ({groupsIn.length})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groupsIn.map((g) => <Card key={g.id}><span style={{ fontSize: 14, color: '#F4F3F0' }}>{g.name} <span style={{ color: '#8B8B96' }}>/{g.slug}</span></span></Card>)}
                  {groupsIn.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>

              <div>
                <SectionLabel>DM threads ({dmThreads.length})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Each thread is a button — clicking it opens a read-only
                      "monitor" view of that conversation (see AdminDmMonitor
                      in DirectMessages.jsx), not the normal send-capable DM
                      view a regular user gets. */}
                  {dmThreads.map((t) => (
                    <button key={t.id} onClick={() => setMonitorThread(t)} style={{ width: '100%', textAlign: 'left', border: 'none', padding: 0, cursor: 'pointer', background: 'transparent' }}>
                      <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 14, color: '#F4F3F0' }}>with @{t.otherUsername}</span>
                        <span style={{ color: '#8B8B96', display: 'flex' }}>{Vectors.ChevronRight}</span>
                      </Card>
                    </button>
                  ))}
                  {dmThreads.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>

              <div>
                <SectionLabel>Confessions ({confessions.length})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {confessions.map((c) => (
                    <Card key={c.id}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: '#F4F3F0', wordBreak: 'break-word' }}>{c.text || <em style={{ color: '#8B8B96' }}>(no text)</em>}</div>
                          <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 4 }}>{c.visibility} · {new Date(c.created_at).toLocaleString()}</div>
                        </div>
                        <button onClick={() => deleteConfession(c.id)} style={{ ...iconBtnStyle, color: '#FF6B6B' }}>{Vectors.Trash}</button>
                      </div>
                    </Card>
                  ))}
                  {confessions.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>

              <div>
                <SectionLabel>Questions ({questions.length})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {questions.map((q) => (
                    <Card key={q.id}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: '#F4F3F0', wordBreak: 'break-word' }}>{q.text}</div>
                          <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 4 }}>{q.question_type} · {new Date(q.created_at).toLocaleString()}</div>
                        </div>
                        <button onClick={() => deleteQuestion(q.id)} style={{ ...iconBtnStyle, color: '#FF6B6B' }}>{Vectors.Trash}</button>
                      </div>
                    </Card>
                  ))}
                  {questions.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {monitorThread && (
        <AdminDmMonitor
          threadId={monitorThread.id}
          otherUsername={monitorThread.otherUsername}
          viewedUsername={user.username}
          viewedUserId={user.id}
          onClose={() => setMonitorThread(null)}
        />
      )}
      {ConfirmUI}
    </div>
  );
}

// ----------------------------------------------------------------------------
// CONFESSIONS TAB — every confession (public feed + group-mirrored), newest
// first, with a delete button. Same confessions_delete_owner_or_admin RLS
// policy as UserDetailPanel's per-user delete already relies on — this is
// just the same capability surfaced as its own top-level tab instead of
// requiring a click into a specific user first. Joins profiles(username)
// so admins can see who actually posted an "anonymous" confession.
// ----------------------------------------------------------------------------
const FEED_PAGE_LIMIT = 150;

function ConfessionsTab({ actor }) {
  const [confessions, setConfessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'public' | 'group'
  const [query, setQuery] = useState('');
  const [confirm, ConfirmUI] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('confessions').select('*, profiles(username, avatar_url)').order('created_at', { ascending: false }).limit(FEED_PAGE_LIMIT);
    if (error) showToast(friendlyDbError(), 'error'); else setConfessions(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(confession) {
    const ok = await confirm({ title: 'Delete confession?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBusyId(confession.id);
    const { error } = await supabase.from('confessions').delete().eq('id', confession.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Confession deleted.', 'success');
    setConfessions((cs) => cs.filter((c) => c.id !== confession.id));
    logAdminAction(actor, 'confession.deleted', 'confession', confession.id, { via: 'confessions_tab' });
  }

  const filtered = useMemo(() => {
    let list = confessions.filter((c) => {
      if (filter === 'public') return !c.group_id;
      if (filter === 'group') return !!c.group_id;
      return true;
    });
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.text?.toLowerCase().includes(q) || c.profiles?.username?.toLowerCase().includes(q));
    return list;
  }, [confessions, filter, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', display: 'flex' }}>{Vectors.Search}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search confession text or author…" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[{ id: 'all', label: 'All' }, { id: 'public', label: 'Public feed' }, { id: 'group', label: 'Groups' }].map((f) => (
          <button key={f.id} onClick={() => { hapticTap(); playTap(); setFilter(f.id); }} style={pillBtnStyle(filter === f.id)}>{f.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: '#8B8B96' }}>{filtered.length} of {confessions.length} confessions (latest {FEED_PAGE_LIMIT})</div>

      {loading ? <SkeletonRows count={4} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((c) => (
            <Card key={c.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {c.photo_url && <img src={c.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: '#F4F3F0', wordBreak: 'break-word' }}>{c.text || <em style={{ color: '#8B8B96' }}>(no text)</em>}</div>
                  <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 4 }}>
                    {c.group_id ? 'group' : 'public'} · {c.is_anon ? 'anonymous' : 'shown'}
                    {c.profiles?.username && <> · <span style={{ color: c.is_anon ? '#FF6B35' : '#8B8B96' }}>@{c.profiles.username}{c.is_anon ? ' (hidden)' : ''}</span></>}
                    {' · '}{new Date(c.created_at).toLocaleString()}
                  </div>
                </div>
                <button onClick={() => handleDelete(c)} disabled={busyId === c.id} style={{ ...iconBtnStyle, color: '#FF6B6B' }}>{Vectors.Trash}</button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && <EmptyState>No confessions found.</EmptyState>}
        </div>
      )}
      {ConfirmUI}
    </div>
  );
}

// ----------------------------------------------------------------------------
// QUESTIONS TAB — new. Mirrors ConfessionsTab's shape, but for the
// questions table: previously the only way to see/delete a question was to
// open the specific user who asked it in the Users tab first. Same
// questions_delete_owner_or_admin RLS policy.
// ----------------------------------------------------------------------------
// The app auto-creates a "personal" question with this exact text on every
// user's profile (see CreateQuestionModal.jsx's 'personal' type) — it's not
// something any one user typed, so it clutters this tab with one identical
// row per user. Matched case-insensitively / trimmed rather than an exact
// string compare, since punctuation on the auto-generated copy could drift
// over time without this filter silently stopping working.
const AUTO_GENERATED_QUESTION_TEXT = 'ask me anything anonymously';
function isAutoGeneratedQuestion(text) {
  return (text || '').trim().toLowerCase() === AUTO_GENERATED_QUESTION_TEXT;
}
const HIDE_AUTO_QUESTIONS_KEY = 'anonroom_admin_hide_auto_questions';

function QuestionsTab({ actor }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  // Defaults to hidden — that's the whole point of this toggle — but
  // remembers the admin's choice across visits via localStorage (this is
  // purely a display filter, never a delete, so it's safe to persist
  // client-side rather than needing a server-side column).
  const [hideAutoGenerated, setHideAutoGenerated] = useState(() => {
    try { return localStorage.getItem(HIDE_AUTO_QUESTIONS_KEY) !== 'false'; } catch { return true; }
  });
  const [confirm, ConfirmUI] = useConfirm();

  function toggleHideAutoGenerated() {
    setHideAutoGenerated((prev) => {
      const next = !prev;
      try { localStorage.setItem(HIDE_AUTO_QUESTIONS_KEY, String(next)); } catch { /* best-effort */ }
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('questions').select('*, profiles(username, avatar_url)').order('created_at', { ascending: false }).limit(FEED_PAGE_LIMIT);
    if (error) showToast(friendlyDbError(), 'error'); else setQuestions(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(question) {
    const ok = await confirm({ title: 'Delete question?', message: 'This will also delete its replies. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBusyId(question.id);
    const { error } = await supabase.from('questions').delete().eq('id', question.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Question deleted.', 'success');
    setQuestions((qs) => qs.filter((q) => q.id !== question.id));
    logAdminAction(actor, 'question.deleted', 'question', question.id, { via: 'questions_tab' });
  }

  const autoGeneratedCount = useMemo(() => questions.filter((q) => isAutoGeneratedQuestion(q.text)).length, [questions]);

  const filtered = useMemo(() => {
    let list = questions;
    if (hideAutoGenerated) list = list.filter((item) => !isAutoGeneratedQuestion(item.text));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => item.text?.toLowerCase().includes(q) || item.profiles?.username?.toLowerCase().includes(q));
  }, [questions, query, hideAutoGenerated]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B8B96', display: 'flex' }}>{Vectors.Search}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search question text or author…" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LiquidSwitch checked={hideAutoGenerated} onChange={toggleHideAutoGenerated} />
          <span style={{ fontSize: 13, color: '#F4F3F0', fontWeight: 600 }}>Hide "Ask Me Anything Anonymously"</span>
        </div>
        {autoGeneratedCount > 0 && <span style={{ fontSize: 12, color: '#8B8B96' }}>{autoGeneratedCount} auto-generated</span>}
      </div>

      <div style={{ fontSize: 13, color: '#8B8B96' }}>{filtered.length} of {questions.length} questions (latest {FEED_PAGE_LIMIT})</div>

      {loading ? <SkeletonRows count={4} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((q) => (
            <Card key={q.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: '#F4F3F0', wordBreak: 'break-word' }}>{q.text}</div>
                  <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 4 }}>
                    {q.question_type}
                    {q.profiles?.username && <> · @{q.profiles.username}</>}
                    {' · '}{new Date(q.created_at).toLocaleString()}
                  </div>
                </div>
                <button onClick={() => handleDelete(q)} disabled={busyId === q.id} style={{ ...iconBtnStyle, color: '#FF6B6B' }}>{Vectors.Trash}</button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && <EmptyState>No questions found.</EmptyState>}
        </div>
      )}
      {ConfirmUI}
    </div>
  );
}

// ----------------------------------------------------------------------------
// STORAGE TAB — browses/cleans the 'media' bucket. Relies on the
// media_admin_full_access storage.objects policy (migration 0004) so this
// works with the caller's own session, no service-role key needed.
// ----------------------------------------------------------------------------
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const PREVIEWABLE_IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function StorageTab({ actor }) {
  const [prefix, setPrefix] = useState(''); // '' = bucket root, else a user-id folder
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [confirm, ConfirmUI] = useConfirm();

  const load = useCallback(async (p) => {
    setLoading(true); setSelected([]);
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(p, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) showToast(friendlyDbError(), 'error'); else setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(prefix); }, [prefix, load]);

  function toggleSelect(name) {
    setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]));
  }

  async function deleteSelected() {
    if (selected.length === 0) return;
    const ok = await confirm({ title: 'Delete files?', message: `${selected.length} item(s) will be permanently removed from storage. This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setDeleting(true);
    const paths = selected.map((name) => (prefix ? `${prefix}/${name}` : name));
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    setDeleting(false);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast(`Deleted ${selected.length} item(s).`, 'success');
    logAdminAction(actor, 'storage.deleted', 'storage', prefix || '(root)', { count: selected.length });
    load(prefix);
  }

  const totalSize = items.reduce((sum, it) => sum + (it.metadata?.size || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#8B8B96' }}>
            Bucket: <strong style={{ color: '#F4F3F0' }}>{MEDIA_BUCKET}</strong>{prefix ? ` / ${prefix}` : ''} · {items.length} item(s) · {formatBytes(totalSize)}
          </div>
          {prefix && <button onClick={() => setPrefix('')} style={{ ...iconBtnStyle, display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '6px 10px', fontSize: 13, color: '#FF6B35' }}>{Vectors.Back} Root</button>}
        </div>
      </Card>

      {selected.length > 0 && (
        <button onClick={deleteSelected} disabled={deleting} style={{ ...primaryBtnStyle(deleting), background: deleting ? 'rgba(255,255,255,0.06)' : '#E5484D' }}>
          {deleting ? 'Deleting…' : `Delete ${selected.length} selected`}
        </button>
      )}

      {loading ? <SkeletonRows count={5} height={50} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => {
            const isFolder = it.id === null; // Supabase storage list() marks folders with a null id
            const checked = selected.includes(it.name);
            const fullPath = prefix ? `${prefix}/${it.name}` : it.name;
            const isImage = !isFolder && PREVIEWABLE_IMAGE_EXT.test(it.name);
            const previewUrl = isImage ? supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fullPath).data?.publicUrl : null;
            return (
              <Card key={it.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!isFolder && <input type="checkbox" checked={checked} onChange={() => toggleSelect(it.name)} style={{ width: 18, height: 18, flexShrink: 0, accentColor: '#FF6B35' }} />}
                  {previewUrl ? (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                      <img src={previewUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                    </a>
                  ) : (
                    <div style={{ color: '#8B8B96', flexShrink: 0 }}>{isFolder ? Vectors.Database : Vectors.File}</div>
                  )}
                  <button onClick={() => isFolder && setPrefix(fullPath)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: isFolder ? 'pointer' : 'default', padding: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#F4F3F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}{isFolder ? '/' : ''}</div>
                    {!isFolder && <div style={{ fontSize: 12, color: '#8B8B96' }}>{formatBytes(it.metadata?.size)}</div>}
                  </button>
                </div>
              </Card>
            );
          })}
          {items.length === 0 && <EmptyState>Empty.</EmptyState>}
        </div>
      )}
      {ConfirmUI}
    </div>
  );
}

// ----------------------------------------------------------------------------
// AUDIT LOG TAB — new. Reads admin_audit_log (migration 0006), which every
// mutating action in this file writes to via logAdminAction() above.
// Defensive against the migration not having been applied yet — a missing
// table shows a friendly notice instead of an error toast.
// ----------------------------------------------------------------------------
const ACTION_LABELS = {
  'group.created': 'created a group', 'group.deleted': 'deleted a group', 'group.edited': 'edited a group',
  'group.channel_toggled': 'toggled channel mode', 'group.cover_updated': 'updated a group picture',
  'user.admin_granted': 'granted admin', 'user.admin_removed': 'removed admin', 'user.banned': 'banned a user', 'user.unbanned': 'unbanned a user',
  'confession.deleted': 'deleted a confession', 'question.deleted': 'deleted a question', 'storage.deleted': 'deleted storage file(s)',
  'push.test_sent': 'sent a test push',
};

function AuditLogTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) {
      setUnavailable(true);
    } else {
      setUnavailable(false);
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (unavailable) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center', padding: 12 }}>
          <div style={{ color: '#8B8B96' }}>{Vectors.Clock}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F4F3F0' }}>Audit log not set up yet</div>
          <div style={{ fontSize: 12.5, color: '#8B8B96', lineHeight: 1.5 }}>
            Apply <code>supabase/migrations/0006_admin_panel_v2.sql</code> to this project to start recording admin actions here.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: '#8B8B96' }}>Last {rows.length} action(s)</div>
      {loading ? <SkeletonRows count={5} height={54} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <Card key={r.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ color: '#8B8B96', marginTop: 2 }}>{Vectors.Clock}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: '#F4F3F0' }}>
                    <strong>{r.actor_name ? `@${r.actor_name}` : 'Someone'}</strong> {ACTION_LABELS[r.action] || r.action}
                    {r.target_type && <span style={{ color: '#8B8B96' }}> · {r.target_type}{r.target_id ? ` #${String(r.target_id).slice(0, 8)}` : ''}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 2 }}>{new Date(r.created_at).toLocaleString()}</div>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && <EmptyState>No admin actions logged yet.</EmptyState>}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// PUSH TAB — send a test push notification. Fires admin-notify with the
// caller's own session JWT, which the function verifies server-side (checks
// profiles.is_admin itself) — this tab being admin-gated in the UI is a
// nicety, not the real access control. Reuses send-push's 'admin' fan-out
// under the hood, so this reaches every user with promotional_enabled =
// true who has a live push_subscriptions row, exactly like a real
// promotional blast would.
// ----------------------------------------------------------------------------
function PushTab({ session, actor }) {
  const [title, setTitle] = useState('Test notification');
  const [body, setBody] = useState('Hello from AnonRoom');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSend() {
    if (!session?.access_token || sending) return;
    setSending(true);
    setResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionsUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
      const response = await fetch(`${functionsUrl}/admin-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title, body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({ ok: false, message: data?.error || `Request failed (${response.status}).` });
      } else {
        setResult({ ok: true, message: `Sent to ${data.sent ?? 0} device(s), skipped ${data.skipped ?? 0}.` });
        logAdminAction(actor, 'push.test_sent', null, null, { title, sent: data.sent, skipped: data.skipped });
      }
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Failed to reach admin-notify.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#F4F3F0' }}>Send test push</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#8B8B96', lineHeight: 1.4 }}>
          Sends to every user with promotional notifications enabled and an active push subscription. Useful for confirming your VAPID keys and edge function are wired up correctly.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" style={inputStyle} />
          <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} style={primaryBtnStyle(sending || !title.trim() || !body.trim())}>
            {sending ? 'Sending…' : 'Send test push'}
          </button>
          {result && <div style={{ fontSize: 13, fontWeight: 500, color: result.ok ? '#2FD8C4' : '#FF6B35' }}>{result.message}</div>}
        </div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SHARED STYLES
// ----------------------------------------------------------------------------
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', background: '#1C1D24', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#F4F3F0' };
const selectStyle = { boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', background: '#1C1D24', borderRadius: 12, padding: '0 10px', fontSize: 13, color: '#F4F3F0', cursor: 'pointer' };
const fieldLabelStyle = { fontSize: 11.5, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 };
const iconBtnStyle = { border: 'none', background: 'rgba(255,255,255,0.06)', width: 32, height: 32, borderRadius: '50%', color: '#8B8B96', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const tableHeadStyle = { textAlign: 'left', padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.4 };
const tableCellStyle = { padding: '10px 14px', verticalAlign: 'middle' };
function primaryBtnStyle(disabled) {
  return { width: '100%', marginTop: 4, padding: '12px 0', borderRadius: 14, border: 'none', background: disabled ? 'rgba(255,255,255,0.06)' : '#FF6B35', color: disabled ? '#8B8B96' : '#fff', fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer' };
}
function pillBtnStyle(active) {
  return { padding: '7px 14px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: active ? '#FF6B35' : 'rgba(255,255,255,0.06)', color: active ? '#fff' : '#8B8B96' };
}
function badgeStyle(color) {
  return { fontSize: 10.5, fontWeight: 700, color, background: `${color}22`, borderRadius: 999, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: 0.3 };
}
const fullScreenCenter = { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C0D10' };

// ----------------------------------------------------------------------------
// RESPONSIVE SHELL — sidebar on desktop-width viewports, bottom tab bar on
// narrow ones. Own small resize listener rather than a shared hook, since
// this is the only page in the whole standalone bundle that needs it.
// ----------------------------------------------------------------------------
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true));
  useEffect(() => {
    function onResize() { setIsDesktop(window.innerWidth >= 900); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isDesktop;
}

// ----------------------------------------------------------------------------
// ROOT
// ----------------------------------------------------------------------------
export default function AdminPanel() {
  const { session, profile, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [authOpen, setAuthOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const isDesktop = useIsDesktop();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Vectors.Grid },
    { id: 'groups', label: 'Groups', icon: Vectors.Hash },
    { id: 'users', label: 'Users', icon: Vectors.Users },
    { id: 'confessions', label: 'Confessions', icon: Vectors.MessageSquare },
    { id: 'questions', label: 'Questions', icon: Vectors.HelpCircle },
    { id: 'storage', label: 'Storage', icon: Vectors.Database },
    { id: 'audit', label: 'Audit Log', icon: Vectors.Clock },
    { id: 'push', label: 'Push', icon: Vectors.Bell },
  ];

  async function handleSignOut() {
    setSigningOut(true);
    hapticTap(); playClose();
    await supabase.auth.signOut();
    setSigningOut(false);
  }

  if (loading) {
    return (
      <div style={fullScreenCenter}>
        <GlobalAdminStyle />
        <div style={{ color: '#FF6B35' }}>{Vectors.Spinner}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={fullScreenCenter}>
        <GlobalAdminStyle />
        <ToastContainer />
        <div className="admin-rise-in" style={{ textAlign: 'center', maxWidth: 320, padding: 20 }}>
          <div style={{ color: '#FF6B35', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{Vectors.Shield}</div>
          <h2 style={{ color: '#F4F3F0', fontSize: 18, margin: '0 0 8px' }}>Admin Panel</h2>
          <p style={{ color: '#8B8B96', fontSize: 14, margin: '0 0 20px' }}>Sign in with your Anonroom account to continue.</p>
          <button onClick={() => setAuthOpen(true)} style={primaryBtnStyle(false)}>Sign in</button>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
      </div>
    );
  }

  if (!profile?.is_admin) {
    return (
      <div style={fullScreenCenter}>
        <GlobalAdminStyle />
        <ToastContainer />
        <div className="admin-rise-in" style={{ textAlign: 'center', maxWidth: 320, padding: 20 }}>
          <div style={{ color: '#8B8B96', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{Vectors.Shield}</div>
          <h2 style={{ color: '#F4F3F0', fontSize: 18, margin: '0 0 8px' }}>Access denied</h2>
          <p style={{ color: '#8B8B96', fontSize: 14, margin: '0 0 20px' }}>Signed in as @{profile?.username || session.user.email}, but this account isn't an admin.</p>
          <button onClick={handleSignOut} disabled={signingOut} style={{ ...iconBtnStyle, width: 'auto', padding: '10px 18px', display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#F4F3F0' }}>
            {Vectors.LogOut} {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    );
  }

  const actor = { id: session.user.id, username: profile.username };

  const activeTabContent = (
    <>
      {tab === 'dashboard' && <DashboardTab profile={profile} />}
      {tab === 'groups' && <GroupsTab actor={actor} />}
      {tab === 'users' && <UsersTab ownUserId={session.user.id} actor={actor} />}
      {tab === 'confessions' && <ConfessionsTab actor={actor} />}
      {tab === 'questions' && <QuestionsTab actor={actor} />}
      {tab === 'storage' && <StorageTab actor={actor} />}
      {tab === 'audit' && <AuditLogTab />}
      {tab === 'push' && <PushTab session={session} actor={actor} />}
    </>
  );

  if (isDesktop) {
    return (
      <div style={{ height: '100dvh', overflow: 'hidden', background: '#0C0D10', display: 'flex' }}>
        <GlobalAdminStyle />
        <ToastContainer />
        <aside style={{ width: 232, flexShrink: 0, background: '#15161B', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '20px 12px', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px' }}>
            <div style={{ color: '#FF6B35' }}>{Vectors.Shield}</div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#F4F3F0' }}>Admin Panel</span>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                className="admin-nav-btn"
                onClick={() => { hapticTap(); playTap(); setTab(t.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: 'none', textAlign: 'left',
                  background: tab === t.id ? 'rgba(255,107,53,0.14)' : 'transparent', color: tab === t.id ? '#FF6B35' : '#8B8B96', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding: '0 8px', fontSize: 12.5, color: '#8B8B96', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{profile.username}</div>
            <button onClick={handleSignOut} disabled={signingOut} className="admin-nav-btn" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: 'none', background: 'transparent', color: '#8B8B96', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', textAlign: 'left' }}>
              {Vectors.LogOut} {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </aside>

        <div className="admin-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px 32px 60px' }}>
          <div key={tab} className="admin-fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
            {activeTabContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', background: '#0C0D10', display: 'flex', flexDirection: 'column' }}>
      <GlobalAdminStyle />
      <ToastContainer />
      <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ color: '#FF6B35' }}>{Vectors.Shield}</div>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F3F0', flex: 1 }}>Admin Panel</h1>
        <span style={{ fontSize: 13, color: '#8B8B96' }}>@{profile.username}</span>
        <button onClick={handleSignOut} disabled={signingOut} style={iconBtnStyle} title="Sign out">{Vectors.LogOut}</button>
      </header>

      <div className="admin-scrollbar" style={{ flexShrink: 0, display: 'flex', gap: 4, padding: '10px 16px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { hapticTap(); playTap(); setTab(t.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, border: 'none', flexShrink: 0,
              background: tab === t.id ? '#FF6B35' : 'transparent', color: tab === t.id ? '#fff' : '#8B8B96', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="admin-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 60px' }}>
        <div key={tab} className="admin-fade-in" style={{ maxWidth: 560, margin: '0 auto' }}>
          {activeTabContent}
        </div>
      </div>
    </div>
  );
}
