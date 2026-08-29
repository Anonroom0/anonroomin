/** ===========================================================================
 * STORY IMAGE GENERATOR (v2)
 * ============================================================================
 * Renders a shareable 1080x1920 (IG/NGL story) PNG using an offscreen
 * <canvas>, for two content shapes ("kinds"):
 *
 *   kind: 'question' — header badge "QUESTION" (or the existing PERSONAL /
 *         ASK ME ANYTHING label), body = the question text, bold.
 *   kind: 'reply'     — header badge "REPLY", a small quoted excerpt of the
 *         ORIGINAL question above the fold, body = the reply text, bold.
 *         This is the "share an answer you received" card — the loop this
 *         app's Ask-Me flow is built around.
 *
 * Both kinds share: a bottom-center Anonroom wordmark/logo, and a reserved
 * empty band above it where nothing is drawn on purpose — that's where
 * Instagram's own link sticker gets dropped in by hand after sharing (see
 * LINK_ZONE below). ShareStorySheet.jsx additionally overlays a dashed guide
 * for that same band in the on-screen *preview* only — never baked into the
 * exported PNG, since a dashed placeholder box would show up as a visible
 * artifact in the final posted story.
 *
 * Every visual choice (header color / background / body style) is looked up
 * from storyStylePresets.js by id, so the picker in ShareStorySheet just
 * passes three ids in and never touches drawing code.
 *
 * generateStoryImage({ kind, questionText, replyText, questionType,
 *                       headerColorId, backgroundId, bodyStyleId })
 *   -> Promise<Blob>   (image/png)
 * generateQuestionStoryImage(...)  -> back-compat alias, kind: 'question'
 * shareStoryImage(blob, opts)       -> Promise<void>  (OS share / download)
 * LINK_ZONE                         -> {x,y,width,height} in canvas px, for
 *                                      ShareStorySheet's preview overlay
 * CANVAS_WIDTH / CANVAS_HEIGHT      -> 1080 / 1920, exported so
 *                                      ShareStorySheet can convert LINK_ZONE
 *                                      into preview-relative percentages
 *                                      without hardcoding canvas size twice
 * ========================================================================= */

import { HEADER_COLOR_PRESETS, BACKGROUND_PRESETS, BODY_STYLE_PRESETS, getPresetById } from './storyStylePresets';
import { shareToInstagramStories } from './instagramShare';

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

// Reserved band for the manually-placed IG link sticker. Sits between the
// body card and the footer logo on every template so it never overlaps
// either. Exposed so the preview overlay in ShareStorySheet.jsx can draw a
// guide box in exactly the same place the export leaves empty.
// Kept deliberately small + centered — Instagram's actual link sticker is a
// compact pill, not a full-width band, so the guide (and the empty space
// reserved for it in the export) matches that real footprint instead of
// eating most of the canvas width.
const LINK_ZONE_WIDTH = 360;
const LINK_ZONE_HEIGHT = 96;
export const LINK_ZONE = {
  x: (CANVAS_WIDTH - LINK_ZONE_WIDTH) / 2,
  y: 1640,
  width: LINK_ZONE_WIDTH,
  height: LINK_ZONE_HEIGHT,
};

const LOGO_URL = '/logo.png'; // public/logo.png — see file banner
let logoImagePromise = null;

function loadLogo() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      // A missing/not-yet-added asset shouldn't block sharing — footer falls back
      // to a bold wordmark drawn in-canvas instead (see drawFooterLogo).
      img.onerror = () => resolve(null);
      img.src = LOGO_URL;
    });
  }
  return logoImagePromise;
}

// ---------------------------------------------------------------------------
// Token fallbacks (only used by preset entries that reference a named token
// instead of a literal hex, e.g. body-style 'ink-2' fill)
// ---------------------------------------------------------------------------
function getToken(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getTokens() {
  return {
    ink: getToken('--ink', '#0C0D10'),
    ink2: getToken('--ink-2', '#1C1D24'),
    paper: getToken('--paper', '#F4F3F0'),
    dim: getToken('--dim', '#8B8B96'),
    ember: getToken('--ember', '#FF6B35'),
  };
}

// ---------------------------------------------------------------------------
// Canvas drawing utilities
// ---------------------------------------------------------------------------
function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = typeof radius === 'number' ? { tl: radius, tr: radius, br: radius, bl: radius } : radius;
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + width - r.tr, y);
  ctx.arcTo(x + width, y, x + width, y + r.tr, r.tr);
  ctx.lineTo(x + width, y + height - r.br);
  ctx.arcTo(x + width, y + height, x + width - r.br, y + height, r.br);
  ctx.lineTo(x + r.bl, y + height);
  ctx.arcTo(x, y + height, x, y + height - r.bl, r.bl);
  ctx.lineTo(x + r.tl, y);
  ctx.arcTo(x, y, x + r.tl, y, r.tl);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(ctx, text, { x, y, maxWidth, lineHeight, align = 'left' }) {
  ctx.textAlign = align;
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — used by the confetti/scatter-style
// patterns so re-rendering the same preset (e.g. live preview updates as
// text changes) always scatters shapes in the same spots instead of
// reshuffling on every keystroke.
// ---------------------------------------------------------------------------
function seededRandom(seed) {
  let t = seed;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFETTI_PALETTE = ['#FF6B35', '#8B5CF6', '#2DD4A7', '#F5C64B', '#FB7EC0', '#3B82F6'];

// ---------------------------------------------------------------------------
// Background — flat fills, gradients, and full-bleed repeating patterns.
// ---------------------------------------------------------------------------
function drawBackground(ctx, backgroundPreset) {
  const { type, colors, overlay, dotColor } = backgroundPreset;
  const base = colors[0];
  const accent = colors[1];

  if (type === 'solid') {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }

  if (type === 'linear') {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, base);
    g.addColorStop(1, accent);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }

  if (type === 'radial') {
    const g = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.28, 60, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.28, CANVAS_WIDTH * 0.9);
    g.addColorStop(0, base);
    g.addColorStop(1, accent);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (overlay) {
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    return;
  }

  // Every pattern below starts with a flat base fill, then layers a
  // repeating motif on top — same shape as the old 'dots' branch.
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (type === 'dots') {
    ctx.fillStyle = dotColor || 'rgba(255,255,255,0.08)';
    const spacing = 56;
    for (let yy = spacing; yy < CANVAS_HEIGHT; yy += spacing) {
      for (let xx = spacing; xx < CANVAS_WIDTH; xx += spacing) {
        ctx.beginPath();
        ctx.arc(xx, yy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'stripes') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clip();
    ctx.fillStyle = accent || 'rgba(255,255,255,0.10)';
    const diagonal = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.rotate((-22 * Math.PI) / 180);
    ctx.translate(-diagonal / 2, -diagonal / 2);
    const stripeW = 70;
    const gapW = 70;
    for (let x = 0; x < diagonal * 1.6; x += stripeW + gapW) {
      ctx.fillRect(x, -diagonal * 0.5, stripeW, diagonal * 2);
    }
    ctx.restore();
  } else if (type === 'grid') {
    ctx.strokeStyle = dotColor || 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    const spacing = 60;
    ctx.beginPath();
    for (let x = 0; x <= CANVAS_WIDTH; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); }
    for (let y = 0; y <= CANVAS_HEIGHT; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); }
    ctx.stroke();
  } else if (type === 'checker') {
    ctx.fillStyle = accent || 'rgba(255,255,255,0.06)';
    const size = 90;
    for (let yy = 0, row = 0; yy < CANVAS_HEIGHT; yy += size, row += 1) {
      for (let xx = row % 2 === 0 ? 0 : size; xx < CANVAS_WIDTH; xx += size * 2) {
        ctx.fillRect(xx, yy, size, size);
      }
    }
  } else if (type === 'crosshatch') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clip();
    ctx.strokeStyle = dotColor || 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    const spacing = 50;
    const diagonal = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    [45, -45].forEach((angle) => {
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.beginPath();
      for (let x = -diagonal; x < diagonal; x += spacing) {
        ctx.moveTo(x, -diagonal);
        ctx.lineTo(x, diagonal);
      }
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  } else if (type === 'confetti') {
    const rand = seededRandom(1337);
    for (let i = 0; i < 140; i += 1) {
      const x = rand() * CANVAS_WIDTH;
      const y = rand() * CANVAS_HEIGHT;
      const r = 4 + rand() * 9;
      ctx.globalAlpha = 0.45 + rand() * 0.3;
      ctx.fillStyle = CONFETTI_PALETTE[Math.floor(rand() * CONFETTI_PALETTE.length)];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (type === 'waves') {
    ctx.strokeStyle = dotColor || 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 3;
    for (let row = 0; row < 14; row += 1) {
      const baseY = row * 150 + 40;
      ctx.beginPath();
      for (let x = 0; x <= CANVAS_WIDTH; x += 20) {
        const y = baseY + Math.sin((x / CANVAS_WIDTH) * Math.PI * 4 + row) * 18;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (type === 'sunburst') {
    const cx = CANVAS_WIDTH / 2;
    const cy = -200;
    const rays = 24;
    const radius = CANVAS_HEIGHT * 1.8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clip();
    ctx.fillStyle = accent || 'rgba(255,255,255,0.08)';
    for (let i = 0; i < rays; i += 2) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = ((i + 1) / rays) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (type === 'halftone') {
    ctx.fillStyle = dotColor || 'rgba(255,255,255,0.10)';
    const spacing = 40;
    for (let yy = spacing, row = 0; yy < CANVAS_HEIGHT; yy += spacing, row += 1) {
      for (let xx = spacing; xx < CANVAS_WIDTH; xx += spacing) {
        const r = row % 2 === 0 ? 5 : 2.4;
        ctx.beginPath();
        ctx.arc(xx, yy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'pinstripe') {
    ctx.strokeStyle = dotColor || 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 30; x < CANVAS_WIDTH; x += 34) { ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Header badge + "Reply anonymously" pill (shared shape, driven by the
// header-color preset)
// ---------------------------------------------------------------------------
function drawTypeBadge(ctx, { x, y, label, headerPreset }) {
  ctx.font = '900 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const paddingX = 22;
  const paddingY = 14;
  const spaced = label.split('').join('\u200a\u200a');
  const textWidth = ctx.measureText(spaced).width;
  const w = textWidth + paddingX * 2;
  const h = 26 + paddingY * 2;

  roundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = headerPreset.pillBg;
  ctx.fill();

  ctx.fillStyle = headerPreset.pillText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(spaced, x + paddingX, y + h / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return { width: w, height: h };
}

function drawReplyPill(ctx, { x, y, headerPreset, fontSize = 30 }) {
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const label = 'Reply anonymously \u2192';
  const paddingX = 40;
  const paddingY = 22;
  const textWidth = ctx.measureText(label).width;
  const pillWidth = textWidth + paddingX * 2;
  const pillHeight = fontSize + paddingY * 2;

  roundedRectPath(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = headerPreset.pillBg;
  ctx.fill();

  ctx.fillStyle = headerPreset.pillText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + pillWidth / 2, y + pillHeight / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return { width: pillWidth, height: pillHeight };
}

// ---------------------------------------------------------------------------
// Body card — fill/border/shape resolved from the body-style preset
// ---------------------------------------------------------------------------
function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return hex; // already rgba()/named — pass through
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 'gradient-header' and 'radial-glow' need the card's bounding box + the
// header preset's color, so those two are drawn directly in drawBodyCard
// instead of resolving to a plain fillStyle string here.
function resolveFill(fillKind, tokens) {
  if (fillKind === 'ink-2') return tokens.ink2;
  if (fillKind === 'paper') return tokens.paper;
  if (fillKind === 'glass') return 'rgba(255,255,255,0.07)';
  return null; // 'none' | 'gradient-header' | 'radial-glow'
}

function applyBorder(ctx, borderKind, tokens) {
  if (borderKind === 'none' || borderKind === 'double') return false; // 'double' is hand-drawn in drawBodyCard
  if (borderKind === 'glass') { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; return true; }
  if (borderKind === 'ember-thin') { ctx.lineWidth = 2; ctx.strokeStyle = tokens.ember; return true; }
  if (borderKind === 'ember-thick') { ctx.lineWidth = 6; ctx.strokeStyle = tokens.ember; return true; }
  if (borderKind === 'glow') {
    ctx.lineWidth = 3;
    ctx.strokeStyle = tokens.ember;
    ctx.shadowColor = tokens.ember;
    ctx.shadowBlur = 30;
    return true;
  }
  return false;
}

/**
 * Draws the body card and returns { textColor } so callers know whether to
 * flip to dark text (paper-card) or keep paper-on-dark (everything else).
 */
function drawBodyCard(ctx, { x, y, width, height, bodyPreset, tokens, headerPreset }) {
  ctx.save();

  if (bodyPreset.rotate) {
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((bodyPreset.rotate * Math.PI) / 180);
    ctx.translate(-(x + width / 2), -(y + height / 2));
  }

  if (bodyPreset.textOnly) {
    // No card at all — text sits straight on the background with a heavy
    // drop shadow so it stays legible over any of the 10 backgrounds.
    ctx.restore();
    return { textColor: tokens.paper, dropShadow: true };
  }

  if (bodyPreset.stacked) {
    // A second, slightly offset card behind the main one for a layered look.
    roundedRectPath(ctx, x + 14, y + 18, width, height, bodyPreset.radius);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
  }

  if (bodyPreset.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
  }

  const fill = resolveFill(bodyPreset.fill, tokens);
  roundedRectPath(ctx, x, y, width, height, bodyPreset.radius);
  if (bodyPreset.fill === 'gradient-header') {
    const g = ctx.createLinearGradient(x, y, x, y + height);
    g.addColorStop(0, hexToRgba(headerPreset.pillBg, 0.38));
    g.addColorStop(1, tokens.ink2);
    ctx.fillStyle = g;
    ctx.fill();
  } else if (bodyPreset.fill === 'radial-glow') {
    const g = ctx.createRadialGradient(x + width / 2, y + height * 0.32, 10, x + width / 2, y + height * 0.32, width * 0.85);
    g.addColorStop(0, hexToRgba(headerPreset.pillBg, 0.5));
    g.addColorStop(1, tokens.ink2);
    ctx.fillStyle = g;
    ctx.fill();
  } else if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (bodyPreset.confetti) {
    // Small scattered dots clipped to the card, sitting behind the text —
    // a "confetti stamp" decoration rather than a full-bleed pattern.
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, bodyPreset.radius);
    ctx.clip();
    const rand = seededRandom(77);
    const palette = [headerPreset.pillBg, 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.14)'];
    for (let i = 0; i < 24; i += 1) {
      const cx = x + rand() * width;
      const cy = y + rand() * height;
      const r = 3 + rand() * 7;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = palette[i % palette.length];
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  if (bodyPreset.border === 'double') {
    // Two concentric strokes — a thin outer glass line + a tighter ember
    // inner line — instead of the single-stroke treatment applyBorder does.
    roundedRectPath(ctx, x, y, width, height, bodyPreset.radius);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    const inset = 10;
    roundedRectPath(ctx, x + inset, y + inset, width - inset * 2, height - inset * 2, Math.max(0, bodyPreset.radius - inset));
    ctx.lineWidth = 3;
    ctx.strokeStyle = tokens.ember;
    ctx.stroke();
  }

  if (bodyPreset.blockHeader) {
    // A solid header-color block fused to the card's top edge — bold,
    // poster-like division between badge and body.
    roundedRectPath(ctx, x, y, width, 100, { tl: bodyPreset.radius, tr: bodyPreset.radius, br: 0, bl: 0 });
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fill();
  }

  if (bodyPreset.ribbon) {
    roundedRectPath(ctx, x, y, 14, height, { tl: bodyPreset.radius, tr: 0, br: 0, bl: bodyPreset.radius });
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fill();
  }

  const hadBorder = applyBorder(ctx, bodyPreset.border, tokens);
  if (hadBorder) {
    roundedRectPath(ctx, x, y, width, height, bodyPreset.radius);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  if (bodyPreset.taped) {
    // Two small "tape" marks at the top corners.
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.translate(x + 46, y - 6);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.fillRect(-30, -14, 60, 28);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.translate(x + width - 46, y - 6);
    ctx.rotate((8 * Math.PI) / 180);
    ctx.fillRect(-30, -14, 60, 28);
    ctx.restore();
  }

  ctx.restore();
  return { textColor: bodyPreset.darkText ? tokens.ink : tokens.paper, dropShadow: false };
}

// ---------------------------------------------------------------------------
// Footer — bottom-center Anonroom logo (falls back to a bold wordmark if
// public/logo.png hasn't been added yet)
// ---------------------------------------------------------------------------
async function drawFooterLogo(ctx, tokens) {
  const logo = await loadLogo();
  const centerX = CANVAS_WIDTH / 2;
  const footerY = CANVAS_HEIGHT - 96;

  if (logo) {
    const targetH = 64;
    const targetW = (logo.width / logo.height) * targetH;
    ctx.drawImage(logo, centerX - targetW / 2, footerY - targetH / 2, targetW, targetH);
    return;
  }

  ctx.font = '900 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = tokens.paper;
  ctx.textAlign = 'center';
  ctx.fillText('ANONROOM', centerX, footerY + 12);
}

// ---------------------------------------------------------------------------
// Typography helpers — turn a body-style preset's fontFamily/fontWeight/
// fontScale/uppercase into the concrete canvas font string + text to draw.
// ---------------------------------------------------------------------------
const FONT_STACKS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
};

function fontStack(bodyPreset) {
  return FONT_STACKS[bodyPreset.fontFamily] || FONT_STACKS.system;
}

function headlineFont(bodyPreset, basePx) {
  const weight = bodyPreset.fontWeight || 900;
  const size = Math.round(basePx * (bodyPreset.fontScale || 1));
  return { css: `${weight} ${size}px ${fontStack(bodyPreset)}`, size };
}

function displayText(text, bodyPreset) {
  return bodyPreset.uppercase ? (text || '').toUpperCase() : text;
}

// ---------------------------------------------------------------------------
// Layout — 'question' kind
// ---------------------------------------------------------------------------
function drawQuestionSlide(ctx, { questionText, questionType, headerPreset, bodyPreset, tokens }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 72;
  const cardY = 520;

  const bodyDisplay = displayText(questionText, bodyPreset);
  const { css: headlineCss, size: headlineSize } = headlineFont(bodyPreset, 60);
  ctx.font = headlineCss;
  const textLines = wrapText(ctx, bodyDisplay, cardWidth - cardPadding * 2);
  const lineHeight = Math.round(headlineSize * 1.233 * (bodyPreset.leadingMult || 1));
  const badgeSpace = bodyPreset.blockHeader ? 130 : 96;
  const cardHeight = cardPadding * 2 + badgeSpace + textLines.length * lineHeight;

  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  const label = questionType === 'personal' ? 'PERSONAL QUESTION' : 'QUESTION';
  if (!bodyPreset.textOnly) {
    drawTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + cardPadding - 10, label, headerPreset });
  }

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = headlineCss;
  drawWrappedText(ctx, bodyDisplay, {
    x: cardX + cardPadding,
    y: cardY + cardPadding + badgeSpace,
    maxWidth: cardWidth - cardPadding * 2,
    lineHeight,
    align: 'left',
  });
  ctx.shadowBlur = 0;

  const pillY = cardY + cardHeight + 56;
  const { width: pillWidth } = drawReplyPill(ctx, { x: (CANVAS_WIDTH - 480) / 2, y: pillY, headerPreset, fontSize: 32 });
  ctx.clearRect(0, pillY - 4, CANVAS_WIDTH, 100);
  drawReplyPill(ctx, { x: (CANVAS_WIDTH - pillWidth) / 2, y: pillY, headerPreset, fontSize: 32 });
}

// ---------------------------------------------------------------------------
// Layout — 'reply' kind (share-an-answer-you-received card)
// ---------------------------------------------------------------------------
function drawReplySlide(ctx, { questionText, replyText, headerPreset, bodyPreset, tokens }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 68;
  const cardY = 420;

  // Quoted excerpt of the original question, small + dim, sits above the
  // main reply text so whoever sees the story knows what was being asked.
  // Scales only gently with the preset (a mild fraction of the full swing)
  // so it always stays visually secondary to the reply itself.
  const excerptScale = 1 + ((bodyPreset.fontScale || 1) - 1) * 0.35;
  ctx.font = `700 ${Math.round(30 * excerptScale)}px ${fontStack(bodyPreset)}`;
  const excerptMax = 160;
  const excerpt = questionText.length > excerptMax ? `${questionText.slice(0, excerptMax).trim()}…` : questionText;
  const excerptLines = wrapText(ctx, `"${excerpt}"`, cardWidth - cardPadding * 2);
  const excerptLineHeight = Math.round(40 * excerptScale);

  const replyDisplay = displayText(replyText, bodyPreset);
  const { css: replyCss, size: replySize } = headlineFont(bodyPreset, 56);
  ctx.font = replyCss;
  const replyLines = wrapText(ctx, replyDisplay, cardWidth - cardPadding * 2);
  const replyLineHeight = Math.round(replySize * 1.25 * (bodyPreset.leadingMult || 1));

  const badgeSpace = bodyPreset.blockHeader ? 130 : 96;
  const excerptBlock = excerptLines.length * excerptLineHeight + 34;
  const cardHeight = cardPadding * 2 + badgeSpace + excerptBlock + replyLines.length * replyLineHeight;

  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  if (!bodyPreset.textOnly) {
    drawTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + cardPadding - 10, label: 'REPLY', headerPreset });
  }

  let cursorY = cardY + cardPadding + badgeSpace;

  ctx.fillStyle = bodyPreset.darkText ? 'rgba(12,13,16,0.6)' : tokens.dim;
  ctx.font = `700 ${Math.round(30 * excerptScale)}px ${fontStack(bodyPreset)}`;
  drawWrappedText(ctx, `"${excerpt}"`, { x: cardX + cardPadding, y: cursorY, maxWidth: cardWidth - cardPadding * 2, lineHeight: excerptLineHeight, align: 'left' });
  cursorY += excerptBlock;

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = replyCss;
  drawWrappedText(ctx, replyDisplay, { x: cardX + cardPadding, y: cursorY, maxWidth: cardWidth - cardPadding * 2, lineHeight: replyLineHeight, align: 'left' });
  ctx.shadowBlur = 0;

  const pillY = cardY + cardHeight + 56;
  const { width: pillWidth } = drawReplyPill(ctx, { x: (CANVAS_WIDTH - 480) / 2, y: pillY, headerPreset, fontSize: 32 });
  ctx.clearRect(0, pillY - 4, CANVAS_WIDTH, 100);
  drawReplyPill(ctx, { x: (CANVAS_WIDTH - pillWidth) / 2, y: pillY, headerPreset, fontSize: 32 });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function generateStoryImage({
  kind = 'question',
  questionText = '',
  replyText = '',
  questionType,
  headerColorId,
  backgroundId,
  bodyStyleId,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  const tokens = getTokens();
  const headerPreset = getPresetById(HEADER_COLOR_PRESETS, headerColorId);
  const backgroundPreset = getPresetById(BACKGROUND_PRESETS, backgroundId);
  const bodyPreset = getPresetById(BODY_STYLE_PRESETS, bodyStyleId);

  drawBackground(ctx, backgroundPreset);

  if (kind === 'reply') {
    drawReplySlide(ctx, { questionText, replyText, headerPreset, bodyPreset, tokens });
  } else {
    drawQuestionSlide(ctx, { questionText, questionType, headerPreset, bodyPreset, tokens });
  }

  // LINK_ZONE (between card bottom and footer) is intentionally left blank —
  // that's where the IG link sticker goes by hand. Nothing draws there.

  await drawFooterLogo(ctx, tokens);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null.'));
    }, 'image/png');
  });
}

// Back-compat: ShareStorySheet / StoryViewer callers using the old question-
// only export keep working unchanged.
export async function generateQuestionStoryImage({ questionText, questionType, template, ...rest }) {
  return generateStoryImage({ kind: 'question', questionText, questionType, ...rest });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares a generated story image. Tries, in order:
 *   1. Direct-to-Instagram-Stories (iOS only, best-effort — see
 *      instagramShare.js for exactly what this can and can't do, and why
 *      "skip the picker on every platform" and "auto-attach a trending
 *      song" aren't things any web app can actually do).
 *   2. The native OS share sheet (navigator.share) — Instagram shows up as
 *      one of the targets here on both iOS and Android.
 *   3. A plain PNG download, if neither is available.
 */
export async function shareStoryImage(blob, { title, tryInstagramDirect = true } = {}) {
  if (tryInstagramDirect) {
    const handled = await shareToInstagramStories(blob);
    if (handled) return;
  }

  const file = new File([blob], 'anonroom-story.png', { type: 'image/png' });
  const canUseNativeShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canUseNativeShare) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }

  downloadBlob(blob, 'anonroom-story.png');
}
