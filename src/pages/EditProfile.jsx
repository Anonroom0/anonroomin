import { Capacitor } from '@capacitor/core';
import { APP_VERSION, fetchLatestAppVersion, isNewerVersion } from '../lib/appVersion';
import { downloadAndInstallUpdate } from '../lib/appUpdate';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom'; // <--- ADDED PORTAL
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import NotificationSettingsPanel from '../components/notifications/NotificationSettingsPanel';
import GlassToggle from '../components/shared/GlassToggle';
import { hapticTap, hapticSuccess, hapticError } from '../lib/haptics';
import { playTap, playRefreshComplete, playError } from '../lib/soundManager';
import { getAdministratorUrl } from '../lib/subdomain';

const AVATAR_BUCKET = 'media';
const ANIMATION_DURATION = 320;

const Vectors = {
  Back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  LogOut: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  Camera: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  Twitter: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>,
  Instagram: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>,
  Link: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  Calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  User: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  Bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  Spinner: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-spin"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
  ChevronRight: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  Shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  ExternalLink: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
  Sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>,
  Moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
};

function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

// Apple-style inset text field: flat, no glow, single hairline border,
// label sits inline until focused/filled, then floats above.
function LiquidInput({ icon, label, type = "text", value, onChange, isTextArea = false, readOnly = false }) {
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || (value && value.length > 0);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: isTextArea ? 'flex-start' : 'center',
        gap: 12,
        background: 'transparent',
        borderBottom: '1px solid var(--glass-border)',
        padding: isTextArea ? '14px 2px' : '12px 2px',
        transition: 'border-color 0.2s ease',
        opacity: readOnly ? 0.5 : 1,
        cursor: readOnly ? 'not-allowed' : 'text',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          flexShrink: 0,
          color: isFocused && !readOnly ? 'var(--ember)' : 'var(--dim)',
          transition: 'color 0.2s ease',
          marginTop: isTextArea ? 3 : 0,
        }}
      >
        {icon}
      </div>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: isTextArea ? 'auto' : 40 }}>
        {isTextArea ? (
          <textarea name={`pf-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`} autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={value} onChange={onChange} onFocus={() => { if(!readOnly) setIsFocused(true); }} onBlur={() => setIsFocused(false)} readOnly={readOnly} rows={4} style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, fontWeight: 600, color: 'var(--paper)', fontFamily: 'inherit', resize: 'none', paddingTop: 14, zIndex: 1, pointerEvents: readOnly ? 'none' : 'auto', lineHeight: 1.45 }} />
        ) : (
          <input type={type === 'text' ? 'search' : type} name={`pf-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`} autoComplete="off-nope" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" value={value} onChange={onChange} onFocus={() => { if(!readOnly) setIsFocused(true); }} onBlur={() => setIsFocused(false)} readOnly={readOnly} style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 16, fontWeight: 600, color: 'var(--paper)', padding: '13px 0 4px', zIndex: 1, pointerEvents: readOnly ? 'none' : 'auto' }} />
        )}
        <label style={{ position: 'absolute', top: isTextArea ? 16 : '50%', left: 0, transform: isFloating ? (isTextArea ? 'translateY(-22px) scale(0.8)' : 'translateY(-24px) scale(0.8)') : (isTextArea ? 'translateY(0)' : 'translateY(-50%)'), transformOrigin: 'left top', color: isFocused && !readOnly ? 'var(--ember)' : 'var(--dim)', fontWeight: 700, fontSize: 15, pointerEvents: 'none', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', zIndex: 0 }}>{label}</label>
      </div>
    </div>
  );
}

// Plain uppercase section header — no icon chip, just a bold monochrome
// caption, the way iOS groups settings sections.
function SectionLabel({ children }) {
  return (
    <h3 style={{ margin: '0 0 8px 4px', fontSize: 13, fontWeight: 800, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {children}
    </h3>
  );
}

// A single settings row: icon, title, optional subtitle, optional chevron.
// Flat, no colored badge behind the icon — icon just sits in the row.
function SettingsRow({ icon, title, subtitle, onClick, chevron = true, iconColor }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, padding: '14px 4px', border: 'none', borderBottom: '1px solid var(--glass-border)',
        background: 'transparent', width: '100%', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor || 'var(--ember)', flexShrink: 0 }}>{icon}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--paper)' }}>{title}</span>
          {subtitle && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)' }}>{subtitle}</span>}
        </div>
      </div>
      {chevron && <div style={{ color: 'var(--dim)', flexShrink: 0 }}>{Vectors.ChevronRight}</div>}
    </button>
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
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('anonroom-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [initial, setInitial] = useState({ bio: '', twitter: '', instagram: '', website: '', birthday: '', avatarUrl: null });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isNativeApp = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const [updateStatus, setUpdateStatus] = useState('idle'); // idle | checking | current | available | error | downloading | download-error
  const [latestInfo, setLatestInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
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

  // Native only: silently check for an update when the sheet opens so the
  // App section can show "Update available" without an extra tap.
  useEffect(() => {
    if (!open || !isNativeApp) return undefined;
    let cancelled = false;
    (async () => {
      setUpdateStatus('checking');
      try {
        const latest = await fetchLatestAppVersion();
        if (cancelled) return;
        setLatestInfo(latest);
        setUpdateStatus(isNewerVersion(latest.version, APP_VERSION) ? 'available' : 'current');
      } catch {
        if (!cancelled) setUpdateStatus('idle');
      }
    })();
    return () => { cancelled = true; };
  }, [open, isNativeApp]);

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

  function handleThemeToggle(nextChecked) {
    const next = nextChecked ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('anonroom-theme', next);
    } catch {}
    document.documentElement.setAttribute('data-theme', next);
    hapticTap();
    playTap();
  }

  async function handleCheckForUpdate() {
    setUpdateStatus('checking');
    setLatestInfo(null);
    try {
      const latest = await fetchLatestAppVersion();
      setLatestInfo(latest);
      if (isNewerVersion(latest.version, APP_VERSION)) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('current');
      }
    } catch (err) {
      console.error(err);
      setUpdateStatus('error');
    }
  }

  async function handleDownloadUpdate() {
    if (!latestInfo?.apkUrl) return;
    setUpdateStatus('downloading');
    setDownloadProgress(0);
    try {
      await downloadAndInstallUpdate(latestInfo.apkUrl, {
        onProgress: (fraction) => setDownloadProgress(fraction),
      });
      // Installer sheet has been handed off to Android at this point;
      // leave the panel in "available" so the button is there again if
      // the user backs out of the install screen instead of confirming.
      setUpdateStatus('available');
    } catch (err) {
      console.error(err);
      playError(); hapticError();
      setUpdateStatus('download-error');
    }
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
      {/* Dimming backdrop */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'auto',
          zIndex: 1
        }}
      />

      {/* THE SHEET */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 2, pointerEvents: 'auto',
          width: '100%', maxWidth: 560, margin: '0 auto', height: '90dvh',
          background: 'var(--sheet-bg)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: '1px solid var(--glass-border)', borderBottom: 'none',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 36, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 14px',
            borderBottom: '1px solid var(--glass-border)', zIndex: 10
          }}
        >
          <button onClick={handleClose} style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: '6px 4px' }}>
            {Vectors.Back} <span>Close</span>
          </button>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--paper)', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: 0.1 }}>Edit Profile</h1>
          <button onClick={handleSignOut} title="Sign Out" style={{ border: 'none', background: 'transparent', color: 'var(--ember)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 6 }}>
            {Vectors.LogOut}
          </button>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 60px' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => { hapticTap(); playTap(); fileInputRef.current?.click(); }}
                disabled={uploadingAvatar}
                style={{
                  width: 100, height: 100, borderRadius: '50%', border: 'none', padding: 0,
                  cursor: uploadingAvatar ? 'default' : 'pointer', position: 'relative',
                  background: 'var(--ink-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {avatarUrl ? ( <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> ) : ( <span style={{ color: 'var(--paper)', fontSize: 32, fontWeight: 800 }}>{getInitials(displayName)}</span> )}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', opacity: uploadingAvatar ? 1 : 0, transition: 'opacity 0.2s' }}>
                  {uploadingAvatar ? Vectors.Spinner : Vectors.Camera}
                  <span style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{uploadingAvatar ? 'Uploading' : 'Edit'}</span>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} style={{ display: 'none' }} />
              <button
                onClick={() => { hapticTap(); playTap(); fileInputRef.current?.click(); }}
                disabled={uploadingAvatar}
                style={{ border: 'none', background: 'transparent', color: 'var(--ember)', fontSize: 14, fontWeight: 700, cursor: uploadingAvatar ? 'default' : 'pointer' }}
              >
                {uploadingAvatar ? 'Uploading…' : 'Change Photo'}
              </button>
            </div>

            <div>
              <SectionLabel>About You</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <LiquidInput icon={Vectors.User} label="Username (Cannot be changed)" value={profile?.username ? `@${profile.username}` : ''} readOnly={true} />
                <LiquidInput icon={Vectors.User} label="Biography" isTextArea={true} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            </div>

            <div>
              <SectionLabel>Notifications</SectionLabel>
              <SettingsRow
                icon={Vectors.Bell}
                title="Notification Settings"
                subtitle="Manage what AnonRoom can notify you about"
                onClick={() => { hapticTap(); playTap(); setNotificationPanelOpen(true); }}
              />
            </div>

            <div>
              <SectionLabel>Appearance</SectionLabel>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '14px 4px',
                  borderBottom: '1px solid var(--glass-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ember)', flexShrink: 0 }}>
                    {theme === 'light' ? Vectors.Sun : Vectors.Moon}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--paper)' }}>
                      Light mode
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)' }}>
                      {theme === 'light' ? 'Currently using light theme' : 'Currently using dark theme'}
                    </span>
                  </div>
                </div>
                <GlassToggle
                  checked={theme === 'light'}
                  onChange={handleThemeToggle}
                />
              </div>
            </div>

            {profile?.is_admin && (
              <div>
                <SectionLabel>Admin</SectionLabel>
                <SettingsRow
                  icon={Vectors.Shield}
                  title="Open Admin Panel"
                  subtitle="Groups, users, storage, test push"
                  onClick={() => { hapticTap(); playTap(); window.open(getAdministratorUrl(), '_blank', 'noopener,noreferrer'); }}
                  chevron={false}
                  iconColor="var(--admin-1)"
                />
              </div>
            )}

            {isNativeApp && (
              <div>
                <SectionLabel>App</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 4px 12px', borderBottom: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--paper)' }}>Version {APP_VERSION}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)', marginTop: 2 }}>
                        {updateStatus === 'checking' && 'Checking for updates…'}
                        {updateStatus === 'current' && "You're up to date"}
                        {updateStatus === 'available' && latestInfo && `Update available: v${latestInfo.version}`}
                        {updateStatus === 'downloading' && `Downloading… ${Math.round(downloadProgress * 100)}%`}
                        {updateStatus === 'download-error' && 'Download failed — tap to retry'}
                        {updateStatus === 'error' && 'Could not check right now'}
                        {updateStatus === 'idle' && 'Check whether a newer build is available'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckForUpdate}
                      disabled={updateStatus === 'checking'}
                      style={{
                        border: 'none', background: 'transparent', color: 'var(--ember)',
                        fontWeight: 700, fontSize: 14, cursor: updateStatus === 'checking' ? 'default' : 'pointer',
                        opacity: updateStatus === 'checking' ? 0.5 : 1, whiteSpace: 'nowrap', padding: '6px 2px',
                      }}
                    >
                      {updateStatus === 'checking' ? 'Checking…' : 'Check for update'}
                    </button>
                  </div>
                  {(updateStatus === 'available' || updateStatus === 'download-error') && latestInfo && (
                    <button
                      type="button"
                      onClick={handleDownloadUpdate}
                      style={{
                        width: '100%', border: 'none', background: 'var(--ember)', color: '#fff',
                        borderRadius: 12, padding: '12px 16px', fontWeight: 800, fontSize: 15, cursor: 'pointer',
                      }}
                    >
                      {updateStatus === 'download-error' ? 'Retry download' : 'Download updated version'}
                    </button>
                  )}

                  {updateStatus === 'downloading' && (
                    <div style={{ width: '100%', height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.max(4, Math.round(downloadProgress * 100))}%`,
                          height: '100%', borderRadius: 999, background: 'var(--ember)',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <SectionLabel>Social Links</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <LiquidInput icon={Vectors.Twitter} label="Twitter / X" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
                <LiquidInput icon={Vectors.Instagram} label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                <LiquidInput icon={Vectors.Link} label="Personal Website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>

            <div>
              <SectionLabel>Private Information</SectionLabel>
              <LiquidInput icon={Vectors.Calendar} label="Birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--danger)', fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '12px' }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ color: 'var(--signal)', fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {Vectors.Check} {success}
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                style={{
                  padding: '16px 0', borderRadius: 14, border: 'none',
                  background: hasChanges ? 'var(--ember)' : 'var(--glass)',
                  color: hasChanges ? '#fff' : 'var(--dim)',
                  fontWeight: 800, fontSize: 16, letterSpacing: 0.1,
                  cursor: hasChanges ? 'pointer' : 'default',
                  transition: 'background 0.2s ease', marginBottom: 16,
                }}
              >
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
