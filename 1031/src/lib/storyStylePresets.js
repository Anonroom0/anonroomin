/** ===========================================================================
 * STORY STYLE PRESETS
 * ============================================================================
 * Replaces the old TEMPLATES ('bold-center' / 'sticky-note' / 'gradient-card')
 * picker in ShareStorySheet with three independent, swipeable preset lists —
 * Header Color, Background, and Body Style — 10 entries each, so someone can
 * mix and match (10 x 10 x 10 = 1,000 combinations) instead of choosing one
 * fixed layout.
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
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 1. HEADER COLOR — the small type badge ("QUESTION" / "REPLY") background +
//    text color, and the "Reply anonymously" pill's fill.
// ---------------------------------------------------------------------------
export const HEADER_COLOR_PRESETS = [
  { id: 'ember', name: 'Ember', pillBg: '#FF6B35', pillText: '#0C0D10' },
  { id: 'crimson', name: 'Crimson', pillBg: '#E63950', pillText: '#FFFFFF' },
  { id: 'violet', name: 'Violet', pillBg: '#8B5CF6', pillText: '#FFFFFF' },
  { id: 'cobalt', name: 'Cobalt', pillBg: '#3B82F6', pillText: '#FFFFFF' },
  { id: 'mint', name: 'Mint', pillBg: '#2DD4A7', pillText: '#0C0D10' },
  { id: 'gold', name: 'Gold', pillBg: '#F5C64B', pillText: '#0C0D10' },
  { id: 'rose', name: 'Rose', pillBg: '#FB7EC0', pillText: '#0C0D10' },
  { id: 'lime', name: 'Lime', pillBg: '#C6F135', pillText: '#0C0D10' },
  { id: 'slate', name: 'Slate', pillBg: '#E7E7EE', pillText: '#0C0D10' },
  { id: 'blackout', name: 'Blackout', pillBg: '#0C0D10', pillText: '#F4F3F0' },
];

// ---------------------------------------------------------------------------
// 2. BACKGROUND — the full 1080x1920 canvas fill, drawn before the body card.
//    type: 'solid' | 'linear' | 'radial' | 'dots'
// ---------------------------------------------------------------------------
export const BACKGROUND_PRESETS = [
  { id: 'ink', name: 'Ink', type: 'solid', colors: ['#0C0D10'] },
  { id: 'dusk', name: 'Dusk', type: 'linear', colors: ['#0C0D10', '#23242E'] },
  { id: 'ember-glow', name: 'Ember Glow', type: 'radial', colors: ['#FF6B35', '#0C0D10'], overlay: 'rgba(12,13,16,0.82)' },
  { id: 'deep-violet', name: 'Deep Violet', type: 'linear', colors: ['#1A1033', '#0C0D10'] },
  { id: 'ocean-fade', name: 'Ocean Fade', type: 'linear', colors: ['#061C2E', '#0C0D10'] },
  { id: 'blackout', name: 'Blackout', type: 'solid', colors: ['#000000'] },
  { id: 'paper-flip', name: 'Paper Flip', type: 'solid', colors: ['#F4F3F0'], light: true },
  { id: 'duotone-crimson', name: 'Duotone Crimson', type: 'linear', colors: ['#3A0E14', '#0C0D10'] },
  { id: 'aurora', name: 'Aurora', type: 'radial', colors: ['#8B5CF6', '#0C0D10'], overlay: 'rgba(12,13,16,0.75)' },
  { id: 'noise-dots', name: 'Dot Grid', type: 'dots', colors: ['#0C0D10'], dotColor: 'rgba(255,255,255,0.08)' },
];

// ---------------------------------------------------------------------------
// 3. BODY STYLE — how the text card itself is drawn: shape, fill, border,
//    shadow. Each is a meaningfully different silhouette, not just a recolor.
// ---------------------------------------------------------------------------
export const BODY_STYLE_PRESETS = [
  { id: 'glass', name: 'Glass', radius: 48, fill: 'glass', border: 'glass', shadow: true },
  { id: 'sharp-mono', name: 'Sharp Mono', radius: 8, fill: 'ink-2', border: 'ember-thin', shadow: false },
  { id: 'paper-card', name: 'Paper Card', radius: 40, fill: 'paper', border: 'none', shadow: true, darkText: true },
  { id: 'outline', name: 'Outline', radius: 40, fill: 'none', border: 'ember-thick', shadow: false },
  { id: 'neon-edge', name: 'Neon Edge', radius: 32, fill: 'ink-2', border: 'glow', shadow: false },
  { id: 'stacked', name: 'Stacked', radius: 36, fill: 'glass', border: 'glass', shadow: true, stacked: true },
  { id: 'ribbon', name: 'Ribbon', radius: 28, fill: 'ink-2', border: 'glass', shadow: true, ribbon: true },
  { id: 'taped', name: 'Taped', radius: 20, fill: 'glass', border: 'glass', shadow: true, rotate: -3, taped: true },
  { id: 'block-label', name: 'Block Label', radius: 0, fill: 'ink-2', border: 'none', shadow: false, blockHeader: true },
  { id: 'minimal-text', name: 'Minimal', radius: 0, fill: 'none', border: 'none', shadow: false, textOnly: true },
];

export function getPresetById(list, id) {
  return list.find((p) => p.id === id) || list[0];
}
