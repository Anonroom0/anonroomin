/**
 * ============================================================================
 * GROUP CARD MODAL (APPLE LIQUID UI)
 * ============================================================================
 * This component acts as the info popup when clicking a group's header,
 * mimicking the behavior of ProfileCard for individual users.
 * 
 * Dependencies: React, Supabase
 * ============================================================================
 */

import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';

const Icons = {
  Close: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Link: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  )
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function LiquidAvatarLarge({ url, name, size = 100 }) {
  const containerStyle = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.12), inset 0 0 0 1px var(--glass-border)',
    margin: '0 auto', userSelect: 'none'
  };

  if (url) {
    return (
      <div style={containerStyle}>
        <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  const colors = [
    'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  ];
  const colorIndex = (name || '').length % colors.length;

  return (
    <div style={{ ...containerStyle, background: colors[colorIndex], color: '#ffffff', fontWeight: 800, fontSize: size * 0.4 }}>
      {getInitials(name)}
    </div>
  );
}

export default function GroupCard({ groupSlug, open, onClose }) {
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !groupSlug) return;

    let isMounted = true;
    setLoading(true);

    async function fetchGroupDetails() {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('slug', groupSlug)
        .maybeSingle();

      if (isMounted && !error && data) {
        setGroup(data);
      }
      if (isMounted) {
        setLoading(false);
      }
    }

    fetchGroupDetails();

    return () => { isMounted = false; };
  }, [groupSlug, open]);

  if (!open) return null;

  return (
    <div 
      className="no-copy-text"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        userSelect: 'none', WebkitUserSelect: 'none'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: '24px 24px 0 0',
          padding: '24px 24px 40px', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
          animation: 'slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
      >
        {/* Drag handle for aesthetics */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--glass-border)', margin: '0 auto 20px' }} />

        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: 20, right: 20, background: 'var(--glass-border)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', cursor: 'pointer' }}
        >
          {Icons.Close}
        </button>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)' }}>Loading group info...</div>
        ) : group ? (
          <div style={{ textAlign: 'center' }}>
            <LiquidAvatarLarge url={group.cover_url} name={group.name} size={90} />
            
            <h2 style={{ margin: '16px 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>
              {group.name}
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--dim)', padding: '0 20px' }}>
              {group.description || 'Public Channel'}
            </p>

            <div style={{ marginTop: 24, background: 'var(--glass-strong)', borderRadius: 16, padding: '16px', textAlign: 'left', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 8 }}>
                Share Link
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, fontSize: 15, color: 'var(--blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {`https://${group.slug}.anonroom.in`}
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`https://${group.slug}.anonroom.in`);
                    alert("Group link copied!");
                  }}
                  style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  {Icons.Link}
                </button>
              </div>
            </div>
            
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)' }}>Group not found.</div>
        )}
      </div>
      
      <style>{`
        @keyframes slideUpFade {
          0% { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
