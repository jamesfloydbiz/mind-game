// THE WORLD — a colossal tree cut flat across the crown, at 1:50 against the player.
// Every collider here is written from the numbers in docs/BRIEF.md; visuals are drawn around them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBox, addCapsule, addSphere } from './physics.js';
import { TABLE_TOP_Y } from './constants.js';

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

  // --- Trunk: one solid box, grip none — the root wall is sheer and slick.
  const trunk = addBox(world, { x: 0, y: 1.225, z: 0 }, { x: 2.07, y: 1.225, z: 1.34 }, { label: 'trunk', kind: 'bark', grip: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    addBox(world, { x: 1.85 * sx, y: 1.225, z: 1.12 * sz }, { x: 0.22, y: 1.225, z: 0.22 }, { label: 'trunk leg', kind: 'bark', grip: 'none' });
  }
  // body of the trunk between the roots: a dark tapered column, squashed to the footprint
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 2.45, 24, 4), mats.barkDeep);
  body.scale.set(1.9, 1, 1.12);
  body.position.y = 1.225;
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // --- Crown / apron and slab.
  addBox(world, { x: 0, y: 2.28, z: 0 }, { x: 2.18, y: 0.2, z: 1.32 }, { label: 'crown', kind: 'bark' });
  const slab = addBox(world, { x: 0, y: 2.575, z: 0 }, { x: 2.18, y: 0.125, z: 1.32 }, { label: 'table top', kind: 'slab', meta: { tableTop: true } });
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.36, 0.25, 2.64), [mats.slabEdge, mats.slabEdge, mats.slab, mats.slabEdge, mats.slabEdge, mats.slabEdge]);
    top.position.y = 2.575;
    top.castShadow = top.receiveShadow = true;
    group.add(top);
    // darker band around the cut edge
    const band = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.05, 2.66), mats.rootDark);
    band.position.y = 2.69;
    group.add(band);
    const heart = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.4, 2.6), mats.barkDeep);
    heart.position.y = 2.28;
    heart.castShadow = heart.receiveShadow = true;
    group.add(heart);
  }
  // braided roots round the crown, tightening as they rise
  for (let ring = 0; ring < 4; ring++) {
    const y = 2.12 + ring * 0.1;
    const inset = ring * 0.012;
    const corners = [
      [-2.2 + inset, -1.34 + inset], [2.2 - inset, -1.34 + inset], [2.2 - inset, 1.34 - inset], [-2.2 + inset, 1.34 - inset],
    ];
    for (let k = 0; k < 4; k++) {
      const [x1, z1] = corners[k], [x2, z2] = corners[(k + 1) % 4];
      const steps = 5;
      for (let s = 0; s < steps; s++) {
        const t1 = s / steps, t2 = (s + 1) / steps;
        const wob = (t) => 0.025 * Math.sin((t + ring) * 11);
        batch.add('root', strandGeometry(
          { x: x1 + (x2 - x1) * t1, y: y + wob(t1), z: z1 + (z2 - z1) * t1 },
          { x: x1 + (x2 - x1) * t2, y: y + wob(t2), z: z1 + (z2 - z1) * t2 },
          0.06 - ring * 0.008, 0.055 - ring * 0.008, ring * 31 + k * 7 + s, 7));
      }
    }
  }
  // 20 veins of root climbing into the underside of the slab
  for (let i = 0; i < 20; i++) {
    const t = i / 20;
    const per = perimeterPoint(t, 2.1, 1.28);
    batch.add('rootDark', strandGeometry({ x: per.x * 0.92, y: 1.9, z: per.z * 0.92 }, { x: per.x, y: 2.46, z: per.z }, 0.07, 0.02, 500 + i, 7));
  }

  // --- Stilt roots. ~37 wall roots round the rim (feet inside the collision footprint).
  for (let i = 0; i < 37; i++) {
    const t = (i + R() * 0.5) / 37;
    const p = perimeterPoint(t, RIM_X, RIM_Z);
    const top = { x: p.x * 0.97, y: 2.1 + R() * 0.25, z: p.z * 0.97 };
    const foot = { x: p.x * 0.995, y: 0, z: p.z * 0.995 };
    batch.add(R() < 0.5 ? 'root' : 'rootDark', strandGeometry(foot, top, 0.16 + R() * 0.1, 0.05, 900 + i));
  }
  // 26 crowding the inside
  for (let i = 0; i < 26; i++) {
    const p = perimeterPoint(R(), RIM_X * 0.8, RIM_Z * 0.75);
    batch.add('rootDark', strandGeometry({ x: p.x, y: 0, z: p.z }, { x: p.x * 0.6, y: 2.2, z: p.z * 0.6 }, 0.22, 0.07, 1000 + i));
  }
  // 16 arching out onto the ground in two segments (feet kept just inside the footprint)
  for (let i = 0; i < 16; i++) {
    const deg = (i / 16) * 360 + R() * 8;
    const e = rimExit(deg);
    const hi = { x: e.x * 0.98, y: 1.0 + R() * 0.5, z: e.z * 0.98 };
    const knee = { x: e.x * 0.995, y: 0.45, z: e.z * 0.995 };
    const foot = { x: e.x * 0.99, y: 0, z: e.z * 0.99 };
    batch.add('root', strandGeometry(knee, hi, 0.13, 0.07, 1100 + i));
    batch.add('root', strandGeometry(foot, knee, 0.17, 0.13, 1150 + i));
  }
  // 10 vines strangling the wall
  for (let i = 0; i < 10; i++) {
    const t0 = R();
    for (let s = 0; s < 6; s++) {
      const a = perimeterPoint((t0 + s * 0.012) % 1, RIM_X + 0.02, RIM_Z + 0.02);
      const b = perimeterPoint((t0 + (s + 1) * 0.012) % 1, RIM_X + 0.02, RIM_Z + 0.02);
      batch.add('vine', strandGeometry({ x: a.x, y: 0.2 + s * 0.35, z: a.z }, { x: b.x, y: 0.2 + (s + 1) * 0.35, z: b.z }, 0.022, 0.02, 1200 + i * 10 + s, 6));
    }
  }
  // 18 lianas hanging off the crown (kept just inside the footprint so they are not handholds)
  for (let i = 0; i < 18; i++) {
    const p = perimeterPoint(R(), RIM_X - 0.01, RIM_Z - 0.01);
    batch.add('vine', strandGeometry({ x: p.x, y: 2.3, z: p.z }, { x: p.x, y: 1.2 + R() * 0.9, z: p.z }, 0.02, 0.006, 1300 + i, 5));
  }

  // --- SIX CLIMB ROUTES ---
  // A: a thick vine that holds, three knots to rest on.
  routes.push(vineRoute(world, batch, 'A', 2.42, -0.85, {}));
  // B: identical, but gives way under a climber's load.
  routes.push(vineRoute(world, batch, 'B', -2.42, 0.85, { breakThreshold: 27 }));
  // C: a root grippable only from below (slick from above).
  {
    const a = { x: -3.05, y: 0.12, z: -1.25 }, b = { x: -2.36, y: 2.8, z: -1.25 };
    const body = addCapsule(world, a, b, 0.09, { label: 'root C', kind: 'root', grip: 'underside', route: 'C' });
    batch.add('root', strandGeometry({ x: -3.12, y: 0, z: -1.25 }, a, 0.16, 0.1, 1401));
    batch.add('root', strandGeometry(a, b, 0.1, 0.075, 1402));
    routes.push({ id: 'C', bodies: [body] });
  }
  // D: a lattice of three root boxes stepping up to a shelf, then a wide overhang (dead end).
  {
    const boxes = [
      [{ x: 1.55, y: 0.09, z: 1.56 }, { x: 0.14, y: 0.09, z: 0.2 }],
      [{ x: 1.25, y: 0.2, z: 1.52 }, { x: 0.14, y: 0.2, z: 0.16 }],
      [{ x: 0.95, y: 0.32, z: 1.5 }, { x: 0.14, y: 0.32, z: 0.14 }],
      [{ x: 0.65, y: 0.62, z: 1.47 }, { x: 0.2, y: 0.04, z: 0.13 }],
    ];
    const bodies = boxes.map(([p, h], i) => addBox(world, p, h, { label: i < 3 ? `root step ${i + 1}` : 'shelf', kind: 'root', route: 'D' }));
    const over = addBox(world, { x: 0.65, y: 1.05, z: 1.62 }, { x: 0.45, y: 0.05, z: 0.28 }, { label: 'overhang', kind: 'root', grip: 'none', route: 'D' });
    bodies.push(over);
    for (const b of bodies) batch.add(b.grip === 'none' ? 'wet' : 'root', rootBlock(b.pos, b.half, 1500 + b.id));
    routes.push({ id: 'D', bodies });
  }
  // E: a pile of eight loose debris boxes that only move when pushed, under a hanging root whose
  // lowest point is just out of reach from the ground.
  const debris = [];
  {
    const hang = addCapsule(world, { x: -0.95, y: 0.55, z: -1.5 }, { x: -0.55, y: 2.82, z: -1.4 }, 0.06, { label: 'hanging root', kind: 'root', route: 'E' });
    batch.add('root', strandGeometry({ x: -0.95, y: 0.5, z: -1.5 }, { x: -0.55, y: 2.82, z: -1.4 }, 0.05, 0.07, 1601));
    const pile = [
      [-1.05, -1.95, 0.1, 0.1, 0.09, 1.6], [-0.8, -2.15, 0.08, 0.07, 0.1, 0.9], [-1.3, -2.25, 0.07, 0.05, 0.06, 0.5],
      [-0.6, -1.95, 0.06, 0.05, 0.07, 0.4], [-1.1, -2.45, 0.09, 0.06, 0.08, 0.8], [-0.85, -2.5, 0.05, 0.04, 0.05, 0.22],
      [-1.45, -1.9, 0.08, 0.08, 0.07, 1.1], [-1.05, -1.95, 0.06, 0.04, 0.06, 0.35],
    ];
    // shifted clear of the 255-degree ridge so the pile sits on open ground
    pile.forEach(([x0, z0, hx, hy, hz, m], i) => {
      const x = x0 - 0.35, z = z0 - 0.05;
      const y = i === 7 ? 0.2 + hy : hy; // the last one rests on top of the first
      const b = addBox(world, { x, y, z }, { x: hx, y: hy, z: hz }, { dynamic: true, mass: m, label: `debris ${i + 1}`, kind: 'debris', route: 'E', friction: 0.9 });
      debris.push(b);
    });
    for (let i = 0; i < 9; i++) {
      const r = 0.025 + R() * 0.03;
      const b = addSphere(world, { x: -2.0 + R() * 1.0, y: r, z: -1.9 - R() * 0.8 }, r, { dynamic: true, mass: 0.15 + R() * 0.3, label: 'stone', kind: 'stone' });
      debris.push(b);
    }
    routes.push({ id: 'E', bodies: [hang, ...debris.slice(0, 8)] });
  }
  // F: like the others, but the upper half (above y 1.28) is wet — grip none.
  routes.push(vineRoute(world, batch, 'F', 2.42, 1.55, { wetAbove: 1.28 }));

  // --- Two fans of solid root ridges round the trunk.
  const long = [70, 85, 100, 115, 130, 145, 180, 255, 270, 285, 300, 315];
  const short = [4, 12, 20, 88, 96, 104, 112, 120, 128, 174, 182, 190, 264, 272, 280, 288, 296, 304, 354, 358];
  const ridge = (deg, reach, i) => {
    const e = rimExit(deg);
    const r0 = 0.07 + R() * 0.05;
    const a = { x: e.x - e.dx * 0.05, y: r0 * 0.55, z: e.z - e.dz * 0.05 };
    const mid = { x: e.dx * (e.r + reach * 0.5), y: r0 * 0.5, z: e.dz * (e.r + reach * 0.5) };
    const b = { x: e.dx * (e.r + reach), y: r0 * 0.2, z: e.dz * (e.r + reach) };
    addCapsule(world, a, mid, r0, { label: 'root ridge', kind: 'root', grip: 'all' });
    addCapsule(world, mid, b, r0 * 0.6, { label: 'root ridge', kind: 'root', grip: 'all' });
    batch.add(i % 2 ? 'root' : 'rootDark', strandGeometry({ x: a.x, y: a.y + 0.02, z: a.z }, mid, r0 * 1.1, r0 * 0.75, 2000 + i));
    batch.add(i % 2 ? 'root' : 'rootDark', strandGeometry(mid, b, r0 * 0.75, r0 * 0.15, 2100 + i));
  };
  long.forEach((d, i) => ridge(d, 2.6 + R() * 3.6, i));
  short.forEach((d, i) => ridge(d, 1.7 + R() * 1.9, 100 + i));

  // --- 40 distant roots and two rocks fading into the fog.
  for (let i = 0; i < 40; i++) {
    const ang = R() * Math.PI * 2, d = 9 + R() * 16;
    const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
    const h = 1.5 + R() * 5;
    batch.add('rootDark', strandGeometry({ x, y: -0.2, z }, { x: x + (R() - 0.5) * 2, y: h, z: z + (R() - 0.5) * 2 }, 0.25 + R() * 0.4, 0.04, 3000 + i, 8));
  }
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
    crumbs.push(addSphere(world, { x: (R() - 0.5) * 3.2, y: TABLE_TOP_Y + r, z: (R() - 0.5) * 1.8 }, r, { dynamic: true, mass: 0.05, label: 'crumb', kind: 'crumb' }));
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

function vineRoute(world, batch, id, x, z, o) {
  const r = 0.075;
  const bodies = [];
  const lo = { x, y: 0.1, z }, hi = { x, y: 2.88, z };
  if (o.wetAbove) {
    const mid = { x, y: o.wetAbove, z };
    bodies.push(addCapsule(world, lo, mid, r, { label: `vine ${id}`, kind: 'vine', route: id }));
    bodies.push(addCapsule(world, mid, hi, r, { label: `vine ${id} (wet)`, kind: 'vine', grip: 'none', route: id }));
    batch.add('vine', strandGeometry(lo, mid, r * 1.05, r, 1700 + x * 10));
    batch.add('wet', strandGeometry(mid, hi, r, r * 0.9, 1710 + x * 10));
  } else {
    bodies.push(addCapsule(world, lo, hi, r, { label: `vine ${id}`, kind: 'vine', route: id, breakThreshold: o.breakThreshold ?? 0 }));
  }
  // three knots to rest on
  const knots = [0.8, 1.55, 2.3].map((y) => addSphere(world, { x, y, z }, 0.1, {
    label: `knot ${id}`, kind: 'vine', route: id,
    grip: o.wetAbove && y > o.wetAbove ? 'none' : 'all',
    breakThreshold: o.breakThreshold ?? 0,
  }));
  bodies.push(...knots);
  // Vines A and B are their own meshes so a vine that gives way can fall as one piece.
  const meshes = [];
  if (!o.wetAbove) {
    const vine = bodies[0];
    vine.mesh = new THREE.Mesh(strandGeometry({ x: 0, y: -1.39, z: 0 }, { x: 0, y: 1.39, z: 0 }, r * 1.05, r * 0.95, 1720 + x * 10), null);
    vine.meshLen = 2.78;
    meshes.push(vine.mesh);
  }
  for (const k of knots) {
    k.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), null);
    k.mesh.scale.set(1, 0.8, 1);
    k.mesh.userData.wet = k.grip === 'none';
    meshes.push(k.mesh);
  }
  return { id, bodies, x, z, r, meshes };
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
