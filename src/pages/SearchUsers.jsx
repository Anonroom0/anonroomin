import { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

export default function SearchUsers({ onSelectUser }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const trimmed = term.trim();

    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${trimmed}%`)
        .order('username')
        .limit(25);

      setLoading(false);
      setSearched(true);

      if (error) {
        console.warn('User search failed:', error.message);
        setResults([]);
        return;
      }
      setResults(data || []);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [term]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="glass-panel"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}
      >
        <span style={{ color: 'var(--dim)' }}>🔍</span>
        <input
          type="text"
          placeholder="Search by username"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 15, color: 'var(--ink)',
          }}
        />
        {loading && (
          <span
            aria-label="Loading"
            style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid var(--glass-border)', borderTopColor: 'var(--blue)',
              animation: 'spin 700ms linear infinite',
            }}
          />
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {!term.trim() && (
        <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, marginTop: 24 }}>
          Search for people by username.
        </p>
      )}

      {term.trim() && searched && !loading && results.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, marginTop: 24 }}>
          No users found for "{term.trim()}".
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelectUser(user.id)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                {initials(user.username)}
              </div>
            )}
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{user.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
