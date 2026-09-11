/**
 * Standard-form drawers for storyImageGenerator.js
 * Merge into generateStoryImage when template === 'tweet'.
 * Falls back to normal for unknown ids.
 */
export const STANDARD_STYLE_IDS = [
  'normal', 'tweet', 'polaroid', 'neon', 'minimal', 'magazine', 'sticky', 'glass',
];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 12);
}

function drawOutlinedText(ctx, text, x, y) {
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
}

/** Call from generateStoryImage Standard branch. */
export function drawStandardForm(ctx, {
  standardStyle = 'normal',
  canvasW,
  canvasH,
  text,
  tagLabel = 'Message',
  tagFrom = '#3D8BFF',
  tagTo = '#5B8FFF',
  senderName = '',
}) {
  const style = STANDARD_STYLE_IDS.includes(standardStyle) ? standardStyle : 'normal';
  const body = String(text || '').trim() || '…';

  if (style === 'tweet') {
    // Light social card (existing look approximation)
    ctx.fillStyle = '#E8EEF5';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const cardW = canvasW * 0.86;
    const cardX = (canvasW - cardW) / 2;
    const cardY = canvasH * 0.22;
    ctx.fillStyle = '#fff';
    roundRect(ctx, cardX, cardY, cardW, canvasH * 0.42, 28);
    ctx.fill();
    ctx.fillStyle = '#0F1419';
    ctx.font = '700 42px system-ui, sans-serif';
    ctx.fillText(senderName || 'Anonroom', cardX + 40, cardY + 70);
    ctx.font = '500 36px system-ui, sans-serif';
    ctx.fillStyle = '#333';
    const lines = wrapLines(ctx, body, cardW - 80);
    lines.forEach((ln, i) => ctx.fillText(ln, cardX + 40, cardY + 140 + i * 48));
    return;
  }

  if (style === 'polaroid') {
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const w = canvasW * 0.78;
    const h = canvasH * 0.55;
    const x = (canvasW - w) / 2;
    const y = canvasH * 0.18;
    ctx.save();
    ctx.translate(canvasW / 2, canvasH * 0.42);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.translate(-canvasW / 2, -canvasH * 0.42);
    ctx.fillStyle = '#f6f4ef';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = '#2a2a2e';
    roundRect(ctx, x + 28, y + 28, w - 56, h * 0.62, 4);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = '600 34px Georgia, serif';
    const lines = wrapLines(ctx, body, w - 80);
    lines.forEach((ln, i) => ctx.fillText(ln, x + 40, y + h * 0.72 + i * 42));
    ctx.restore();
    return;
  }

  if (style === 'neon') {
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const w = canvasW * 0.82;
    const h = canvasH * 0.38;
    const x = (canvasW - w) / 2;
    const y = canvasH * 0.32;
    ctx.save();
    ctx.shadowColor = tagFrom;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = tagFrom;
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, w, h, 24);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '800 44px system-ui, sans-serif';
    const lines = wrapLines(ctx, body, w - 80);
    lines.forEach((ln, i) => {
      ctx.shadowColor = tagTo;
      ctx.shadowBlur = 12;
      ctx.fillText(ln, x + 40, y + 90 + i * 56);
    });
    ctx.shadowBlur = 0;
    return;
  }

  if (style === 'minimal') {
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#f5f5f7';
    ctx.font = '500 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const lines = wrapLines(ctx, body, canvasW * 0.7);
    const startY = canvasH * 0.42 - (lines.length * 58) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, canvasW / 2, startY + i * 58));
    ctx.textAlign = 'left';
    return;
  }

  if (style === 'magazine') {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = tagFrom;
    ctx.fillRect(canvasW * 0.1, canvasH * 0.28, canvasW * 0.8, 4);
    ctx.fillStyle = '#111';
    ctx.font = '700 56px Georgia, serif';
    const lines = wrapLines(ctx, body, canvasW * 0.78);
    lines.forEach((ln, i) => ctx.fillText(ln, canvasW * 0.11, canvasH * 0.38 + i * 68));
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText((senderName || tagLabel).toUpperCase(), canvasW * 0.11, canvasH * 0.38 + lines.length * 68 + 40);
    return;
  }

  if (style === 'sticky') {
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const w = canvasW * 0.72;
    const h = canvasH * 0.4;
    const x = (canvasW - w) / 2;
    const y = canvasH * 0.28;
    ctx.save();
    ctx.translate(canvasW / 2, canvasH * 0.45);
    ctx.rotate((4 * Math.PI) / 180);
    ctx.translate(-canvasW / 2, -canvasH * 0.45);
    ctx.fillStyle = '#FFE56A';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.fillStyle = '#3a2f00';
    ctx.font = '600 40px "Segoe Print", "Comic Sans MS", cursive';
    const lines = wrapLines(ctx, body, w - 70);
    lines.forEach((ln, i) => ctx.fillText(ln, x + 36, y + 80 + i * 50));
    ctx.restore();
    return;
  }

  if (style === 'glass') {
    const g = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    g.addColorStop(0, '#1a2744');
    g.addColorStop(1, '#3a1a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasW, canvasH);
    const w = canvasW * 0.84;
    const h = canvasH * 0.36;
    const x = (canvasW - w) / 2;
    const y = canvasH * 0.32;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x, y, w, h, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 28);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '600 40px system-ui, sans-serif';
    const lines = wrapLines(ctx, body, w - 80);
    lines.forEach((ln, i) => ctx.fillText(ln, x + 40, y + 90 + i * 52));
    return;
  }

  // normal (default) — tag header + grey body + outlined white text
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(0, 0, canvasW, canvasH);
  const cardW = canvasW * 0.86;
  const cardX = (canvasW - cardW) / 2;
  const cardY = canvasH * 0.26;
  const tagH = 56;
  const bodyH = canvasH * 0.34;
  const tg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
  tg.addColorStop(0, tagFrom);
  tg.addColorStop(1, tagTo);
  ctx.fillStyle = tg;
  roundRect(ctx, cardX, cardY, cardW, tagH, 18);
  ctx.fill();
  // square off bottom of tag
  ctx.fillRect(cardX, cardY + tagH - 18, cardW, 18);
  ctx.fillStyle = '#fff';
  ctx.font = '800 28px system-ui, sans-serif';
  ctx.fillText(String(tagLabel).toUpperCase(), cardX + 28, cardY + 38);
  ctx.fillStyle = '#2a2a32';
  roundRect(ctx, cardX, cardY + tagH - 4, cardW, bodyH, 18);
  ctx.fill();
  ctx.font = '700 40px system-ui, sans-serif';
  const lines = wrapLines(ctx, body, cardW - 64);
  lines.forEach((ln, i) => drawOutlinedText(ctx, ln, cardX + 32, cardY + tagH + 70 + i * 52));
}
