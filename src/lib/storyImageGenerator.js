/** ===========================================================================
 * STORY IMAGE GENERATOR (v3)
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
 *   kind: 'message'   — no text badge. Instead, a circular avatar + sender
 *         name row (drawAvatarNameHeader) sits in its own row directly
 *         above the card — outside it, not sharing its padding — so the
 *         sender's identity can never overlap the message text below.
 *         Used for "Share as Story" on a GroupChat message/confession —
 *         see GroupChat.jsx. Fully re-skinnable via the same Background/
 *         Colour/Shape/Size presets as 'question' and 'reply'.
 *
 * All three kinds share: a bottom-center Anonroom wordmark/logo, and a reserved
 * empty band above it where nothing is drawn on purpose — that's where
 * Instagram's own link sticker gets dropped in by hand after sharing (see
 * LINK_ZONE below). ShareStorySheet.jsx additionally overlays a dashed guide
 * for that same band in the on-screen *preview* only — never baked into the
 * exported PNG, since a dashed placeholder box would show up as a visible
 * artifact in the final posted story.
 *
 * v3 adds a second `template === 'tweet'` ("Standard") look, chosen via the
 * new `standardStyle` param:
 *   - standardStyle: 'normal' (NEW, default) — drawNormalSlide, below: a
 *     confession-bubble-style card with a coloured tag header (Question /
 *     Reply / Confession / Message each get their own gradient — see
 *     defaultTagInfo, which mirrors ShareStorySheet.jsx's own getTagInfo so
 *     the sheet's preview and the export can never disagree), a solid grey
 *     body, and the shared text rendered white-fill/black-outline
 *     (sticker-text) so it stays legible over anything. No CTA pill, no
 *     fake engagement row — just the card and the shared footer logo.
 *   - standardStyle: 'tweet' — the original fixed realistic-post preset
 *     (drawTweetSlide), unchanged.
 *
 * Every visual choice for the Basic template is looked up/derived from
 * storyStylePresets.js by id — a Background structure + an accent Colour
 * (combined at render time via buildThemeRuntime, below, into the concrete
 * header-badge color and background fill — see storyStylePresets.js's file
 * banner for why v5 split these two apart instead of shipping fixed pairs),
 * a Shape (the card's silhouette), and a Scale (how bold/big the text
 * reads). The picker in ShareStorySheet just passes four ids in and never
 * touches drawing code.
 *
 * generateStoryImage({ kind, questionText, replyText, questionType,
 *                       backgroundId, colorId, shapeId, scaleId, template,
 *                       standardStyle, tagLabel, tagGradientFrom,
 *                       tagGradientTo })
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

import { BACKGROUND_STRUCTURES, ACCENT_COLORS, BODY_SHAPES, BODY_SCALES, mergeBodyPreset, getPresetById } from './storyStylePresets';
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

// Vertical zone the card is allowed to occupy. Every slide layout below
// sizes + fits its text inside this budget and then centers the resulting
// card within it, instead of starting at a fixed Y and growing downward
// unbounded — that's what used to let a long message push the card past
// LINK_ZONE/the footer. WITH_CTA is for the two slide kinds that draw a
// "Reply anonymously" pill below the card (question, reply); NO_CTA is for
// 'message' and the new 'normal' Standard style, neither of which draws one.
const CARD_SAFE_TOP = 210;
const CARD_SAFE_BOTTOM_NO_CTA = LINK_ZONE.y - 60;
const CARD_SAFE_BOTTOM_WITH_CTA = LINK_ZONE.y - 60 - 150; // reserves room for the pill + its gap below the card
const CARD_SAFE_HEIGHT_NO_CTA = CARD_SAFE_BOTTOM_NO_CTA - CARD_SAFE_TOP;
const CARD_SAFE_HEIGHT_WITH_CTA = CARD_SAFE_BOTTOM_WITH_CTA - CARD_SAFE_TOP;

// Centers a card of `cardHeight` inside a [CARD_SAFE_TOP, safeBottom]
// budget it's already been fitted to (cardHeight <= safeHeight is
// guaranteed by fitTextBlock upstream) — this is what gives short
// messages a balanced, intentional composition instead of sitting stuck
// near the top with a dead gap below, and gives long ones the same
// centered feel instead of stretching toward the footer.
function centeredCardY(cardHeight, safeHeight) {
  return Math.round(CARD_SAFE_TOP + Math.max(0, safeHeight - cardHeight) / 2);
}

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

// Loads a sender's pfp for the 'message' kind's avatar+name header.
// crossOrigin is required so the canvas can still be exported (toBlob) once
// an external image has been drawn onto it — without it, a remote Supabase
// Storage avatar would "taint" the canvas and toBlob would throw. If the
// avatar is missing or the load fails for any reason (CORS, 404, no
// avatar_url at all), this resolves null and drawAvatarNameHeader falls
// back to an initials circle instead of blocking the whole render.
function loadAvatarImage(url) {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
  // Newlines are treated as ordinary whitespace here (same as a space) —
  // \s+ already swallows them, so a literal newline the user typed never
  // forces its own line break; where lines actually break is decided
  // purely by available width, same as every other word.
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    // A single "word" with no whitespace in it at all (a long wallet
    // address, URL, or hash) can still be wider than maxWidth on its own —
    // wrapping only ever happened *between* words before, so a token like
    // this just overflowed straight past the card's edge instead of
    // wrapping. Break it into maxWidth-sized chunks by character instead,
    // the same way a text editor would, so it always stays inside the
    // card no matter how long it is.
    if (ctx.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      let chunk = '';
      for (const ch of word) {
        const candidateChunk = chunk + ch;
        if (ctx.measureText(candidateChunk).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = candidateChunk;
        }
      }
      current = chunk;
      continue;
    }

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

// Draws lines that were already computed (by fitTextBlock, below) instead
// of re-wrapping raw text — keeps the drawn output in exact sync with
// whatever size/wrap/truncation fitTextBlock decided on.
function drawLines(ctx, lines, { x, y, lineHeight, align = 'left' }) {
  ctx.textAlign = align;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
}

// ---------------------------------------------------------------------------
// Auto-fit typography. A body-style Scale (Cozy…Ultra, see
// storyStylePresets.js) used to set one fixed font size that the card grew
// to fit, with no ceiling — so a long question at a big Scale could push
// the card taller than the space actually available above the reserved
// link zone, spilling the last lines off the bottom of the canvas or under
// the footer (exactly the "half question showing" bug). fitTextBlock
// inverts that: it's handed a fixed vertical budget (maxHeight) and starts
// at the Scale's chosen size, stepping the font size *down* — never the
// card past its budget — until every line fits. A composer's character cap
// (280 for a question, 500 for a confession/message) fits comfortably even
// at the floor size, so in normal use this only ever gently softens the
// biggest Scale on the longest messages; the tail-truncation below is a
// last-resort safety net, not the common path.
// ---------------------------------------------------------------------------
function fitTextBlock(ctx, text, { fontFamily, weight, uppercase, maxWidth, maxHeight, basePx, minPx, lineHeightRatio, leadingMult = 1 }) {
  const display = uppercase ? (text || '').toUpperCase() : (text || '');

  const measure = (px) => {
    ctx.font = `${weight} ${px}px ${fontFamily}`;
    const wrapped = wrapText(ctx, display, maxWidth);
    const lh = Math.max(1, Math.round(px * lineHeightRatio * leadingMult));
    return { wrapped, lh, height: wrapped.length * lh };
  };

  let size = basePx;
  let result = measure(size);
  while (result.height > maxHeight && size > minPx) {
    size -= 2;
    result = measure(size);
  }

  let lines = result.wrapped;
  const lineHeight = result.lh;

  // Safety net for text far past any composer's own character cap: clip to
  // however many lines the budget actually holds at the floor size and
  // ellipsize the last one, rather than ever drawing past maxHeight.
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  if (lines.length > maxLines) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}\u2026`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = `${last}\u2026`;
    lines = kept;
  }

  ctx.font = `${weight} ${size}px ${fontFamily}`;
  return { size, css: `${weight} ${size}px ${fontFamily}`, lines, lineHeight, display };
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
// theme's header color) — also picks up a few cues from the chosen body
// SHAPE (font family, corner sharpness, dashed outline) so the badge/pill
// reads as part of the same design family as the card instead of always
// being the one fixed rounded-pill regardless of what shape was picked.
// ---------------------------------------------------------------------------
function badgeRadius(height, bodyPreset) {
  // Sharp/blocky shapes (radius 0-12) get a matching near-square badge;
  // everything else keeps the fully-rounded pill look.
  if (bodyPreset && bodyPreset.radius <= 12) return Math.min(8, height / 2);
  return height / 2;
}

function strokeDashedIfNeeded(ctx, bodyPreset, tokens) {
  if (!bodyPreset || bodyPreset.border !== 'dashed') return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = tokens.ember;
  ctx.stroke();
  ctx.restore();
}

function drawTypeBadge(ctx, { x, y, label, headerPreset, bodyPreset, tokens }) {
  ctx.font = `900 26px ${fontStack(bodyPreset || {})}`;
  const paddingX = 22;
  const paddingY = 14;
  const spaced = label.split('').join('\u200a\u200a');
  const textWidth = ctx.measureText(spaced).width;
  const w = textWidth + paddingX * 2;
  const h = 26 + paddingY * 2;
  const radius = badgeRadius(h, bodyPreset);

  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = headerPreset.pillBg;
  ctx.fill();
  roundedRectPath(ctx, x, y, w, h, radius);
  strokeDashedIfNeeded(ctx, bodyPreset, tokens);

  ctx.fillStyle = headerPreset.pillText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(spaced, x + paddingX, y + h / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return { width: w, height: h };
}

function drawReplyPill(ctx, { x, y, headerPreset, bodyPreset, tokens, fontSize = 30 }) {
  ctx.font = `900 ${fontSize}px ${fontStack(bodyPreset || {})}`;
  const label = 'Reply anonymously \u2192';
  const paddingX = 40;
  const paddingY = 22;
  const textWidth = ctx.measureText(label).width;
  const pillWidth = textWidth + paddingX * 2;
  const pillHeight = fontSize + paddingY * 2;
  const radius = badgeRadius(pillHeight, bodyPreset);

  roundedRectPath(ctx, x, y, pillWidth, pillHeight, radius);
  ctx.fillStyle = headerPreset.pillBg;
  ctx.fill();
  roundedRectPath(ctx, x, y, pillWidth, pillHeight, radius);
  strokeDashedIfNeeded(ctx, bodyPreset, tokens);

  ctx.fillStyle = headerPreset.pillText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + pillWidth / 2, y + pillHeight / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return { width: pillWidth, height: pillHeight };
}

function getInitialsForCanvas(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Avatar + name header — the 'message' kind's equivalent of drawTypeBadge:
// a circular pfp (or an initials-fallback circle, styled off the theme's
// header color) with the sender's name beside it, sitting at the top of the
// card exactly like a chat message. Drawn as its own separate element (not
// reusing drawTypeBadge's pill shape) since it's an image + name, not a
// text label.
// ---------------------------------------------------------------------------
function drawAvatarNameHeader(ctx, { x, y, size = 76, avatarImage, senderName, headerPreset, bodyPreset, tokens, standalone = false }) {
  const radius = size / 2;
  const cx = x + radius;
  const cy = y + radius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatarImage) {
    // Cover-fit into the circle (like CSS object-fit: cover) so a
    // non-square avatar never looks stretched.
    const imgRatio = avatarImage.width / avatarImage.height;
    let drawW = size;
    let drawH = size;
    let dx = x;
    let dy = y;
    if (imgRatio > 1) {
      drawH = size;
      drawW = size * imgRatio;
      dx = x - (drawW - size) / 2;
    } else {
      drawW = size;
      drawH = size / imgRatio;
      dy = y - (drawH - size) / 2;
    }
    ctx.drawImage(avatarImage, dx, dy, drawW, drawH);
  } else {
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = headerPreset.pillText;
    ctx.font = `900 ${Math.round(size * 0.4)}px ${fontStack(bodyPreset || {})}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitialsForCanvas(senderName), cx, cy + 2);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Thin ring around the avatar so it reads as a distinct circle even
  // against whatever sits behind it (the card fill, or — when standalone —
  // the page background).
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = standalone
    ? 'rgba(255,255,255,0.35)'
    : (bodyPreset.darkText ? 'rgba(12,13,16,0.25)' : 'rgba(255,255,255,0.25)');
  ctx.stroke();

  const nameFontPx = Math.round(size * 0.4);
  ctx.font = `800 ${nameFontPx}px ${fontStack(bodyPreset || {})}`;
  ctx.save();
  if (standalone) {
    // Sits directly on the page background (any accent/pattern the user
    // picked), not on the card fill — so it always uses the light paper
    // tone plus a soft shadow for legibility, instead of the card's
    // darkText-driven contrast logic below.
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = tokens.paper;
  } else {
    ctx.fillStyle = bodyPreset.darkText ? tokens.ink : tokens.paper;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(senderName || 'Anonymous', x + size + 24, cy + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  return size;
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

// ---------------------------------------------------------------------------
// Background + header color are both derived from a single ACCENT_COLORS
// pick, so a Background structure and an accent Colour can be combined
// freely (any x any) without ever landing on a clashing pair — both halves
// always come from the same one hex value. See storyStylePresets.js's file
// banner for why v5 split "Theme" back into these two independent pickers.
// ---------------------------------------------------------------------------
function hexToRgbTuple(hex) {
  const h = (hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbTupleToHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

// Blends `hex` toward `towardHex` by `amount` (0 = hex unchanged, 1 = fully towardHex).
function mixHex(hex, towardHex, amount) {
  const a = hexToRgbTuple(hex);
  const b = hexToRgbTuple(towardHex);
  return rgbTupleToHex(a.map((v, i) => v + (b[i] - v) * amount));
}

// WCAG relative luminance, used to pick readable badge text (white vs ink)
// for whichever accent color was picked — a bright accent like Snow or
// Yellow needs dark text; a dark one like Blackout needs light text.
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readableTextColor(hex) {
  return relativeLuminance(hex) > 0.42 ? '#0C0D10' : '#FFFFFF';
}

/**
 * Combines a BACKGROUND_STRUCTURES entry with an ACCENT_COLORS entry into
 * the concrete { pillBg, pillText, background } runtime shape the rest of
 * this file already expects — the same shape a fixed preset used to be,
 * just computed instead of hand-authored per pair.
 */
function buildThemeRuntime(backgroundId, colorId) {
  const structure = getPresetById(BACKGROUND_STRUCTURES, backgroundId);
  const color = getPresetById(ACCENT_COLORS, colorId);
  const accent = color.hex;
  // v6: mixed in far less black than before (was 0.86/0.94 — nearly the
  // whole canvas washed out to near-charcoal regardless of which accent
  // was picked, which is exactly the "dull" look this reworks). Now the
  // base fill stays a genuinely saturated, recognizably-that-color tone,
  // with just enough black mixed in to keep the paper-colored card text
  // and footer legible on top of it.
  const base = mixHex(accent, '#0C0D10', 0.42);
  const baseDeep = mixHex(accent, '#0C0D10', 0.62);
  const pillText = readableTextColor(accent);

  let background;
  switch (structure.type) {
    case 'solid':
      background = { type: 'solid', colors: [base] };
      break;
    case 'linear':
      background = { type: 'linear', colors: [base, baseDeep] };
      break;
    case 'radial':
      background = { type: 'radial', colors: [accent, base], overlay: 'rgba(12,13,16,0.32)' };
      break;
    case 'dots':
    case 'grid':
    case 'crosshatch':
    case 'halftone':
    case 'pinstripe':
    case 'waves':
      background = { type: structure.type, colors: [base], dotColor: hexToRgba(accent, 0.6) };
      break;
    case 'stripes':
    case 'checker':
    case 'sunburst':
      background = { type: structure.type, colors: [base, hexToRgba(accent, 0.45)] };
      break;
    case 'confetti':
      background = { type: 'confetti', colors: [base] }; // keeps CONFETTI_PALETTE's own multi-color scatter
      break;
    default:
      background = { type: 'solid', colors: [base] };
  }

  return { pillBg: accent, pillText, background };
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
  if (borderKind === 'dashed') { ctx.lineWidth = 3; ctx.strokeStyle = tokens.ember; ctx.setLineDash([16, 12]); return true; }
  if (borderKind === 'ink-thick') { ctx.lineWidth = 6; ctx.strokeStyle = tokens.ink; return true; }
  if (borderKind === 'paper-thick') { ctx.lineWidth = 6; ctx.strokeStyle = tokens.paper; return true; }
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

  // Clamp to the card's own bounds so an intentionally huge radius (e.g.
  // 'capsule', 200) renders as a true pill instead of producing a broken
  // rounded-rect path once the requested radius exceeds half the card's
  // width/height.
  const safeRadius = Math.max(0, Math.min(bodyPreset.radius, height / 2, width / 2));

  if (bodyPreset.rotate) {
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((bodyPreset.rotate * Math.PI) / 180);
    ctx.translate(-(x + width / 2), -(y + height / 2));
  }

  if (bodyPreset.textOnly) {
    // No card at all — text sits straight on the background with a heavy
    // drop shadow so it stays legible over any of the themes' backgrounds.
    ctx.restore();
    return { textColor: tokens.paper, dropShadow: true };
  }

  if (bodyPreset.stacked) {
    // A second, slightly offset card behind the main one for a layered look.
    roundedRectPath(ctx, x + 14, y + 18, width, height, safeRadius);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
  }

  if (bodyPreset.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
  }

  const fill = resolveFill(bodyPreset.fill, tokens);
  roundedRectPath(ctx, x, y, width, height, safeRadius);
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
  } else if (bodyPreset.fill === 'split') {
    // Hard two-tone split — a header-tinted band across the top ~36%, ink-2
    // for the rest. Clipped to the already-active rounded-rect path so the
    // seam never pokes past the card's own corners.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = tokens.ink2;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = hexToRgba(headerPreset.pillBg, 0.55);
    ctx.fillRect(x, y, width, height * 0.36);
    ctx.restore();
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
    roundedRectPath(ctx, x, y, width, height, safeRadius);
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
    roundedRectPath(ctx, x, y, width, height, safeRadius);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    const inset = 10;
    roundedRectPath(ctx, x + inset, y + inset, width - inset * 2, height - inset * 2, Math.max(0, safeRadius - inset));
    ctx.lineWidth = 3;
    ctx.strokeStyle = tokens.ember;
    ctx.stroke();
  }

  if (bodyPreset.blockHeader) {
    // A solid header-color block fused to the card's top edge — bold,
    // poster-like division between badge and body.
    roundedRectPath(ctx, x, y, width, 100, { tl: safeRadius, tr: safeRadius, br: 0, bl: 0 });
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fill();
  }

  if (bodyPreset.ribbon) {
    roundedRectPath(ctx, x, y, 14, height, { tl: safeRadius, tr: 0, br: 0, bl: safeRadius });
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fill();
  }

  if (bodyPreset.sideTab) {
    // A small colored tab protruding from the left edge, like a bookmark —
    // distinct from 'ribbon' (a full-height stripe) by being short and
    // sitting proud of the card rather than flush with it.
    roundedRectPath(ctx, x - 16, y + 34, 30, 54, { tl: 8, tr: 0, br: 0, bl: 8 });
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fill();
  }

  if (bodyPreset.cornerTag) {
    // A small triangular flag in the top-right corner, clipped to the
    // card's own rounded path so it never pokes past the corner radius.
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, safeRadius);
    ctx.clip();
    ctx.fillStyle = headerPreset.pillBg;
    ctx.beginPath();
    ctx.moveTo(x + width - 70, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + 70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (bodyPreset.ringAccent) {
    // A single inset ring in the header color — distinct from 'double'
    // (two full concentric frames in fixed white+ember) by being one ring,
    // in the theme's own accent color, and only lightly inset.
    const inset = 14;
    roundedRectPath(ctx, x + inset, y + inset, width - inset * 2, height - inset * 2, Math.max(0, safeRadius - inset));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = headerPreset.pillBg;
    ctx.stroke();
  }

  const hadBorder = applyBorder(ctx, bodyPreset.border, tokens);
  if (hadBorder) {
    roundedRectPath(ctx, x, y, width, height, safeRadius);
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

  if (bodyPreset.underline) {
    // A short colored bar sitting just under where the badge lands —
    // a simple accent rather than tracking the exact wrapped-text bottom,
    // which keeps this independent of how many lines the body text wraps to.
    roundedRectPath(ctx, x + 72, y + 78, 64, 6, 3);
    ctx.fillStyle = headerPreset.pillBg;
    ctx.fill();
  }

  ctx.restore();
  return { textColor: bodyPreset.darkText ? tokens.ink : tokens.paper, dropShadow: false };
}

// ---------------------------------------------------------------------------
// Footer — bottom-center Anonroom logo (falls back to a bold wordmark if
// public/logo.png hasn't been added yet)
// ---------------------------------------------------------------------------
// `textColor`, when passed, overrides the fallback wordmark's fill —
// needed for the Tweet-classic template, whose backdrop is light
// (#EFF3F4) rather than one of the dark backgrounds (Basic, and the new
// Normal Standard style) tokens.paper (near-white) was designed to sit on
// top of. Without this override the wordmark renders white-on-light and is
// effectively invisible.
async function drawFooterLogo(ctx, tokens, { textColor } = {}) {
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
  ctx.fillStyle = textColor || tokens.paper;
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

// ---------------------------------------------------------------------------
// Layout — 'question' kind
// ---------------------------------------------------------------------------
function drawQuestionSlide(ctx, { questionText, questionType, headerPreset, bodyPreset, tokens }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 64;
  const maxTextWidth = cardWidth - cardPadding * 2;

  // Fixed clearance for the badge + a clear gap under it — independent of
  // the body font size (see fitTextBlock's banner above), so the header
  // badge and body text can never overlap regardless of how much text
  // there is or which Scale was picked.
  const badgeSpace = bodyPreset.blockHeader ? 156 : 114;
  const maxTextHeight = CARD_SAFE_HEIGHT_WITH_CTA - cardPadding * 2 - badgeSpace;

  const { css: headlineCss, lines: textLines, lineHeight } = fitTextBlock(ctx, questionText, {
    fontFamily: fontStack(bodyPreset),
    weight: bodyPreset.fontWeight || 900,
    uppercase: bodyPreset.uppercase,
    maxWidth: maxTextWidth,
    maxHeight: maxTextHeight,
    basePx: Math.round(60 * (bodyPreset.fontScale || 1)),
    minPx: 30,
    lineHeightRatio: 1.233,
    leadingMult: bodyPreset.leadingMult,
  });

  const cardHeight = cardPadding * 2 + badgeSpace + textLines.length * lineHeight;
  const cardY = centeredCardY(cardHeight, CARD_SAFE_HEIGHT_WITH_CTA);

  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  const label = questionType === 'personal' ? 'PERSONAL QUESTION' : 'QUESTION';
  if (!bodyPreset.textOnly) {
    drawTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + cardPadding - 10, label, headerPreset, bodyPreset, tokens });
  }

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = headlineCss;
  drawLines(ctx, textLines, {
    x: cardX + cardPadding,
    y: cardY + cardPadding + badgeSpace,
    lineHeight,
    align: 'left',
  });
  ctx.shadowBlur = 0;

  const pillY = cardY + cardHeight + 56;
  const { width: pillWidth } = drawReplyPill(ctx, { x: (CANVAS_WIDTH - 480) / 2, y: pillY, headerPreset, bodyPreset, tokens, fontSize: 32 });
  ctx.clearRect(0, pillY - 4, CANVAS_WIDTH, 100);
  drawReplyPill(ctx, { x: (CANVAS_WIDTH - pillWidth) / 2, y: pillY, headerPreset, bodyPreset, tokens, fontSize: 32 });
}

// ---------------------------------------------------------------------------
// Layout — 'reply' kind (share-an-answer-you-received card)
// ---------------------------------------------------------------------------
function drawReplySlide(ctx, { questionText, replyText, headerPreset, bodyPreset, tokens, badgeLabel = 'REPLY' }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 64;
  const maxTextWidth = cardWidth - cardPadding * 2;

  // Quoted excerpt of the original question, small + dim, sits above the
  // main reply text so whoever sees the story knows what was being asked.
  // Capped to 2 lines with an ellipsis (independent of the reply's own
  // auto-fit) so a long original question can never eat into the space
  // the reply itself needs.
  const excerptScale = 1 + ((bodyPreset.fontScale || 1) - 1) * 0.35;
  const excerptFontPx = Math.round(30 * excerptScale);
  const excerptLineHeight = Math.round(40 * excerptScale);
  const { lines: excerptLines } = fitTextBlock(ctx, `"${questionText}"`, {
    fontFamily: fontStack(bodyPreset),
    weight: 700,
    uppercase: false,
    maxWidth: maxTextWidth,
    maxHeight: excerptLineHeight * 2,
    basePx: excerptFontPx,
    minPx: excerptFontPx,
    lineHeightRatio: excerptLineHeight / excerptFontPx,
  });
  const excerptBlock = excerptLines.length * excerptLineHeight + 34;

  const badgeSpace = bodyPreset.blockHeader ? 156 : 114;
  const maxTextHeight = CARD_SAFE_HEIGHT_WITH_CTA - cardPadding * 2 - badgeSpace - excerptBlock;

  const { css: replyCss, lines: replyLines, lineHeight: replyLineHeight } = fitTextBlock(ctx, replyText, {
    fontFamily: fontStack(bodyPreset),
    weight: bodyPreset.fontWeight || 900,
    uppercase: bodyPreset.uppercase,
    maxWidth: maxTextWidth,
    maxHeight: maxTextHeight,
    basePx: Math.round(56 * (bodyPreset.fontScale || 1)),
    minPx: 28,
    lineHeightRatio: 1.25,
    leadingMult: bodyPreset.leadingMult,
  });

  const cardHeight = cardPadding * 2 + badgeSpace + excerptBlock + replyLines.length * replyLineHeight;
  const cardY = centeredCardY(cardHeight, CARD_SAFE_HEIGHT_WITH_CTA);

  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  if (!bodyPreset.textOnly) {
    drawTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + cardPadding - 10, label: badgeLabel, headerPreset, bodyPreset, tokens });
  }

  let cursorY = cardY + cardPadding + badgeSpace;

  ctx.fillStyle = bodyPreset.darkText ? 'rgba(12,13,16,0.6)' : tokens.dim;
  ctx.font = `700 ${excerptFontPx}px ${fontStack(bodyPreset)}`;
  drawLines(ctx, excerptLines, { x: cardX + cardPadding, y: cursorY, lineHeight: excerptLineHeight, align: 'left' });
  cursorY += excerptBlock;

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = replyCss;
  drawLines(ctx, replyLines, { x: cardX + cardPadding, y: cursorY, lineHeight: replyLineHeight, align: 'left' });
  ctx.shadowBlur = 0;

  const pillY = cardY + cardHeight + 56;
  const { width: pillWidth } = drawReplyPill(ctx, { x: (CANVAS_WIDTH - 480) / 2, y: pillY, headerPreset, bodyPreset, tokens, fontSize: 32 });
  ctx.clearRect(0, pillY - 4, CANVAS_WIDTH, 100);
  drawReplyPill(ctx, { x: (CANVAS_WIDTH - pillWidth) / 2, y: pillY, headerPreset, bodyPreset, tokens, fontSize: 32 });
}

// ---------------------------------------------------------------------------
// Layout — 'message' kind (share-a-chat-message card). Same card chrome as
// 'question'/'reply' (drawBodyCard, fully re-skinnable), but the header is
// the avatar+name row instead of a text badge — see drawAvatarNameHeader.
// No CTA pill at the bottom: unlike a question, a chat message isn't asking
// for a reply, so there's nothing to invite one for.
// ---------------------------------------------------------------------------
function drawMessageSlide(ctx, { messageText, senderName, avatarImage, headerPreset, bodyPreset, tokens, isConfession }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 64;
  const avatarSize = 72;
  // The avatar+name row is drawn in its own row above the card now, not
  // tucked inside cardPadding on top of the message text — it's the
  // message's identity, not part of the body copy, so it can never crowd
  // or run into the text underneath it no matter how tall the card grows.
  const headerToCardGap = 32;
  const maxTextWidth = cardWidth - cardPadding * 2;

  // Confessions get their own "CONFESSION" badge inside the card — the
  // same treatment 'question'/'reply' get from drawTypeBadge — reserving a
  // fixed clearance above the body text so it can never overlap regardless
  // of how much text there is or which Scale was picked.
  const badgeSpace = isConfession ? (bodyPreset.blockHeader ? 156 : 114) : 0;

  const maxTextHeight = CARD_SAFE_HEIGHT_NO_CTA - cardPadding * 2 - avatarSize - headerToCardGap - badgeSpace;

  const { css: bodyCss, lines: bodyLines, lineHeight: bodyLineHeight } = fitTextBlock(ctx, messageText, {
    fontFamily: fontStack(bodyPreset),
    weight: bodyPreset.fontWeight || 900,
    uppercase: bodyPreset.uppercase,
    maxWidth: maxTextWidth,
    maxHeight: maxTextHeight,
    basePx: Math.round(52 * (bodyPreset.fontScale || 1)),
    minPx: 26,
    lineHeightRatio: 1.28,
    leadingMult: bodyPreset.leadingMult,
  });

  const cardHeight = cardPadding * 2 + badgeSpace + Math.max(1, bodyLines.length) * bodyLineHeight;
  // Header row + gap + card are centered together as one block, so the
  // whole composition (not just the card) stays balanced in the safe zone.
  const blockHeight = avatarSize + headerToCardGap + cardHeight;
  const blockY = centeredCardY(blockHeight, CARD_SAFE_HEIGHT_NO_CTA);

  // Unlike drawTypeBadge (skipped for 'textOnly' shapes), the avatar+name
  // row IS the message's identity, not a decorative label — so it's always
  // drawn, the same way drawReplySlide always draws its quoted excerpt.
  // `standalone: true` — it now sits on the page background, outside the
  // card entirely, so it gets its own always-legible styling instead of
  // the card-fill-relative contrast drawAvatarNameHeader uses by default.
  drawAvatarNameHeader(ctx, {
    x: cardX,
    y: blockY,
    size: avatarSize,
    avatarImage,
    senderName,
    headerPreset,
    bodyPreset,
    tokens,
    standalone: true,
  });

  const cardY = blockY + avatarSize + headerToCardGap;
  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  if (isConfession && !bodyPreset.textOnly) {
    drawTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + cardPadding - 10, label: 'CONFESSION', headerPreset, bodyPreset, tokens });
  }

  const cursorY = cardY + cardPadding + badgeSpace;

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = bodyCss;
  drawLines(ctx, bodyLines, { x: cardX + cardPadding, y: cursorY, lineHeight: bodyLineHeight, align: 'left' });
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// Layout — 'tweet' template (professional, realistic tweet-screenshot style)
// ---------------------------------------------------------------------------
// A fixed, non-customizable preset (Background/Shape/Colour/Size from
// storyStylePresets.js don't apply here — see ShareStorySheet's
// Basic/Standard toggle) built to read like a genuine social-post
// screenshot: a plain neutral canvas backdrop behind a white, rounded,
// drop-shadowed card with an avatar+name/handle header, the shared text as
// the body copy, a timestamp line, and a muted reply/repost/like/share icon
// row. Works for all three share kinds — 'question' and 'reply' get a
// synthesized handle and (for 'reply') a small quoted excerpt of the
// original question, the same way drawReplySlide's quoted-question inset
// works. This is `standardStyle === 'tweet'` — see drawNormalSlide below
// for the newer, default `standardStyle === 'normal'` look.
const TWEET_CARD_BG = '#FFFFFF';
const TWEET_TEXT_PRIMARY = '#0F1419';
const TWEET_TEXT_SECONDARY = '#536471';
const TWEET_BORDER = 'rgba(15,20,25,0.12)';
const TWEET_ACCENT = '#1D9BF0';

function drawTweetAvatar(ctx, { x, y, size, avatarImage, label }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImage) {
    ctx.drawImage(avatarImage, x, y, size, size);
  } else {
    ctx.fillStyle = '#E1E8ED';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#536471';
    ctx.font = `700 ${Math.round(size * 0.42)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((label || 'A').slice(0, 1).toUpperCase(), x + size / 2, y + size / 2 + 2);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

// Small filled-circle "verified" badge — generic, not any real platform's
// mark — just enough to read as "a real, professional post" at a glance.
function drawVerifiedBadge(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = TWEET_ACCENT;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = size * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.24, y);
  ctx.lineTo(x - size * 0.05, y + size * 0.2);
  ctx.lineTo(x + size * 0.26, y - size * 0.22);
  ctx.stroke();
  ctx.restore();
}

function drawTweetSlide(ctx, { kind, questionText, questionType, replyText, messageText, senderName, avatarImage, isConfession }) {
  // Plain neutral backdrop — the tweet card is the whole point here, not
  // any of the customizable Background presets.
  ctx.fillStyle = '#EFF3F4';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cardX = 64;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const pad = 48;
  const avatarSize = 84;

  const displayName = kind === 'message' ? (senderName || 'Anonymous') : 'Anonymous';
  const handle = '@anonymous';
  const bodyText = kind === 'reply' ? replyText : kind === 'message' ? messageText : questionText;
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  // --- Quoted-question inset (reply kind only) — measured first so the
  // card's total height accounts for it. ---
  const hasQuote = kind === 'reply' && Boolean(questionText);
  let quoteLines = [];
  let quoteLineHeight = 0;
  const quotePadding = 28;
  if (hasQuote) {
    ctx.font = '500 30px ' + font;
    const fitted = fitTextBlock(ctx, questionText, {
      fontFamily: font,
      weight: 500,
      uppercase: false,
      maxWidth: cardWidth - pad * 2 - quotePadding * 2,
      maxHeight: 220,
      basePx: 30,
      minPx: 22,
      lineHeightRatio: 1.3,
    });
    quoteLines = fitted.lines;
    quoteLineHeight = fitted.lineHeight;
  }
  const quoteBlockHeight = hasQuote ? quotePadding * 2 + quoteLines.length * quoteLineHeight + 20 : 0;

  // --- Body text ---
  const maxBodyWidth = cardWidth - pad * 2;
  const maxBodyHeight = 900;
  const { css: bodyCss, lines: bodyLines, lineHeight: bodyLineHeight } = fitTextBlock(ctx, bodyText, {
    fontFamily: font,
    weight: 400,
    uppercase: false,
    maxWidth: maxBodyWidth,
    maxHeight: maxBodyHeight,
    basePx: 46,
    minPx: 26,
    lineHeightRatio: 1.34,
  });

  const headerHeight = avatarSize;
  const headerToBodyGap = 30;
  const bodyToMetaGap = 34;
  const metaHeight = 40;
  const metaToDividerGap = 24;
  // Card now ends cleanly right after the divider + a little breathing room
  // — no fake reply/repost/like/share row underneath (Anonroom has no real
  // engagement counts to show, and a made-up row read as fake).
  const dividerToBottomGap = 30;
  const badgeHeight = kind === 'question' || (kind === 'message' && isConfession) ? 56 : 0;

  const cardHeight =
    pad * 2 +
    badgeHeight +
    headerHeight +
    headerToBodyGap +
    bodyLines.length * bodyLineHeight +
    quoteBlockHeight +
    bodyToMetaGap +
    metaHeight +
    metaToDividerGap +
    1 +
    dividerToBottomGap;

  const cardY = Math.max(220, (CANVAS_HEIGHT - cardHeight) / 2 - 60);

  // --- Card shell — a plain, symmetric rectangle: bright white card on a
  // soft grey backdrop, tight corner radius instead of a rounded "bubble".
  const cardRadius = 14;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.fillStyle = TWEET_CARD_BG;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.strokeStyle = TWEET_BORDER;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  let cursorY = cardY + pad;

  if (kind === 'question' || (kind === 'message' && isConfession)) {
    const label = kind === 'message' ? 'CONFESSION' : (questionType === 'personal' ? 'PERSONAL QUESTION' : 'ANONYMOUS QUESTION');
    ctx.font = '800 22px ' + font;
    const labelWidth = ctx.measureText(label).width + 32;
    roundedRectPath(ctx, cardX + pad, cursorY, labelWidth, 40, 10);
    ctx.fillStyle = 'rgba(29,155,240,0.1)';
    ctx.fill();
    ctx.fillStyle = TWEET_ACCENT;
    ctx.textAlign = 'left';
    ctx.fillText(label, cardX + pad + 16, cursorY + 27);
    cursorY += badgeHeight;
  }

  // --- Header: avatar + name/handle ---
  drawTweetAvatar(ctx, { x: cardX + pad, y: cursorY, size: avatarSize, avatarImage, label: displayName });
  const nameX = cardX + pad + avatarSize + 22;
  ctx.textAlign = 'left';
  ctx.fillStyle = TWEET_TEXT_PRIMARY;
  ctx.font = '800 32px ' + font;
  const nameWidth = ctx.measureText(displayName).width;
  ctx.fillText(displayName, nameX, cursorY + 34);
  drawVerifiedBadge(ctx, nameX + nameWidth + 20, cursorY + 24, 26);
  ctx.fillStyle = TWEET_TEXT_SECONDARY;
  ctx.font = '400 28px ' + font;
  ctx.fillText(handle, nameX, cursorY + 68);

  cursorY += headerHeight + headerToBodyGap;

  // --- Body text ---
  ctx.fillStyle = TWEET_TEXT_PRIMARY;
  ctx.font = bodyCss;
  // +bodyLineHeight * 0.72 nudges the first baseline down from the cap
  // (cursorY) by roughly one line's ascent, so the glyphs sit inside the
  // card instead of clipping against its top edge.
  drawLines(ctx, bodyLines, { x: cardX + pad, y: cursorY + Math.round(bodyLineHeight * 0.72), lineHeight: bodyLineHeight, align: 'left' });
  cursorY += bodyLines.length * bodyLineHeight;

  // --- Quoted question inset (reply only) ---
  if (hasQuote) {
    cursorY += 20;
    const quoteY = cursorY;
    roundedRectPath(ctx, cardX + pad, quoteY, cardWidth - pad * 2, quoteBlockHeight - 20, 16);
    ctx.fillStyle = 'rgba(15,20,25,0.04)';
    ctx.fill();
    ctx.strokeStyle = TWEET_BORDER;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = TWEET_TEXT_SECONDARY;
    ctx.font = '500 30px ' + font;
    drawLines(ctx, quoteLines, { x: cardX + pad + quotePadding, y: quoteY + quotePadding + 24, lineHeight: quoteLineHeight, align: 'left' });
    cursorY += quoteBlockHeight - 20;
  }

  // --- Timestamp / meta line ---
  cursorY += bodyToMetaGap;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillStyle = TWEET_TEXT_SECONDARY;
  ctx.font = '400 26px ' + font;
  ctx.fillText(`${timeStr} · ${dateStr} · Anonroom`, cardX + pad, cursorY + 24);

  cursorY += metaHeight + metaToDividerGap;
  ctx.strokeStyle = TWEET_BORDER;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cardX + pad, cursorY);
  ctx.lineTo(cardX + cardWidth - pad, cursorY);
  ctx.stroke();
  // Card ends here — no fake reply/repost/like/share icon row below the
  // divider (see the dividerToBottomGap comment above cardHeight).
}

// ---------------------------------------------------------------------------
// Layout — `standardStyle === 'normal'` (NEW default Standard look) — a
// confession-bubble-style card: a coloured tag header (Question / Reply /
// Confession / Message each get their own gradient — see
// NORMAL_TAG_DEFAULTS/defaultTagInfo, which mirror ShareStorySheet.jsx's
// own getTagInfo so the sheet's preview chip and this export can never
// disagree) sitting above a solid grey body, with the shared text rendered
// white-fill/black-outline (sticker-text) so it reads over anything.
//
// Uses the same fitTextBlock/roundedRectPath/centeredCardY machinery every
// other layout in this file uses; no CTA pill, no engagement row — just the
// card. The footer logo is drawn afterward by the shared drawFooterLogo
// call in generateStoryImage, same as every other layout.
// ---------------------------------------------------------------------------
const NORMAL_TAG_DEFAULTS = {
  question: { label: 'Question', from: '#3EA6F7', to: '#2B7FD6' },
  reply: { label: 'Reply', from: '#22C55E', to: '#16A34A' },
  confession: { label: 'Confession', from: '#6A5CF5', to: '#9B5CF5' },
  message: { label: 'Message', from: '#FF6B35', to: '#FF9166' },
};

// Fallback for callers that don't pass tagLabel/tagGradientFrom/To
// explicitly (ShareStorySheet.jsx v7 always does, via its own getTagInfo).
function defaultTagInfo(kind, isConfession) {
  if (kind === 'question') return NORMAL_TAG_DEFAULTS.question;
  if (kind === 'reply') return NORMAL_TAG_DEFAULTS.reply;
  if (isConfession) return NORMAL_TAG_DEFAULTS.confession;
  return NORMAL_TAG_DEFAULTS.message;
}

const NORMAL_CARD_X = 80;
const NORMAL_CARD_RADIUS = 40;
const NORMAL_HEADER_HEIGHT = 140;
const NORMAL_CARD_PADDING = 64;
const NORMAL_BODY_FILL = '#2A2B33'; // solid grey card body, per spec

function drawNormalSlide(ctx, { kind, questionText, replyText, messageText, tagLabel, tagGradientFrom, tagGradientTo, tokens }) {
  // Solid dark backdrop — keeps focus on the card and guarantees the
  // white/black-outlined text stays legible regardless of whatever the
  // story ends up posted over afterward.
  ctx.fillStyle = tokens.ink;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cardX = NORMAL_CARD_X;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const font = FONT_STACKS.system;
  const maxTextWidth = cardWidth - NORMAL_CARD_PADDING * 2;
  const maxTextHeight = CARD_SAFE_HEIGHT_NO_CTA - NORMAL_HEADER_HEIGHT - NORMAL_CARD_PADDING * 2;

  const bodyText = kind === 'reply' ? replyText : kind === 'message' ? messageText : questionText;

  const fitted = fitTextBlock(ctx, bodyText, {
    fontFamily: font,
    weight: 800,
    uppercase: false,
    maxWidth: maxTextWidth,
    maxHeight: maxTextHeight,
    basePx: 54,
    minPx: 28,
    lineHeightRatio: 1.32,
  });
  const { lines, lineHeight, css, size } = fitted;

  const bodyHeight = NORMAL_CARD_PADDING * 2 + lines.length * lineHeight;
  const cardHeight = NORMAL_HEADER_HEIGHT + bodyHeight;
  const cardY = centeredCardY(cardHeight, CARD_SAFE_HEIGHT_NO_CTA);

  // --- shadow + full grey body fill first — this is what gives the header
  // (drawn on top, clipped to the top corners only) its matching rounded
  // top corners for free, and gives the whole card one soft drop shadow
  // instead of two competing ones from drawing header/body separately. ---
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, NORMAL_CARD_RADIUS);
  ctx.fillStyle = NORMAL_BODY_FILL;
  ctx.fill();
  ctx.restore();

  // --- coloured tag header, clipped to the card's top corners only ---
  ctx.save();
  roundedRectPath(ctx, cardX, cardY, cardWidth, NORMAL_HEADER_HEIGHT, { tl: NORMAL_CARD_RADIUS, tr: NORMAL_CARD_RADIUS, br: 0, bl: 0 });
  ctx.clip();
  const headerGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + NORMAL_HEADER_HEIGHT);
  headerGrad.addColorStop(0, tagGradientFrom);
  headerGrad.addColorStop(1, tagGradientTo);
  ctx.fillStyle = headerGrad;
  ctx.fillRect(cardX, cardY, cardWidth, NORMAL_HEADER_HEIGHT);
  ctx.restore();

  // --- thin outer ring so header + body read as one cohesive card on any
  // backdrop, same idea as drawBodyCard's 'glass' border treatment ---
  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, NORMAL_CARD_RADIUS);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.stroke();

  // --- tag label, centered in the header ---
  ctx.save();
  ctx.font = `800 44px ${font}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.fillText((tagLabel || '').toUpperCase(), cardX + cardWidth / 2, cardY + NORMAL_HEADER_HEIGHT / 2);
  ctx.restore();

  // --- body text: white fill, black outline (sticker-text), centered ---
  ctx.save();
  ctx.font = css;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const textCenterX = cardX + cardWidth / 2;
  let cursorY = cardY + NORMAL_HEADER_HEIGHT + NORMAL_CARD_PADDING + Math.round(lineHeight * 0.78);
  const strokeWidth = Math.max(6, Math.round(size * 0.14));
  lines.forEach((line) => {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(line, textCenterX, cursorY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, textCenterX, cursorY);
    cursorY += lineHeight;
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Attached-media notice (mode="message" only) — the actual photo/video/GIF
// is never drawn into the exported image (and never shown anywhere in the
// app UI either); instead a small fixed-position pill just says a media
// file is attached, always drawn directly above the footer wordmark/logo
// (the "anonroom.in" branding), sitting just above the reserved LINK_ZONE
// band so it never overlaps either the footer or the space left for the
// manual IG link sticker.
// ---------------------------------------------------------------------------
const MEDIA_NOTICE_HEIGHT = 64;
const MEDIA_NOTICE_LABELS = {
  image: { emoji: '📸', label: 'Photo attached' },
  video: { emoji: '🎬', label: 'Video attached' },
  audio: { emoji: '🎵', label: 'Voice message attached' },
  gif: { emoji: '🎞️', label: 'GIF attached' },
  sticker: { emoji: '🏷️', label: 'Sticker attached' },
};

function drawMediaAttachedNotice(ctx, mediaType, tokens) {
  const meta = MEDIA_NOTICE_LABELS[mediaType] || { emoji: '📎', label: 'Media attached' };
  const font = FONT_STACKS.system;
  ctx.font = '700 26px ' + font;
  const text = `${meta.emoji}  ${meta.label}`;
  const textWidth = ctx.measureText(text).width;
  const paddingX = 28;
  const width = textWidth + paddingX * 2;
  const height = MEDIA_NOTICE_HEIGHT;
  const x = (CANVAS_WIDTH - width) / 2;
  const y = LINK_ZONE.y - 24 - height; // fixed: always just above the link-zone/footer band

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 26px ' + font;
  ctx.fillText(text, x + paddingX, y + height / 2 + 1);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Layout — confession-card-only (no header badge/label, no footer, no CTA
// pill) — used to render a group confession's chosen Background/Colour/
// Shape/Size combo *inside a chat bubble* (see ConfessionBubble.jsx) rather
// than as a shareable story. Reuses the exact same body-card drawing
// (drawBodyCard) and text-fitting (fitTextBlock) the story slides use, just
// without the parts that only make sense for a full 1080x1920 story export.
// ---------------------------------------------------------------------------
function drawConfessionCardBody(ctx, { text, bodyPreset, headerPreset, tokens }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 64;
  const maxTextWidth = cardWidth - cardPadding * 2;
  const maxTextHeight = 900;

  const { css, lines, lineHeight } = fitTextBlock(ctx, text, {
    fontFamily: fontStack(bodyPreset),
    weight: bodyPreset.fontWeight || 900,
    uppercase: bodyPreset.uppercase,
    maxWidth: maxTextWidth,
    maxHeight: maxTextHeight,
    basePx: Math.round(56 * (bodyPreset.fontScale || 1)),
    minPx: 28,
    lineHeightRatio: 1.25,
    leadingMult: bodyPreset.leadingMult,
  });

  const cardHeight = cardPadding * 2 + lines.length * lineHeight;
  const cardY = centeredCardY(cardHeight, CARD_SAFE_HEIGHT_NO_CTA);

  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = css;
  drawLines(ctx, lines, { x: cardX + cardPadding, y: cardY + cardPadding, lineHeight, align: 'left' });
  ctx.shadowBlur = 0;

  return { cardX, cardY, cardWidth, cardHeight };
}

/**
 * Renders just the chosen Shape (body card) sitting on its Background —
 * no "Confession"/type label, no sender header, no footer wordmark, no
 * reserved link zone. Used by ConfessionBubble.jsx to show a group
 * confession's customization inline, inside the chat bubble itself, instead
 * of as a shareable story image. Returns a cropped PNG blob containing only
 * the card (plus a small margin for shadows/rotation/decorations) so the
 * bubble can size itself to the card's own aspect ratio.
 */
export async function generateConfessionCardImage({
  text = '',
  backgroundId,
  colorId,
  shapeId,
  scaleId,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  const tokens = getTokens();
  const runtime = buildThemeRuntime(backgroundId, colorId);
  const headerPreset = { pillBg: runtime.pillBg, pillText: runtime.pillText };
  const bodyPreset = mergeBodyPreset(getPresetById(BODY_SHAPES, shapeId), getPresetById(BODY_SCALES, scaleId));

  drawBackground(ctx, runtime.background);
  const { cardX, cardY, cardWidth, cardHeight } = drawConfessionCardBody(ctx, { text, bodyPreset, headerPreset, tokens });

  const margin = 120;
  const sx = Math.max(0, cardX - margin);
  const sy = Math.max(0, cardY - margin);
  const sw = Math.min(CANVAS_WIDTH - sx, cardWidth + margin * 2);
  const sh = Math.min(CANVAS_HEIGHT - sy, cardHeight + margin * 2);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  cropCanvas.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    cropCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null.'));
    }, 'image/png');
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function generateStoryImage({
  kind = 'question',
  questionText = '',
  replyText = '',
  questionType,
  messageText = '',
  senderName = '',
  avatarUrl = '',
  // mode="message" only — true for a confession-flagged chat message, so
  // the render can carry the same "CONFESSION" badge treatment
  // 'question'/'reply' get from their own type badges (see drawMessageSlide
  // / drawTweetSlide / drawNormalSlide).
  isConfession = false,
  // 'reply' kind only — overrides the default "REPLY" header badge text.
  // CustomizedConfessionCard (see StoryViewer.jsx) reuses the 'reply' layout
  // for a confession's own customized story style and passes 'CONFESSION'
  // here instead, since that card is a confession, not an actual reply.
  badgeLabel,
  backgroundId,
  colorId,
  shapeId,
  scaleId,
  // Preset toggle: 'basic' (fully customizable, default) or 'tweet'
  // ("Standard" — a single fixed-layout card; see standardStyle below for
  // which look it uses).
  template = 'basic',
  // Only meaningful when template === 'tweet': 'normal' (NEW, default) is
  // the confession-card look (drawNormalSlide); 'tweet' is the original
  // fixed realistic-post preset (drawTweetSlide), unchanged.
  standardStyle = 'normal',
  // Tag identity for the 'normal' Standard style. ShareStorySheet.jsx's own
  // getTagInfo is the source of truth for these, so the sheet's live
  // preview chip and this export can never disagree; defaultTagInfo below
  // is only a fallback for callers that don't pass them explicitly.
  tagLabel,
  tagGradientFrom,
  tagGradientTo,
  // mode="message" only — when set, a small "media attached" notice pill
  // is drawn above the footer branding. The actual media is never rendered
  // into the image (or shown anywhere in the app) — just the notice.
  mediaUrl = '',
  mediaType = '',
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  const tokens = getTokens();

  if (template === 'tweet' && standardStyle === 'normal') {
    const tag = defaultTagInfo(kind, isConfession);
    drawNormalSlide(ctx, {
      kind,
      questionText,
      replyText,
      messageText,
      tagLabel: tagLabel || tag.label,
      tagGradientFrom: tagGradientFrom || tag.from,
      tagGradientTo: tagGradientTo || tag.to,
      tokens,
    });
  } else if (template === 'tweet') {
    const avatarImage = kind === 'message' ? await loadAvatarImage(avatarUrl) : null;
    drawTweetSlide(ctx, { kind, questionText, questionType, replyText, messageText, senderName, avatarImage, isConfession });
  } else {
    const runtime = buildThemeRuntime(backgroundId, colorId);
    const headerPreset = { pillBg: runtime.pillBg, pillText: runtime.pillText };
    const backgroundPreset = runtime.background;
    const bodyPreset = mergeBodyPreset(getPresetById(BODY_SHAPES, shapeId), getPresetById(BODY_SCALES, scaleId));

    drawBackground(ctx, backgroundPreset);

    if (kind === 'reply') {
      drawReplySlide(ctx, { questionText, replyText, headerPreset, bodyPreset, tokens, ...(badgeLabel ? { badgeLabel } : {}) });
    } else if (kind === 'message') {
      const avatarImage = await loadAvatarImage(avatarUrl);
      drawMessageSlide(ctx, { messageText, senderName, avatarImage, headerPreset, bodyPreset, tokens, isConfession });
    } else {
      drawQuestionSlide(ctx, { questionText, questionType, headerPreset, bodyPreset, tokens });
    }
  }

  // LINK_ZONE (between card bottom and footer) is intentionally left blank —
  // that's where the IG link sticker goes by hand. Nothing draws there.

  if (kind === 'message' && mediaUrl && mediaType) {
    drawMediaAttachedNotice(ctx, mediaType, tokens);
  }

  // Tweet-classic sits on a light backdrop, so the footer wordmark needs a
  // dark fill instead of the light one every dark background (Basic, and
  // the new Normal Standard style) expects (see drawFooterLogo).
  await drawFooterLogo(ctx, tokens, template === 'tweet' && standardStyle === 'tweet' ? { textColor: TWEET_TEXT_PRIMARY } : undefined);

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
