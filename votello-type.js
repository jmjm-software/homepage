import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
} from './vendor/pretext/layout.js';

const stage = document.getElementById('votello-type');
const canvas = document.getElementById('votello-type-canvas');

if (!(stage instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Votello typography stage is unavailable');
}

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D is unavailable');

const COPY = (
  'Scan a product. Trace the companies behind it, from the brand on the package to the parent at the top of the ownership chain. ' +
  'Explore verified environmental, labor, human-rights, political, tax, supply-chain, and governance signals. ' +
  'Open every source and read the exact evidence behind each claim. ' +
  'Votello keeps uncertainty visible, explains how each signal shapes the score, and never turns missing evidence into a clean bill of health. ' +
  'Not a shopping verdict — a transparent map, so you can decide for yourself. '
).repeat(4);

const FONT_DESKTOP = '500 13px "IBM Plex Sans"';
const FONT_MOBILE = '500 11.5px "IBM Plex Sans"';
const LETTER_SPACING = 0.2;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* EAN-style bar pattern: module widths, guard bars render taller */
const BAR_PATTERN = [
  { w: 1, guard: true }, { w: 1 }, { w: 2 }, { w: 1 }, { w: 3 }, { w: 1 },
  { w: 2 }, { w: 2 }, { w: 1 }, { w: 3 },
  { w: 1, guard: true }, { w: 1, guard: true },
  { w: 2 }, { w: 1 }, { w: 3 }, { w: 1 }, { w: 1 }, { w: 2 }, { w: 3 }, { w: 1 },
  { w: 1, guard: true }, { w: 1 },
];

let preparedByFont = {};
let cssWidth = 0;
let cssHeight = 0;
let pixelRatio = 1;
let mobile = false;
let visible = false;
let frameId = 0;
let pointerActive = false;
let lastPointerMove = 0;
const pointer = { x: 0, y: 0 };
const barcode = { x: 0, y: 0, w: 96, h: 44 };

function typography() {
  return mobile
    ? { font: FONT_MOBILE, lineHeight: 17, margin: 16 }
    : { font: FONT_DESKTOP, lineHeight: 21, margin: 22 };
}

function barcodeSize() {
  return mobile ? { w: 72, h: 34 } : { w: 96, h: 44 };
}

function resize() {
  const rect = stage.getBoundingClientRect();
  cssWidth = Math.max(1, Math.round(rect.width));
  cssHeight = Math.max(1, Math.round(rect.height));
  mobile = cssWidth < 380;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const size = barcodeSize();
  barcode.w = size.w;
  barcode.h = size.h;
  if (!barcode.x) {
    barcode.x = cssWidth * 0.58;
    barcode.y = cssHeight * 0.48;
  }
  draw(performance.now());
}

function rowSegments(y, lineHeight, margin) {
  const pad = mobile ? 13 : 16;
  const halfW = barcode.w / 2 + pad;
  const halfH = barcode.h / 2 + pad;
  const bandTop = y - lineHeight * 0.8;
  const bandBottom = y + lineHeight * 0.22;
  const full = [{ x: margin, width: cssWidth - margin * 2 }];
  if (bandBottom < barcode.y - halfH || bandTop > barcode.y + halfH) return full;

  const segments = [];
  const leftWidth = barcode.x - halfW - margin;
  if (leftWidth >= 64) segments.push({ x: margin, width: leftWidth });
  const rightX = barcode.x + halfW;
  const rightWidth = cssWidth - margin - rightX;
  if (rightWidth >= 64) segments.push({ x: rightX, width: rightWidth });
  return segments;
}

function drawText() {
  const { font, lineHeight, margin } = typography();
  const prepared = preparedByFont[font];
  if (!prepared) return;

  ctx.font = font;
  ctx.letterSpacing = `${LETTER_SPACING}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let lineIndex = 0;
  let cycle = 0;
  const cycleAlpha = [1, 0.7, 0.52, 0.42];
  const topY = mobile ? 24 : 30;
  for (let y = topY; y < cssHeight - 12; y += lineHeight) {
    for (const segment of rowSegments(y, lineHeight, margin)) {
      let range = layoutNextLineRange(prepared, cursor, segment.width);
      if (!range) {
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        cycle += 1;
        range = layoutNextLineRange(prepared, cursor, segment.width);
      }
      if (!range) return;
      const line = materializeLineRange(prepared, range);
      const repeat = cycleAlpha[Math.min(cycle, cycleAlpha.length - 1)];

      const distance = Math.hypot(segment.x + line.width / 2 - barcode.x, y - barcode.y);
      const near = Math.max(0, 1 - distance / 175);
      ctx.fillStyle = near > 0.08
        ? `rgba(70,214,140,${(0.4 + near * 0.55) * repeat})`
        : `rgba(217,228,226,${(0.6 + (lineIndex % 2) * 0.04) * repeat})`;
      ctx.fillText(line.text, segment.x, y);

      cursor = range.end;
      lineIndex += 1;
    }
  }
}

function drawBarcode(time) {
  const { x, y, w, h } = barcode;
  const left = x - w / 2;
  const top = y - h / 2;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, w * 1.05);
  glow.addColorStop(0, 'rgba(70,214,140,0.13)');
  glow.addColorStop(1, 'rgba(70,214,140,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, w * 1.05, 0, Math.PI * 2);
  ctx.fill();

  const modules = BAR_PATTERN.reduce((sum, bar) => sum + bar.w + 1, 0);
  const module = w / modules;
  let bx = left;
  for (const bar of BAR_PATTERN) {
    const barWidth = bar.w * module;
    const barHeight = bar.guard ? h : h * 0.76;
    ctx.fillStyle = bar.guard ? 'rgba(70,214,140,0.95)' : 'rgba(217,228,226,0.92)';
    ctx.fillRect(bx, y - barHeight / 2, barWidth, barHeight);
    bx += barWidth + module;
  }

  const sweepY = reduced ? y : top + ((time * 0.045) % (h + 16)) - 8;
  if (sweepY > top - 8 && sweepY < top + h + 8) {
    const beam = ctx.createLinearGradient(left, sweepY, left + w, sweepY);
    beam.addColorStop(0, 'rgba(70,214,140,0)');
    beam.addColorStop(0.5, 'rgba(70,214,140,0.9)');
    beam.addColorStop(1, 'rgba(70,214,140,0)');
    ctx.strokeStyle = beam;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left - 6, sweepY);
    ctx.lineTo(left + w + 6, sweepY);
    ctx.stroke();
  }

  const boxPad = 9;
  const arm = mobile ? 8 : 11;
  ctx.strokeStyle = 'rgba(255,180,84,0.7)';
  ctx.lineWidth = 1.4;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x + sx * (w / 2 + boxPad);
    const cy = y + sy * (h / 2 + boxPad);
    ctx.beginPath();
    ctx.moveTo(cx - sx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy - sy * arm);
    ctx.stroke();
  }

  ctx.font = mobile ? '400 7px "JetBrains Mono"' : '400 8px "JetBrains Mono"';
  ctx.letterSpacing = '1.5px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(127,146,150,0.78)';
  ctx.fillText('4 012345 678901', x, top + h + 11);
}

function draw(time) {
  if (!cssWidth || !cssHeight) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const idleX = cssWidth * (0.55 + Math.sin(time * 0.00034) * 0.13);
  const idleY = cssHeight * (0.48 + Math.cos(time * 0.00042) * 0.16);
  const recentlyMoved = performance.now() - lastPointerMove < 1700;
  const targetX = pointerActive && recentlyMoved ? pointer.x : idleX;
  const targetY = pointerActive && recentlyMoved ? pointer.y : idleY;
  const ease = reduced ? 1 : 0.085;
  barcode.x += (targetX - barcode.x) * ease;
  barcode.y += (targetY - barcode.y) * ease;

  drawText();
  drawBarcode(time);
}

function animate(time) {
  draw(time);
  frameId = visible && !reduced ? requestAnimationFrame(animate) : 0;
}

stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect();
  const halfW = barcode.w / 2 + 8;
  const halfH = barcode.h / 2 + 8;
  pointer.x = Math.max(halfW, Math.min(cssWidth - halfW, event.clientX - rect.left));
  pointer.y = Math.max(halfH, Math.min(cssHeight - halfH, event.clientY - rect.top));
  pointerActive = event.pointerType === 'mouse' || event.pointerType === 'pen';
  lastPointerMove = performance.now();
  if (pointerActive) draw(lastPointerMove);
});
stage.addEventListener('pointerleave', () => { pointerActive = false; });

new ResizeObserver(resize).observe(stage);
new IntersectionObserver(([entry]) => {
  visible = Boolean(entry?.isIntersecting);
  if (visible && !frameId) frameId = requestAnimationFrame(animate);
  if (!visible && frameId) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
}, { rootMargin: '120px' }).observe(stage);

await Promise.all([
  document.fonts.load(FONT_DESKTOP),
  document.fonts.load(FONT_MOBILE),
  document.fonts.load('400 8px "JetBrains Mono"'),
]);
preparedByFont = {
  [FONT_DESKTOP]: prepareWithSegments(COPY, FONT_DESKTOP, { letterSpacing: LETTER_SPACING }),
  [FONT_MOBILE]: prepareWithSegments(COPY, FONT_MOBILE, { letterSpacing: LETTER_SPACING }),
};
resize();
