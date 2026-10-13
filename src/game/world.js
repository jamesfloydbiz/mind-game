// THE WORLD — a colossal tree cut flat across the crown, its roots spreading over the ground.
// Every collider is the size of what is drawn: no invisible walls, no ghost geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBox, addCapsule, addSphere } from './physics.js';
import { TABLE_TOP_Y, SPAWN, WORLD_SCALE as W } from './constants.js';
import { buildTrunk, outerAlong, taperedTube } from './trunk.js';

export const SLAB = { hx: 2.6 * W, hz: 1.75 * W, h: 0.25 * W };
const UP = new THREE.Vector3(0, 1, 0);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// A tapered strand from a (radius rFrom) to b (radius rTo), with a little organic wobble.
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

// Merges many geometries per material into one mesh each (few draw calls).
class Batch {
  constructor() { this.parts = {}; }
  add(mat, geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (geo !== g) geo.dispose();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    (this.parts[mat] ||= []).push(g);
  }
  build(group, mats) {
    for (const [k, list] of Object.entries(this.parts)) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mats[k]);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      list.forEach((g) => g.dispose());
    }
  }
}

export function buildWorld(world, scene, mats) {
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);
  const batch = new Batch();
  const R = rng(1234);

  // --- Ground: a 120 x 1 x 120 box, top at y=0.
  const ground = addBox(world, { x: 0, y: -0.5, z: 0 }, { x: 60, y: 0.5, z: 60 }, { label: 'ground', kind: 'ground', grip: 'none' });
  const gGeo = new THREE.PlaneGeometry(120, 120, 120, 120);
  gGeo.rotateX(-Math.PI / 2);
  {
    const p = gGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const far = Math.max(0, Math.min(1, (Math.hypot(x, z) - 14) / 10));
      p.setY(i, -far * (0.4 + 0.3 * Math.sin(x * 0.21) * Math.cos(z * 0.17)));
    }
    gGeo.computeVertexNormals();
  }
  const gMesh = new THREE.Mesh(gGeo, mats.ground);
  gMesh.receiveShadow = true;
  group.add(gMesh);

  // --- Trunk: an hourglass of braided, climbable roots (see trunk.js).
  const trunk = buildTrunk(world, batch, group, mats);

  // --- Crown / apron and slab.
  const slabY = TABLE_TOP_Y - SLAB.h / 2;
  // the crown's heart, kept inside the roots so it never overhangs a climber
  addBox(world, { x: 0, y: slabY - SLAB.h / 2 - 0.16 * W, z: 0 }, { x: 3.1, y: 0.16 * W, z: 2.05 }, { label: 'crown', kind: 'bark', grip: 'none' });
  const slab = addBox(world, { x: 0, y: slabY, z: 0 }, { x: SLAB.hx, y: SLAB.h / 2, z: SLAB.hz }, { label: 'table top', kind: 'slab', meta: { tableTop: true } });
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(SLAB.hx * 2, SLAB.h, SLAB.hz * 2), [mats.slabEdge, mats.slabEdge, mats.slab, mats.slabEdge, mats.slabEdge, mats.slabEdge]);
    top.position.y = slabY;
    top.castShadow = top.receiveShadow = true;
    group.add(top);
    const band = new THREE.Mesh(new THREE.BoxGeometry(SLAB.hx * 2 + 0.03, 0.06, SLAB.hz * 2 + 0.03), mats.rootDark);
    band.position.y = TABLE_TOP_Y - 0.01;
    group.add(band);
  }
  // braided roots round the slab's rim (look only; inside the slab's edge)
  for (let ring = 0; ring < 4; ring++) {
    const y = TABLE_TOP_Y - SLAB.h + 0.06 + ring * 0.08;
    const ex = SLAB.hx - 0.02 - ring * 0.01, ez = SLAB.hz - 0.02 - ring * 0.01;
    const corners = [[-ex, -ez], [ex, -ez], [ex, ez], [-ex, ez]];
    for (let k = 0; k < 4; k++) {
      const [x1, z1] = corners[k], [x2, z2] = corners[(k + 1) % 4];
      const steps = 9;
      for (let s = 0; s < steps; s++) {
        const t1 = s / steps, t2 = (s + 1) / steps;
        const wob = (t) => 0.012 * Math.sin((t + ring) * 11);
        batch.add('rootDark', strandGeometry(
          { x: x1 + (x2 - x1) * t1, y: y + wob(t1), z: z1 + (z2 - z1) * t1 },
          { x: x1 + (x2 - x1) * t2, y: y + wob(t2), z: z1 + (z2 - z1) * t2 },
          0.045, 0.042, ring * 31 + k * 7 + s, 7));
      }
    }
  }

  // --- Loose debris near the trunk's foot: boxes that move only when pushed, plus stones.
  const debris = [];
  const pile = [
    [0.1, 0.1, 0.09, 1.6], [0.08, 0.07, 0.1, 0.9], [0.07, 0.05, 0.06, 0.5], [0.06, 0.05, 0.07, 0.4],
    [0.09, 0.06, 0.08, 0.8], [0.05, 0.04, 0.05, 0.22], [0.08, 0.08, 0.07, 1.1], [0.06, 0.04, 0.06, 0.35],
  ];
  const pileAt = { x: -2.2, z: -4.6 };
  pile.forEach(([hx, hy, hz, m], i) => {
    const a = i * 0.8, d = 0.15 + (i % 3) * 0.18;
    debris.push(addBox(world, { x: pileAt.x + Math.cos(a) * d, y: hy, z: pileAt.z + Math.sin(a) * d }, { x: hx, y: hy, z: hz }, { dynamic: true, mass: m, label: `debris ${i + 1}`, kind: 'debris', friction: 0.9 }));
  });
  for (let i = 0; i < 9; i++) {
    const r = 0.025 + R() * 0.03;
    debris.push(addSphere(world, { x: pileAt.x - 0.6 + R() * 1.2, y: r, z: pileAt.z - 0.3 - R() * 0.7 }, r, { dynamic: true, mass: 0.15 + R() * 0.3, label: 'stone', kind: 'stone' }));
  }

  // --- Ground roots: curving out from the trunk's foot, rising into arches and dipping back under
  // the soil, densest between the spawn and the tree. Climbable (grip all), never on the spawn.
  const clearOf = [{ x: SPAWN.x, z: SPAWN.z, r: 0.45 }, { x: pileAt.x, z: pileAt.z, r: 0.9 }];
  const groundRoot = (deg, reach, r0, seed) => {
    const a0 = (deg * Math.PI) / 180;
    const startR = outerAlong(a0, 0.1) - 0.25;
    const n = 6 + Math.floor(R() * 3);
    const archAt = R() < 0.6 ? 1 + Math.floor(R() * (n - 2)) : -1;
    const archH = 0.12 + R() * 0.3;
    const pts = [];
    let ang = a0;
    const bend = (R() - 0.5) * 0.25;
    for (let k = 0; k <= n; k++) {
      const d = startR + (reach * k) / n;
      ang += bend / n + (R() - 0.5) * 0.08;
      const r = Math.max(0.025, r0 * (1 - (k / n) * 0.75));
      // rise and dip: an arch somewhere along it, otherwise half-buried waves
      let y = r * 0.45 + Math.sin(k * 1.3 + seed) * r * 0.35;
      if (k === archAt) y = archH + r;
      if (k > 0 && (k === archAt + 1 || k === archAt - 1)) y = Math.max(y, archH * 0.45 + r * 0.5);
      pts.push({ x: Math.cos(ang) * d, y, z: Math.sin(ang) * d, r });
    }
    if (!pts.slice(1).every((p) => clearOf.every((c) => Math.hypot(p.x - c.x, p.z - c.z) > c.r + p.r))) return false;
    for (let k = 0; k < n; k++) addCapsule(world, pts[k], pts[k + 1], (pts[k].r + pts[k + 1].r) / 2, { label: 'ground root', kind: 'root', grip: 'all' });
    batch.add(seed % 3 ? 'root' : 'rootDark', taperedTube(pts, pts.map((p) => p.r), seed, 9));
    return true;
  };
  const spawnDeg = (Math.atan2(SPAWN.z, SPAWN.x) * 180) / Math.PI;
  let made = 0;
  for (let i = 0; i < 900 && made < 190; i++) {
    const toward = made < 80;
    const deg = toward ? spawnDeg - 30 + R() * 60 : R() * 360;
    const reach = toward ? 3 + R() * 7 : 1.5 + R() * 6;
    const r0 = 0.05 + R() * (made < 30 ? 0.16 : 0.09);
    if (groundRoot(deg, reach, r0, 2300 + i)) made++;
  }

  // --- Two rocks fading into the fog.
  for (const [x, z, s] of [[-9.5, 6.5, 1.3], [11, -8, 1.8]]) {
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
    crumbs.push(addSphere(world, { x: (R() - 0.5) * 6, y: TABLE_TOP_Y + r, z: 0.6 + (R() - 0.5) * 3 }, r, { dynamic: true, mass: 0.05, label: 'crumb', kind: 'crumb' }));
  }

  batch.build(group, mats);

  // per-body meshes — synced to their bodies each frame
  const synced = [...trunk.synced];
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
  return { group, roots: trunk.roots, ground, slab, trunk: trunk.core, debris, crumbs, synced };
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
