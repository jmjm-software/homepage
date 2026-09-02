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

const FONT = '600 12px "IBM Plex Sans"';
const LINE_HEIGHT = 19;
const COPY = (
  'Scan a product. Trace who owns it. Read the evidence. Decide for yourself. ' +
  'A barcode becomes a brand, a company, an ownership network, and a trail of public sources. ' +
  'Claims stay connected to exact quotations. Uncertainty stays visible. Missing evidence stays unknown. ' +
  'Scores summarize the record; they never replace it. Transparency is not a verdict. It is a better view. '
).repeat(8);

let prepared;
let cssWidth = 0;
let cssHeight = 0;
let pixelRatio = 1;
let visible = false;
let frameId = 0;
let pointerActive = false;
const pointer = { x: 0, y: 0 };
const lens = { x: 0, y: 0 };
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  const rect = stage.getBoundingClientRect();
  cssWidth = Math.max(1, Math.round(rect.width));
  cssHeight = Math.max(1, Math.round(rect.height));
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (!lens.x) {
    lens.x = cssWidth * 0.58;
    lens.y = cssHeight * 0.48;
  }
  draw(performance.now());
}

function lineSlot(y, radius) {
  const margin = 22;
  const gap = 14;
  const bandCenter = y - LINE_HEIGHT * 0.35;
  const dy = Math.abs(bandCenter - lens.y);
  if (dy > radius + LINE_HEIGHT) return { x: margin, width: cssWidth - margin * 2 };

  const halfChord = Math.sqrt(Math.max(0, radius * radius - Math.min(radius, dy) ** 2));
  const leftWidth = lens.x - halfChord - gap - margin;
  const rightX = lens.x + halfChord + gap;
  const rightWidth = cssWidth - margin - rightX;
  if (rightWidth > leftWidth) return { x: rightX, width: rightWidth };
  return { x: margin, width: leftWidth };
}

function drawScanner(time, radius) {
  const pulse = reduced ? 0 : 0.5 + Math.sin(time * 0.0024) * 0.5;
  const glow = ctx.createRadialGradient(lens.x, lens.y, radius * 0.08, lens.x, lens.y, radius * 1.35);
  glow.addColorStop(0, 'rgba(70,214,140,0.12)');
  glow.addColorStop(0.62, 'rgba(70,214,140,0.045)');
  glow.addColorStop(1, 'rgba(70,214,140,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lens.x, lens.y, radius * 1.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(70,214,140,${0.58 + pulse * 0.2})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(lens.x, lens.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,215,224,0.2)';
  ctx.beginPath();
  ctx.arc(lens.x, lens.y, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  const sweepY = reduced ? lens.y : lens.y - radius * 0.7 + ((time * 0.055) % (radius * 1.4));
  const chord = Math.sqrt(Math.max(0, radius * radius - (sweepY - lens.y) ** 2));
  const beam = ctx.createLinearGradient(lens.x - chord, sweepY, lens.x + chord, sweepY);
  beam.addColorStop(0, 'rgba(70,214,140,0)');
  beam.addColorStop(0.5, 'rgba(70,214,140,0.9)');
  beam.addColorStop(1, 'rgba(70,214,140,0)');
  ctx.strokeStyle = beam;
  ctx.beginPath();
  ctx.moveTo(lens.x - chord, sweepY);
  ctx.lineTo(lens.x + chord, sweepY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(217,228,226,0.76)';
  const bars = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1];
  const total = bars.reduce((sum, width) => sum + width + 1, 0);
  let bx = lens.x - total;
  for (const width of bars) {
    const h = radius * (0.35 + ((width * 17) % 4) * 0.055);
    ctx.fillRect(bx, lens.y - h / 2, width, h);
    bx += width + 2;
  }

  const corner = radius * 0.4;
  const arm = 12;
  ctx.strokeStyle = 'rgba(255,180,84,0.72)';
  ctx.lineWidth = 1.5;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = lens.x + sx * corner;
    const y = lens.y + sy * corner;
    ctx.beginPath();
    ctx.moveTo(x - sx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - sy * arm);
    ctx.stroke();
  }
}

function draw(time) {
  if (!prepared || !cssWidth || !cssHeight) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const radius = Math.max(58, Math.min(88, cssWidth * 0.15));
  const idleX = cssWidth * (0.58 + Math.sin(time * 0.00045) * 0.11);
  const idleY = cssHeight * (0.49 + Math.cos(time * 0.00058) * 0.13);
  const targetX = pointerActive ? pointer.x : idleX;
  const targetY = pointerActive ? pointer.y : idleY;
  const ease = reduced ? 1 : 0.09;
  lens.x += (targetX - lens.x) * ease;
  lens.y += (targetY - lens.y) * ease;

  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let lineIndex = 0;
  for (let y = 25; y < cssHeight - 12; y += LINE_HEIGHT) {
    const slot = lineSlot(y, radius);
    if (slot.width < 76) continue;
    const range = layoutNextLineRange(prepared, cursor, slot.width);
    if (!range) break;
    const line = materializeLineRange(prepared, range);
    const distance = Math.hypot(slot.x + line.width * 0.5 - lens.x, y - lens.y);
    const near = Math.max(0, 1 - distance / (radius * 2.5));
    ctx.fillStyle = near > 0.16
      ? `rgba(70,214,140,${0.26 + near * 0.55})`
      : `rgba(127,146,150,${0.21 + (lineIndex % 3) * 0.035})`;
    ctx.fillText(line.text, slot.x, y);
    cursor = range.end;
    lineIndex += 1;
  }

  drawScanner(time, radius);
}

function animate(time) {
  draw(time);
  frameId = visible && !reduced ? requestAnimationFrame(animate) : 0;
}

stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect();
  pointer.x = Math.max(76, Math.min(cssWidth - 76, event.clientX - rect.left));
  pointer.y = Math.max(76, Math.min(cssHeight - 76, event.clientY - rect.top));
  pointerActive = event.pointerType === 'mouse' || event.pointerType === 'pen';
  if (pointerActive) draw(performance.now());
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

await document.fonts.load(FONT);
prepared = prepareWithSegments(COPY, FONT);
resize();