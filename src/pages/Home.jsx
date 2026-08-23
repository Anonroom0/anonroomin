import { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useAuth } from '../lib/authContext';
import AuthModal from './AuthModal';
import SearchUsers from './SearchUsers';
import ProfileCard from './ProfileCard';
import DirectMessages from './DirectMessages';
import AdminInbox from './AdminInbox';
import '../styles/tokens.css';

const TABS = [
  { id: 'chats', label: 'Chats', icon: '💬' },
  { id: 'groups', label: 'Groups', icon: '🗂️' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

function relativeTime(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function groupUrl(slug) {
  // Reconstructs the site's own protocol/root while swapping in the group
  // slug as the subdomain, e.g. https://general.anonroom.in
  const { protocol, hostname } = window.location;
  const parts = hostname.split('.');
  const root = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
  return `${protocol}//${slug}.${root}`;
}

// -----------------------------------------------------------------------
// Floating background blobs — purely decorative, sits behind all tabs.
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
// Chats tab
// -----------------------------------------------------------------------
function ChatsTab({ session, onOpenProfile, onRequestGroup }) {
  const [groups, setGroups] = useState([]);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);

      // v1: show all public groups here (no per-user "active in" filter yet).
      const groupsPromise = supabase
        .from('groups')
        .select('id, slug, name, description, cover_url, created_at')
        .order('created_at', { ascending: false });

      const threadsPromise = session?.user
        ? supabase
            .from('dm_threads')
            .select('id, user_a, user_b, created_at')
            .or(`user_a.eq.${session.user.id},user_b.eq.${session.user.id}`)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null });

      const [{ data: groupsData, error: groupsError }, { data: threadsData, error: threadsError }] =
        await Promise.all([groupsPromise, threadsPromise]);

      if (!isMounted) return;

      if (groupsError) console.warn('Failed to load groups:', groupsError.message);
      if (threadsError) console.warn('Failed to load dm threads:', threadsError.message);

      setGroups(groupsData || []);
      setThreads(threadsData || []);
      setLoading(false);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [session]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        onClick={onRequestGroup}
        className="glass-panel"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
        }}
      >
        <span
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}
        >
          +
        </span>
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Request a group</span>
      </button>

      {loading && <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center' }}>Loading…</p>}

      {!loading && session?.user && threads.length > 0 && (
        <>
          <p style={sectionLabelStyle}>Direct messages</p>
          {threads.map((thread) => {
            const otherUserId = thread.user_a === session.user.id ? thread.user_b : thread.user_a;
            return (
              <button
                key={thread.id}
                onClick={() => onOpenProfile(otherUserId)}
                className="glass-panel pop-in"
                style={rowButtonStyle}
              >
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Direct message</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--dim)' }}>
                  {relativeTime(thread.created_at)}
                </span>
              </button>
            );
          })}
        </>
      )}

      {!loading && (
        <>
          <p style={sectionLabelStyle}>Groups</p>
          {groups.length === 0 && (
            <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
              No groups yet.
            </p>
          )}
          {groups.map((group) => (
            <a
              key={group.id}
              href={groupUrl(group.slug)}
              className="glass-panel pop-in"
              style={{ ...rowButtonStyle, textDecoration: 'none' }}
            >
              {group.cover_url ? (
                <img
                  src={group.cover_url}
                  alt=""
                  style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }}
                />
              ) : (
                <span
                  style={{
                    width: 36, height: 36, borderRadius: 10, background: 'var(--bubble-them)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}
                >
                  #
                </span>
              )}
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{group.name}</span>
            </a>
          ))}
        </>
      )}
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
    return <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center' }}>Loading…</p>;
  }

  if (groups.length === 0) {
    return (
      <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
        No groups yet — request one from the Chats tab.
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
// Search tab
// -----------------------------------------------------------------------
function SearchTab({ onOpenProfile }) {
  return <SearchUsers onSelectUser={onOpenProfile} />;
}

// -----------------------------------------------------------------------
// Profile tab
// -----------------------------------------------------------------------
function ProfileTab({ onOpenAuth, onOpenAdminInbox }) {
  const { profile, isAdmin, signOut, loading } = useAuth();

  if (loading) {
    return <p style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center' }}>Loading…</p>;
  }

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <p style={{ color: 'var(--dim)', marginBottom: 16 }}>You're not signed in.</p>
        <button onClick={() => onOpenAuth('signin')} style={primaryButtonStyle}>
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
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
      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{profile.username}</p>

      {isAdmin && (
        <button onClick={onOpenAdminInbox} className="glass-panel" style={adminButtonStyle}>
          🛠️ Admin Inbox
        </button>
      )}

      <button onClick={signOut} style={secondaryButtonStyle}>
        Sign Out
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------
// Home
// -----------------------------------------------------------------------
export default function Home() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState('chats');
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState('signin');
  const [profileCardUserId, setProfileCardUserId] = useState(null);
  const [dmThreadUserId, setDmThreadUserId] = useState(null);
  const [adminInboxOpen, setAdminInboxOpen] = useState(false);

  const isWide = typeof window !== 'undefined' && window.innerWidth >= 900;

  function openAuth(tab) {
    setAuthInitialTab(tab);
    setAuthOpen(true);
  }

  function handleOpenProfile(userId) {
    setProfileCardUserId(userId);
  }

  function openDmWith(userId) {
    if (!session) {
      openAuth('signin');
      return;
    }
    setDmThreadUserId(userId);
  }

  function handleMessageFromProfileCard(userId) {
    openDmWith(userId);
  }

  async function handleRequestGroup() {
    if (!session) {
      openAuth('signin');
      return;
    }
    const { data: admin, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();

    if (error || !admin) {
      console.warn('Could not find admin account:', error?.message);
      return;
    }
    // Note: this opens a normal DM thread with the admin. Flagging the
    // message itself as is_group_request=true would need a small addition
    // to DirectMessages' send path — left as-is here since DirectMessages
    // doesn't currently accept that flag as a prop.
    setDmThreadUserId(admin.id);
  }

  return (
    <div
      style={{
        minHeight: '100vh', background: 'var(--bg)', display: 'flex',
        flexDirection: isWide ? 'row' : 'column-reverse', position: 'relative',
      }}
    >
      <BackgroundBlobs />

      {/* Tab bar: bottom on narrow screens, side rail on wide screens */}
      <nav
        className="glass-strong"
        style={
          isWide
            ? {
                width: 88, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, padding: '24px 0', borderRadius: 0, position: 'sticky', top: 0, height: '100vh',
              }
            : {
                display: 'flex', justifyContent: 'space-around', padding: '10px 8px',
                borderRadius: 0, position: 'sticky', bottom: 0,
              }
        }
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: isWide ? '10px 0' : '4px 10px',
              color: activeTab === tab.id ? 'var(--blue)' : 'var(--dim)',
              fontWeight: activeTab === tab.id ? 700 : 500,
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span style={{ fontSize: 11 }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Active tab content */}
      <main style={{ flex: 1, padding: 20, maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {activeTab === 'chats' && (
          <ChatsTab session={session} onOpenProfile={handleOpenProfile} onRequestGroup={handleRequestGroup} />
        )}
        {activeTab === 'groups' && <GroupsTab />}
        {activeTab === 'search' && <SearchTab onOpenProfile={handleOpenProfile} />}
        {activeTab === 'profile' && (
          <ProfileTab onOpenAuth={openAuth} onOpenAdminInbox={() => setAdminInboxOpen(true)} />
        )}
      </main>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialTab={authInitialTab}
        onVerified={() => setAuthOpen(false)}
      />

      <ProfileCard
        userId={profileCardUserId}
        open={profileCardUserId !== null}
        onClose={() => setProfileCardUserId(null)}
        onMessage={handleMessageFromProfileCard}
      />

      {dmThreadUserId && (
        <div
          onClick={() => setDmThreadUserId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-strong pop-in"
            style={{ width: 420, maxWidth: '100%', maxHeight: '80vh', padding: 20, position: 'relative' }}
          >
            <button
              onClick={() => setDmThreadUserId(null)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%',
                border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer', zIndex: 1,
              }}
            >
              ✕
            </button>
            <DirectMessages openThreadWithUserId={dmThreadUserId} />
          </div>
        </div>
      )}

      {adminInboxOpen && (
        <div
          onClick={() => setAdminInboxOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-strong pop-in"
            style={{ width: 460, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', padding: 20, position: 'relative' }}
          >
            <button
              onClick={() => setAdminInboxOpen(false)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%',
                border: 'none', background: 'rgba(0,0,0,0.06)', color: 'var(--ink)', cursor: 'pointer', zIndex: 1,
              }}
            >
              ✕
            </button>
            <AdminInbox />
          </div>
        </div>
      )}
    </div>
  );
}

const sectionLabelStyle = {
  fontSize: 12, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase',
  letterSpacing: '0.04em', margin: '8px 0 0',
};

const rowButtonStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
  border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
};

const primaryButtonStyle = {
  padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--blue)',
  color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
};

const secondaryButtonStyle = {
  padding: '10px 20px', borderRadius: 12, border: '1px solid var(--glass-border)',
  background: 'transparent', color: 'var(--red)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

const adminButtonStyle = {
  padding: '10px 20px', border: 'none', color: 'var(--ink)', fontWeight: 600,
  fontSize: 14, cursor: 'pointer',
};
