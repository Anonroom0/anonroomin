/** ===========================================================================
 * STORY STYLE PRESETS (v4)
 * ============================================================================
 * Three independent preset lists ShareStorySheet.jsx mixes together live —
 * Theme, Shape, and Size. storyImageGenerator.js consumes all three by id.
 *
 * v4 reworks how these are organized, based on direct feedback that v3 was
 * messy in two specific ways:
 *
 *   1. Header Color and Background used to be two fully independent
 *      pickers, so it was easy to land on a clashing pair (e.g. a violet
 *      badge on a lime background). They're merged here into STORY_THEMES —
 *      ~30 curated {header, background} pairs picked to look coherent
 *      together, the way a real "send me anonymous confessions" story
 *      template pairs a gradient header with a matching dark body. Picking
 *      a theme changes both at once; there's no way to end up with a
 *      mismatched pair anymore.
 *
 *   2. Body Style used to be one flat gallery of SHAPES x SCALES (160
 *      thumbnails — every shape repeated 8 times at different sizes), which
 *      was overwhelming to browse and made "just show me the shapes"
 *      impossible. Shape and Size are independent exports now (BODY_SHAPES,
 *      BODY_SCALES) — ShareStorySheet renders Shape as its own browsable
 *      gallery (currently 30 entries, designed to keep growing toward
 *      ~100+ over time) and Size as a compact dropdown, and
 *      storyImageGenerator merges whichever pair is picked at render time
 *      instead of looking up a precomputed combo id.
 *
 * Every color value is a plain hex/rgba string (not a CSS var lookup)
 * because these are drawn to a canvas, which can't resolve custom
 * properties — each preset intentionally echoes the app's existing token
 * palette (tokens.css: --ink, --ink-2, --paper, --dim, --ember,
 * --glass-white, --glass-border) so every combination still reads as
 * unmistakably "Anonroom," just with a different accent/mood.
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 1. STORY THEMES — the type badge ("QUESTION"/"REPLY") + "Reply
//    anonymously" pill color, paired with the full canvas background that's
//    meant to go with it. Selecting a theme changes both together.
//    background.type: 'solid' | 'linear' | 'radial' | 'dots' | 'stripes' |
//    'grid' | 'checker' | 'crosshatch' | 'confetti' | 'waves' | 'sunburst' |
//    'halftone' | 'pinstripe' — see storyImageGenerator.js's drawBackground.
// ---------------------------------------------------------------------------
export const STORY_THEMES = [
  { id: 'ember-dusk', name: 'Ember Dusk', pillBg: '#FF6B35', pillText: '#0C0D10', background: { type: 'linear', colors: ['#0C0D10', '#23242E'] } },
  { id: 'crimson-duotone', name: 'Crimson Duotone', pillBg: '#E63950', pillText: '#FFFFFF', background: { type: 'linear', colors: ['#3A0E14', '#0C0D10'] } },
  { id: 'scarlet-ink', name: 'Scarlet Ink', pillBg: '#FF3B3B', pillText: '#FFFFFF', background: { type: 'solid', colors: ['#2A0808'] } },
  { id: 'violet-midnight', name: 'Violet Midnight', pillBg: '#8B5CF6', pillText: '#FFFFFF', background: { type: 'linear', colors: ['#1A1033', '#0C0D10'] } },
  { id: 'grape-aurora', name: 'Grape Aurora', pillBg: '#6D28D9', pillText: '#FFFFFF', background: { type: 'radial', colors: ['#8B5CF6', '#0C0D10'], overlay: 'rgba(12,13,16,0.75)' } },
  { id: 'cobalt-ocean', name: 'Cobalt Ocean', pillBg: '#3B82F6', pillText: '#FFFFFF', background: { type: 'linear', colors: ['#061C2E', '#0C0D10'] } },
  { id: 'sky-lagoon', name: 'Sky Lagoon', pillBg: '#38BDF8', pillText: '#0C0D10', background: { type: 'linear', colors: ['#14B8A6', '#0B1E3B'] } },
  { id: 'mint-forest', name: 'Mint Forest', pillBg: '#2DD4A7', pillText: '#0C0D10', background: { type: 'solid', colors: ['#0E2A1C'] } },
  { id: 'jade-teal', name: 'Jade Teal', pillBg: '#16A34A', pillText: '#FFFFFF', background: { type: 'solid', colors: ['#062723'] } },
  { id: 'gold-dusk', name: 'Gold Dusk', pillBg: '#F5C64B', pillText: '#0C0D10', background: { type: 'solid', colors: ['#2B2108'] } },
  { id: 'amber-sunset', name: 'Amber Sunset', pillBg: '#F59E0B', pillText: '#0C0D10', background: { type: 'linear', colors: ['#FF6B35', '#3A0E14'] } },
  { id: 'rose-dust', name: 'Rose Dust', pillBg: '#FB7EC0', pillText: '#0C0D10', background: { type: 'solid', colors: ['#2E1420'] } },
  { id: 'fuchsia-glow', name: 'Fuchsia Glow', pillBg: '#E135DA', pillText: '#FFFFFF', background: { type: 'radial', colors: ['#E135DA', '#0C0D10'], overlay: 'rgba(12,13,16,0.8)' } },
  { id: 'lime-pop', name: 'Lime Pop', pillBg: '#C6F135', pillText: '#0C0D10', background: { type: 'solid', colors: ['#182B08'] } },
  { id: 'teal-cobalt', name: 'Teal Cobalt', pillBg: '#14B8A6', pillText: '#0C0D10', background: { type: 'solid', colors: ['#0B1E3B'] } },
  { id: 'indigo-deep', name: 'Indigo Deep', pillBg: '#4F46E5', pillText: '#FFFFFF', background: { type: 'linear', colors: ['#0C0D10', '#1A1550'] } },
  { id: 'coral-blush', name: 'Coral Blush', pillBg: '#FF7A5C', pillText: '#0C0D10', background: { type: 'linear', colors: ['#2E1420', '#0C0D10'] } },
  { id: 'slate-blackout', name: 'Slate Blackout', pillBg: '#E7E7EE', pillText: '#0C0D10', background: { type: 'solid', colors: ['#000000'] } },
  { id: 'blackout-snow', name: 'Blackout Snow', pillBg: '#0C0D10', pillText: '#F4F3F0', background: { type: 'solid', colors: ['#F4F3F0'], light: true } },
  { id: 'snow-ink', name: 'Snow Ink', pillBg: '#FFFFFF', pillText: '#0C0D10', background: { type: 'solid', colors: ['#0C0D10'] } },
  { id: 'ember-dots', name: 'Ember Dots', pillBg: '#FF6B35', pillText: '#0C0D10', background: { type: 'dots', colors: ['#0C0D10'], dotColor: 'rgba(255,255,255,0.08)' } },
  { id: 'violet-stripes', name: 'Violet Stripes', pillBg: '#8B5CF6', pillText: '#FFFFFF', background: { type: 'stripes', colors: ['#0C0D10', 'rgba(139,92,246,0.16)'] } },
  { id: 'cobalt-grid', name: 'Cobalt Grid', pillBg: '#3B82F6', pillText: '#FFFFFF', background: { type: 'grid', colors: ['#0B1E3B'], dotColor: 'rgba(255,255,255,0.10)' } },
  { id: 'gold-checker', name: 'Gold Checker', pillBg: '#F5C64B', pillText: '#0C0D10', background: { type: 'checker', colors: ['#2B2108', 'rgba(245,198,75,0.14)'] } },
  { id: 'rose-crosshatch', name: 'Rose Crosshatch', pillBg: '#FB7EC0', pillText: '#0C0D10', background: { type: 'crosshatch', colors: ['#2E1420'], dotColor: 'rgba(255,255,255,0.09)' } },
  { id: 'confetti-party', name: 'Confetti Party', pillBg: '#F5C64B', pillText: '#0C0D10', background: { type: 'confetti', colors: ['#0C0D10'] } },
  { id: 'cobalt-waves', name: 'Cobalt Waves', pillBg: '#38BDF8', pillText: '#0C0D10', background: { type: 'waves', colors: ['#0B1E3B'], dotColor: 'rgba(255,255,255,0.14)' } },
  { id: 'amber-sunburst', name: 'Amber Sunburst', pillBg: '#F59E0B', pillText: '#0C0D10', background: { type: 'sunburst', colors: ['#2B2108', 'rgba(245,198,75,0.18)'] } },
  { id: 'grape-halftone', name: 'Grape Halftone', pillBg: '#8B5CF6', pillText: '#FFFFFF', background: { type: 'halftone', colors: ['#1A1033'], dotColor: 'rgba(255,255,255,0.16)' } },
  { id: 'mint-pinstripe', name: 'Mint Pinstripe', pillBg: '#2DD4A7', pillText: '#0C0D10', background: { type: 'pinstripe', colors: ['#062723'], dotColor: 'rgba(255,255,255,0.10)' } },
];

// ---------------------------------------------------------------------------
// 2. BODY SHAPES — the card's silhouette: radius/fill/border/decoration/
//    typeface. 30 to start (per the "start with 30" ask) — genuinely
//    different designs, not the same shape recolored, and meant to keep
//    growing toward a much larger gallery over time; just add more entries
//    here (reusing an existing fill/border/decoration, or introducing a new
//    one in storyImageGenerator.js's drawBodyCard the way sideTab/
//    underline/cornerTag/ringAccent/split/dashed were added for this batch).
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
  { id: 'block-label', name: 'Block Label', radius: 0, fill: 'ink-2', border: 'none', shadow: false, blockHeader: true },
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
  { id: 'split-panel', name: 'Split Panel', radius: 32, fill: 'split', border: 'none', shadow: true },
  { id: 'corner-tag', name: 'Corner Tag', radius: 28, fill: 'ink-2', border: 'glass', shadow: true, cornerTag: true },
  { id: 'paper-thick-frame', name: 'Thick Frame', radius: 20, fill: 'ink-2', border: 'paper-thick', shadow: false },
  { id: 'brutalist', name: 'Brutalist', radius: 0, fill: 'paper', border: 'ink-thick', shadow: false, darkText: true, fontFamily: 'mono' },
  { id: 'postcard', name: 'Postcard', radius: 12, fill: 'paper', border: 'dashed', shadow: true, darkText: true, fontFamily: 'serif', rotate: -2 },
  { id: 'ring-accent', name: 'Ring Accent', radius: 40, fill: 'ink-2', border: 'glass', shadow: true, ringAccent: true },
  { id: 'capsule', name: 'Capsule', radius: 200, fill: 'glass', border: 'glass', shadow: true }, // clamped to a true pill at render time — see drawBodyCard's safeRadius
];

// ---------------------------------------------------------------------------
// 3. BODY SCALES — same shape, different typographic energy: how bold + how
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
