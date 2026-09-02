import {
  measureNaturalWidth,
  prepareWithSegments,
} from './vendor/pretext/layout.js';

const stage = document.getElementById('votello-type');
const canvas = document.getElementById('votello-type-canvas');

if (!(stage instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Votello typography stage is unavailable');
}

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D is unavailable');

const FONT = '600 11px "IBM Plex Sans"';
const CENTER_FONT = '700 10px "IBM Plex Sans"';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const RING_LABELS = [
  ['PRODUCT', 'BARCODE', 'CATEGORY'],
  ['BRAND', 'COMPANY', 'MANUFACTURER', 'OWNER'],
  ['PARENT', 'SUBSIDIARY', 'SOURCE', 'EVIDENCE', 'SCORE'],
];

let labels = [];
let cssWidth = 0;
let cssHeight = 0;
let pixelRatio = 1;
let visible = false;
let frameId = 0;
let pointerActive = false;
let lastPointerMove = 0;
const pointer = { x: 0, y: 0 };
const center = { x: 0, y: 0 };

function prepareLabels() {
  labels = RING_LABELS.map((ring) => ring.map((text) => {
    const prepared = prepareWithSegments(text, FONT, { letterSpacing: 1.1 });
    return { text, width: measureNaturalWidth(prepared) + Math.max(0, text.length - 1) * 1.1 };
  }));
}

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
  if (!center.x) {
    center.x = cssWidth * 0.55;
    center.y = cssHeight * 0.5;
  }
  draw(performance.now());
}

function ringRadii() {
  const maxRadius = Math.min(cssWidth, cssHeight) * 0.43;
  return [maxRadius * 0.38, maxRadius * 0.68, maxRadius];
}

function drawGrid() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(70,214,140,0.045)';
  for (let x = 18; x < cssWidth; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }
  for (let y = 18; y < cssHeight; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }
}

function drawRipple(time, maxRadius) {
  if (reduced) return;
  const progress = (time * 0.00016) % 1;
  const radius = maxRadius * (0.25 + progress * 1.05);
  ctx.strokeStyle = `rgba(70,214,140,${(1 - progress) * 0.16})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLabel(label, angle, radius, ringIndex) {
  const x = center.x + Math.cos(angle) * radius;
  const y = center.y + Math.sin(angle) * radius;
  let rotation = angle + Math.PI / 2;
  if (Math.cos(angle) < 0) rotation += Math.PI;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const alpha = 0.68 - ringIndex * 0.08;
  const padX = 6;
  const boxWidth = label.width + padX * 2;
  ctx.fillStyle = 'rgba(5,18,20,0.88)';
  ctx.fillRect(-boxWidth / 2, -9, boxWidth, 17);
  ctx.strokeStyle = ringIndex === 0
    ? 'rgba(255,180,84,0.42)'
    : `rgba(70,214,140,${0.22 - ringIndex * 0.035})`;
  ctx.strokeRect(-boxWidth / 2, -9, boxWidth, 17);
  ctx.font = FONT;
  ctx.letterSpacing = '1.1px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ringIndex === 0
    ? `rgba(255,180,84,${alpha + 0.08})`
    : `rgba(217,228,226,${alpha})`;
  ctx.fillText(label.text, 0, 0);
  ctx.restore();

  return { x, y };
}

function drawRings(time, radii) {
  const speed = reduced ? 0 : time * 0.00008;
  radii.forEach((radius, ringIndex) => {
    ctx.strokeStyle = `rgba(70,214,140,${0.23 - ringIndex * 0.045})`;
    ctx.lineWidth = ringIndex === 0 ? 1.25 : 1;
    ctx.setLineDash(ringIndex === 1 ? [3, 5] : []);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const ring = labels[ringIndex];
    const direction = ringIndex % 2 === 0 ? 1 : -1;
    const offset = speed * direction * (1.15 - ringIndex * 0.18) + ringIndex * 0.7;
    ring.forEach((label, labelIndex) => {
      const angle = offset + (labelIndex / ring.length) * Math.PI * 2;
      const point = drawLabel(label, angle, radius, ringIndex);
      if (ringIndex === 0) {
        ctx.strokeStyle = 'rgba(255,180,84,0.12)';
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    });
  });
}

function drawCore(time) {
  const pulse = reduced ? 0 : Math.sin(time * 0.0026) * 2;
  const radius = 20 + pulse;
  const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 46);
  glow.addColorStop(0, 'rgba(70,214,140,0.22)');
  glow.addColorStop(1, 'rgba(70,214,140,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(5,24,25,0.96)';
  ctx.strokeStyle = 'rgba(70,214,140,0.9)';
  ctx.lineWidth = 1.3;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.font = CENTER_FONT;
  ctx.letterSpacing = '1.2px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(70,214,140,0.95)';
  ctx.fillText('PRODUCT', center.x, center.y - 5);
  ctx.font = '500 8px "IBM Plex Sans"';
  ctx.letterSpacing = '1px';
  ctx.fillStyle = 'rgba(127,146,150,0.8)';
  ctx.fillText('TRACE', center.x, center.y + 8);
}

function draw(time) {
  if (!labels.length || !cssWidth || !cssHeight) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  drawGrid();

  const idleX = cssWidth * (0.55 + Math.sin(time * 0.00038) * 0.08);
  const idleY = cssHeight * (0.5 + Math.cos(time * 0.00044) * 0.08);
  const recentlyMoved = performance.now() - lastPointerMove < 1800;
  const targetX = pointerActive && recentlyMoved ? pointer.x : idleX;
  const targetY = pointerActive && recentlyMoved ? pointer.y : idleY;
  const ease = reduced ? 1 : 0.075;
  center.x += (targetX - center.x) * ease;
  center.y += (targetY - center.y) * ease;

  const radii = ringRadii();
  drawRipple(time, radii[2]);
  drawRings(time, radii);
  drawCore(time);
}

function animate(time) {
  draw(time);
  frameId = visible && !reduced ? requestAnimationFrame(animate) : 0;
}

stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect();
  const radii = ringRadii();
  const edge = radii[2] + 14;
  pointer.x = Math.max(edge, Math.min(cssWidth - edge, event.clientX - rect.left));
  pointer.y = Math.max(edge, Math.min(cssHeight - edge, event.clientY - rect.top));
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

await Promise.all([document.fonts.load(FONT), document.fonts.load(CENTER_FONT)]);
prepareLabels();
resize();
