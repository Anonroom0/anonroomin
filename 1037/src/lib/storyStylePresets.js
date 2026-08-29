/** ===========================================================================
 * STORY STYLE PRESETS (v3)
 * ============================================================================
 * Three independent, swipeable/tappable preset lists that ShareStorySheet
 * mixes together live — Header Color, Background, and Body Style.
 *
 * storyImageGenerator.js consumes these by id. Every color value is a plain
 * hex/rgba string (not a CSS var lookup) because these are drawn to a canvas,
 * which can't resolve custom properties — each preset intentionally echoes
 * the app's existing token palette (tokens.css: --ink, --ink-2, --paper,
 * --dim, --ember, --glass-white, --glass-border) so every combination still
 * reads as unmistakably "Anonroom," just with a different accent/mood.
 *
 * Nothing here is user-uploaded — "already saved in app" just means these
 * fixed arrays; picking a preset never hits the network.
 *
 * BODY STYLE is generated, not hand-listed: a small set of SHAPES (the
 * card's silhouette — radius/fill/border/decoration/typeface) is crossed
 * with a small set of SCALES (how bold + how big the text reads, from
 * "Cozy" up to "Ultra") to produce every SHAPES.length * SCALES.length
 * combination as its own named preset — currently well into the hundreds,
 * so someone can browse a real gallery instead of three fixed looks.
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 1. HEADER COLOR — the small type badge ("QUESTION" / "REPLY") background +
//    text color, and the "Reply anonymously" pill's fill. A wide spread so
//    the on-screen picker reads as a proper color-swatch grid.
// ---------------------------------------------------------------------------
export const HEADER_COLOR_PRESETS = [
  { id: 'ember', name: 'Ember', pillBg: '#FF6B35', pillText: '#0C0D10' },
  { id: 'crimson', name: 'Crimson', pillBg: '#E63950', pillText: '#FFFFFF' },
  { id: 'scarlet', name: 'Scarlet', pillBg: '#FF3B3B', pillText: '#FFFFFF' },
  { id: 'violet', name: 'Violet', pillBg: '#8B5CF6', pillText: '#FFFFFF' },
  { id: 'grape', name: 'Grape', pillBg: '#6D28D9', pillText: '#FFFFFF' },
  { id: 'cobalt', name: 'Cobalt', pillBg: '#3B82F6', pillText: '#FFFFFF' },
  { id: 'sky', name: 'Sky', pillBg: '#38BDF8', pillText: '#0C0D10' },
  { id: 'mint', name: 'Mint', pillBg: '#2DD4A7', pillText: '#0C0D10' },
  { id: 'jade', name: 'Jade', pillBg: '#16A34A', pillText: '#FFFFFF' },
  { id: 'gold', name: 'Gold', pillBg: '#F5C64B', pillText: '#0C0D10' },
  { id: 'amber', name: 'Amber', pillBg: '#F59E0B', pillText: '#0C0D10' },
  { id: 'rose', name: 'Rose', pillBg: '#FB7EC0', pillText: '#0C0D10' },
  { id: 'fuchsia', name: 'Fuchsia', pillBg: '#E135DA', pillText: '#FFFFFF' },
  { id: 'lime', name: 'Lime', pillBg: '#C6F135', pillText: '#0C0D10' },
  { id: 'teal', name: 'Teal', pillBg: '#14B8A6', pillText: '#0C0D10' },
  { id: 'indigo', name: 'Indigo', pillBg: '#4F46E5', pillText: '#FFFFFF' },
  { id: 'coral', name: 'Coral', pillBg: '#FF7A5C', pillText: '#0C0D10' },
  { id: 'slate', name: 'Slate', pillBg: '#E7E7EE', pillText: '#0C0D10' },
  { id: 'blackout', name: 'Blackout', pillBg: '#0C0D10', pillText: '#F4F3F0' },
  { id: 'snow', name: 'Snow', pillBg: '#FFFFFF', pillText: '#0C0D10' },
];

// ---------------------------------------------------------------------------
// 2. BACKGROUND — the full 1080x1920 canvas fill, drawn before the body card.
//    type: 'solid' | 'linear' | 'radial' | 'dots' | 'stripes' | 'grid' |
//          'checker' | 'crosshatch' | 'confetti' | 'waves' | 'sunburst' |
//          'halftone' | 'pinstripe'
//    The last group (patterns) draws a repeating motif instead of a flat
//    fill, so the color picker has real texture to offer, not just hue.
// ---------------------------------------------------------------------------
export const BACKGROUND_PRESETS = [
  // --- Solids: one flat color each, so "pick a color" is literal ---------
  { id: 'ink', name: 'Ink', type: 'solid', colors: ['#0C0D10'] },
  { id: 'blackout', name: 'Blackout', type: 'solid', colors: ['#000000'] },
  { id: 'paper-flip', name: 'Paper Flip', type: 'solid', colors: ['#F4F3F0'], light: true },
  { id: 'crimson-solid', name: 'Crimson', type: 'solid', colors: ['#3A0E14'] },
  { id: 'violet-solid', name: 'Violet', type: 'solid', colors: ['#1A1033'] },
  { id: 'cobalt-solid', name: 'Cobalt', type: 'solid', colors: ['#0B1E3B'] },
  { id: 'forest-solid', name: 'Forest', type: 'solid', colors: ['#0E2A1C'] },
  { id: 'gold-solid', name: 'Gold Dusk', type: 'solid', colors: ['#2B2108'] },
  { id: 'rose-solid', name: 'Rose Dust', type: 'solid', colors: ['#2E1420'] },
  { id: 'teal-solid', name: 'Teal Deep', type: 'solid', colors: ['#062723'] },

  // --- Gradients -----------------------------------------------------------
  { id: 'dusk', name: 'Dusk', type: 'linear', colors: ['#0C0D10', '#23242E'] },
  { id: 'ember-glow', name: 'Ember Glow', type: 'radial', colors: ['#FF6B35', '#0C0D10'], overlay: 'rgba(12,13,16,0.82)' },
  { id: 'deep-violet', name: 'Deep Violet', type: 'linear', colors: ['#1A1033', '#0C0D10'] },
  { id: 'ocean-fade', name: 'Ocean Fade', type: 'linear', colors: ['#061C2E', '#0C0D10'] },
  { id: 'duotone-crimson', name: 'Duotone Crimson', type: 'linear', colors: ['#3A0E14', '#0C0D10'] },
  { id: 'aurora', name: 'Aurora', type: 'radial', colors: ['#8B5CF6', '#0C0D10'], overlay: 'rgba(12,13,16,0.75)' },
  { id: 'sunset', name: 'Sunset', type: 'linear', colors: ['#FF6B35', '#3A0E14'] },
  { id: 'lagoon', name: 'Lagoon', type: 'linear', colors: ['#14B8A6', '#0B1E3B'] },

  // --- Patterns --------------------------------------------------------------
  { id: 'noise-dots', name: 'Dot Grid', type: 'dots', colors: ['#0C0D10'], dotColor: 'rgba(255,255,255,0.08)' },
  { id: 'diagonal-stripes', name: 'Diagonal', type: 'stripes', colors: ['#0C0D10', 'rgba(255,107,53,0.14)'] },
  { id: 'grid-paper', name: 'Grid Paper', type: 'grid', colors: ['#0C0D10'], dotColor: 'rgba(255,255,255,0.09)' },
  { id: 'checkerboard', name: 'Checker', type: 'checker', colors: ['#0C0D10', 'rgba(255,255,255,0.05)'] },
  { id: 'crosshatch', name: 'Crosshatch', type: 'crosshatch', colors: ['#0C0D10'], dotColor: 'rgba(255,255,255,0.07)' },
  { id: 'confetti-scatter', name: 'Confetti', type: 'confetti', colors: ['#0C0D10'] },
  { id: 'wave-lines', name: 'Waves', type: 'waves', colors: ['#0B1E3B'], dotColor: 'rgba(255,255,255,0.12)' },
  { id: 'sunburst-rays', name: 'Sunburst', type: 'sunburst', colors: ['#2B2108', 'rgba(245,198,75,0.16)'] },
  { id: 'halftone-dots', name: 'Halftone', type: 'halftone', colors: ['#1A1033'], dotColor: 'rgba(255,255,255,0.14)' },
  { id: 'pinstripe', name: 'Pinstripe', type: 'pinstripe', colors: ['#0C0D10'], dotColor: 'rgba(255,255,255,0.08)' },
];

// ---------------------------------------------------------------------------
// 3. BODY STYLE — generated from SHAPES x SCALES (see file banner).
// ---------------------------------------------------------------------------

// SHAPES — the card's silhouette: radius/fill/border/decoration/typeface.
// Each is a meaningfully different look, not just a recolor.
const SHAPES = [
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
];

// SCALES — same shape, different typographic energy: how bold + how big
// the headline text reads, from a quiet "Cozy" up to a poster-sized "Ultra".
const SCALES = [
  { id: 'cozy', name: 'Cozy', fontWeight: 700, fontScale: 0.80, leadingMult: 1.02, uppercase: false },
  { id: 'neat', name: 'Neat', fontWeight: 800, fontScale: 0.88, leadingMult: 1.0, uppercase: false },
  { id: 'regular', name: 'Regular', fontWeight: 800, fontScale: 0.95, leadingMult: 1.0, uppercase: false },
  { id: 'bold', name: 'Bold', fontWeight: 900, fontScale: 1.0, leadingMult: 1.0, uppercase: false },
  { id: 'big', name: 'Big', fontWeight: 900, fontScale: 1.14, leadingMult: 0.98, uppercase: false },
  { id: 'huge', name: 'Huge', fontWeight: 900, fontScale: 1.28, leadingMult: 0.95, uppercase: false },
  { id: 'massive', name: 'Massive', fontWeight: 900, fontScale: 1.44, leadingMult: 0.9, uppercase: true },
  { id: 'ultra', name: 'Ultra', fontWeight: 900, fontScale: 1.62, leadingMult: 0.86, uppercase: true },
];

// Cross SHAPES x SCALES into the full flat preset list every picker/renderer
// consumes. `swatch` is a lightweight hint the on-screen visual selector
// uses to draw a quick CSS preview chip without touching canvas.
export const BODY_STYLE_PRESETS = SHAPES.flatMap((shape) =>
  SCALES.map((scale) => ({
    ...shape,
    fontWeight: scale.fontWeight,
    fontScale: scale.fontScale,
    leadingMult: scale.leadingMult,
    uppercase: scale.uppercase,
    id: `${shape.id}--${scale.id}`,
    name: `${shape.name} \u00B7 ${scale.name}`,
    shapeId: shape.id,
    shapeName: shape.name,
    scaleId: scale.id,
    scaleName: scale.name,
    swatch: {
      radius: shape.radius,
      fill: shape.fill,
      border: shape.border,
      darkText: !!shape.darkText,
      fontFamily: shape.fontFamily || 'system',
      fontWeight: scale.fontWeight,
      fontScale: scale.fontScale,
      uppercase: scale.uppercase,
    },
  }))
);

// A short curated slice (one scale-spread per handful of shapes) for
// anywhere that wants a quick "greatest hits" set instead of the full
// generated gallery — currently unused by ShareStorySheet (which browses
// the full list) but kept available for future compact pickers.
export const BODY_STYLE_HIGHLIGHTS = BODY_STYLE_PRESETS.filter((p) =>
  ['glass--bold', 'sharp-mono--big', 'paper-card--regular', 'outline--huge', 'neon-edge--bold', 'bubble--massive', 'gradient-wash--big', 'terminal--bold'].includes(p.id)
);

export function getPresetById(list, id) {
  return list.find((p) => p.id === id) || list[0];
}
