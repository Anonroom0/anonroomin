import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';

const AVATAR_BUCKET = 'media';

function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toUpperCase();
}

export default function EditProfile({ open, onClose }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;

  const [bio, setBio] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);

  const [initial, setInitial] = useState({ bio: '', twitter: '', instagram: '', website: '', birthday: '' });

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open || !profile) return;
    const links = profile.social_links || {};
    const nextValues = {
      bio: profile.bio || '',
      twitter: links.twitter || '',
      instagram: links.instagram || '',
      website: links.website || '',
      birthday: profile.birthday || '',
    };
    setBio(nextValues.bio);
    setTwitter(nextValues.twitter);
    setInstagram(nextValues.instagram);
    setWebsite(nextValues.website);
    setBirthday(nextValues.birthday);
    setAvatarUrl(profile.avatar_url || null);
    setInitial(nextValues);
    setError('');
    setAvatarError('');
    setSaved(false);
  }, [open, profile]);

  if (!open) return null;

  const hasChanges =
    bio !== initial.bio ||
    twitter !== initial.twitter ||
    instagram !== initial.instagram ||
    website !== initial.website ||
    birthday !== initial.birthday;

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;

    setAvatarError('');
    setUploadingAvatar(true);

    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${userId}/avatar-${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setAvatarError(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        setAvatarError('Could not resolve uploaded image URL.');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) {
        setAvatarError(updateError.message);
        return;
      }

      setAvatarUrl(publicUrl);
    } catch (err) {
      setAvatarError(err?.message || 'Avatar upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave() {
    if (!userId || !hasChanges) return;
    setError('');
    setSaved(false);
    setSaving(true);

    const updates = {};

    if (bio !== initial.bio) updates.bio = bio.trim() || null;

    if (twitter !== initial.twitter || instagram !== initial.instagram || website !== initial.website) {
      const links = {};
      if (twitter.trim()) links.twitter = twitter.trim();
      if (instagram.trim()) links.instagram = instagram.trim();
      if (website.trim()) links.website = website.trim();
      updates.social_links = links;
    }

    if (birthday !== initial.birthday) updates.birthday = birthday || null;

    const { error: updateError } = await supabase.from('profiles').update(updates).eq('id', userId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setInitial({ bio, twitter, instagram, website, birthday });
    setSaved(true);

    setTimeout(() => {
      onClose();
    }, 700);
  }

  const displayName = profile?.username || session?.user?.email || '';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg, #f4f4f5)',
      }}
    >
      {/* Header */}
      <div
        className="glass-strong"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', flexShrink: 0,
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Back"
          style={backButtonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
        >
          ‹
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.2 }}>
          Edit Profile
        </h1>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 40px' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Change avatar"
              style={{
                width: 96, height: 96, borderRadius: '50%', border: 'none', padding: 0,
                cursor: uploadingAvatar ? 'default' : 'pointer', position: 'relative',
                overflow: 'hidden', background: 'var(--blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Your avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>
                  {getInitials(displayName)}
                </span>
              )}

              {uploadingAvatar && (
                <div
                  style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 600,
                  }}
                >
                  Uploading…
                </div>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarPick}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
                color: 'var(--blue)', cursor: uploadingAvatar ? 'default' : 'pointer',
                opacity: uploadingAvatar ? 0.6 : 1,
              }}
            >
              {avatarUrl ? 'Change photo' : 'Add photo'}
            </button>

            {avatarError && <p style={errorStyle}>{avatarError}</p>}
          </div>

          {/* Bio */}
          <div>
            <label style={labelStyle}>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a little about yourself…"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Social links */}
          <div>
            <label style={labelStyle}>Social Links</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="Twitter / X username"
                style={inputStyle}
              />
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="Instagram username"
                style={inputStyle}
              />
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="Website URL"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Birthday */}
          <div>
            <label style={labelStyle}>Birthday</label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              style={inputStyle}
            />
            <p style={hintStyle}>Never shown publicly unless you choose to surface it elsewhere later.</p>
          </div>

          {error && <p style={errorStyle}>{error}</p>}
          {saved && <p style={successStyle}>Profile updated ✓</p>}

          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={!hasChanges || saving ? saveButtonDisabledStyle : saveButtonStyle}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const backButtonStyle = {
  width: 32, height: 32, borderRadius: '50%', border: 'none',
  background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer',
  fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 160ms ease',
};

const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--dim)',
  marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4,
};

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--glass-border)',
  background: 'rgba(255,255,255,0.7)', fontSize: 15, color: 'var(--ink)', outline: 'none',
  boxSizing: 'border-box',
};

const hintStyle = {
  margin: '6px 2px 0', fontSize: 12, color: 'var(--dim)', lineHeight: 1.4,
};

const errorStyle = { margin: '4px 0 0', fontSize: 13, color: 'var(--red)' };

const successStyle = { margin: 0, fontSize: 13, color: 'var(--blue)', fontWeight: 600 };

const saveButtonStyle = {
  padding: '13px 0', borderRadius: 12, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(10,132,255,0.28)',
};

const saveButtonDisabledStyle = {
  ...saveButtonStyle,
  opacity: 0.5, cursor: 'default', boxShadow: 'none',
};
