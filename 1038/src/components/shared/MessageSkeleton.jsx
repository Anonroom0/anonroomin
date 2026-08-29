/**
 * ============================================================================
 * MESSAGE SKELETON (SHARED LOADING SHIMMER)
 * ============================================================================
 * Single consolidated skeleton loader used anywhere a list of rows, a chat's
 * messages, or a profile/group bottom-sheet is still fetching data. Replaces
 * the five near-identical skeletons that used to be duplicated inline:
 *   - MessageSkeleton   (GroupChat.jsx / DirectMessages.jsx)
 *   - ListSkeletonLoader (Home.jsx)
 *   - SearchSkeletonLoader (SearchUsers.jsx)
 *   - GroupCardSkeleton  (GroupCard.jsx)
 *   - ProfileCardSkeleton (ProfileCard.jsx)
 *
 * Variants:
 *   - "message"    chat bubble skeleton (avatar + bubble, alternating sides)
 *   - "list-row"   sidebar chat/group row skeleton (avatar + two text lines)
 *   - "search-row" search result row skeleton (avatar + two text lines,
 *                  fading opacity per row)
 *   - "card"       centered bottom-sheet skeleton (big avatar + title +
 *                  subtitle), shared by ProfileCard and GroupCard
 *
 * The shimmer sweep is a single cosmetic keyframe scoped locally to this
 * file via an inline <style> tag (same pattern ProfileCard/GroupCard already
 * used for their own GlobalKeyframes) — it isn't part of the interaction /
 * motion spec that lives in animations.css, so it doesn't belong there.
 *
 * Dependencies: React
 * ============================================================================
 */

import React from 'react';

// ============================================================================
// 1. LOCAL SHIMMER KEYFRAME (cosmetic-only, scoped to this component)
// ============================================================================
const ShimmerKeyframes = () => (
  <style>{`
    @keyframes message-skeleton-shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .message-skeleton-shimmer {
      /* Sweeping band built from --glass-white; the brighter mid-stop has no
         matching token (it's a transient highlight, not a surface color), so
         it's the one deliberate rgba() left un-tokenized here. */
      background-image: linear-gradient(
        90deg,
        var(--glass-white) 0%,
        rgba(255, 255, 255, 0.16) 50%,
        var(--glass-white) 100%
      );
      background-size: 800px 100%;
      animation: message-skeleton-shimmer 1.6s ease-in-out infinite;
    }
  `}</style>
);

// ============================================================================
// 2. PRIMITIVE
// ============================================================================

/**
 * A single shimmering filler block. Every skeleton shape (avatar circle,
 * text line, bubble, title pill) is just a Bone with different dimensions.
 */
function Bone({ width, height, borderRadius = 8, style }) {
  return (
    <div
      className="message-skeleton-shimmer"
      style={{
        width,
        height,
        borderRadius,
        flexShrink: 0,
        background: 'var(--glass-white)',
        border: '1px solid var(--glass-border)',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

// ============================================================================
// 3. VARIANT ROW RENDERERS
// ============================================================================

/**
 * "message" — mirrors a real chat thread: alternating incoming rows
 * (avatar + left bubble) and outgoing rows (bubble only, right-aligned),
 * with deterministically varied widths/heights so it reads as an actual
 * conversation rather than a stack of identical blocks. Matches the shape
 * of the old GroupChat/DirectMessages MessageSkeleton.
 */
function MessageRow({ index }) {
  // Every third row skews "own message" (right-aligned, no avatar) — a
  // reasonable stand-in for real conversational rhythm while loading.
  const isOwn = index % 3 === 1;
  const bubbleWidth = isOwn ? ['55%', '38%', '48%'][index % 3] : ['42%', '30%', '50%'][index % 3];
  const bubbleHeight = 18 + ((index * 11) % 28); // 18-46px, deterministic variety

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginBottom: 16,
      }}
    >
      {!isOwn && <Bone width={36} height={36} borderRadius="50%" />}
      <Bone
        width={bubbleWidth}
        height={bubbleHeight + 20}
        borderRadius={20}
        style={{
          borderBottomRightRadius: isOwn ? 4 : 20,
          borderBottomLeftRadius: isOwn ? 20 : 4,
        }}
      />
    </div>
  );
}

/**
 * "list-row" — sidebar chat/group row: avatar circle + name line + subtitle
 * line, fading slightly per row. Matches Home.jsx's ListSkeletonLoader.
 */
function ListRow({ index }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 8px',
        opacity: 1 - index * 0.1,
      }}
    >
      <Bone width={48} height={48} borderRadius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bone width="40%" height={14} borderRadius={4} />
        <Bone width="70%" height={12} borderRadius={4} />
      </div>
    </div>
  );
}

/**
 * "search-row" — search result row: avatar + name line + label line,
 * fading out faster than list-row to create the depth-of-field effect the
 * original SearchUsers.jsx SearchSkeletonLoader had.
 */
function SearchRow({ index }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 8px',
        opacity: 1 - index * 0.12,
      }}
    >
      <Bone width={48} height={48} borderRadius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bone width="45%" height={14} borderRadius={4} />
        <Bone width="25%" height={12} borderRadius={4} />
      </div>
    </div>
  );
}

/**
 * "card" — centered bottom-sheet skeleton: big avatar circle, title pill,
 * subtitle pill. Shared shape for ProfileCard's and GroupCard's loading
 * state (their skeletons were already pixel-identical).
 */
function CardSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        width: '100%',
        marginTop: 16,
      }}
    >
      <Bone width={140} height={140} borderRadius="50%" />
      <Bone width="50%" height={32} borderRadius={16} />
      <Bone width="40%" height={18} borderRadius={8} />
    </div>
  );
}

// ============================================================================
// 4. MAIN EXPORT
// ============================================================================

/**
 * MessageSkeleton
 *
 * @param {"message"|"list-row"|"search-row"|"card"} variant - which shape to render
 * @param {number} count - number of repeated rows; ignored by "card" since
 *   a profile/group sheet only ever shows one skeleton, not a repeated list
 */
export default function MessageSkeleton({ variant = 'list-row', count = 3 }) {
  if (variant === 'card') {
    return (
      <>
        <ShimmerKeyframes />
        <CardSkeleton />
      </>
    );
  }

  const RowComponent =
    variant === 'message' ? MessageRow : variant === 'search-row' ? SearchRow : ListRow;

  // "message" rows sit inside a scrolling chat body (tighter side padding);
  // "list-row"/"search-row" sit inside a sidebar list (matches old callers).
  const wrapperStyle =
    variant === 'message'
      ? { display: 'flex', flexDirection: 'column', padding: '10px 16px' }
      : { display: 'flex', flexDirection: 'column', padding: '0 8px', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={wrapperStyle}>
      <ShimmerKeyframes />
      {Array.from({ length: count }).map((_, i) => (
        <RowComponent key={i} index={i} />
      ))}
    </div>
  );
}