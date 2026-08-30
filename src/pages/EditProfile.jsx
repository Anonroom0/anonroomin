import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom'; // <--- ADDED PORTAL
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import NotificationSettingsPanel from '../components/notifications/NotificationSettingsPanel';
import { hapticTap, hapticSuccess, hapticError } from '../lib/haptics';
import { playTap, playRefreshComplete, playError } from '../lib/soundManager';
import { getAdministratorUrl } from '../lib/subdomain';

const AVATAR_BUCKET = 'media';
const ANIMATION_DURATION = 320;

const Vectors = {
  Back: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  LogOut: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  Camera: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  Twitter: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>,
  Instagram: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
  Link: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  Calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  User: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  Bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  Spinner: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
  ChevronRight: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  Shield: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Plus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  ExternalLink: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
  Hash: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
};

// Small on/off switch used for the "Make this a channel" toggle in
// CreateGroupModal — matches this file's flat, borderless icon-button
// styling rather than pulling in GlassToggle (which is styled for the
// glassmorphism surfaces elsewhere, not this solid #1C1D24 sheet).
function LiquidSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 46, height: 28, borderRadius: 999, border: 'none', flexShrink: 0,
        background: checked ? '#FF6B35' : 'rgba(255,255,255,0.12)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3, width: 22, height: 22, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}

// Admin-only "Create Group" flow. Inserts directly into public.groups —
// enforced admin-only server-side by the groups_insert_admin_only RLS
// policy (see supabase/migrations/0004_channels_and_admin_panel.sql), so
// this modal being hidden from non-admins in the UI is a nicety, not the
// actual access control, same pattern as handleSendTestPush above.
function CreateGroupModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isChannel, setIsChannel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(''); setSlug(''); setDescription(''); setIsChannel(false); setError(''); }
  }, [open]);

  // Auto-derives a URL-safe slug from the name unless the admin has
  // already started typing their own — mirrors the common "slugify as you
  // type" pattern without fighting a manual edit once one's in progress.
  const [slugTouched, setSlugTouched] = useState(false);
  function handleNameChange(v) {
    setName(v);
    if (!slugTouched) setSlug(v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    if (!trimmedName || !trimmedSlug) { setError('Name and slug are required.'); return; }
    setSaving(true); setError('');
    try {
      const { data, error: insertError } = await supabase
        .from('groups')
        .insert({ name: trimmedName, slug: trimmedSlug, description: description.trim() || null, is_channel: isChannel })
        .select()
        .single();
      if (insertError) throw insertError;
      hapticSuccess(); playRefreshComplete();
      onCreated?.(data);
      onClose();
    } catch (err) {
      playError(); hapticError();
      setError(err?.message?.includes('duplicate') ? 'That slug is already taken.' : (err?.message || 'Failed to create group.'));
    } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 15, background: '#1C1D24', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onClose} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: '#FF6B35', fontSize: 16, fontWeight: 500, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, marginLeft: -8 }}>
          {Vectors.Back} <span>Close</span>
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F3F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>New Group</h1>
        <div style={{ width: 60 }} />
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 40px' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LiquidInput icon={Vectors.User} label="Group name" value={name} onChange={(e) => handleNameChange(e.target.value)} />
          <LiquidInput icon={Vectors.Hash} label="Slug (used in the group's URL)" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} />
          <LiquidInput icon={Vectors.User} label="Description (optional)" isTextArea={true} value={description} onChange={(e) => setDescription(e.target.value)} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#F4F3F0' }}>Make this a channel</span>
              <span style={{ fontSize: 12.5, color: '#8B8B96', lineHeight: 1.4 }}>Only admins can post. Everyone else can read but not send messages.</span>
            </div>
            <LiquidSwitch checked={isChannel} onChange={setIsChannel} />
          </div>

          {error && <div style={{ color: '#FF6B35', fontSize: 14, fontWeight: 500, textAlign: 'center', background: 'rgba(255,107,53,0.1)', padding: '10px', borderRadius: 12 }}>{error}</div>}

          <button onClick={handleCreate} disabled={saving || !name.trim() || !slug.trim()} style={{ marginTop: 8, padding: '16px 0', borderRadius: 18, border: 'none', background: (name.trim() && slug.trim()) ? '#FF6B35' : 'rgba(255,255,255,0.06)', color: (name.trim() && slug.trim()) ? '#fff' : '#8B8B96', fontWeight: 700, fontSize: 16, cursor: (saving || !name.trim() || !slug.trim()) ? 'default' : 'pointer' }}>
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function LiquidInput({ icon, label, type = "text", value, onChange, isTextArea = false, readOnly = false }) {
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || (value && value.length > 0);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: isTextArea ? 'flex-start' : 'center', gap: 12, background: readOnly ? '#15161B' : '#1C1D24', border: '1px solid', borderColor: isFocused && !readOnly ? '#FF6B35' : 'rgba(255,255,255,0.06)', borderRadius: 16, padding: isTextArea ? '16px' : '8px 16px', boxShadow: isFocused && !readOnly ? '0 0 0 4px rgba(255,107,53,0.15)' : 'inset 0 1px 3px rgba(0,0,0,0.1)', transition: 'all 0.2s', marginTop: 12, opacity: readOnly ? 0.6 : 1, cursor: readOnly ? 'not-allowed' : 'text' }}>
      <div style={{ color: isFocused && !readOnly ? '#FF6B35' : '#8B8B96', transition: 'color 0.2s', paddingTop: isTextArea ? 2 : 0 }}>{icon}</div>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {isTextArea ? (
          <textarea name={`pf-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`} autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={value} onChange={onChange} onFocus={() => { if(!readOnly) setIsFocused(true); }} onBlur={() => setIsFocused(false)} readOnly={readOnly} rows={4} style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: '#F4F3F0', fontFamily: 'inherit', resize: 'none', paddingTop: 12, zIndex: 1, pointerEvents: readOnly ? 'none' : 'auto' }} />
        ) : (
          <input type={type === 'text' ? 'search' : type} name={`pf-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`} autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={value} onChange={onChange} onFocus={() => { if(!readOnly) setIsFocused(true); }} onBlur={() => setIsFocused(false)} readOnly={readOnly} style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: '#F4F3F0', padding: '12px 0 4px', zIndex: 1, pointerEvents: readOnly ? 'none' : 'auto' }} />
        )}
        <label style={{ position: 'absolute', top: isTextArea ? 14 : '50%', left: 0, transform: isFloating ? (isTextArea ? 'translateY(-20px) scale(0.85)' : 'translateY(-24px) scale(0.85)') : (isTextArea ? 'translateY(0)' : 'translateY(-50%)'), transformOrigin: 'left top', color: '#8B8B96', fontSize: 16, pointerEvents: 'none', transition: 'all 0.2s', zIndex: 0 }}>{label}</label>
      </div>
    </div>
  );
}

export default function EditProfile({ open, onClose }) {
  const { session, profile, refreshProfile } = useAuth();
  const userId = session?.user?.id;

  const [isVisible, setIsVisible] = useState(false);
  const [bio, setBio] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [testPushTitle, setTestPushTitle] = useState('Test notification');
  const [testPushBody, setTestPushBody] = useState('Hello from AnonRoom');
  const [sendingTestPush, setSendingTestPush] = useState(false);
  const [testPushResult, setTestPushResult] = useState(null);
  const [initial, setInitial] = useState({ bio: '', twitter: '', instagram: '', website: '', birthday: '', avatarUrl: null });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && profile) {
      setIsVisible(true); setError(''); setSuccess('');
      const links = profile.social_links || {};
      const initialValues = { bio: profile.bio || '', twitter: links.twitter || '', instagram: links.instagram || '', website: links.website || '', birthday: profile.birthday || '', avatarUrl: profile.avatar_url || null };
      setBio(initialValues.bio); setTwitter(initialValues.twitter); setInstagram(initialValues.instagram); setWebsite(initialValues.website); setBirthday(initialValues.birthday); setAvatarUrl(initialValues.avatarUrl); setInitial(initialValues);
    } else if (!open) {
      setIsVisible(false);
    }
  }, [open, profile]);

  const hasChanges = bio !== initial.bio || twitter !== initial.twitter || instagram !== initial.instagram || website !== initial.website || birthday !== initial.birthday || avatarUrl !== initial.avatarUrl;

  const handleClose = useCallback(() => {
    if (saving) return;
    hapticTap();
    playTap();
    setIsVisible(false);
    setTimeout(() => { onClose(); }, ANIMATION_DURATION);
  }, [onClose, saving]);

  const handleBackdropClick = useCallback((e) => { if (e.target === e.currentTarget) handleClose(); }, [handleClose]);
  const handleSignOut = async () => { hapticTap(); playTap(); await supabase.auth.signOut(); window.location.reload(); };

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setError(''); setUploadingAvatar(true);
    try {
      const path = `${userId}/avatar-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) throw new Error('Could not resolve image URL.');
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
      if (updateError) throw updateError;
      setAvatarUrl(publicUrl); setInitial((prev) => ({ ...prev, avatarUrl: publicUrl })); setSuccess('Profile picture updated successfully.'); refreshProfile();
      playRefreshComplete(); hapticSuccess();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { playError(); hapticError(); setError(err?.message || 'Avatar upload failed.'); } finally { setUploadingAvatar(false); }
  }

  async function handleSave() {
    if (!userId || !hasChanges) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const updates = {};
      if (bio !== initial.bio) updates.bio = bio.trim() || null;
      if (birthday !== initial.birthday) updates.birthday = birthday || null;
      if (twitter !== initial.twitter || instagram !== initial.instagram || website !== initial.website) {
        const links = {};
        if (twitter.trim()) links.twitter = twitter.trim();
        if (instagram.trim()) links.instagram = instagram.trim();
        if (website.trim()) links.website = website.trim();
        updates.social_links = links;
      }
      const { error: updateError } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (updateError) throw updateError;
      setInitial({ bio, twitter, instagram, website, birthday, avatarUrl }); setSuccess('Profile saved successfully.'); refreshProfile();
      playRefreshComplete(); hapticSuccess();
      setTimeout(() => { handleClose(); }, 1000);
    } catch (err) { playError(); hapticError(); setError(err.message || 'Failed to save changes.'); } finally { setSaving(false); }
  }

  // Admin-only: fires admin-notify with the caller's own session JWT, which
  // the function verifies server-side (checks profiles.is_admin itself) —
  // this button being hidden for non-admins is a UI nicety, not the actual
  // access control. Reuses send-push's 'admin' fan-out under the hood, so
  // this reaches every user with promotional_enabled = true who has a live
  // push_subscriptions row, exactly like a real promotional blast would.
  async function handleSendTestPush() {
    if (!session?.access_token || sendingTestPush) return;
    setSendingTestPush(true);
    setTestPushResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionsUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
      const response = await fetch(`${functionsUrl}/admin-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ title: testPushTitle, body: testPushBody }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTestPushResult({ ok: false, message: result?.error || `Request failed (${response.status}).` });
      } else {
        setTestPushResult({ ok: true, message: `Sent to ${result.sent ?? 0} device(s), skipped ${result.skipped ?? 0}.` });
      }
    } catch (err) {
      setTestPushResult({ ok: false, message: err.message || 'Failed to reach admin-notify.' });
    } finally {
      setSendingTestPush(false);
    }
  }

  if (!open && !isVisible) return null;
  const displayName = profile?.username || session?.user?.email || 'Anonymous';

  // --------------------------------------------------------------------------
  // THE PORTAL UI (Physically escapes all CSS traps)
  // --------------------------------------------------------------------------
  const modalUI = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999, // Guaranteed Top Layer
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        pointerEvents: 'none' // Let clicks pass through empty space
      }}
    >
      {/* SOLID BLACK DIMMING BACKDROP */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'absolute', inset: 0, 
          backgroundColor: 'rgba(0,0,0,0.85)', // 85% Solid Black
          opacity: isVisible ? 1 : 0, 
          transition: 'opacity 0.3s ease',
          pointerEvents: 'auto',
          zIndex: 1
        }}
      />

      {/* THE SHEET (No CSS Classes used here to prevent overriding) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 2, pointerEvents: 'auto',
          width: '100%', maxWidth: 560, margin: '0 auto', height: '90dvh',
          backgroundColor: '#1C1D24', // SOLID MATTE HEX
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', 
            backgroundColor: '#1C1D24', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 10
          }}
        >
          <button onClick={handleClose} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: '#FF6B35', fontSize: 16, fontWeight: 500, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, marginLeft: -8 }}>
            {Vectors.Back} <span>Close</span>
          </button>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F3F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>Edit Profile</h1>
          <button onClick={handleSignOut} title="Sign Out" style={{ border: 'none', background: 'transparent', padding: '8px', borderRadius: '50%', color: '#FF6B35', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: -8 }}>
            {Vectors.LogOut}
          </button>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <button onClick={() => { hapticTap(); playTap(); fileInputRef.current?.click(); }} disabled={uploadingAvatar} style={{ width: 120, height: 120, borderRadius: '50%', border: 'none', padding: 0, cursor: uploadingAvatar ? 'default' : 'pointer', position: 'relative', overflow: 'hidden', background: '#FF6B35', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', transition: 'transform 0.2s' }}>
                {avatarUrl ? ( <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> ) : ( <span style={{ color: '#fff', fontSize: 40, fontWeight: 800 }}>{getInitials(displayName)}</span> )}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', opacity: uploadingAvatar ? 1 : 0, transition: 'opacity 0.2s' }}>
                  {uploadingAvatar ? Vectors.Spinner : Vectors.Camera}
                  <span style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{uploadingAvatar ? 'Uploading' : 'Edit'}</span>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} style={{ display: 'none' }} />
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>About You</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <LiquidInput icon={Vectors.User} label="Username (Cannot be changed)" value={profile?.username ? `@${profile.username}` : ''} readOnly={true} />
                <LiquidInput icon={Vectors.User} label="Biography" isTextArea={true} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Notifications</h3>
              <button onClick={() => { hapticTap(); playTap(); setNotificationPanelOpen(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', width: '100%', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ color: '#FF6B35' }}>{Vectors.Bell}</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: '#F4F3F0' }}>Notification Settings</span>
                    <span style={{ fontSize: 13, color: '#8B8B96' }}>Manage what AnonRoom can notify you about</span>
                  </div>
                </div>
                <div style={{ color: '#8B8B96' }}>{Vectors.ChevronRight}</div>
              </button>
            </div>

            {profile?.is_admin && (
              <div>
                <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Admin</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button onClick={() => { hapticTap(); playTap(); setCreateGroupOpen(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', width: '100%', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ color: '#FF6B35' }}>{Vectors.Plus}</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 500, color: '#F4F3F0' }}>Create New Group</span>
                        <span style={{ fontSize: 13, color: '#8B8B96' }}>Add a group, optionally as an admin-only channel</span>
                      </div>
                    </div>
                    <div style={{ color: '#8B8B96' }}>{Vectors.ChevronRight}</div>
                  </button>

                  <button onClick={() => { hapticTap(); playTap(); window.open(getAdministratorUrl(), '_blank', 'noopener,noreferrer'); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', width: '100%', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ color: '#FF6B35' }}>{Vectors.Shield}</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 500, color: '#F4F3F0' }}>Open Admin Panel</span>
                        <span style={{ fontSize: 13, color: '#8B8B96' }}>Users, groups, storage cleanup — administrator.anonroom.in</span>
                      </div>
                    </div>
                    <div style={{ color: '#8B8B96' }}>{Vectors.ExternalLink}</div>
                  </button>
                </div>
              </div>
            )}

            {profile?.is_admin && (
              <div>
                <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Admin: Send Test Push</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#15161B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12.5, color: '#8B8B96', lineHeight: 1.4 }}>
                    Sends to every user with promotional notifications enabled and an active push subscription. Useful for confirming your VAPID keys and edge function are wired up correctly.
                  </p>
                  <LiquidInput icon={Vectors.Bell} label="Title" value={testPushTitle} onChange={(e) => setTestPushTitle(e.target.value)} />
                  <LiquidInput icon={Vectors.Bell} label="Body" value={testPushBody} onChange={(e) => setTestPushBody(e.target.value)} />
                  <button
                    onClick={handleSendTestPush}
                    disabled={sendingTestPush || !testPushTitle.trim() || !testPushBody.trim()}
                    style={{ marginTop: 8, padding: '12px 0', borderRadius: 14, border: 'none', background: sendingTestPush ? 'rgba(255,255,255,0.06)' : '#FF6B35', color: sendingTestPush ? '#8B8B96' : '#fff', fontWeight: 700, fontSize: 15, cursor: sendingTestPush ? 'default' : 'pointer' }}
                  >
                    {sendingTestPush ? 'Sending…' : 'Send Test Push'}
                  </button>
                  {testPushResult && (
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: testPushResult.ok ? '#2FD8C4' : '#FF6B35' }}>
                      {testPushResult.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Social Links</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <LiquidInput icon={Vectors.Twitter} label="Twitter / X" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
                <LiquidInput icon={Vectors.Instagram} label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                <LiquidInput icon={Vectors.Link} label="Personal Website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px 12px', fontSize: 13, fontWeight: 600, color: '#8B8B96', textTransform: 'uppercase', letterSpacing: 0.5 }}>Private Information</h3>
              <LiquidInput icon={Vectors.Calendar} label="Birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {error && <div style={{ color: '#FF6B35', fontSize: 14, fontWeight: 500, textAlign: 'center', background: 'rgba(255,107,53,0.1)', padding: '10px', borderRadius: 12 }}>{error}</div>}
              {success && <div style={{ color: '#2FD8C4', fontSize: 14, fontWeight: 600, textAlign: 'center', background: 'rgba(47,216,196,0.1)', padding: '10px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{Vectors.Check} {success}</div>}
              <button onClick={handleSave} disabled={!hasChanges || saving} style={{ padding: '16px 0', borderRadius: 18, border: 'none', background: hasChanges ? '#FF6B35' : 'rgba(255,255,255,0.06)', color: hasChanges ? '#fff' : '#8B8B96', fontWeight: 700, fontSize: 16, cursor: hasChanges ? 'pointer' : 'default', transition: 'background 0.2s', marginBottom: 16 }}>
                {saving ? 'Saving Changes...' : 'Save Profile'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {notificationPanelOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'auto' }}>
          <NotificationSettingsPanel onClose={() => setNotificationPanelOpen(false)} />
        </div>
      )}
    </div>
  );

  // Safely inject into body to escape all CSS flex/transform traps
  if (typeof document !== 'undefined') {
    return createPortal(modalUI, document.body);
  }
  return null;
}
