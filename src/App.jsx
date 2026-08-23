import { AuthProvider } from './lib/authContext';
import { getGroupSlugFromHost } from './lib/subdomain';
import Home from './pages/Home';
import GroupChat from './pages/GroupChat';
import './styles/tokens.css';

// The only top-level routing concern in this app: which subdomain are we
// on? A group slug renders that group's chat; the bare root domain (or
// www) renders Home. In-page tabs (Chats/Groups/Search/Profile) are
// handled locally inside Home.jsx, not here.
export default function App() {
  const groupSlug = getGroupSlugFromHost();

  return (
    <AuthProvider>
      {groupSlug ? <GroupChat slug={groupSlug} /> : <Home />}
    </AuthProvider>
  );
}
