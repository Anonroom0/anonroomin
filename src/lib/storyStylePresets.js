/** ===========================================================================
 * STORY STYLE PRESETS (v5)
 * ============================================================================
 * Four independent preset lists ShareStorySheet.jsx mixes together live —
 * Background, Colour, Shape, and Size. storyImageGenerator.js consumes all
 * four by id.
 *
 * v5 splits what v4 called a "Theme" apart again, based on feedback that
 * baking a fixed accent color into each of the 30 theme pairs still meant
 * you couldn't, say, get a Dot Grid background in green if green only
 * shipped paired with Sunburst. BACKGROUND_STRUCTURES now describes only
 * the *shape* of the background (solid / gradient / dots / stripes / …) —
 * no colors baked in — and ACCENT_COLORS is a standalone palette. Any
 * structure can pair with any color: storyImageGenerator.js's
 * buildThemeRuntime() derives the actual background fill/gradient/pattern
 * colors AND the header-badge color from whichever single accent color is
 * picked, so the pairing can never clash (both halves always come from the
 * same one color) without needing to hand-author every combination.
 *
 * Shape/Size stay split the way v4 introduced them — see those exports'
 * own comments below for why.
 *
 * Every color value is a plain hex/rgba string (not a CSS var lookup)
 * because these are drawn to a canvas, which can't resolve custom
 * properties.
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 1. BACKGROUND STRUCTURES — the full canvas fill's *shape* only; colors
//    are derived at render time from whichever ACCENT_COLORS entry is
//    picked (see storyImageGenerator.js's buildThemeRuntime). Rendered as a
//    horizontally scrollable strip in ShareStorySheet — pick one by
//    scrolling and tapping, no modal.
// ---------------------------------------------------------------------------
export const BACKGROUND_STRUCTURES = [
  { id: 'solid', name: 'Solid', type: 'solid' },
  { id: 'linear', name: 'Gradient', type: 'linear' },
  { id: 'radial', name: 'Glow', type: 'radial' },
  { id: 'dots', name: 'Dot Grid', type: 'dots' },
  { id: 'stripes', name: 'Diagonal', type: 'stripes' },
  { id: 'grid', name: 'Grid Paper', type: 'grid' },
  { id: 'checker', name: 'Checker', type: 'checker' },
  { id: 'crosshatch', name: 'Crosshatch', type: 'crosshatch' },
  { id: 'confetti', name: 'Confetti', type: 'confetti' },
  { id: 'waves', name: 'Waves', type: 'waves' },
  { id: 'sunburst', name: 'Sunburst', type: 'sunburst' },
  { id: 'halftone', name: 'Halftone', type: 'halftone' },
  { id: 'pinstripe', name: 'Pinstripe', type: 'pinstripe' },
];

// ---------------------------------------------------------------------------
// 2. ACCENT COLORS — the one color that drives both the header badge and
//    the background's accent tone (see buildThemeRuntime). Ordered around
//    the hue wheel (warm -> cool -> neutrals) so a circular picker in
//    ShareStorySheet can lay these out like an actual color wheel instead
//    of an arbitrary grid.
// ---------------------------------------------------------------------------
export const ACCENT_COLORS = [
  { id: 'ember', name: 'Ember', hex: '#FF6B35' },
  { id: 'tangerine', name: 'Tangerine', hex: '#FF8C42' },
  { id: 'amber', name: 'Amber', hex: '#F59E0B' },
  { id: 'gold', name: 'Gold', hex: '#F5C64B' },
  { id: 'yellow', name: 'Yellow', hex: '#FDE047' },
  { id: 'lime', name: 'Lime', hex: '#C6F135' },
  { id: 'chartreuse', name: 'Chartreuse', hex: '#A3E635' },
  { id: 'mint', name: 'Mint', hex: '#2DD4A7' },
  { id: 'jade', name: 'Jade', hex: '#16A34A' },
  { id: 'teal', name: 'Teal', hex: '#14B8A6' },
  { id: 'cyan', name: 'Cyan', hex: '#22D3EE' },
  { id: 'sky', name: 'Sky', hex: '#38BDF8' },
  { id: 'cobalt', name: 'Cobalt', hex: '#3B82F6' },
  { id: 'indigo', name: 'Indigo', hex: '#4F46E5' },
  { id: 'violet', name: 'Violet', hex: '#8B5CF6' },
  { id: 'grape', name: 'Grape', hex: '#6D28D9' },
  { id: 'purple', name: 'Purple', hex: '#A855F7' },
  { id: 'fuchsia', name: 'Fuchsia', hex: '#E135DA' },
  { id: 'magenta', name: 'Magenta', hex: '#EC4899' },
  { id: 'rose', name: 'Rose', hex: '#FB7EC0' },
  { id: 'pink', name: 'Pink', hex: '#F472B6' },
  { id: 'crimson', name: 'Crimson', hex: '#E63950' },
  { id: 'scarlet', name: 'Scarlet', hex: '#FF3B3B' },
  { id: 'red', name: 'Red', hex: '#EF4444' },
  { id: 'coral', name: 'Coral', hex: '#FF7A5C' },
  { id: 'snow', name: 'Snow', hex: '#FFFFFF' },
];
// v6: dropped 'Slate' (#E7E7EE) and 'Blackout' (#0C0D10) — the two
// desaturated/near-neutral entries that made the story feature read as
// dull no matter which lively BACKGROUND_STRUCTURES pattern was paired
// with them (see storyImageGenerator.js's buildThemeRuntime, also
// rebalanced in v6 to mix far less black into every accent's background
// fill). Every remaining color is a genuinely saturated hue, so any
// Background x Colour combo now lands vibrant by construction.

// ---------------------------------------------------------------------------
// 3. BODY SHAPES — the card's silhouette: radius/fill/border/decoration/
//    typeface. 30 to start — genuinely different designs, not the same
//    shape recolored, and meant to keep growing over time; see
//    /docs/ADDING_STORY_SHAPES.md for exactly how to add more (including
//    the prompt to hand another AI to generate a fresh batch).
// ---------------------------------------------------------------------------
export const BODY_SHAPES = [
  { id: 'glass', name: 'Glass', radius: 48, fill: 'glass', border: 'glass', shadow: true },
  { id: 'sharp-mono', name: 'Sharp Mono', radius: 8, fill: 'ink-2', border: 'ember-thin', shadow: false },
  { id: 'paper-card', name: 'Paper Card', radius: 40, fill: 'paper', border: 'none', shadow: true, darkText: true, fontFamily: 'serif' },
  { id: 'outline', name: 'Outline', radius: 40, fill: 'none', border: 'ember-thick', shadow: false },
  { id: 'neon-edge', name: 'Neon Edge', radius: 32, fill: 'ink-2', border: 'glow', shadow: false },
  { id: 'stacked', name: 'Stacked', radius: 36, fill: 'glass', border: 'glass', shadow: true, stacked: true },
  { id: 'ribbon', name: 'Ribbon', radius: 28, fill: 'ink-2', border: 'glass', shadow: true, ribbon: true },
  { id: 'taped', name: 'Taped', radius: 20, fill: 'glass', border: 'glass', shadow: true, rotate: -3, taped: true, fontFamily: 'serif' },
  { id: 'minimal-text', name: 'Minimal', radius: 0, fill: 'none', border: 'none', shadow: false, textOnly: true },
  { id: 'bubble', name: 'Bubble', radius: 72, fill: 'glass', border: 'glass', shadow: true },
  { id: 'double-frame', name: 'Double Frame', radius: 28, fill: 'ink-2', border: 'double', shadow: true },
  { id: 'gradient-wash', name: 'Gradient Wash', radius: 36, fill: 'gradient-header', border: 'none', shadow: true },
  { id: 'sticker-pop', name: 'Sticker Pop', radius: 28, fill: 'paper', border: 'ember-thick', shadow: true, rotate: 4, taped: true, darkText: true, fontFamily: 'serif' },
  { id: 'mono-slab', name: 'Mono Slab', radius: 0, fill: 'ink-2', border: 'none', shadow: false, fontFamily: 'mono' },
  { id: 'halo-glow', name: 'Halo Glow', radius: 40, fill: 'glass', border: 'glow', shadow: true },
  { id: 'newsprint', name: 'Newsprint', radius: 4, fill: 'paper', border: 'ember-thin', shadow: false, darkText: true, fontFamily: 'serif' },
  { id: 'terminal', name: 'Terminal', radius: 12, fill: 'ink-2', border: 'ember-thin', shadow: false, fontFamily: 'mono' },
  { id: 'confetti-pop', name: 'Confetti Pop', radius: 36, fill: 'glass', border: 'glass', shadow: true, confetti: true },
  { id: 'spotlight', name: 'Spotlight', radius: 48, fill: 'radial-glow', border: 'glass', shadow: true },
  // --- new for v4, taking the shape count from 20 -> 30 -------------------
  { id: 'dashed-frame', name: 'Dashed Frame', radius: 24, fill: 'ink-2', border: 'dashed', shadow: false },
  { id: 'side-tab', name: 'Side Tab', radius: 32, fill: 'glass', border: 'glass', shadow: true, sideTab: true },
  { id: 'underline-badge', name: 'Underline', radius: 20, fill: 'ink-2', border: 'none', shadow: false, underline: true },
  { id: 'corner-tag', name: 'Corner Tag', radius: 28, fill: 'ink-2', border: 'glass', shadow: true, cornerTag: true },
  { id: 'paper-thick-frame', name: 'Thick Frame', radius: 20, fill: 'ink-2', border: 'paper-thick', shadow: false },
  { id: 'brutalist', name: 'Brutalist', radius: 0, fill: 'paper', border: 'ink-thick', shadow: false, darkText: true, fontFamily: 'mono' },
  { id: 'postcard', name: 'Postcard', radius: 12, fill: 'paper', border: 'dashed', shadow: true, darkText: true, fontFamily: 'serif', rotate: -2 },
  { id: 'ring-accent', name: 'Ring Accent', radius: 40, fill: 'ink-2', border: 'glass', shadow: true, ringAccent: true },
  { id: 'capsule', name: 'Capsule', radius: 200, fill: 'glass', border: 'glass', shadow: true }, // clamped to a true pill at render time — see drawBodyCard's safeRadius
];

// ---------------------------------------------------------------------------
// 4. BODY SCALES — same shape, different typographic energy: how bold + how
//    big the headline text reads, from a quiet "Cozy" up to a poster-sized
//    "Ultra". Rendered as a compact dropdown in ShareStorySheet, independent
//    of which shape is picked.
// ---------------------------------------------------------------------------
export const BODY_SCALES = [
  { id: 'cozy', name: 'Cozy', fontWeight: 700, fontScale: 0.80, leadingMult: 1.02, uppercase: false },
  { id: 'neat', name: 'Neat', fontWeight: 800, fontScale: 0.88, leadingMult: 1.0, uppercase: false },
  { id: 'regular', name: 'Regular', fontWeight: 800, fontScale: 0.95, leadingMult: 1.0, uppercase: false },
  { id: 'bold', name: 'Bold', fontWeight: 900, fontScale: 1.0, leadingMult: 1.0, uppercase: false },
  { id: 'big', name: 'Big', fontWeight: 900, fontScale: 1.14, leadingMult: 0.98, uppercase: false },
  { id: 'huge', name: 'Huge', fontWeight: 900, fontScale: 1.28, leadingMult: 0.95, uppercase: false },
  { id: 'massive', name: 'Massive', fontWeight: 900, fontScale: 1.44, leadingMult: 0.9, uppercase: true },
  { id: 'ultra', name: 'Ultra', fontWeight: 900, fontScale: 1.62, leadingMult: 0.86, uppercase: true },
];

// Merges a chosen BODY_SHAPES entry with a chosen BODY_SCALES entry into the
// single flat object storyImageGenerator.js's drawing code expects (same
// shape it always consumed — this is just computed on demand now instead of
// precomputed as a giant SHAPES x SCALES array).
export function mergeBodyPreset(shape, scale) {
  return {
    ...shape,
    fontWeight: scale.fontWeight,
    fontScale: scale.fontScale,
    leadingMult: scale.leadingMult,
    uppercase: scale.uppercase,
    shapeId: shape.id,
    shapeName: shape.name,
    scaleId: scale.id,
    scaleName: scale.name,
  };
}

export function getPresetById(list, id) {
  return list.find((p) => p.id === id) || list[0];
}
