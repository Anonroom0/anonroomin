/**
 * ============================================================================
 * ADMIN PANEL — administrator.anonroom.in
 * ============================================================================
 * Standalone view rendered by App.jsx when isAdministratorSubdomain() is
 * true. Uses the exact same AuthProvider/session as the main site — the
 * cross-subdomain cookie set up in supabaseClient.js (cookieDomain =
 * '.anonroom.in') means a login on anonroom.in is already valid here with
 * no separate auth step. Every mutation below is also enforced server-side
 * via RLS (see supabase/migrations/0004_channels_and_admin_panel.sql), so
 * the is_admin gate in this component is a UI nicety, not the real access
 * control — same pattern as EditProfile.jsx's admin-only sections.
 *
 * Tabs:
 *   - Groups:  list/create groups, toggle channel mode, delete a group
 *   - Users:   list all profiles, promote/demote admin status
 *   - Storage: browse the 'media' bucket, delete individual files or bulk-clean
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import AuthModal from './AuthModal';
import { hapticTap, hapticSuccess, hapticError } from '../lib/haptics';
import { playTap, playRefreshComplete, playError } from '../lib/soundManager';
import { showToast, friendlyDbError } from '../lib/toast';
import ToastContainer from '../components/ToastContainer';

const Vectors = {
  Shield: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Spinner: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
  Users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Hash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>,
  Database: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
  Trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  File: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  Bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  ChevronRight: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
};

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

function Card({ children }) {
  return <div style={{ background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>{children}</div>;
}

// ----------------------------------------------------------------------------
// GROUPS TAB
// ----------------------------------------------------------------------------
function GroupsTab() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', isChannel: false });
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (error) showToast(friendlyDbError(), 'error'); else setGroups(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleNameChange(v) {
    setForm((f) => ({ ...f, name: v, slug: slugTouched ? f.slug : v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }));
  }

  async function handleCreate() {
    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    if (!name || !slug) { showToast('Name and slug are required.', 'info'); return; }
    setCreating(true);
    const { data, error } = await supabase.from('groups').insert({ name, slug, description: form.description.trim() || null, is_channel: form.isChannel }).select().single();
    setCreating(false);
    if (error) { playError(); hapticError(); showToast(error.message?.includes('duplicate') ? 'That slug is already taken.' : friendlyDbError(), 'error'); return; }
    hapticSuccess(); playRefreshComplete(); showToast('Group created.', 'success');
    setForm({ name: '', slug: '', description: '', isChannel: false }); setSlugTouched(false);
    setGroups((g) => [data, ...g]);
  }

  async function toggleChannel(group) {
    setBusyId(group.id);
    const { error } = await supabase.from('groups').update({ is_channel: !group.is_channel }).eq('id', group.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticTap();
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, is_channel: !g.is_channel } : g)));
  }

  async function handleDelete(group) {
    if (!window.confirm(`Delete "${group.name}"? This cannot be undone.`)) return;
    setBusyId(group.id);
    const { error } = await supabase.from('groups').delete().eq('id', group.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Group deleted.', 'success');
    setGroups((gs) => gs.filter((g) => g.id !== group.id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#F4F3F0' }}>Create Group</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Group name" style={inputStyle} />
          <input value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })); }} placeholder="slug" style={inputStyle} />
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" style={inputStyle} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
            <span style={{ fontSize: 14, color: '#F4F3F0' }}>Channel mode (admin-only posting)</span>
            <LiquidSwitch checked={form.isChannel} onChange={(v) => setForm((f) => ({ ...f, isChannel: v }))} />
          </div>
          <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.slug.trim()} style={primaryBtnStyle(creating || !form.name.trim() || !form.slug.trim())}>
            {creating ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </Card>

      <div>
        <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>All Groups ({groups.length})</h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: '#FF6B35' }}>{Vectors.Spinner}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map((g) => (
              <Card key={g.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F4F3F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                    <div style={{ fontSize: 12.5, color: '#8B8B96' }}>/{g.slug}{g.is_channel ? ' · channel' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    <LiquidSwitch checked={!!g.is_channel} onChange={() => toggleChannel(g)} disabled={busyId === g.id} />
                    <button onClick={() => handleDelete(g)} disabled={busyId === g.id} style={iconBtnStyle}>{Vectors.Trash}</button>
                  </div>
                </div>
              </Card>
            ))}
            {groups.length === 0 && <div style={{ color: '#8B8B96', fontSize: 14, textAlign: 'center', padding: 20 }}>No groups yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// USERS TAB
// ----------------------------------------------------------------------------
function UsersTab({ ownUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [detailUser, setDetailUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('id, username, avatar_url, is_admin, created_at').order('created_at', { ascending: false });
    if (error) showToast(friendlyDbError(), 'error'); else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAdmin(user) {
    if (user.id === ownUserId) { showToast("You can't change your own admin status here.", 'info'); return; }
    if (!window.confirm(`${user.is_admin ? 'Remove admin from' : 'Make admin:'} @${user.username || 'unknown'}?`)) return;
    setBusyId(user.id);
    const { error } = await supabase.from('profiles').update({ is_admin: !user.is_admin }).eq('id', user.id);
    setBusyId(null);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast(user.is_admin ? 'Admin removed.' : 'User promoted to admin.', 'success');
    setUsers((us) => us.map((u) => (u.id === user.id ? { ...u, is_admin: !u.is_admin } : u)));
  }

  const filtered = users.filter((u) => !query.trim() || u.username?.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username…" style={inputStyle} />
      <div style={{ fontSize: 13, color: '#8B8B96' }}>{filtered.length} of {users.length} users</div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: '#FF6B35' }}>{Vectors.Spinner}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((u) => (
            <Card key={u.id}>
              <button onClick={() => setDetailUser(u)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FF6B35', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>{(u.username || '?').slice(0, 2).toUpperCase()}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: u.is_admin ? '#FF6B35' : '#F4F3F0' }}>@{u.username || 'unknown'}</div>
                  <div style={{ fontSize: 12, color: '#8B8B96' }}>{u.is_admin ? 'Admin' : 'Member'}</div>
                </div>
                <div style={{ color: '#8B8B96', flexShrink: 0 }}>{Vectors.ChevronRight}</div>
              </button>
              <div style={{ marginTop: 10 }}>
                <button onClick={(e) => { e.stopPropagation(); toggleAdmin(u); }} disabled={busyId === u.id || u.id === ownUserId} style={{ ...primaryBtnStyle(busyId === u.id || u.id === ownUserId), width: 'auto', padding: '8px 14px', fontSize: 13, marginTop: 0 }}>
                  {u.is_admin ? 'Remove admin' : 'Make admin'}
                </button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && <div style={{ color: '#8B8B96', fontSize: 14, textAlign: 'center', padding: 20 }}>No users found.</div>}
        </div>
      )}

      {detailUser && <UserDetailPanel user={detailUser} onClose={() => setDetailUser(null)} />}
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
function UserDetailPanel({ user, onClose }) {
  const [loading, setLoading] = useState(true);
  const [groupsIn, setGroupsIn] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [confessions, setConfessions] = useState([]);
  const [questions, setQuestions] = useState([]);

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
    if (!window.confirm('Delete this confession? This cannot be undone.')) return;
    const { error } = await supabase.from('confessions').delete().eq('id', id);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Confession deleted.', 'success');
    setConfessions((cs) => cs.filter((c) => c.id !== id));
  }

  async function deleteQuestion(id) {
    if (!window.confirm('Delete this question and its replies? This cannot be undone.')) return;
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast('Question deleted.', 'success');
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0C0D10', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onClose} style={iconBtnStyle}>{Vectors.Back}</button>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#F4F3F0' }}>@{user.username || 'unknown'}</h1>
      </header>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 60px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: '#FF6B35' }}>{Vectors.Spinner}</div>
          ) : (
            <>
              <div>
                <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Groups posted in ({groupsIn.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groupsIn.map((g) => <Card key={g.id}><span style={{ fontSize: 14, color: '#F4F3F0' }}>{g.name} <span style={{ color: '#8B8B96' }}>/{g.slug}</span></span></Card>)}
                  {groupsIn.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>DM threads ({dmThreads.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dmThreads.map((t) => <Card key={t.id}><span style={{ fontSize: 14, color: '#F4F3F0' }}>with @{t.otherUsername}</span></Card>)}
                  {dmThreads.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Confessions ({confessions.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {confessions.map((c) => (
                    <Card key={c.id}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: '#F4F3F0', wordBreak: 'break-word' }}>{c.text || <em style={{ color: '#8B8B96' }}>(no text)</em>}</div>
                          <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 4 }}>{c.visibility} · {new Date(c.created_at).toLocaleString()}</div>
                        </div>
                        <button onClick={() => deleteConfession(c.id)} style={iconBtnStyle}>{Vectors.Trash}</button>
                      </div>
                    </Card>
                  ))}
                  {confessions.length === 0 && <div style={{ color: '#8B8B96', fontSize: 13 }}>None.</div>}
                </div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Questions ({questions.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {questions.map((q) => (
                    <Card key={q.id}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: '#F4F3F0', wordBreak: 'break-word' }}>{q.text}</div>
                          <div style={{ fontSize: 11.5, color: '#8B8B96', marginTop: 4 }}>{q.question_type} · {new Date(q.created_at).toLocaleString()}</div>
                        </div>
                        <button onClick={() => deleteQuestion(q.id)} style={iconBtnStyle}>{Vectors.Trash}</button>
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
    </div>
  );
}

// ----------------------------------------------------------------------------
// STORAGE TAB — browses/cleans the 'media' bucket. Relies on the
// media_admin_full_access storage.objects policy (migration 0004) so this
// works with the caller's own session, no service-role key needed.
// ----------------------------------------------------------------------------
const MEDIA_BUCKET = 'media';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const PREVIEWABLE_IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function StorageTab() {
  const [prefix, setPrefix] = useState(''); // '' = bucket root, else a user-id folder
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);

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
    if (!window.confirm(`Delete ${selected.length} item(s) from storage? This cannot be undone.`)) return;
    setDeleting(true);
    const paths = selected.map((name) => (prefix ? `${prefix}/${name}` : name));
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    setDeleting(false);
    if (error) { showToast(friendlyDbError(), 'error'); return; }
    hapticSuccess(); showToast(`Deleted ${selected.length} item(s).`, 'success');
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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: '#FF6B35' }}>{Vectors.Spinner}</div>
      ) : (
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
                  {!isFolder && (
                    <input type="checkbox" checked={checked} onChange={() => toggleSelect(it.name)} style={{ width: 18, height: 18, flexShrink: 0, accentColor: '#FF6B35' }} />
                  )}
                  {previewUrl ? (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                      <img src={previewUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                    </a>
                  ) : (
                    <div style={{ color: '#8B8B96', flexShrink: 0 }}>{isFolder ? Vectors.Database : Vectors.File}</div>
                  )}
                  <button
                    onClick={() => isFolder && setPrefix(fullPath)}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: isFolder ? 'pointer' : 'default', padding: 0 }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#F4F3F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}{isFolder ? '/' : ''}</div>
                    {!isFolder && <div style={{ fontSize: 12, color: '#8B8B96' }}>{formatBytes(it.metadata?.size)}</div>}
                  </button>
                </div>
              </Card>
            );
          })}
          {items.length === 0 && <div style={{ color: '#8B8B96', fontSize: 14, textAlign: 'center', padding: 20 }}>Empty.</div>}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// PUSH TAB — send a test push notification. Moved here from
// EditProfile.jsx's "Admin: Send Test Push" section: this is the admin
// panel, so admin-only tools belong here rather than mixed into every
// user's own profile editor. Fires admin-notify with the caller's own
// session JWT, which the function verifies server-side (checks
// profiles.is_admin itself) — this tab being admin-gated in the UI is a
// nicety, not the real access control. Reuses send-push's 'admin' fan-out
// under the hood, so this reaches every user with promotional_enabled =
// true who has a live push_subscriptions row, exactly like a real
// promotional blast would.
// ----------------------------------------------------------------------------
function PushTab({ session }) {
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
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#F4F3F0' }}>Send Test Push</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#8B8B96', lineHeight: 1.4 }}>
          Sends to every user with promotional notifications enabled and an active push subscription. Useful for confirming your VAPID keys and edge function are wired up correctly.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" style={inputStyle} />
          <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} style={primaryBtnStyle(sending || !title.trim() || !body.trim())}>
            {sending ? 'Sending…' : 'Send Test Push'}
          </button>
          {result && (
            <div style={{ fontSize: 13, fontWeight: 500, color: result.ok ? '#2FD8C4' : '#FF6B35' }}>{result.message}</div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SHARED STYLES
// ----------------------------------------------------------------------------
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', background: '#1C1D24', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#F4F3F0' };
const iconBtnStyle = { border: 'none', background: 'rgba(255,255,255,0.06)', width: 32, height: 32, borderRadius: '50%', color: '#8B8B96', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
function primaryBtnStyle(disabled) {
  return { width: '100%', marginTop: 4, padding: '12px 0', borderRadius: 14, border: 'none', background: disabled ? 'rgba(255,255,255,0.06)' : '#FF6B35', color: disabled ? '#8B8B96' : '#fff', fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer' };
}

// ----------------------------------------------------------------------------
// ROOT
// ----------------------------------------------------------------------------
export default function AdminPanel() {
  const { session, profile, loading } = useAuth();
  const [tab, setTab] = useState('groups');
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) {
    return <div style={fullScreenCenter}><div style={{ color: '#FF6B35' }}>{Vectors.Spinner}</div></div>;
  }

  if (!session) {
    return (
      <div style={fullScreenCenter}>
        <ToastContainer />
        <div style={{ textAlign: 'center', maxWidth: 320, padding: 20 }}>
          <div style={{ color: '#FF6B35', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{Vectors.Shield}</div>
          <h2 style={{ color: '#F4F3F0', fontSize: 18, margin: '0 0 8px' }}>Admin Panel</h2>
          <p style={{ color: '#8B8B96', fontSize: 14, margin: '0 0 20px' }}>Sign in with your Anonroom account to continue.</p>
          <button onClick={() => setAuthOpen(true)} style={primaryBtnStyle(false)}>Sign In</button>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialTab="signin" onVerified={() => setAuthOpen(false)} />
      </div>
    );
  }

  if (!profile?.is_admin) {
    return (
      <div style={fullScreenCenter}>
        <div style={{ textAlign: 'center', maxWidth: 320, padding: 20 }}>
          <h2 style={{ color: '#F4F3F0', fontSize: 18, margin: '0 0 8px' }}>Access denied</h2>
          <p style={{ color: '#8B8B96', fontSize: 14, margin: 0 }}>Signed in as @{profile?.username || session.user.email}, but this account isn't an admin.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'groups', label: 'Groups', icon: Vectors.Hash },
    { id: 'users', label: 'Users', icon: Vectors.Users },
    { id: 'storage', label: 'Storage', icon: Vectors.Database },
    { id: 'push', label: 'Push', icon: Vectors.Bell },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: '#0C0D10', display: 'flex', flexDirection: 'column' }}>
      <ToastContainer />
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ color: '#FF6B35' }}>{Vectors.Shield}</div>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F3F0', flex: 1 }}>Admin Panel</h1>
        <span style={{ fontSize: 13, color: '#8B8B96' }}>@{profile.username}</span>
      </header>

      <div style={{ display: 'flex', gap: 4, padding: '10px 16px', background: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 61, zIndex: 9, overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { hapticTap(); playTap(); setTab(t.id); }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, border: 'none', flexShrink: 0,
            background: tab === t.id ? '#FF6B35' : 'transparent', color: tab === t.id ? '#fff' : '#8B8B96', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 60px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {tab === 'groups' && <GroupsTab />}
          {tab === 'users' && <UsersTab ownUserId={session.user.id} />}
          {tab === 'storage' && <StorageTab />}
          {tab === 'push' && <PushTab session={session} />}
        </div>
      </div>
    </div>
  );
}

const fullScreenCenter = { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C0D10' };
