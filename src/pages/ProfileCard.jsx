import { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

function relativeTime(dateString) {
  if (!dateString) return '';
  const then = new Date(dateString).getTime();
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
}

export default function ProfileCard({ userId, open, onClose, onMessage }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'not-found' | 'error'
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!open || !userId) return;

    let isMounted = true;
    setStatus('loading');
    setProfile(null);

    supabase
      .from('profiles')
      .select('id, username, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn('Failed to load profile:', error.message);
          setStatus('error');
          return;
        }
        if (!data) {
          setStatus('not-found');
          return;
        }
        setProfile(data);
        setStatus('ready');
      });

    return () => {
      isMounted = false;
    };
  }, [open, userId]);

  if (!open) return null;

  function handleMessage() {
    onMessage(userId);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong pop-in"
        style={{
          width: '100%', maxWidth: 400, padding: 28,
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          animation: 'pop-in 260ms cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)', marginBottom: 8 }} />

        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%',
            border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {status === 'loading' && (
          <p style={{ color: 'var(--dim)', padding: '32px 0' }}>Loading…</p>
        )}

        {status === 'not-found' && (
          <p style={{ color: 'var(--dim)', padding: '32px 0' }}>This user couldn't be found.</p>
        )}

        {status === 'error' && (
          <p style={{ color: 'var(--red)', padding: '32px 0' }}>Something went wrong loading this profile.</p>
        )}

        {status === 'ready' && profile && (
          <>
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 84, height: 84, borderRadius: '50%', background: 'var(--blue)',
                  color: '#fff', fontSize: 28, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {initials(profile.username)}
              </div>
            )}

            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
              {profile.username}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--dim)' }}>
              Joined {relativeTime(profile.created_at)}
            </p>

            <button
              onClick={handleMessage}
              style={{
                marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                background: 'var(--blue)', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              }}
            >
              Message
            </button>
          </>
        )}
      </div>
    </div>
  );
}
