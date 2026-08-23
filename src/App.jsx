import { AuthProvider } from './lib/authContext';
import { getGroupSlugFromHost, getRootDomainUrl } from './lib/subdomain';
import Home from './pages/Home';
import GroupChat from './pages/GroupChat';
import './styles/tokens.css';

// The only top-level routing concern in this app: which subdomain are we
// on? A group slug (slug.anonroom.in) renders that group's chat full-page;
// the bare root domain (or www) renders Home, which owns its own internal
// Chats/Groups/Search/Profile navigation.
//
// The group-subdomain route has no sidebar to sit next to, so it needs its
// own 100%-height, centered shell here — mounting GroupChat.jsx's flex:1
// layout directly under <body> with no height ancestor is what produced
// the "blank page, content stuck to the top" bug.
export default function App() {
  const groupSlug = getGroupSlugFromHost();

  return (
    <AuthProvider>
      {groupSlug ? (
        <div
          className="app-viewport"
          style={{
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
          }}
        >
          <GroupChat
            groupSlug={groupSlug}
            onBack={() => {
              window.location.href = getRootDomainUrl();
            }}
          />
        </div>
      ) : (
        <Home />
      )}
    </AuthProvider>
  );
}
