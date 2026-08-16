/* ─────────────────────────────────────────────────────
   scene.js — "The Machine"
   A fixed, scroll-driven three.js scene that acts out
   the page's thesis: BUILD → INSPECT → TEARDOWN.

   · Assembly  (scroll   0 – 0.45): a wireframe blueprint
     hangs in the void while ~28 solid parts fly in and
     snap into place, flashing as they lock.
   · Inspection (0.46 – 0.70): the finished machine turns
     slowly under a sweeping scan plane, a targeting
     reticle and orbiting probe drones.
   · Teardown  (0.72 – 1.0): the machine explodes into a
     technical exploded view; red finding-markers pulse
     on suspect parts while the cage opens and the core
     is laid bare.

   No 3D text — the DOM owns all words. Exposes scroll
   progress via window.__stackProgress.
   ───────────────────────────────────────────────────── */
import * as THREE from './vendor/three.module.min.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* mobile: cap GPU work — fewer pixels, no MSAA, fewer dust motes */
const MOBILE = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  canvas.style.display = 'none';
  window.__stackProgress = 0;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x070a0d, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a0d, 0.013);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 160);

/* ── lights ── */
scene.add(new THREE.AmbientLight(0x3a4a52, 1.05));
const key = new THREE.DirectionalLight(0xffd9a0, 1.2);
key.position.set(9, 14, 7);
scene.add(key);
const rim = new THREE.DirectionalLight(0x5ad7e0, 0.7);
rim.position.set(-12, -8, -9);
scene.add(rim);

/* ── image-based light: bright studio cards so metal facets read ── */
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const card = (c, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  card(new THREE.Color(3.4, 2.5, 1.3), 14, 8, 8, 12, 6);     // warm key, upper right
  card(new THREE.Color(0.5, 1.7, 1.9), 12, 10, -12, 2, -6);  // cyan rim, left
  card(new THREE.Color(0.16, 0.2, 0.24), 22, 22, 0, -14, 0); // dim floor bounce
  scene.environment = pmrem.fromScene(env, 0.05).texture;
  pmrem.dispose();
}

/* ── palette ── */
const AMBER = 0xffb454, ORANGE = 0xff6b35, GREEN = 0x46d68c, CYAN = 0x5ad7e0, RED = 0xff5252;
const colAmber = new THREE.Color(AMBER);
const colCyan = new THREE.Color(CYAN);

/* ── the machine ── */
const machine = new THREE.Group();
scene.add(machine);

const parts = [];
const rng = (a, b) => a + Math.random() * (b - a);

function addPart(spec) {
  const { geo, pos, rot = [0, 0, 0], explode = [0, 0, 0], basic = null,
          color = 0x17222a, emissive = AMBER, emInt = 0.16, rough = 0.42, metal = 0.55,
          edge = 0x93b9c6,
          noGhost = false, tumble = rng(0.35, 0.95) } = spec;

  const mat = basic
    ? new THREE.MeshBasicMaterial(basic)
    : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: emInt, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  machine.add(mesh);

  // crisp CAD edge lines — corners stay readable against the dark void
  let edgeMat = null;
  if (!basic) {
    edgeMat = new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.7 });
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat));
  }

  // blueprint ghost — the wireframe hologram the solid part snaps into
  let ghost = null;
  if (!noGhost) {
    ghost = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x3d5a64, transparent: true, opacity: 0.3 })
    );
    ghost.position.copy(mesh.position);
    ghost.rotation.copy(mesh.rotation);
    machine.add(ghost);
  }

  // scattered start pose (where the part flies in from)
  const dir = new THREE.Vector3(rng(-1, 1), rng(-0.7, 1), rng(-1, 1)).normalize();
  const startPos = new THREE.Vector3().copy(mesh.position).addScaledVector(dir, rng(9, 16));
  startPos.y += rng(-3, 5);
  const startQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rng(-Math.PI, Math.PI), rng(-Math.PI, Math.PI), rng(-Math.PI, Math.PI))
  );

  const explodeV = new THREE.Vector3(...explode);
  // Spin around the travel axis as the part backs out (like a screw),
  // rather than tumbling end-over-end — an end-over-end tumble sweeps a
  // wide arc and clips neighbouring parts in the exploded view.
  const axis = explodeV.lengthSq() > 1e-4
    ? explodeV.clone().normalize()
    : new THREE.Vector3(rng(-1, 1), rng(-1, 1), rng(-1, 1)).normalize();

  const p = {
    mesh, ghost, mat, edgeMat, edgeCol: new THREE.Color(edge),
    finalPos: mesh.position.clone(),
    finalQuat: mesh.quaternion.clone(),
    startPos, startQuat,
    explodeV,
    tumbleAxis: axis, tumbleSpeed: tumble, spin: 0,
    flash: 0, prevBp: 0,
    baseEm: emInt,
    t0: 0, t1: 0, td0: 0, td1: 0,
  };
  parts.push(p);
  return p;
}

/* ── part definitions, in assembly order ── */
// 1 · base plate
addPart({ geo: new THREE.BoxGeometry(5.2, 0.35, 5.2), pos: [0, -2.2, 0], explode: [0, -4.2, 0] });
// 2–3 · heat sinks
addPart({ geo: new THREE.BoxGeometry(0.9, 0.42, 1.7), pos: [1.7, -1.8, 0.3], explode: [3.8, -1.0, 1.5], emissive: CYAN, emInt: 0.1 });
addPart({ geo: new THREE.BoxGeometry(0.9, 0.42, 1.7), pos: [-1.7, -1.8, -0.3], explode: [-3.8, -1.0, -1.5], emissive: CYAN, emInt: 0.1 });
// 4–7 · corner pillars
for (const [x, z] of [[2.15, 2.15], [-2.15, 2.15], [2.15, -2.15], [-2.15, -2.15]]) {
  addPart({ geo: new THREE.BoxGeometry(0.3, 3.7, 0.3), pos: [x, -0.15, z], explode: [x * 1.55, -1.7, z * 1.55] });
}
// 8 · lower collar ring
addPart({ geo: new THREE.TorusGeometry(2.05, 0.09, 12, 72), pos: [0, -1.15, 0], rot: [Math.PI / 2, 0, 0], explode: [0, -2.7, 0], emissive: AMBER, emInt: 0.3 });
// 9–12 · energy conduits (glowing data lines, corner to corner)
const conduits = [];
for (const [x, z] of [[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) {
  conduits.push(addPart({
    geo: new THREE.CylinderGeometry(0.05, 0.05, 3.5, 8), pos: [x, -0.2, z],
    explode: [x * 2.5, 1.7, z * 2.5], noGhost: true,
    basic: { color: AMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false },
  }));
}
// 13–17 · chip array on the base
for (const [x, z] of [[-1.5, -1.4], [1.6, -1.5], [-1.7, 1.3], [1.4, 1.6], [0.2, -1.8]]) {
  addPart({ geo: new THREE.BoxGeometry(0.55, 0.16, 0.42), pos: [x, -1.94, z], explode: [x * 1.7, 2.9, z * 1.7], emissive: GREEN, emInt: 0.4 });
}
// 18 · upper collar ring
addPart({ geo: new THREE.TorusGeometry(1.65, 0.09, 12, 72), pos: [0, 1.45, 0], rot: [Math.PI / 2, 0, 0], explode: [0, 3.4, 0], emissive: AMBER, emInt: 0.3 });
// 19–22 · chassis panels
addPart({ geo: new THREE.BoxGeometry(0.12, 2.7, 1.9), pos: [2.35, 0.1, 0], explode: [5.2, 0.6, 0] });
addPart({ geo: new THREE.BoxGeometry(0.12, 2.7, 1.9), pos: [-2.35, 0.1, 0], explode: [-5.2, 0.6, 0] });
addPart({ geo: new THREE.BoxGeometry(1.9, 2.7, 0.12), pos: [0, 0.1, 2.35], explode: [0, 0.6, 5.2] });
addPart({ geo: new THREE.BoxGeometry(1.9, 2.7, 0.12), pos: [0, 0.1, -2.35], explode: [0, 0.6, -5.2] });
// 23–25 · cap, antenna, beacon
addPart({ geo: new THREE.CylinderGeometry(0.55, 1.15, 0.5, 6), pos: [0, 2.05, 0], explode: [0, 4.6, 0] });
addPart({ geo: new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), pos: [0, 2.85, 0], explode: [0, 5.8, 0] });
const beacon = addPart({
  geo: new THREE.SphereGeometry(0.13, 12, 12), pos: [0, 3.55, 0], explode: [0, 6.8, 0], noGhost: true,
  basic: { color: GREEN, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false },
});
// 26–27 · gyro rings around the core (always spinning — the machine's heartbeat)
const gyro1 = addPart({
  geo: new THREE.TorusGeometry(1.05, 0.028, 8, 72), pos: [0, 0.15, 0], explode: [2.1, 2.4, 0], noGhost: true,
  basic: { color: CYAN, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide },
});
const gyro2 = addPart({
  geo: new THREE.TorusGeometry(0.82, 0.028, 8, 72), pos: [0, 0.15, 0], rot: [Math.PI / 2.6, 0, 0], explode: [-2.1, -1.5, 0], noGhost: true,
  basic: { color: AMBER, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide },
});
// 28 · containment cage (wireframe — opens during teardown)
const cage = addPart({
  geo: new THREE.IcosahedronGeometry(1.25, 1), pos: [0, 0.15, 0], explode: [0, 0, 0], noGhost: true, tumble: 0.2,
  basic: { color: AMBER, wireframe: true, transparent: true, opacity: 0.34 },
});
// 29 · the core (arrives last, stays put during teardown — the exposed secret)
const core = addPart({
  geo: new THREE.IcosahedronGeometry(0.85, 1), pos: [0, 0.15, 0], explode: [0, 0, 0], tumble: 0,
  color: 0x1a120a, emissive: AMBER, emInt: 0.85, rough: 0.25, metal: 0.85, edge: AMBER,
});

/* stagger: assembly windows up the scroll, teardown windows in reverse (outer parts peel first) */
const N = parts.length;
parts.forEach((p, i) => {
  p.t0 = 0.02 + i * 0.012;
  p.t1 = p.t0 + 0.1;
  p.td0 = 0.72 + (N - 1 - i) * 0.005;
  p.td1 = p.td0 + 0.12;
});

const coreLight = new THREE.PointLight(AMBER, 20, 30, 1.8);
coreLight.position.set(0, 0.15, 0);
machine.add(coreLight);

/* ── finding markers (appear on suspect parts during teardown) ── */
const findings = [];
// each marker sits on its own part's surface (local coords match that part's geometry)
const markedParts = [
  { p: parts[18], at: [0.1, 0.85, 0.55] },    // chassis panel — outer face
  { p: parts[12], at: [0.18, 0.13, 0.14] },   // chip — top corner
  { p: parts[5],  at: [0.2, 1.35, 0.12] },    // corner pillar — upper side
  { p: parts[22], at: [0.4, 0.32, 0.2] },     // cap — top face
];
markedParts.forEach((m, i) => {
  const g = new THREE.Group();
  const dot = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const ping = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.21, 32),
    new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  g.add(dot, ping);
  g.position.set(...m.at);
  m.p.mesh.add(g);
  findings.push({ g, dot, ping, phase: i * 0.27 });
});

/* ── inspection rig ── */
// sweeping scan plane
const scanPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(7.4, 7.4),
  new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
scanPlane.rotation.x = -Math.PI / 2;
scene.add(scanPlane);
const scanRing = new THREE.Mesh(
  new THREE.RingGeometry(2.55, 2.62, 72),
  new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
scanRing.rotation.x = -Math.PI / 2;
scene.add(scanRing);

// targeting reticle
const reticle = new THREE.Group();
const retMat = () => new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const r1 = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.0, 72), retMat());
r1.rotation.x = -Math.PI / 2;
const r2 = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.54, 72), retMat());
r2.rotation.x = -Math.PI / 2;
const c1 = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 0.045), retMat());
c1.rotation.x = -Math.PI / 2;
const c2 = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 9.2), retMat());
c2.rotation.x = -Math.PI / 2;
reticle.add(r1, r2, c1, c2);
reticle.position.y = 0.15;
scene.add(reticle);

// probe drones
const probes = [];
for (let i = 0; i < 3; i++) {
  const pr = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.1, 0),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  scene.add(pr);
  probes.push(pr);
}

// lock-in flash ring (reused whenever a part snaps home)
const lockRing = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 1, 48),
  new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
lockRing.rotation.x = -Math.PI / 2;
scene.add(lockRing);
let lockT = 0;
const lockPos = new THREE.Vector3();

/* ── ambient dust + floor ── */
const DUST = MOBILE ? 220 : 550;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 34;
  dustPos[i * 3 + 1] = rng(-9, 11);
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * 34;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0x5f7a80, size: 0.07, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true,
}));
scene.add(dust);

const floorGrid = new THREE.PolarGridHelper(13, 16, 6, 72, 0x2e424a, 0x1c2b31);
floorGrid.position.y = -2.62;
floorGrid.material.transparent = true;
floorGrid.material.opacity = 0.35;
scene.add(floorGrid);

/* ── scroll + mouse state ── */
let targetT = 0, t = 0;
function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  targetT = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}
window.addEventListener('scroll', readScroll, { passive: true });
readScroll();

let mx = 0, my = 0, smx = 0, smy = 0;
// mouse-only parallax — touch scrolling shouldn't steer the camera
if (window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', (e) => {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // wide screens: shift the machine right of the content column (view-space offset)
  if (camera.aspect > 1.15) camera.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.17, 0, window.innerWidth, window.innerHeight);
  else camera.clearViewOffset();
  readScroll();
});
window.dispatchEvent(new Event('resize'));

/* ── helpers ── */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOutCubic = (x) => { const c = clamp01(x); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
const lerp = THREE.MathUtils.lerp;

const clock = new THREE.Clock();
const qTmp = new THREE.Quaternion();
const qTumble = new THREE.Quaternion();
let machineSpin = 0;
let hidden = false;
document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

function frame() {
  requestAnimationFrame(frame);
  if (hidden) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  t += (targetT - t) * (REDUCED ? 1 : Math.min(1, dt * 5.2));
  window.__stackProgress = t;

  smx += (mx - smx) * Math.min(1, dt * 3);
  smy += (my - smy) * Math.min(1, dt * 3);

  /* phase amounts */
  const inspectP = smooth01((t - 0.46) / 0.06) * (1 - smooth01((t - 0.68) / 0.06));
  const teardown = smooth01((t - 0.72) / 0.1);

  /* camera: orbit in, lean in to inspect, pull back for the exploded view */
  const rad = t < 0.45 ? lerp(15.8, 12.6, t / 0.45)
            : t < 0.72 ? lerp(12.6, 10.3, (t - 0.45) / 0.27)
            : lerp(10.3, 17.6, clamp01((t - 0.72) / 0.28));
  const cy = t < 0.45 ? lerp(6.4, 3.6, t / 0.45)
           : t < 0.72 ? lerp(3.6, 1.7, (t - 0.45) / 0.27)
           : lerp(1.7, 7.6, clamp01((t - 0.72) / 0.28));
  const ang = 0.95 + t * 2.5 + smx * 0.05;
  camera.position.set(Math.sin(ang) * rad + smx * 0.6, cy - smy * 0.5, Math.cos(ang) * rad);
  camera.lookAt(0, lerp(0.5, 0.15, inspectP) + teardown * 0.4, 0);

  /* machine idle bob + slow turn while inspected */
  machine.position.y = REDUCED ? 0 : Math.sin(time * 0.5) * 0.08;
  machineSpin += dt * (REDUCED ? 0 : 0.22) * inspectP;
  machine.rotation.y = machineSpin;

  /* parts: fly in → lock → hold → explode out */
  for (const p of parts) {
    const bp = easeInOutCubic((t - p.t0) / (p.t1 - p.t0));
    const tp = easeInOutCubic((t - p.td0) / (p.td1 - p.td0));

    if (p.prevBp < 1 && bp >= 1 && !REDUCED) {
      p.flash = 1;
      p.mesh.getWorldPosition(lockPos);
      lockRing.position.copy(lockPos);
      lockT = 0.001;
    }
    p.prevBp = bp;

    p.mesh.position.lerpVectors(p.startPos, p.finalPos, bp).addScaledVector(p.explodeV, tp);
    qTmp.copy(p.startQuat).slerp(p.finalQuat, bp);
    if (tp > 0 && p.tumbleSpeed > 0) {
      p.spin += dt * p.tumbleSpeed * tp;
      qTumble.setFromAxisAngle(p.tumbleAxis, p.spin);
      qTmp.multiply(qTumble);
    }
    p.mesh.quaternion.copy(qTmp);

    if (p.ghost) p.ghost.material.opacity = 0.3 * (1 - smooth01((bp - 0.6) / 0.4)) * (1 - tp);

    if (!p.mat.isMeshBasicMaterial) {
      p.flash = Math.max(0, p.flash - dt * 2.2);
      p.mat.emissiveIntensity = p.baseEm + p.flash * 1.7 + inspectP * 0.22;
      if (p.edgeMat) {
        // edges fade in as the part locks home; the inspection scan lights them cyan
        p.edgeMat.opacity = bp * (0.6 + p.flash * 0.4 + inspectP * 0.35);
        p.edgeMat.color.copy(p.edgeCol).lerp(colCyan, inspectP * 0.75);
      }
    }
  }

  /* core + cage narrative */
  const coreGlow = 0.85 + 0.3 * Math.sin(time * 1.9) + teardown * 1.5 + inspectP * 0.35;
  core.mat.emissiveIntensity = coreGlow;
  core.mesh.rotation.y = time * (REDUCED ? 0 : 0.3);
  core.mesh.rotation.x = time * (REDUCED ? 0 : 0.12);
  core.mat.emissive.copy(colAmber).lerp(colCyan, inspectP * 0.6);
  coreLight.color.copy(core.mat.emissive);
  coreLight.intensity = 18 + teardown * 34 + inspectP * 8;

  const cageOpen = smooth01((t - 0.76) / 0.14);
  cage.mesh.scale.setScalar(1 + cageOpen * 0.95);
  cage.mat.opacity = 0.34 * (1 - cageOpen) + 0.05;
  cage.mesh.rotation.y = -time * (REDUCED ? 0 : 0.14);

  // gyro rings — the machine's heartbeat, always turning
  if (!REDUCED) {
    gyro1.mesh.rotation.x = time * 0.7;
    gyro1.mesh.rotation.y = time * 0.42;
    gyro2.mesh.rotation.y = -time * 0.55;
    gyro2.mesh.rotation.z = time * 0.36;
  }
  gyro1.mat.opacity = 0.5 * (1 - teardown * 0.35);
  gyro2.mat.opacity = 0.5 * (1 - teardown * 0.35);

  // beacon blink
  beacon.mat.opacity = 0.55 + 0.45 * Math.sin(time * 3.1);

  // conduits pulse; tint cyan under inspection; flicker as they tear loose
  conduits.forEach((c, i) => {
    const fl = teardown > 0 ? (0.4 + 0.6 * Math.abs(Math.sin(time * 11 + i * 2))) : 1;
    c.mat.opacity = (0.32 + 0.26 * Math.sin(time * 2.3 + i * 1.7)) * fl * (1 - teardown * 0.45);
    c.mat.color.copy(colAmber).lerp(colCyan, inspectP);
  });

  /* inspection rig */
  const scanY = -2.3 + 4.9 * (0.5 + 0.5 * Math.sin(time * 0.85));
  scanPlane.position.y = scanY;
  scanPlane.material.opacity = inspectP * (0.13 + 0.06 * Math.sin(time * 2.6));
  scanRing.position.y = scanY;
  scanRing.material.opacity = inspectP * 0.4;

  reticle.rotation.y = time * 0.5;
  const retScale = 1 + 0.04 * Math.sin(time * 2);
  reticle.scale.setScalar(retScale);
  reticle.children.forEach((m) => { m.material.opacity = inspectP * 0.65; });

  probes.forEach((pr, i) => {
    const a = time * (0.5 + i * 0.17) + i * 2.1;
    pr.position.set(Math.cos(a) * 3.3, -1.4 + i * 1.5 + Math.sin(time * 0.8 + i) * 0.35, Math.sin(a) * 3.3);
    pr.rotation.y = time * 2;
    pr.material.opacity = inspectP * 0.85;
  });

  /* lock flash ring */
  if (lockT > 0) {
    lockT += dt;
    const s = lockT / 0.55;
    if (s >= 1) { lockT = 0; lockRing.material.opacity = 0; }
    else {
      lockRing.scale.setScalar(0.3 + s * 2.6);
      lockRing.material.opacity = (1 - s) * 0.7;
    }
  }

  /* finding markers during teardown */
  findings.forEach((f, i) => {
    const on = teardown;
    f.dot.material.opacity = on * (0.65 + 0.35 * Math.sin(time * 4 + f.phase * 9));
    f.dot.scale.setScalar(1 + 0.28 * Math.sin(time * 4 + f.phase * 9));
    f.dot.rotation.y = time * 1.6;
    const pp = (time * 0.9 + f.phase) % 1;
    f.ping.scale.setScalar(1 + pp * 2.4);
    f.ping.material.opacity = on * (1 - pp) * 0.55;
    f.ping.lookAt(camera.position);
  });

  /* dust drift */
  const dp = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST; i++) {
    let y = dp[i * 3 + 1] + dt * 0.3;
    if (y > 11) y = -9;
    dp[i * 3 + 1] = y;
  }
  dustGeo.attributes.position.needsUpdate = true;
  dust.rotation.y = time * 0.012;

  renderer.render(scene, camera);
}
frame();

/* dev probe — lets the console inspect render stats + part state */
window.__scene = { renderer, parts, machine };
