// THE WORLD — a colossal tree cut flat across the crown, at 1:50 against the player.
// Every collider here is written from the numbers in docs/BRIEF.md; visuals are drawn around them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBox, addCapsule, addSphere } from './physics.js';
import { TABLE_TOP_Y, SPAWN } from './constants.js';
import { buildTrunk, outerX, outerZ, taperedTube } from './trunk.js';

export const SLAB = { hx: 2.6, hz: 1.75 };

const UP = new THREE.Vector3(0, 1, 0);
const RIM_X = 2.06, RIM_Z = 1.33;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// A tapered strand from a (radius rFrom) to b (radius rTo). Flared at its root, drawn to a point
// as it climbs — which a capsule's rounded end cannot do. Vertices get a little organic wobble.
export function strandGeometry(a, b, rFrom, rTo, seed = 1, radial = 9) {
  const A = new THREE.Vector3(a.x, a.y, a.z), B = new THREE.Vector3(b.x, b.y, b.z);
  const dir = B.clone().sub(A);
  const L = dir.length();
  const segs = Math.max(2, Math.ceil(L * 6));
  const g = new THREE.CylinderGeometry(rTo, rFrom, L, radial, segs, false);
  const r = rng(seed);
  const ph = r() * 10, amp = Math.min(rFrom, 0.12) * 0.35;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y / L) + 0.5;
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const w = 1 + 0.12 * Math.sin(ang * 3 + ph + t * 7) + 0.06 * Math.sin(ang * 7 + t * 19);
    pos.setX(i, pos.getX(i) * w + Math.sin(t * 9 + ph) * amp * (1 - t));
    pos.setZ(i, pos.getZ(i) * w + Math.cos(t * 7 + ph) * amp * (1 - t));
  }
  g.computeVertexNormals();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

class Batch {
  constructor() { this.parts = {}; }
  add(mat, geo) { (this.parts[mat] ||= []).push(geo); }
  build(group, mats, shadows = true) {
    for (const [k, list] of Object.entries(this.parts)) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mats[k]);
      m.castShadow = shadows; m.receiveShadow = true;
      group.add(m);
      list.forEach((g) => g.dispose());
    }
  }
}

// Where a ray from the trunk centre at `deg` leaves the trunk footprint.
function rimExit(deg) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a), dz = Math.sin(a);
  const t = Math.min(RIM_X / Math.max(1e-6, Math.abs(dx)), RIM_Z / Math.max(1e-6, Math.abs(dz)));
  return { x: dx * t, z: dz * t, dx, dz, r: t };
}

export function buildWorld(world, scene, mats) {
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);
  const batch = new Batch();
  const routes = [];
  const R = rng(1234);

  // --- Ground: a 120 x 1 x 120 box, top at y=0.
  const ground = addBox(world, { x: 0, y: -0.5, z: 0 }, { x: 60, y: 0.5, z: 60 }, { label: 'ground', kind: 'ground', grip: 'none' });
  const gGeo = new THREE.PlaneGeometry(120, 120, 120, 120);
  gGeo.rotateX(-Math.PI / 2);
  {
    const p = gGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.hypot(x, z);
      // keep the playfield flat (physics floor is flat); undulate only far away, below y=0
      const far = Math.max(0, Math.min(1, (d - 9) / 10));
      p.setY(i, -far * (0.4 + 0.3 * Math.sin(x * 0.21) * Math.cos(z * 0.17)));
    }
    gGeo.computeVertexNormals();
  }
  const gMesh = new THREE.Mesh(gGeo, mats.ground);
  gMesh.receiveShadow = true;
  group.add(gMesh);

  // --- Climb-route anchors, hung off the trunk's real surface (see trunk.js outerX / outerZ).
  const vineLine = (side, z) => [
    { x: side * (outerX(0.1, z) + 0.14), y: 0.1, z },
    { x: side * (SLAB.hx + 0.08), y: 2.88, z },
  ];
  const lineA = vineLine(1, -0.85), lineB = vineLine(-1, 0.85), lineF = vineLine(1, 1.55);
  const lineC = [
    { x: -(outerX(0.12, -1.25) + 0.95), y: 0.12, z: -1.25 },
    { x: -(SLAB.hx + 0.21), y: 2.8, z: -1.25 }, // clear of the slab edge so a climber fits beneath
  ];
  const lineE = [
    { x: -0.95, y: 0.55, z: -(outerZ(0.55, -0.95) + 0.13) },
    { x: -0.55, y: 2.82, z: -(outerZ(2.45, -0.55) + 0.08) },
  ];
  const xz = (l) => [[l[0].x, l[0].z], [l[1].x, l[1].z]];
  const routeSegs = [lineA, lineB, lineF, lineC, lineE].map(xz);

  // --- Trunk: an hourglass of braided root fibres (see trunk.js).
  const trunk = buildTrunk(world, batch, group, mats, routeSegs);

  // --- Crown / apron and slab.
  addBox(world, { x: 0, y: 2.28, z: 0 }, { x: SLAB.hx, y: 0.2, z: SLAB.hz }, { label: 'crown', kind: 'bark' });
  const slab = addBox(world, { x: 0, y: 2.575, z: 0 }, { x: SLAB.hx, y: 0.125, z: SLAB.hz }, { label: 'table top', kind: 'slab', meta: { tableTop: true } });
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(SLAB.hx * 2, 0.25, SLAB.hz * 2), [mats.slabEdge, mats.slabEdge, mats.slab, mats.slabEdge, mats.slabEdge, mats.slabEdge]);
    top.position.y = 2.575;
    top.castShadow = top.receiveShadow = true;
    group.add(top);
    const band = new THREE.Mesh(new THREE.BoxGeometry(SLAB.hx * 2 + 0.02, 0.05, SLAB.hz * 2 + 0.02), mats.rootDark);
    band.position.y = 2.69;
    group.add(band);
    const heart = new THREE.Mesh(new THREE.BoxGeometry(SLAB.hx * 2 - 0.05, 0.4, SLAB.hz * 2 - 0.05), mats.rootDark);
    heart.position.y = 2.28;
    heart.castShadow = heart.receiveShadow = true;
    group.add(heart);
  }
  // braided roots round the crown, tightening as they rise
  for (let ring = 0; ring < 4; ring++) {
    const y = 2.12 + ring * 0.1;
    const inset = ring * 0.012;
    const ex = SLAB.hx + 0.02 - inset, ez = SLAB.hz + 0.02 - inset;
    const corners = [[-ex, -ez], [ex, -ez], [ex, ez], [-ex, ez]];
    for (let k = 0; k < 4; k++) {
      const [x1, z1] = corners[k], [x2, z2] = corners[(k + 1) % 4];
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const t1 = s / steps, t2 = (s + 1) / steps;
        const wob = (t) => 0.025 * Math.sin((t + ring) * 11);
        batch.add('rootDark', strandGeometry(
          { x: x1 + (x2 - x1) * t1, y: y + wob(t1), z: z1 + (z2 - z1) * t1 },
          { x: x1 + (x2 - x1) * t2, y: y + wob(t2), z: z1 + (z2 - z1) * t2 },
          0.07 - ring * 0.008, 0.065 - ring * 0.008, ring * 31 + k * 7 + s, 7));
      }
    }
  }
  // --- SIX CLIMB ROUTES ---
  // A: a thick vine that holds, three knots to rest on.
  routes.push(vineRoute(world, batch, 'A', lineA, {}));
  // B: identical, but gives way under a climber's load.
  routes.push(vineRoute(world, batch, 'B', lineB, { breakThreshold: 27 }));
  // C: a root grippable only from below (slick from above).
  {
    const [a, b] = lineC;
    const body = addCapsule(world, a, b, 0.09, { label: 'root C', kind: 'root', grip: 'underside', route: 'C' });
    batch.add('root', strandGeometry({ x: a.x - 0.07, y: 0, z: a.z }, a, 0.16, 0.1, 1401));
    batch.add('root', strandGeometry(a, b, 0.1, 0.075, 1402));
    routes.push({ id: 'C', bodies: [body] });
  }
  // D: a lattice of three root boxes stepping up to a shelf, then a wide overhang (dead end).
  {
    const face = outerZ(0.05, 1.2);
    const boxes = [
      [{ x: 1.55, y: 0.09, z: face + 0.2 }, { x: 0.14, y: 0.09, z: 0.2 }],
      [{ x: 1.25, y: 0.2, z: face + 0.16 }, { x: 0.14, y: 0.2, z: 0.16 }],
      [{ x: 0.95, y: 0.32, z: face + 0.14 }, { x: 0.14, y: 0.32, z: 0.14 }],
      [{ x: 0.65, y: 0.62, z: face - 0.05 }, { x: 0.2, y: 0.04, z: 0.3 }],
    ];
    const bodies = boxes.map(([p, h], i) => addBox(world, p, h, { label: i < 3 ? `root step ${i + 1}` : 'shelf', kind: 'root', route: 'D' }));
    const oz = outerZ(1.05, 0.65);
    const over = addBox(world, { x: 0.65, y: 1.05, z: oz + 0.42 }, { x: 0.45, y: 0.05, z: 0.45 }, { label: 'overhang', kind: 'root', grip: 'none', route: 'D' });
    bodies.push(over);
    for (const b of bodies) batch.add(b.grip === 'none' ? 'wet' : 'root', rootBlock(b.pos, b.half, 1500 + b.id));
    routes.push({ id: 'D', bodies });
  }
  // E: a pile of eight loose debris boxes that only move when pushed, under a hanging root whose
  // lowest point is just out of reach from the ground.
  const debris = [];
  {
    const [lo, hi] = lineE;
    const hang = addCapsule(world, lo, hi, 0.06, { label: 'hanging root', kind: 'root', route: 'E' });
    batch.add('root', strandGeometry({ x: lo.x, y: lo.y - 0.05, z: lo.z }, hi, 0.05, 0.07, 1601));
    const pile = [
      [-1.05, -1.95, 0.1, 0.1, 0.09, 1.6], [-0.8, -2.15, 0.08, 0.07, 0.1, 0.9], [-1.3, -2.25, 0.07, 0.05, 0.06, 0.5],
      [-0.6, -1.95, 0.06, 0.05, 0.07, 0.4], [-1.1, -2.45, 0.09, 0.06, 0.08, 0.8], [-0.85, -2.5, 0.05, 0.04, 0.05, 0.22],
      [-1.45, -1.9, 0.08, 0.08, 0.07, 1.1], [-1.05, -1.95, 0.06, 0.04, 0.06, 0.35],
    ];
    pile.forEach(([x0, z0, hx, hy, hz, m], i) => {
      const x = x0 - 0.35, z = z0 - 0.75;
      const y = i === 7 ? 0.2 + hy : hy; // the last one rests on top of the first
      const b = addBox(world, { x, y, z }, { x: hx, y: hy, z: hz }, { dynamic: true, mass: m, label: `debris ${i + 1}`, kind: 'debris', route: 'E', friction: 0.9 });
      debris.push(b);
    });
    for (let i = 0; i < 9; i++) {
      const r = 0.025 + R() * 0.03;
      const b = addSphere(world, { x: -2.0 + R() * 1.0, y: r, z: -2.65 - R() * 0.8 }, r, { dynamic: true, mass: 0.15 + R() * 0.3, label: 'stone', kind: 'stone' });
      debris.push(b);
    }
    routes.push({ id: 'E', bodies: [hang, ...debris.slice(0, 8)] });
  }
  // F: like the others, but the upper half (above y 1.28) is wet — grip none.
  routes.push(vineRoute(world, batch, 'F', lineF, { wetAbove: 1.28 }));

  // --- Ground roots. Kept clear of every route's foot, the debris pile and the spawn point.
  const keepClear = [
    ...routeSegs.map(([a, b]) => ({ seg: [a, b], r: 0.45 })),
    { seg: [[0.5, outerZ(0.05, 1.2)], [1.7, outerZ(0.05, 1.2) + 0.45]], r: 0.35 }, // D lattice
    { seg: [[-2.2, -2.6], [-0.7, -3.4]], r: 0.45 }, // debris pile
    { seg: [[SPAWN.x, SPAWN.z], [SPAWN.x, SPAWN.z]], r: 0.35 },
  ];
  const segDist = (x, z, [a, b]) => {
    const abx = b[0] - a[0], abz = b[1] - a[1], l2 = abx * abx + abz * abz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / l2)) : 0;
    return Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
  };
  const isClear = (pts, pad) => pts.every((p) => keepClear.every((k) => segDist(p.x, p.z, k.seg) > k.r + pad));
  // a root that runs out from the trunk's foot along `deg`, wandering, `reach` long, in 4 segments
  const groundRoot = (deg, reach, r0, seed) => {
    const a0 = (deg * Math.PI) / 180;
    const startR = Math.min(outerX(0.05, Math.sin(a0) * 2) / Math.max(0.3, Math.abs(Math.cos(a0))), outerZ(0.05, Math.cos(a0) * 2) / Math.max(0.3, Math.abs(Math.sin(a0)))) - 0.1;
    const pts = [];
    let ang = a0;
    for (let k = 0; k <= 4; k++) {
      const d = startR + (reach * k) / 4;
      ang += (R() - 0.5) * 0.12;
      const r = r0 * (1 - k * 0.2);
      pts.push({ x: Math.cos(ang) * d, y: Math.max(0.02, r * 0.5), z: Math.sin(ang) * d, r });
    }
    if (!isClear(pts.slice(1), r0)) return false;
    for (let k = 0; k < 4; k++) addCapsule(world, pts[k], pts[k + 1], Math.max(0.02, (pts[k].r + pts[k + 1].r) / 2), { label: 'root ridge', kind: 'root', grip: 'all' });
    batch.add(seed % 2 ? 'root' : 'rootDark', taperedTube(pts, pts.map((p) => p.r), seed, 8));
    return true;
  };
  // the brief's two fans of ridges round the trunk...
  const long = [70, 85, 100, 115, 130, 145, 180, 255, 270, 285, 300, 315];
  const short = [4, 12, 20, 88, 96, 104, 112, 120, 128, 174, 182, 190, 264, 272, 280, 288, 296, 304, 354, 358];
  long.forEach((d, i) => groundRoot(d, 2.6 + R() * 3.6, 0.09 + R() * 0.03, 2000 + i));
  short.forEach((d, i) => groundRoot(d, 1.7 + R() * 1.9, 0.07 + R() * 0.03, 2100 + i));
  // ...plus many more, densest across the ground between the spawn and the tree
  let made = 0;
  for (let i = 0; i < 400 && made < 70; i++) {
    const toward = made < 34;
    const deg = toward ? 18 + R() * 50 : R() * 360;
    if (groundRoot(deg, toward ? 3.5 + R() * 4.5 : 1.5 + R() * 4, 0.04 + R() * 0.06, 2300 + i)) made++;
  }

  // --- Two rocks fading into the fog. (The brief's 40 distant roots read as pale spikes against
  // the backdrop hills once fogged, so they are left out; the backdrop carries the distance.)
  for (const [x, z, s] of [[-6.5, 4.2, 1.1], [7.5, -5.5, 1.6]]) {
    const geo = new THREE.IcosahedronGeometry(s, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + 0.18 * Math.sin(p.getX(i) * 3.1) * Math.cos(p.getZ(i) * 2.7);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * 0.55 * f, p.getZ(i) * f);
    }
    geo.computeVertexNormals();
    geo.translate(x, s * 0.2, z);
    batch.add('stone', geo);
    addSphere(world, { x, y: s * 0.2, z }, s * 0.6, { label: 'rock', kind: 'stone' });
  }

  // --- Nine loose crumbs on the tabletop.
  const crumbs = [];
  for (let i = 0; i < 9; i++) {
    const r = 0.012 + R() * 0.018;
    crumbs.push(addSphere(world, { x: (R() - 0.5) * 3.8, y: TABLE_TOP_Y + r, z: 0.4 + (R() - 0.5) * 2.0 }, r, { dynamic: true, mass: 0.05, label: 'crumb', kind: 'crumb' }));
  }

  batch.build(group, mats);

  // Per-body meshes (vines A/B, knots, debris, stones, crumbs) — synced to their bodies each frame.
  const synced = [];
  for (const rt of routes) for (const m of rt.meshes || []) {
    m.material = m.userData.wet ? mats.wet : mats.vine;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  for (const rt of routes) for (const b of rt.bodies) if (b.mesh) synced.push(b);
  for (const b of debris) {
    if (b.shape === 'box') b.mesh = new THREE.Mesh(rootBlock({ x: 0, y: 0, z: 0 }, b.half, 1800 + b.id), mats.wood);
    else b.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 1), mats.stone);
    b.mesh.castShadow = b.mesh.receiveShadow = true;
    group.add(b.mesh);
    synced.push(b);
  }
  for (const b of crumbs) {
    b.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 1), mats.loaf);
    b.mesh.castShadow = true;
    group.add(b.mesh);
    synced.push(b);
  }
  return { group, routes, ground, slab, trunk, debris, crumbs, synced };
}

function perimeterPoint(t, hx, hz) {
  const sides = [2 * hx, 2 * hz, 2 * hx, 2 * hz];
  let d = (((t % 1) + 1) % 1) * (sides[0] + sides[1] + sides[2] + sides[3]);
  if (d < sides[0]) return { x: -hx + d, z: -hz };
  d -= sides[0];
  if (d < sides[1]) return { x: hx, z: -hz + d };
  d -= sides[1];
  if (d < sides[2]) return { x: hx - d, z: hz };
  d -= sides[2];
  return { x: -hx, z: hz - d };
}

function vineRoute(world, batch, id, [lo, hi], o) {
  const r = 0.075;
  const bodies = [];
  const at = (y) => { const t = (y - lo.y) / (hi.y - lo.y); return { x: lo.x + (hi.x - lo.x) * t, y, z: lo.z + (hi.z - lo.z) * t }; };
  const seed = 1700 + Math.round(lo.x * 10) + Math.round(lo.z * 100);
  if (o.wetAbove) {
    const mid = at(o.wetAbove);
    bodies.push(addCapsule(world, lo, mid, r, { label: `vine ${id}`, kind: 'vine', route: id }));
    bodies.push(addCapsule(world, mid, hi, r, { label: `vine ${id} (wet)`, kind: 'vine', grip: 'none', route: id }));
    batch.add('vine', strandGeometry(lo, mid, r * 1.05, r, seed));
    batch.add('wet', strandGeometry(mid, hi, r, r * 0.9, seed + 1));
  } else {
    bodies.push(addCapsule(world, lo, hi, r, { label: `vine ${id}`, kind: 'vine', route: id, breakThreshold: o.breakThreshold ?? 0 }));
  }
  // three knots to rest on
  const knots = [0.8, 1.55, 2.3].map((y) => addSphere(world, at(y), 0.1, {
    label: `knot ${id}`, kind: 'vine', route: id,
    grip: o.wetAbove && y > o.wetAbove ? 'none' : 'all',
    breakThreshold: o.breakThreshold ?? 0,
  }));
  bodies.push(...knots);
  // Vines A and B are their own meshes so a vine that gives way can fall as one piece.
  const meshes = [];
  if (!o.wetAbove) {
    const vine = bodies[0];
    const L = vine.len;
    vine.mesh = new THREE.Mesh(strandGeometry({ x: 0, y: -L / 2, z: 0 }, { x: 0, y: L / 2, z: 0 }, r * 1.05, r * 0.95, seed + 2), null);
    meshes.push(vine.mesh);
  }
  for (const k of knots) {
    k.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), null);
    k.mesh.scale.set(1, 0.8, 1);
    k.mesh.userData.wet = k.grip === 'none';
    meshes.push(k.mesh);
  }
  return { id, bodies, meshes };
}

function rootBlock(pos, half, seed) {
  const g = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2, 3, Math.max(1, Math.round(half.y * 10)), 3);
  const r = rng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.012;
    p.setXYZ(i, p.getX(i) + (r() - 0.5) * k, p.getY(i) + (r() - 0.5) * k * 0.5, p.getZ(i) + (r() - 0.5) * k);
  }
  g.computeVertexNormals();
  g.translate(pos.x, pos.y, pos.z);
  return g;
}
