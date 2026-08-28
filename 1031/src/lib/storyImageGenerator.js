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
 * ========================================================================= */

import { HEADER_COLOR_PRESETS, BACKGROUND_PRESETS, BODY_STYLE_PRESETS, getPresetById } from './storyStylePresets';
import { shareToInstagramStories } from './instagramShare';

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

// Reserved band for the manually-placed IG link sticker. Sits between the
// body card and the footer logo on every template so it never overlaps
// either. Exposed so the preview overlay in ShareStorySheet.jsx can draw a
// guide box in exactly the same place the export leaves empty.
export const LINK_ZONE = { x: 140, y: 1620, width: CANVAS_WIDTH - 280, height: 140 };

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
// Background
// ---------------------------------------------------------------------------
function drawBackground(ctx, backgroundPreset) {
  const { type, colors, overlay, dotColor } = backgroundPreset;

  if (type === 'solid') {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else if (type === 'linear') {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else if (type === 'radial') {
    const g = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.28, 60, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.28, CANVAS_WIDTH * 0.9);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (overlay) {
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  } else if (type === 'dots') {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = dotColor || 'rgba(255,255,255,0.08)';
    const spacing = 56;
    for (let yy = spacing; yy < CANVAS_HEIGHT; yy += spacing) {
      for (let xx = spacing; xx < CANVAS_WIDTH; xx += spacing) {
        ctx.beginPath();
        ctx.arc(xx, yy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
function resolveFill(fillKind, tokens) {
  if (fillKind === 'ink-2') return tokens.ink2;
  if (fillKind === 'paper') return tokens.paper;
  if (fillKind === 'glass') return 'rgba(255,255,255,0.07)';
  return null; // 'none'
}

function applyBorder(ctx, borderKind, tokens) {
  if (borderKind === 'none') return false;
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
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

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
// Layout — 'question' kind
// ---------------------------------------------------------------------------
function drawQuestionSlide(ctx, { questionText, questionType, headerPreset, bodyPreset, tokens }) {
  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardPadding = 72;
  const cardY = 520;

  ctx.font = '900 60px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const textLines = wrapText(ctx, questionText, cardWidth - cardPadding * 2);
  const lineHeight = 74;
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
  ctx.font = '900 60px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  drawWrappedText(ctx, questionText, {
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
  ctx.font = '700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const excerptMax = 160;
  const excerpt = questionText.length > excerptMax ? `${questionText.slice(0, excerptMax).trim()}…` : questionText;
  const excerptLines = wrapText(ctx, `"${excerpt}"`, cardWidth - cardPadding * 2);
  const excerptLineHeight = 40;

  ctx.font = '900 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const replyLines = wrapText(ctx, replyText, cardWidth - cardPadding * 2);
  const replyLineHeight = 70;

  const badgeSpace = bodyPreset.blockHeader ? 130 : 96;
  const excerptBlock = excerptLines.length * excerptLineHeight + 34;
  const cardHeight = cardPadding * 2 + badgeSpace + excerptBlock + replyLines.length * replyLineHeight;

  const { textColor, dropShadow } = drawBodyCard(ctx, { x: cardX, y: cardY, width: cardWidth, height: cardHeight, bodyPreset, tokens, headerPreset });

  if (!bodyPreset.textOnly) {
    drawTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + cardPadding - 10, label: 'REPLY', headerPreset });
  }

  let cursorY = cardY + cardPadding + badgeSpace;

  ctx.fillStyle = bodyPreset.darkText ? 'rgba(12,13,16,0.6)' : tokens.dim;
  ctx.font = '700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  drawWrappedText(ctx, `"${excerpt}"`, { x: cardX + cardPadding, y: cursorY, maxWidth: cardWidth - cardPadding * 2, lineHeight: excerptLineHeight, align: 'left' });
  cursorY += excerptBlock;

  if (dropShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = textColor;
  ctx.font = '900 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  drawWrappedText(ctx, replyText, { x: cardX + cardPadding, y: cursorY, maxWidth: cardWidth - cardPadding * 2, lineHeight: replyLineHeight, align: 'left' });
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
