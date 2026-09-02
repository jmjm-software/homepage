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

const COPY = 'Scan a product. Trace the companies behind it, from the brand on the package to the parent company at the top of the ownership chain. Explore verified environmental, labor, human-rights, political, tax, supply-chain, and governance signals. Open every source and read the exact evidence behind each claim. Votello keeps uncertainty visible, explains how each signal affects the score, and never turns missing evidence into a clean bill of health. The result is not a shopping verdict. It is a transparent map that helps you decide for yourself.';
const FONT_DESKTOP = '500 13px "IBM Plex Sans"';
const FONT_MOBILE = '500 11.5px "IBM Plex Sans"';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let preparedDesktop;
let preparedMobile;
let cssWidth = 0;
let cssHeight = 0;
let pixelRatio = 1;
let visible = false;
let frameId = 0;
let pointerActive = false;
let lastPointerMove = 0;
const pointer = { x: 0, y: 0 };
const graph = { x: 0, y: 0 };

function typography() {
  const mobile = cssWidth < 380;
  return {
    font: mobile ? FONT_MOBILE : FONT_DESKTOP,
    lineHeight: mobile ? 17 : 21,
    prepared: mobile ? preparedMobile : preparedDesktop,
    margin: mobile ? 16 : 22,
  };
}

function graphSize() {
  const mobile = cssWidth < 380;
  return {
    width: mobile ? 104 : 144,
    height: mobile ? 88 : 116,
  };
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
  if (!graph.x) {
    graph.x = cssWidth * 0.72;
    graph.y = cssHeight * 0.49;
  }
  draw(performance.now());
}

function drawBackdrop() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(70,214,140,0.035)';
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

  const glow = ctx.createRadialGradient(graph.x, graph.y, 0, graph.x, graph.y, 150);
  glow.addColorStop(0, 'rgba(70,214,140,0.095)');
  glow.addColorStop(1, 'rgba(70,214,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
}

function drawCopy() {
  const { font, lineHeight, prepared, margin } = typography();
  if (!prepared) return;

  const size = graphSize();
  const graphLeft = graph.x - size.width / 2;
  const graphTop = graph.y - size.height / 2;
  const graphBottom = graph.y + size.height / 2;
  const textTop = cssWidth < 380 ? 21 : 30;
  const textBottom = cssHeight - 15;
  const gap = cssWidth < 380 ? 12 : 18;

  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0.15px';

  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let lineIndex = 0;
  for (let y = textTop; y < textBottom; y += lineHeight) {
    const lineBandTop = y - lineHeight * 0.78;
    const lineBandBottom = y + lineHeight * 0.18;
    const hitsGraph = lineBandBottom >= graphTop && lineBandTop <= graphBottom;
    const maxWidth = hitsGraph
      ? graphLeft - gap - margin
      : cssWidth - margin * 2;

    if (maxWidth < 105) continue;
    const range = layoutNextLineRange(prepared, cursor, maxWidth);
    if (!range) break;
    const line = materializeLineRange(prepared, range);

    const keyLine = /^(Scan|Trace|Explore|Open|Votello|The result)/.test(line.text);
    ctx.fillStyle = keyLine
      ? 'rgba(70,214,140,0.9)'
      : `rgba(217,228,226,${0.62 + (lineIndex % 3) * 0.055})`;
    ctx.fillText(line.text, margin, y);

    cursor = range.end;
    lineIndex += 1;
  }
}

function drawNode(x, y, label, active = false) {
  const width = cssWidth < 380 ? 45 : 58;
  const height = cssWidth < 380 ? 20 : 24;
  ctx.fillStyle = active ? 'rgba(70,214,140,0.16)' : 'rgba(5,18,20,0.96)';
  ctx.strokeStyle = active ? 'rgba(70,214,140,0.92)' : 'rgba(90,215,224,0.48)';
  ctx.lineWidth = active ? 1.4 : 1;
  ctx.fillRect(x - width / 2, y - height / 2, width, height);
  ctx.strokeRect(x - width / 2, y - height / 2, width, height);
  ctx.font = cssWidth < 380 ? '700 7px "IBM Plex Sans"' : '700 8.5px "IBM Plex Sans"';
  ctx.letterSpacing = '0.8px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = active ? 'rgba(70,214,140,0.98)' : 'rgba(217,228,226,0.76)';
  ctx.fillText(label, x, y + 0.5);
}

function drawGraph(time) {
  const size = graphSize();
  const scale = cssWidth < 380 ? 0.72 : 1;
  const pulse = reduced ? 0 : Math.sin(time * 0.0025) * 1.5;
  const top = { x: graph.x, y: graph.y - 40 * scale };
  const left = { x: graph.x - 40 * scale, y: graph.y + 29 * scale };
  const right = { x: graph.x + 40 * scale, y: graph.y + 29 * scale };

  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = 'rgba(70,214,140,0.22)';
  ctx.strokeRect(
    graph.x - size.width / 2 - pulse,
    graph.y - size.height / 2 - pulse,
    size.width + pulse * 2,
    size.height + pulse * 2,
  );
  ctx.restore();

  ctx.strokeStyle = 'rgba(70,214,140,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y + 12 * scale);
  ctx.lineTo(left.x, left.y - 10 * scale);
  ctx.moveTo(top.x, top.y + 12 * scale);
  ctx.lineTo(right.x, right.y - 10 * scale);
  ctx.stroke();

  const travel = reduced ? 0.5 : (time * 0.0003) % 1;
  for (const target of [left, right]) {
    const x = top.x + (target.x - top.x) * travel;
    const y = top.y + (target.y - top.y) * travel;
    ctx.fillStyle = 'rgba(255,180,84,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawNode(top.x, top.y, 'PRODUCT', true);
  drawNode(left.x, left.y, 'BRAND');
  drawNode(right.x, right.y, 'OWNER');
}

function draw(time) {
  if (!preparedDesktop || !preparedMobile || !cssWidth || !cssHeight) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const idleX = cssWidth * (0.72 + Math.sin(time * 0.00034) * 0.045);
  const idleY = cssHeight * (0.49 + Math.cos(time * 0.00042) * 0.09);
  const recentlyMoved = performance.now() - lastPointerMove < 1700;
  const targetX = pointerActive && recentlyMoved ? pointer.x : idleX;
  const targetY = pointerActive && recentlyMoved ? pointer.y : idleY;
  const ease = reduced ? 1 : 0.075;
  graph.x += (targetX - graph.x) * ease;
  graph.y += (targetY - graph.y) * ease;

  drawBackdrop();
  drawCopy();
  drawGraph(time);
}

function animate(time) {
  draw(time);
  frameId = visible && !reduced ? requestAnimationFrame(animate) : 0;
}

stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect();
  const size = graphSize();
  const rawX = (event.clientX - rect.left) / Math.max(1, rect.width);
  const rawY = (event.clientY - rect.top) / Math.max(1, rect.height);
  pointer.x = cssWidth * (0.6 + rawX * 0.18);
  pointer.y = Math.max(size.height * 0.62, Math.min(cssHeight - size.height * 0.62, rawY * cssHeight));
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
]);
preparedDesktop = prepareWithSegments(COPY, FONT_DESKTOP, { letterSpacing: 0.15 });
preparedMobile = prepareWithSegments(COPY, FONT_MOBILE, { letterSpacing: 0.15 });
resize();
