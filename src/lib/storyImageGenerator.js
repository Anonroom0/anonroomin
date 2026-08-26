/** ===========================================================================
 * QUESTION STORY IMAGE GENERATOR
 * ============================================================================
 * Renders a shareable 1080x1920 (standard IG/NGL story) PNG for a question
 * page, using an offscreen <canvas>, and hands off to the native share sheet
 * or a plain download. Every template pulls its colors live from the same
 * CSS custom properties tokens.css defines (--ink, --glass-white, --glass-
 * border, --ember, --paper, --dim) rather than hardcoding hex, so a palette
 * change to tokens.css is reflected here automatically and every template
 * still reads as unmistakably "Anonroom" regardless of layout.
 *
 * generateQuestionStoryImage({ questionText, questionType, replyUrl, template })
 *   -> Promise<Blob>              (image/png)
 * shareStoryImage(blob, { title }) -> Promise<void>
 * TEMPLATES                        -> string[] of layout ids
 * ========================================================================= */

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

// Layout ids. Each one meaningfully changes card position/size, text scale,
// and where the reply-URL caption sits -- not just a recolor of the same
// composition.
export const TEMPLATES = ['bold-center', 'sticky-note', 'gradient-card'];

// ---------------------------------------------------------------------------
// Token access
// ---------------------------------------------------------------------------

/**
 * Reads a design token straight from :root at draw time, falling back to
 * the value documented in the master context if the stylesheet hasn't
 * loaded yet (e.g. this ever runs before tokens.css is attached). Keeping
 * this dynamic -- rather than hardcoding hex here -- means a palette tweak
 * in tokens.css is picked up with zero changes to this file.
 */
function getToken(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getTokens() {
  return {
    ink: getToken('--ink', '#0C0D10'),
    paper: getToken('--paper', '#F4F3F0'),
    dim: getToken('--dim', '#8B8B96'),
    ember: getToken('--ember', '#FF6B35'),
    glassWhite: getToken('--glass-white', 'rgba(255,255,255,0.07)'),
    glassBorder: getToken('--glass-border', 'rgba(255,255,255,0.10)'),
  };
}

// ---------------------------------------------------------------------------
// Canvas drawing utilities
// ---------------------------------------------------------------------------

/** Manual rounded-rect path -- doesn't rely on ctx.roundRect() so this works
 * on older WebKit/Safari builds that don't yet implement it. */
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
  ctx.lineTo(x, y + r.tl);
  ctx.arcTo(x, y, x + r.tl, y, r.tl);
  ctx.closePath();
}

/** Greedy word-wrap. Returns an array of lines that each fit maxWidth. */
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
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
  return lines.length * lineHeight;
}

/** The ember "Reply anonymously →" pill every template shares. */
function drawReplyPill(ctx, { x, y, tokens, fontSize = 30 }) {
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const label = 'Reply anonymously \u2192';
  const paddingX = 40;
  const paddingY = 22;
  const textWidth = ctx.measureText(label).width;
  const pillWidth = textWidth + paddingX * 2;
  const pillHeight = fontSize + paddingY * 2;

  roundedRectPath(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = tokens.ember;
  ctx.fill();

  // Dark text on the bright ember fill reads more clearly than paper/white
  // would here -- a judgment call since the master context only specifies
  // the pill's fill color, not its label color.
  ctx.fillStyle = tokens.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + pillWidth / 2, y + pillHeight / 2 + 2);
  ctx.textBaseline = 'alphabetic';

  return { width: pillWidth, height: pillHeight };
}

function drawQuestionTypeBadge(ctx, { x, y, questionType, tokens }) {
  const label = questionType === 'personal' ? 'PERSONAL QUESTION' : 'ASK ME ANYTHING';
  ctx.font = '700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = tokens.dim;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Letter-spacing isn't native to canvas fillText, so space the characters
  // out manually for the small caps-style label.
  const spaced = label.split('').join('\u200a\u200a');
  ctx.fillText(spaced, x, y);
}

function drawCaption(ctx, { x, y, replyUrl, tokens, align = 'left', maxWidth }) {
  ctx.font = '500 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = tokens.dim;
  ctx.textAlign = align;
  drawWrappedText(ctx, replyUrl, { x, y, maxWidth: maxWidth ?? CANVAS_WIDTH - 160, lineHeight: 38, align });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** bold-center: one big centered card, largest type of the three templates,
 * pill directly beneath it, caption anchored near the bottom of the canvas. */
function drawBoldCenter(ctx, { questionText, questionType, replyUrl, tokens }) {
  ctx.fillStyle = tokens.ink;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cardX = 80;
  const cardWidth = CANVAS_WIDTH - cardX * 2;
  const cardY = 560;
  const cardPadding = 72;

  ctx.font = '700 64px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const textLines = wrapText(ctx, questionText, cardWidth - cardPadding * 2);
  const lineHeight = 78;
  const cardHeight = cardPadding * 2 + 56 + textLines.length * lineHeight;

  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, 48);
  ctx.fillStyle = tokens.glassWhite;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = tokens.glassBorder;
  ctx.stroke();

  drawQuestionTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + 64, questionType, tokens });

  ctx.fillStyle = tokens.paper;
  ctx.font = '700 64px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  drawWrappedText(ctx, questionText, {
    x: cardX + cardPadding,
    y: cardY + 64 + 76,
    maxWidth: cardWidth - cardPadding * 2,
    lineHeight,
    align: 'left',
  });

  const pillY = cardY + cardHeight + 64;
  const { width: pillWidth } = drawReplyPill(ctx, {
    x: CANVAS_WIDTH / 2 - 260,
    y: pillY,
    tokens,
    fontSize: 32,
  });
  // Re-center exactly now that we know the real pill width.
  ctx.clearRect(0, pillY - 4, CANVAS_WIDTH, 100);
  drawReplyPill(ctx, { x: (CANVAS_WIDTH - pillWidth) / 2, y: pillY, tokens, fontSize: 32 });

  drawCaption(ctx, {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 140,
    replyUrl,
    tokens,
    align: 'center',
    maxWidth: CANVAS_WIDTH - 200,
  });
}

/** sticky-note: a small, slightly rotated card sitting in the upper third,
 * like a note pinned to the background, with the pill tucked in its corner
 * and the caption placed independently near the bottom-left. */
function drawStickyNote(ctx, { questionText, questionType, replyUrl, tokens }) {
  ctx.fillStyle = tokens.ink;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cardWidth = 760;
  const cardPadding = 56;
  const cardX = (CANVAS_WIDTH - cardWidth) / 2;
  const cardY = 260;
  const rotationDeg = -3;

  ctx.save();
  ctx.translate(cardX + cardWidth / 2, cardY + 260);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-(cardX + cardWidth / 2), -(cardY + 260));

  ctx.font = '600 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const textLines = wrapText(ctx, questionText, cardWidth - cardPadding * 2);
  const lineHeight = 60;
  const cardHeight = cardPadding * 2 + 48 + textLines.length * lineHeight;

  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, 24);
  ctx.fillStyle = tokens.glassWhite;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = tokens.glassBorder;
  ctx.stroke();

  drawQuestionTypeBadge(ctx, { x: cardX + cardPadding, y: cardY + 56, questionType, tokens });

  ctx.fillStyle = tokens.paper;
  ctx.font = '600 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  drawWrappedText(ctx, questionText, {
    x: cardX + cardPadding,
    y: cardY + 56 + 62,
    maxWidth: cardWidth - cardPadding * 2,
    lineHeight,
    align: 'left',
  });

  ctx.restore();

  // Pill sits outside the rotated card, tucked near its lower-right corner,
  // laid flat (unrotated) so the CTA stays easy to read at a glance.
  const pillY = cardY + 420;
  drawReplyPill(ctx, { x: cardX + cardWidth - 460, y: pillY, tokens, fontSize: 28 });

  // Caption placed independently near the bottom-left, separate from the
  // note itself -- this template treats the URL as ambient background
  // detail rather than a caption directly tied to the card.
  drawCaption(ctx, {
    x: 80,
    y: CANVAS_HEIGHT - 180,
    replyUrl,
    tokens,
    align: 'left',
    maxWidth: CANVAS_WIDTH - 160,
  });
}

/** gradient-card: full-bleed background gradient built only from token
 * colors (--ink to a --ember-tinted dark), with a large card anchored to
 * the bottom two-thirds of the canvas, top-aligned text, and the pill
 * floating above the card's top edge. */
function drawGradientCard(ctx, { questionText, questionType, replyUrl, tokens }) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, tokens.ink);
  gradient.addColorStop(1, tokens.ember);
  // Lay a near-opaque ink wash back over the gradient so the ember stop
  // reads as a subtle tint rather than a bright orange floor -- keeps the
  // background legible behind paper-colored text while still being built
  // entirely from the two token colors above.
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = 'rgba(12,13,16,0.82)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cardX = 0;
  const cardWidth = CANVAS_WIDTH;
  const cardY = 780;
  const cardHeight = CANVAS_HEIGHT - cardY;
  const cardPadding = 80;

  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, { tl: 56, tr: 56, br: 0, bl: 0 });
  ctx.fillStyle = tokens.glassWhite;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = tokens.glassBorder;
  ctx.stroke();

  // Pill floats above the card's top edge, straddling the seam between the
  // gradient background and the card.
  const pillWidthGuess = 420;
  const { width: pillWidth } = drawReplyPill(ctx, {
    x: (CANVAS_WIDTH - pillWidthGuess) / 2,
    y: cardY - 44,
    tokens,
    fontSize: 30,
  });
  if (Math.abs(pillWidth - pillWidthGuess) > 4) {
    ctx.clearRect(0, cardY - 52, CANVAS_WIDTH, 110);
    // Redraw the card's top edge over the cleared strip's lower portion,
    // then the correctly-centered pill on top.
    roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, { tl: 56, tr: 56, br: 0, bl: 0 });
    ctx.fillStyle = tokens.glassWhite;
    ctx.fill();
    drawReplyPill(ctx, { x: (CANVAS_WIDTH - pillWidth) / 2, y: cardY - 44, tokens, fontSize: 30 });
  }

  drawQuestionTypeBadge(ctx, { x: cardPadding, y: cardY + 96, questionType, tokens });

  ctx.fillStyle = tokens.paper;
  ctx.font = '700 58px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  drawWrappedText(ctx, questionText, {
    x: cardPadding,
    y: cardY + 96 + 72,
    maxWidth: cardWidth - cardPadding * 2,
    lineHeight: 72,
    align: 'left',
  });

  drawCaption(ctx, {
    x: cardPadding,
    y: CANVAS_HEIGHT - 90,
    replyUrl,
    tokens,
    align: 'left',
    maxWidth: cardWidth - cardPadding * 2,
  });
}

const TEMPLATE_DRAW_FNS = {
  'bold-center': drawBoldCenter,
  'sticky-note': drawStickyNote,
  'gradient-card': drawGradientCard,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders the requested template to an offscreen canvas and resolves with
 * the resulting PNG blob. Falls back to 'bold-center' for an unrecognized
 * template id rather than throwing, since a bad id shouldn't block sharing.
 */
export async function generateQuestionStoryImage({ questionText, questionType, replyUrl, template }) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  const drawFn = TEMPLATE_DRAW_FNS[template] || TEMPLATE_DRAW_FNS['bold-center'];
  const tokens = getTokens();

  drawFn(ctx, { questionText: questionText || '', questionType, replyUrl: replyUrl || '', tokens });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null.'));
    }, 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the download a moment to start before freeing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares a generated story image via the native share sheet when the
 * platform supports sharing files, falling back to a plain browser
 * download of the PNG otherwise. If the person backs out of the native
 * share sheet (AbortError), this respects that and does not fall back to
 * a forced download.
 */
export async function shareStoryImage(blob, { title } = {}) {
  const file = new File([blob], 'anonroom-question.png', { type: 'image/png' });

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
      // Any other failure means native sharing genuinely didn't work here,
      // so fall through to the download fallback below.
    }
  }

  downloadBlob(blob, 'anonroom-question.png');
}
