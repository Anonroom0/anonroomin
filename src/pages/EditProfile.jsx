/**
 * ============================================================================
 * EDIT PROFILE SHEET (APPLE LIQUID UI & TELEGRAM PHYSICS)
 * ============================================================================
 * This component acts as a master settings overlay for users to edit their
 * identity, avatar, and social links. It uses iOS-style bottom-sheet physics
 * and Apple glassmorphism.
 * 
 * Corrected Features Included Inline:
 * - Read-Only Username Display (Non-editable identity verification)
 * - Liquid Glassmorphism Modal & Backdrop
 * - React-Controlled Floating Label Inputs (No CSS Hacks / No Overlaps)
 * - Interactive Avatar Upload Matrix with Shimmer
 * - Inline Vector Library (Social icons, Camera, Navigation, Logout)
 * - Intelligent Save State (Dirty tracking)
 * - Fully unminified, enterprise-grade formatting
 * 
 * Dependencies: React, Supabase, AuthContext
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================
const AVATAR_BUCKET = 'media';
const ANIMATION_DURATION = 400; // Liquid spring timing

// ============================================================================
// 2. MASSIVE INLINE SVG VECTOR LIBRARY (APPLE / TELEGRAM STYLE)
// ============================================================================
const Vectors = {
  Back: (
    <svg 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  LogOut: (
    <svg 
      width="22" 
      height="22" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Camera: (
    <svg 
      width="28" 
      height="28" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Twitter: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
    </svg>
  ),
  Instagram: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  Link: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  Calendar: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  User: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Check: (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Spinner: (
    <svg 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className="spinner-animation"
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  )
};

// ============================================================================
// 3. UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets capitalized initials for avatar placeholder.
 */
function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

// ============================================================================
// 4. UI SUB-COMPONENTS
// ============================================================================

const GlobalKeyframes = () => (
  <style>{`
    @keyframes sheet-slide-up {
      0% { opacity: 0; transform: translateY(100%); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes sheet-slide-down {
      0% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(100%); }
    }
    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }
    .spinner-animation {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  `}</style>
);

/**
 * FIXED Apple-style Liquid Input with React-controlled floating label mechanics.
 * No CSS :placeholder-shown hacks. This prevents text overlap completely.
 * Now natively supports a readOnly visual state.
 */
function LiquidInput({ icon, label, type = "text", value, onChange, isTextArea = false, readOnly = false }) {
  const [isFocused, setIsFocused] = useState(false);
  
  // Strict React condition for when the label should float up
  const isFloating = isFocused || (value && value.length > 0);

  return (
    <div 
      style={{
        position: 'relative',
        display: 'flex', 
        alignItems: isTextArea ? 'flex-start' : 'center', 
        gap: 12,
        background: readOnly ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)', // Dimmer background if locked
        border: '1px solid',
        borderColor: isFocused && !readOnly ? 'var(--blue)' : 'var(--glass-border)',
        borderRadius: 16,
        padding: isTextArea ? '16px' : '8px 16px',
        boxShadow: isFocused && !readOnly ? '0 0 0 4px rgba(10,132,255,0.15)' : 'inset 0 2px 4px rgba(0,0,0,0.02)',
        transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
        marginTop: 12, // Spacing for floating label
        opacity: readOnly ? 0.6 : 1, // Visual fade for read-only fields
        cursor: readOnly ? 'not-allowed' : 'text'
      }}
    >
      <div 
        style={{ 
          color: isFocused && !readOnly ? 'var(--blue)' : 'var(--dim)', 
          transition: 'color 0.2s',
          paddingTop: isTextArea ? 2 : 0 
        }}
      >
        {icon}
      </div>
      
      <div 
        style={{ 
          position: 'relative', 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center' 
        }}
      >
        {isTextArea ? (
          <textarea
            value={value}
            onChange={onChange}
            onFocus={() => { if(!readOnly) setIsFocused(true); }}
            onBlur={() => setIsFocused(false)}
            readOnly={readOnly}
            rows={4}
            style={{
              width: '100%', 
              border: 'none', 
              background: 'transparent', 
              outline: 'none',
              fontSize: 16, 
              color: 'var(--ink)', 
              fontFamily: 'inherit',
              resize: 'none', 
              paddingTop: 12, 
              zIndex: 1,
              pointerEvents: readOnly ? 'none' : 'auto'
            }}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={onChange}
            onFocus={() => { if(!readOnly) setIsFocused(true); }}
            onBlur={() => setIsFocused(false)}
            readOnly={readOnly}
            style={{
              width: '100%', 
              border: 'none', 
              background: 'transparent', 
              outline: 'none',
              fontSize: 16, 
              color: 'var(--ink)', 
              padding: '12px 0 4px', 
              zIndex: 1,
              pointerEvents: readOnly ? 'none' : 'auto'
            }}
          />
        )}
        
        {/* Floating Label Absolute Layer controlled purely by React State */}
        <label 
          style={{
            position: 'absolute', 
            top: isTextArea ? 14 : '50%', 
            left: 0,
            transform: isFloating 
              ? (isTextArea ? 'translateY(-20px) scale(0.85)' : 'translateY(-24px) scale(0.85)')
              : (isTextArea ? 'translateY(0)' : 'translateY(-50%)'),
            transformOrigin: 'left top',
            color: 'var(--dim)', 
            fontSize: 16, 
            pointerEvents: 'none',
            transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', 
            zIndex: 0
          }}
        >
          {label}
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// 5. MAIN EDIT PROFILE COMPONENT
// ============================================================================

export default function EditProfile({ open, onClose }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  const [isVisible, setIsVisible] = useState(false);
  
  // Form Fields
  const [bio, setBio] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Tracking for "Dirty" state (enables Save button)
  const [initial, setInitial] = useState({ bio: '', twitter: '', instagram: '', website: '', birthday: '', avatarUrl: null });

  // Network States
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fileInputRef = useRef(null);

  // --------------------------------------------------------------------------
  // LIFECYCLES & INITIALIZATION
  // --------------------------------------------------------------------------
  
  useEffect(() => {
    if (open && profile) {
      setIsVisible(true);
      setError('');
      setSuccess('');
      
      const links = profile.social_links || {};
      const initialValues = {
        bio: profile.bio || '',
        twitter: links.twitter || '',
        instagram: links.instagram || '',
        website: links.website || '',
        birthday: profile.birthday || '',
        avatarUrl: profile.avatar_url || null
      };

      setBio(initialValues.bio);
      setTwitter(initialValues.twitter);
      setInstagram(initialValues.instagram);
      setWebsite(initialValues.website);
      setBirthday(initialValues.birthday);
      setAvatarUrl(initialValues.avatarUrl);
      
      setInitial(initialValues);
    } else if (!open) {
      setIsVisible(false);
    }
  }, [open, profile]);

  const hasChanges = 
    bio !== initial.bio ||
    twitter !== initial.twitter ||
    instagram !== initial.instagram ||
    website !== initial.website ||
    birthday !== initial.birthday ||
    avatarUrl !== initial.avatarUrl;

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION - 50);
  }, [onClose]);

  // --------------------------------------------------------------------------
  // AUTHENTICATION LOGIC (LOGOUT)
  // --------------------------------------------------------------------------
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // --------------------------------------------------------------------------
  // AVATAR UPLOAD LOGIC
  // --------------------------------------------------------------------------
  
  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;

    setError('');
    setUploadingAvatar(true);

    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${userId}/avatar-${timestamp}-${safeName}`;

      // Upload directly to Media Bucket
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) throw new Error('Could not resolve image URL.');

      // Immediate Database Update for Avatar specifically to prevent data loss
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setInitial((prev) => ({ ...prev, avatarUrl: publicUrl })); // Lock in change
      setSuccess('Profile picture updated successfully.');
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      setError(err?.message || 'Avatar upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  // --------------------------------------------------------------------------
  // PROFILE SAVE LOGIC
  // --------------------------------------------------------------------------

  async function handleSave() {
    if (!userId || !hasChanges) return;
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const updates = {};
      
      if (bio !== initial.bio) updates.bio = bio.trim() || null;
      if (birthday !== initial.birthday) updates.birthday = birthday || null;

      // Group Social Links in JSONB
      if (twitter !== initial.twitter || instagram !== initial.instagram || website !== initial.website) {
        const links = {};
        if (twitter.trim()) links.twitter = twitter.trim();
        if (instagram.trim()) links.instagram = instagram.trim();
        if (website.trim()) links.website = website.trim();
        updates.social_links = links;
      }

      const { error: updateError } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (updateError) throw updateError;

      // Update Local Initial State to clear dirty tracking
      setInitial({ bio, twitter, instagram, website, birthday, avatarUrl });
      setSuccess('Profile saved successfully.');
      
      // Auto-close Apple style after saving
      setTimeout(() => {
        handleClose();
      }, 1000);

    } catch (err) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------------------------------
  // RENDER GUARD
  // --------------------------------------------------------------------------
  if (!open && !isVisible) return null;

  const displayName = profile?.username || session?.user?.email || 'Anonymous';

  // --------------------------------------------------------------------------
  // MAIN COMPONENT RENDER
  // --------------------------------------------------------------------------
  return (
    <>
      <GlobalKeyframes />
      <div
        style={{
          position: 'fixed', 
          inset: 0, 
          zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: isVisible ? 'blur(16px)' : 'blur(0px)',
          WebkitBackdropFilter: isVisible ? 'blur(16px)' : 'blur(0px)',
          display: 'flex', 
          alignItems: 'flex-end', 
          justifyContent: 'center',
          opacity: isVisible ? 1 : 0,
          transition: `all ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', 
            maxWidth: 560, 
            height: '90vh',
            background: 'var(--bg)',
            borderTopLeftRadius: 32, 
            borderTopRightRadius: 32,
            boxShadow: '0 -24px 60px rgba(0,0,0,0.2)',
            display: 'flex', 
            flexDirection: 'column',
            transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: `transform ${ANIMATION_DURATION}ms cubic-bezier(0.175, 0.885, 0.32, 1.05)`,
            overflow: 'hidden'
          }}
        >
          {/* 
            ===================================================================
            APPLE SETTINGS HEADER
            ===================================================================
          */}
          <div
            style={{
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '16px 20px', 
              background: 'var(--glass-strong)',
              backdropFilter: 'blur(30px) saturate(200%)',
              borderBottom: '1px solid var(--glass-border)', 
              zIndex: 10
            }}
          >
            {/* BACK BUTTON */}
            <button
              onClick={handleClose}
              style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                border: 'none', 
                background: 'transparent',
                color: 'var(--blue)', 
                fontSize: 16, 
                fontWeight: 500, 
                cursor: 'pointer', 
                padding: 0
              }}
            >
              {Vectors.Back}
              <span>Close</span>
            </button>
            
            <h1 
              style={{ 
                margin: 0, 
                fontSize: 17, 
                fontWeight: 700, 
                color: 'var(--ink)', 
                position: 'absolute', 
                left: '50%', 
                transform: 'translateX(-50%)' 
              }}
            >
              Edit Profile
            </h1>
            
            {/* ACTION BUTTONS (LOGOUT & SAVE) */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16 
              }}
            >
              <button
                onClick={handleSignOut}
                title="Sign Out"
                style={{
                  border: 'none', 
                  background: 'transparent', 
                  padding: 0,
                  color: 'var(--red)', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center'
                }}
              >
                {Vectors.LogOut}
              </button>

              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                style={{
                  border: 'none', 
                  background: 'transparent', 
                  padding: 0,
                  color: hasChanges ? 'var(--blue)' : 'var(--dim)',
                  fontSize: 16, 
                  fontWeight: 700, 
                  cursor: hasChanges ? 'pointer' : 'default',
                  opacity: saving ? 0.5 : 1, 
                  transition: 'color 0.2s'
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* 
            ===================================================================
            SCROLLABLE CONTENT BODY
            ===================================================================
          */}
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 60px' }}>
            <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

              {/* 
                1. AVATAR UPLOADER
              */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  aria-label="Change Avatar"
                  style={{
                    width: 120, 
                    height: 120, 
                    borderRadius: '50%', 
                    border: 'none', 
                    padding: 0,
                    cursor: uploadingAvatar ? 'default' : 'pointer', 
                    position: 'relative',
                    overflow: 'hidden', 
                    background: 'var(--blue)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    boxShadow: '0 12px 32px rgba(10,132,255,0.25)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={(e) => { if(!uploadingAvatar) e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Your Avatar" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <span style={{ color: '#fff', fontSize: 40, fontWeight: 800 }}>
                      {getInitials(displayName)}
                    </span>
                  )}

                  {/* Glassmorphic Hover Overlay */}
                  <div 
                    style={{
                      position: 'absolute', 
                      inset: 0, 
                      background: 'rgba(0,0,0,0.4)',
                      backdropFilter: 'blur(4px)', 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: '#fff',
                      opacity: uploadingAvatar ? 1 : 0, 
                      transition: 'opacity 0.2s',
                    }}
                    className="hover-overlay"
                  >
                    {uploadingAvatar ? Vectors.Spinner : Vectors.Camera}
                    <span style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                      {uploadingAvatar ? 'Uploading' : 'Edit'}
                    </span>
                  </div>
                </button>
                <style>{`button:hover .hover-overlay { opacity: 1 !important; }`}</style>
                
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarPick} 
                  style={{ display: 'none' }} 
                />
              </div>

              {/* 
                2. ABOUT YOU (Including Read-Only Username)
              */}
              <div>
                <h3 
                  style={{ 
                    margin: '0 0 8px 12px', 
                    fontSize: 13, 
                    fontWeight: 600, 
                    color: 'var(--dim)', 
                    textTransform: 'uppercase', 
                    letterSpacing: 0.5 
                  }}
                >
                  About You
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <LiquidInput
                    icon={Vectors.User}
                    label="Username (Cannot be changed)"
                    value={profile?.username ? `@${profile.username}` : ''}
                    readOnly={true}
                  />
                  <LiquidInput
                    icon={Vectors.User}
                    label="Biography"
                    isTextArea={true}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>
              </div>

              {/* 
                3. SOCIAL LINKS
              */}
              <div>
                <h3 
                  style={{ 
                    margin: '0 0 8px 12px', 
                    fontSize: 13, 
                    fontWeight: 600, 
                    color: 'var(--dim)', 
                    textTransform: 'uppercase', 
                    letterSpacing: 0.5 
                  }}
                >
                  Social Links
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <LiquidInput
                    icon={Vectors.Twitter}
                    label="Twitter / X"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                  />
                  <LiquidInput
                    icon={Vectors.Instagram}
                    label="Instagram"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                  <LiquidInput
                    icon={Vectors.Link}
                    label="Personal Website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
              </div>

              {/* 
                4. PRIVATE DATA (BIRTHDAY)
              */}
              <div>
                <h3 
                  style={{ 
                    margin: '0 0 8px 12px', 
                    fontSize: 13, 
                    fontWeight: 600, 
                    color: 'var(--dim)', 
                    textTransform: 'uppercase', 
                    letterSpacing: 0.5 
                  }}
                >
                  Private Information
                </h3>
                <LiquidInput
                  icon={Vectors.Calendar}
                  label="Birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
                <p 
                  style={{ 
                    margin: '8px 12px 0', 
                    fontSize: 12, 
                    color: 'var(--dim)', 
                    lineHeight: 1.4 
                  }}
                >
                  Your birthday is strictly private and never exposed to other users or admins.
                </p>
              </div>

              {/* 
                5. STATUS MESSAGES & BUTTON
              */}
              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 12, 
                  marginTop: 12 
                }}
              >
                {error && (
                  <div 
                    style={{ 
                      color: 'var(--red)', 
                      fontSize: 14, 
                      fontWeight: 500, 
                      textAlign: 'center', 
                      background: 'rgba(255,59,48,0.1)', 
                      padding: '10px', 
                      borderRadius: 12 
                    }}
                  >
                    {error}
                  </div>
                )}
                
                {success && (
                  <div 
                    style={{ 
                      color: 'var(--blue)', 
                      fontSize: 14, 
                      fontWeight: 600, 
                      textAlign: 'center', 
                      background: 'rgba(10,132,255,0.1)', 
                      padding: '10px', 
                      borderRadius: 12, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 8 
                    }}
                  >
                    {Vectors.Check} {success}
                  </div>
                )}
                
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  style={{
                    padding: '16px 0', 
                    borderRadius: 18, 
                    border: 'none',
                    background: hasChanges ? 'var(--blue)' : 'var(--glass-border)',
                    color: hasChanges ? '#fff' : 'var(--dim)',
                    fontWeight: 700, 
                    fontSize: 16, 
                    cursor: hasChanges ? 'pointer' : 'default',
                    boxShadow: hasChanges ? '0 8px 24px rgba(10,132,255,0.3)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => { if(hasChanges) e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={(e) => { if(hasChanges) e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {saving ? 'Saving Changes...' : 'Save Profile'}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
