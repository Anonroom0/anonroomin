import { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import AuthModal from './AuthModal';
import SearchUsers from './SearchUsers';
import ProfileCard from './ProfileCard';
import DirectMessages from './DirectMessages';
import AdminInbox from './AdminInbox';
import EditProfile from './EditProfile';
import '../styles/tokens.css';

const SUPPORT_LABEL = 'Anonroom Support';

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

function relativeTime(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function groupUrl(slug) {
  // Reconstructs the site's own protocol/root while swapping in the group
  // slug as the subdomain, e.g. https://general.anonroom.in
  const { protocol, hostname } = window.location;
  const parts = hostname.split('.');
  const root = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
  return `${protocol}//${slug}.${root}`;
}

// Never exposes a real username/avatar for admin accounts — mirrors the
// same rule enforced inside DirectMessages.jsx (TASK 6).
function displayIdentity(user) {
  if (user?.is_admin) {
    return { name: SUPPORT_LABEL, avatarUrl: null, isSupport: true };
  }
  return { name: user?.username || 'Unknown user', avatarUrl: user?.avatar_url || null, isSupport: false };
}

function IdentityAvatar({ identity, size = 40 }) {
  if (identity.isSupport) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: '50%', background: 'var(--ink)', color: '#fff',
          fontSize: size * 0.44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        🎧
      </div>
    );
  }
  if (identity.avatarUrl) {
    return (
      <img
        src={identity.avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--blue)', color: '#fff',
        fontWeight: 700, fontSize: size * 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials(identity.name)}
    </div>
  );
}

// -----------------------------------------------------------------------
// Floating background blobs — purely decorative, sits behind all content.
// -----------------------------------------------------------------------
function BackgroundBlobs() {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute', top: '-10%', left: '-10%', width: 420, height: 420,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,132,255,0.16), transparent 70%)',
          animation: 'float 18s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: '-15%', right: '-10%', width: 480, height: 480,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,132,255,0.10), transparent 70%)',
          animation: 'float 22s ease-in-out infinite reverse',
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------
// Groups tab
// -----------------------------------------------------------------------
function GroupsTab() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from('groups')
      .select('id, slug, name, description, cover_url, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) console.warn('Failed to load groups:', error.message);
        setGroups(data || []);
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Loading…</p>;
  }

  if (groups.length === 0) {
    return (
      <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
        No groups yet — request one with the + button.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((group) => (
        <a
          key={group.id}
          href={groupUrl(group.slug)}
          className="glass-panel pop-in"
          style={{
            display: 'flex', flexDirection: 'column', gap: 8, padding: 16,
            textDecoration: 'none', overflow: 'hidden',
          }}
        >
          {group.cover_url && (
            <img
              src={group.cover_url}
              alt=""
              style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }}
            />
          )}
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{group.name}</span>
          {group.description && (
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>{group.description}</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--blue)' }}>{group.slug}.anonroom.in</span>
        </a>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------
// DMs tab
// -----------------------------------------------------------------------
function DmsTab({ session, isAdmin, onOpenThread, onOpenAdminInbox, onOpenAuth }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    setLoading(true);

    async function load() {
      const { data: threadRows, error: threadsError } = await supabase
        .from('dm_threads')
        .select('id, user_a, user_b, created_at')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (threadsError) {
        console.warn('Failed to load dm threads:', threadsError.message);
        setThreads([]);
        setLoading(false);
        return;
      }

      const otherIds = (threadRows || []).map((t) => (t.user_a === userId ? t.user_b : t.user_a));
      let profilesById = {};

      if (otherIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_admin')
          .in('id', otherIds);

        if (profilesError) {
          console.warn('Failed to load participant profiles:', profilesError.message);
        } else {
          profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
        }
      }

      if (!isMounted) return;

      const enriched = (threadRows || []).map((t) => {
        const otherId = t.user_a === userId ? t.user_b : t.user_a;
        return { ...t, otherUser: profilesById[otherId] || { id: otherId, username: 'Unknown user' } };
      });

      setThreads(enriched);
      setLoading(false);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  if (!session) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <p style={{ color: 'var(--dim)', marginBottom: 16 }}>Sign in to view your messages</p>
        <button onClick={onOpenAuth} style={primaryButtonStyle}>
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isAdmin && (
        <button
          onClick={onOpenAdminInbox}
          className="glass-panel pop-in"
          style={{ ...rowButtonStyle, background: 'rgba(10,132,255,0.08)' }}
        >
          <span
            style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}
          >
            🛠️
          </span>
          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Admin Inbox</span>
        </button>
      )}

      {loading && <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Loading…</p>}

      {!loading && threads.length === 0 && (
        <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
          No conversations yet.
        </p>
      )}

      {!loading &&
        threads.map((thread) => {
          const identity = displayIdentity(thread.otherUser);
          const otherId = thread.user_a === userId ? thread.user_b : thread.user_a;
          return (
            <button
              key={thread.id}
              onClick={() => onOpenThread(otherId)}
              className="glass-panel pop-in"
              style={rowButtonStyle}
            >
              <IdentityAvatar identity={identity} size={40} />
              <span style={{ fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{identity.name}</span>
              <span style={{ fontSize: 12, color: 'var(--dim)' }}>{relativeTime(thread.created_at)}</span>
            </button>
          );
        })}
    </div>
  );
}

// -----------------------------------------------------------------------
// Home
// -----------------------------------------------------------------------
export default function Home() {
  const { session, profile, isAdmin } = useAuth();

  const [tab, setTab] = useState('groups'); // 'groups' | 'dms'
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState('signin');
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [activeDmUserId, setActiveDmUserId] = useState(null);
  const [adminInboxOpen, setAdminInboxOpen] = useState(false);
  const [requestingGroup, setRequestingGroup] = useState(false);

  const searchInputRef = useRef(null);

  const showSearch = searchFocused || searchQuery.trim().length > 0;

  function openAuth(initialTab = 'signin') {
    setAuthInitialTab(initialTab);
    setAuthOpen(true);
  }

  function handleProfileButtonClick() {
    if (session) {
      setEditProfileOpen(true);
    } else {
      openAuth('signin');
    }
  }

  function handleOpenThread(userId) {
    setActiveDmUserId(userId);
  }

  function handleSelectSearchUser(userId) {
    setProfileCardUserId(userId);
  }

  function handleMessageFromProfileCard(userId) {
    if (!session) {
      openAuth('signin');
      return;
    }
    setProfileCardUserId(null);
    setActiveDmUserId(userId);
  }

  async function handleRequestGroup() {
    if (!session) {
      openAuth('signin');
      return;
    }
    setRequestingGroup(true);
    const { data: admin, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();
    setRequestingGroup(false);

    if (error || !admin) {
      console.warn('Could not find admin account:', error?.message);
      return;
    }
    setActiveDmUserId(admin.id);
  }

  const profileIdentity = session
    ? { name: profile?.username || 'You', avatarUrl: profile?.avatar_url || null, isSupport: false }
    : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <BackgroundBlobs />

      {/* Header */}
      <header
        className="glass-strong"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderRadius: 0, position: 'sticky', top: 0, zIndex: 20,
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.4 }}>
          anonroom
        </span>

        <button
          onClick={handleProfileButtonClick}
          aria-label={session ? 'Edit profile' : 'Sign in'}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
            overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          {session ? (
            <IdentityAvatar identity={profileIdentity} size={36} />
          ) : (
            <div
              style={{
                width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                color: 'var(--dim)',
              }}
            >
              👤
            </div>
          )}
        </button>
      </header>

      <main style={{ maxWidth: 560, width: '100%', margin: '0 auto', padding: '16px 20px 100px' }}>
        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span
            style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              fontSize: 15, color: 'var(--dim)', pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search people"
            className="glass-panel"
            style={{
              width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none',
              background: 'transparent', padding: '12px 14px 12px 40px', fontSize: 15,
              color: 'var(--ink)', borderRadius: 14,
            }}
          />
        </div>

        {showSearch ? (
          <SearchUsers onSelectUser={handleSelectSearchUser} />
        ) : (
          <>
            {/* Segmented tab switcher */}
            <div
              style={{
                position: 'relative', display: 'flex', background: 'rgba(0,0,0,0.05)',
                borderRadius: 13, padding: 4, marginBottom: 20,
              }}
            >
              <div
                style={{
                  position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 4px)',
                  left: tab === 'groups' ? 4 : 'calc(50% + 0px)',
                  background: '#fff', borderRadius: 10,
                  transition: 'left 260ms cubic-bezier(0.34,1.56,0.64,1)',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.14)',
                }}
              />
              <button
                onClick={() => setTab('groups')}
                style={{
                  flex: 1, zIndex: 1, padding: '9px 0', border: 'none', background: 'transparent',
                  fontWeight: 600, fontSize: 14, letterSpacing: -0.1, borderRadius: 10,
                  color: tab === 'groups' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer',
                  transition: 'color 180ms ease',
                }}
              >
                Groups
              </button>
              <button
                onClick={() => setTab('dms')}
                style={{
                  flex: 1, zIndex: 1, padding: '9px 0', border: 'none', background: 'transparent',
                  fontWeight: 600, fontSize: 14, letterSpacing: -0.1, borderRadius: 10,
                  color: tab === 'dms' ? 'var(--ink)' : 'var(--dim)', cursor: 'pointer',
                  transition: 'color 180ms ease',
                }}
              >
                DMs
              </button>
            </div>

            {tab === 'groups' && <GroupsTab />}
            {tab === 'dms' && (
              <DmsTab
                session={session}
                isAdmin={isAdmin}
                onOpenThread={handleOpenThread}
                onOpenAdminInbox={() => setAdminInboxOpen(true)}
                onOpenAuth={() => openAuth('signin')}
              />
            )}
          </>
        )}
      </main>

      {/* Floating "Request a group" button */}
      <button
        onClick={handleRequestGroup}
        disabled={requestingGroup}
        aria-label="Request a group"
        style={{
          position: 'fixed', bottom: 28, right: 24, width: 56, height: 56, borderRadius: '50%',
          border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 26, fontWeight: 400,
          cursor: requestingGroup ? 'default' : 'pointer', opacity: requestingGroup ? 0.7 : 1,
          boxShadow: '0 10px 24px rgba(10,132,255,0.38)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 30, lineHeight: 1,
        }}
      >
        +
      </button>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialTab={authInitialTab}
        onVerified={() => setAuthOpen(false)}
      />

      <EditProfile open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />

      <ProfileCard
        userId={profileCardUserId}
        open={profileCardUserId !== null}
        onClose={() => setProfileCardUserId(null)}
        onMessage={handleMessageFromProfileCard}
      />

      {/* DM thread — full-page takeover, own back button */}
      {activeDmUserId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
          <button
            onClick={() => setActiveDmUserId(null)}
            aria-label="Back"
            style={{
              position: 'fixed', top: 14, left: 16, zIndex: 95, width: 32, height: 32, borderRadius: '50%',
              border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--blue)', cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ←
          </button>
          <DirectMessages openThreadWithUserId={activeDmUserId} />
        </div>
      )}

      {/* Admin Inbox — full-page takeover, same pattern as DMs */}
      {adminInboxOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--bg)', overflowY: 'auto' }}>
          <header
            className="glass-strong"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
              borderRadius: 0, position: 'sticky', top: 0, zIndex: 10,
            }}
          >
            <button
              onClick={() => setAdminInboxOpen(false)}
              aria-label="Back"
              style={{ border: 'none', background: 'none', color: 'var(--blue)', fontSize: 20, cursor: 'pointer', padding: 0 }}
            >
              ←
            </button>
            <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 16 }}>Admin Inbox</span>
          </header>
          <div style={{ padding: 20, maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <AdminInbox />
          </div>
        </div>
      )}
    </div>
  );
}

const rowButtonStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
  border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
};

const primaryButtonStyle = {
  padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
};
