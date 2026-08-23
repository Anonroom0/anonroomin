import { AuthProvider } from './lib/authContext';
import { getGroupSlugFromHost, getRootDomainUrl } from './lib/subdomain';
import Home from './pages/Home';
import GroupChat from './pages/GroupChat';
import './styles/tokens.css';



// The entire application layout, routing (both subdomains and paths), 
// and state management is now handled entirely inside <Home />. 
// This ensures that groups and DMs always render with the correct 
// split-pane sidebar UI on desktop, and full-screen on mobile.
export default function App() {
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}
