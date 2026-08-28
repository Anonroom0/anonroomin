/** ===========================================================================
 * LIQUID AVATAR — consolidated avatar renderer
 * ============================================================================
 * Replaces four near-duplicate components that had drifted slightly apart:
 * LiquidAvatar (Home.jsx, SearchUsers.jsx), GroupLiquidAvatar (GroupChat.jsx),
 * DMLiquidAvatar (DirectMessages.jsx), LiquidProfileAvatar (ProfileCard.jsx).
 * Every caller now imports this one component instead.
 *
 *   <LiquidAvatar
 *     identity={{ avatar_url, name, is_admin }}
 *     size={48}
 *     kind="user" | "group"
 *     isAnon
 *     isOnline
 *     justReceivedMessage
 *   />
 *
 * Precedence for what renders inside the circle (highest first):
 *   1. isAnon (kind="user" only) — masked ghost treatment, identity hidden
 *   2. identity.is_admin (kind="user" only) — solid gold fill, "ADM" label
 *   3. identity.avatar_url — the actual photo/cover image
 *   4. fallback — colored gradient with initials ("#" for kind="group")
 *
 * Status ring: an --signal ring when isOnline, a --dim ring when isOnline
 * is explicitly false. Deliberately static — a conic-gradient of a single
 * hue renders pixel-identical to a plain solid-color border, so this uses
 * the plain border (simpler, no masking edge cases) rather than an actual
 * conic-gradient that would just be doing more work to look the same; if a
 * future prompt asks for a rotating/segmented ring, that's the point where
 * an actual conic-gradient becomes necessary. No ring renders at all when
 * isOnline is left undefined, since plenty of call sites (e.g. inside a
 * message bubble's sender avatar) don't track presence and shouldn't imply
 * "offline" by default.
 *
 * justReceivedMessage: purely reflected into the .avatar-status-pulse
 * class from animations.css — this component holds no internal timer. The
 * parent is responsible for flipping the prop back to false after the
 * animation's ~400ms so the class can be re-added on the next message.
 * ========================================================================= */

const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export default function LiquidAvatar({
  identity,
  size = 48,
  kind = 'user',
  isAnon = false,
  isOnline,
  justReceivedMessage = false,
}) {
  const isGroup = kind === 'group';
  const name = identity?.name;
  const avatarUrl = identity?.avatar_url || null;
  const isAdmin = !isGroup && identity?.is_admin === true;

  const circleStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 0 1px var(--glass-border)',
    userSelect: 'none',
  };

  let content;
  if (isAnon && !isGroup) {
    // Masked treatment: identity hidden regardless of what's on the
    // profile, matching GroupChat.jsx/DirectMessages.jsx's ghost fallback.
    content = (
      <div style={{ ...circleStyle, background: 'var(--glass-border)', color: 'var(--dim)' }}>
        <div style={{ transform: 'scale(0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
          </svg>
        </div>
      </div>
    );
  } else if (isAdmin) {
    content = (
      <div
        style={{
          ...circleStyle,
          background: 'linear-gradient(135deg, var(--admin-1) 0%, var(--admin-2) 100%)',
          color: '#fff',
          fontSize: size * 0.35,
          fontWeight: 800,
        }}
      >
        ADM
      </div>
    );
  } else if (avatarUrl) {
    content = (
      <div style={circleStyle}>
        <img src={avatarUrl} alt={name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  } else {
    const colorIndex = (name || '').length % FALLBACK_GRADIENTS.length;
    content = (
      <div
        style={{
          ...circleStyle,
          background: FALLBACK_GRADIENTS[colorIndex],
          color: '#ffffff',
          fontWeight: 700,
          fontSize: size * 0.4,
        }}
      >
        {isGroup ? '#' : getInitials(name)}
      </div>
    );
  }

  const hasStatusRing = typeof isOnline === 'boolean';

  return (
    <div
      className={justReceivedMessage ? 'avatar-status-pulse' : undefined}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      {content}
      {hasStatusRing && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            pointerEvents: 'none',
            border: `2px solid ${isOnline ? 'var(--signal)' : 'var(--dim)'}`,
          }}
        />
      )}
    </div>
  );
}
