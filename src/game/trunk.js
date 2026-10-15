// The trunk: an hourglass of braided roots (flared foot, pinched waist, wide crown), round and
// lobed in plan rather than boxy. The roots ARE the way up — every one can be gripped and climbed —
// but they look alike and only some hold: some are rotten and snap under a climber's weight, some
// are slick and wet higher up. Climbing sideways onto a neighbouring root hands the grip over.
// Every root you see is a collider of the same size: no invisible walls, no ghost geometry.
import * as THREE from 'three';
import { addBox, addCapsule, addSphere } from './physics.js';
import { strandGeometry, slabEdge } from './world.js';
import { TABLE_TOP_Y } from './constants.js';

// centre-line ellipse of the roots at each height (before lobes); y in world units
const H = 1.25; // trunk height follows the table (25% taller)
export const PROFILE = [
  { y: 0.0, ax: 4.5, az: 3.4 },
  { y: 0.7 * H, ax: 3.9, az: 3.0 },
  { y: 1.8 * H, ax: 3.25, az: 2.6 },
  { y: 2.95 * H, ax: 3.6, az: 2.85 },
  { y: 3.92 * H, ax: 4.25, az: 3.1 },
];
export const ROOT_R = [0.24, 0.2, 0.17, 0.18, 0.19];
const ROOTS = 58;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// lobes: buttress bulges round the trunk so the outline is never a clean ellipse
// (strong at the foot, fading toward the crown so every root's top clears the slab's edge)
const lobe = (th, y) => 1 + (1 - 0.7 * Math.min(1, y / (3.92 * H))) * (0.07 * Math.sin(3 * th + 0.6) + 0.05 * Math.sin(5 * th + 1.9 + y * 0.6) + 0.03 * Math.sin(9 * th + y));

function lerpProfile(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i], b = PROFILE[i + 1];
    if (y <= b.y || i === PROFILE.length - 2) {
      const k = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
      return { ax: a.ax + (b.ax - a.ax) * k, az: a.az + (b.az - a.az) * k, r: ROOT_R[i] + (ROOT_R[i + 1] - ROOT_R[i]) * k };
    }
  }
  return { ...PROFILE[0], r: ROOT_R[0] };
}

// point on the (lobed) centre-line at angle th and height y, pushed `out` further
export function surfacePoint(th, y, out = 0) {
  const p = lerpProfile(y);
  const l = lobe(th, y);
  return { x: Math.cos(th) * (p.ax * l + out), y, z: Math.sin(th) * (p.az * l + out) };
}

// distance from the trunk axis to its outer surface along angle th at height y
export function outerAlong(th, y) {
  const p = lerpProfile(y);
  const l = lobe(th, y);
  return Math.hypot(Math.cos(th) * p.ax * l, Math.sin(th) * p.az * l) + p.r;
}

// A tube along a smooth curve whose radius follows `radii` (one per point), with bark wobble.
export function taperedTube(points, radii, seed, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  const L = curve.getLength();
  const rings = Math.max(8, Math.ceil(L * 10));
  const frames = curve.computeFrenetFrames(rings, false);
  const r = rng(seed);
  const ph = r() * 10;
  const pos = [], uv = [], idx = [];
  const radiusAt = (u) => {
    const f = u * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(f));
    return radii[i] + (radii[i + 1] - radii[i]) * (f - i);
  };
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    curve.getPointAt(u, P);
    const rad = radiusAt(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const w = 1 + 0.13 * Math.sin(a * 3 + ph + u * 23) + 0.07 * Math.sin(a * 5 + u * 41);
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
      pos.push(P.x + N.x * rad * w, P.y + N.y * rad * w, P.z + N.z * rad * w);
      uv.push(j / radial, u * L * 2);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Root kinds round the trunk, in bands so neighbouring roots tend to share a fate.
// They look alike on purpose; wet ones have only a faint sheen high up.
function kindsAround(R) {
  const kinds = [];
  const pattern = ['sound', 'rotten', 'wet', 'rotten', 'wet', 'sound', 'wet', 'rotten', 'sound', 'rotten', 'wet', 'rotten'];
  let i = 0, b = 0;
  while (i < ROOTS) {
    const kind = pattern[b++ % pattern.length];
    const n = 3 + Math.floor(R() * 4);
    for (let k = 0; k < n && i < ROOTS; k++, i++) kinds.push(kind);
  }
  return kinds;
}

export function buildTrunk(world, batch, group, mats) {
  const R = rng(4242);
  const synced = [];

  // a dark core behind the roots, sized inside the waist so nothing can be reached through a gap
  const coreBody = addBox(world, { x: 0, y: 1.96 * H, z: 0 }, { x: 2.15, y: 1.96 * H, z: 1.7 }, { label: 'trunk', kind: 'bark', grip: 'none' });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.92 * H, 32), mats.barkDeep);
  core.scale.set(2.95, 1, 2.3);
  core.position.y = 1.96 * H;
  group.add(core);

  const kinds = kindsAround(R);
  const roots = [];
  for (let i = 0; i < ROOTS; i++) {
    const th0 = (i / ROOTS) * Math.PI * 2 + (R() - 0.5) * 0.02;
    const twist = (i % 2 ? 1 : -1) * (0.012 + R() * 0.012);
    const out = (R() - 0.5) * 0.12;
    const pts = PROFILE.map((p, k) => {
      const q = surfacePoint(th0 + twist * k, p.y, out);
      return { x: q.x, y: p.y + (k === 0 ? -0.06 : 0), z: q.z };
    });
    const radii = ROOT_R.map((r) => r * (0.88 + R() * 0.24));
    // the top of every root curls out round the table's edge and up to its rim, so whichever
    // root you climb, its top is beside the tabletop (as in the film, roots wrap the rim)
    {
      const top = pts[pts.length - 1];
      const L = Math.hypot(top.x, top.z), dx = top.x / L, dz = top.z / L;
      const t = slabEdge(dx, dz) + radii[radii.length - 1] + 0.04;
      pts[pts.length - 1] = { x: dx * Math.max(t, L), y: TABLE_TOP_Y - 0.04, z: dz * Math.max(t, L) };
      const mid = pts[pts.length - 2];
      const ml = Math.hypot(mid.x, mid.z);
      const want = Math.max(ml, t - 0.35);
      pts[pts.length - 2] = { x: (mid.x / ml) * want, y: mid.y, z: (mid.z / ml) * want };
    }
    const kind = kinds[i];
    const route = `root ${String(i + 1).padStart(2, '0')}`;
    const meta = { rootKind: kind };
    roots.push({ route, kind });
    for (let k = 0; k < pts.length - 1; k++) {
      const wet = kind === 'wet' && k >= 2;
      const b = addCapsule(world, pts[k], pts[k + 1], (radii[k] + radii[k + 1]) / 2, {
        label: wet ? `${route} (wet)` : route, kind: 'root', route, meta,
        grip: wet ? 'none' : 'all',
        // rotten roots give way after a second or two of a climber's weight
        breakThreshold: kind === 'rotten' && k >= 1 ? 11 + R() * 9 : 0,
      });
      if (kind === 'rotten' && k >= 1) {
        // its own mesh so it can fall when it snaps
        const L = b.len;
        b.mesh = new THREE.Mesh(strandGeometry({ x: 0, y: -L / 2, z: 0 }, { x: 0, y: L / 2, z: 0 }, radii[k], radii[k + 1], 5000 + i * 4 + k, 8), mats.barkDeep);
        b.mesh.castShadow = b.mesh.receiveShadow = true;
        group.add(b.mesh);
        synced.push(b);
      }
    }
    if (kind === 'rotten') {
      batch.add('barkDeep', taperedTube(pts.slice(0, 2), radii.slice(0, 2), 100 + i));
    } else if (kind === 'wet') {
      batch.add('barkDeep', taperedTube(pts.slice(0, 3), radii.slice(0, 3), 100 + i));
      batch.add('wet', taperedTube(pts.slice(2), radii.slice(2), 200 + i));
    } else {
      batch.add(R() < 0.5 ? 'barkDeep' : 'rootDark', taperedTube(pts, radii, 100 + i));
    }
  }

  // A second, inner layer of roots, set between the outer ones and a little behind them, so there
  // is no gap anywhere to squeeze through into the trunk or up under the tabletop. Hidden behind
  // the outer roots (only a dark sliver shows through), slick.
  for (let i = 0; i < ROOTS; i++) {
    const th0 = ((i + 0.5) / ROOTS) * Math.PI * 2;
    const pts = PROFILE.map((p, k) => {
      const r = ROOT_R[k];
      const q = surfacePoint(th0, p.y, -r * 1.1);
      return { x: q.x, y: p.y + (k === 0 ? -0.06 : 0), z: q.z, r: r * 1.0 };
    });
    // its top tucks in just under the slab, out to the slab's edge
    const top = pts[pts.length - 1];
    const L = Math.hypot(top.x, top.z), dx = top.x / L, dz = top.z / L;
    const t = slabEdge(dx, dz) - 0.06;
    pts[pts.length - 1] = { x: dx * Math.max(L, t), y: TABLE_TOP_Y - 0.25 * 1.6 - top.r * 0.6, z: dz * Math.max(L, t), r: top.r };
    for (let k = 0; k < pts.length - 1; k++) addCapsule(world, pts[k], pts[k + 1], (pts[k].r + pts[k + 1].r) / 2, { label: 'trunk', kind: 'bark', grip: 'none' });
    batch.add('rootDark', taperedTube(pts, pts.map((p) => p.r * 0.9), 1300 + i, 6));
  }

  // finer fibres laid over the braid (inside the collision envelope — look only)
  for (let i = 0; i < 90; i++) {
    const th = R() * Math.PI * 2;
    const twist = (R() < 0.5 ? 1 : -1) * (0.04 + R() * 0.06);
    const y0 = R() * 0.8, y1 = (2.4 + R() * 1.4) * H;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const y = y0 + (y1 - y0) * (k / 5);
      pts.push(surfacePoint(th + twist * k, y, lerpProfile(y).r * 0.75));
    }
    const r0 = 0.035 + R() * 0.035;
    batch.add(R() < 0.5 ? 'root' : 'vine', taperedTube(pts, [r0 * 1.3, r0, r0, r0, r0 * 0.7, r0 * 0.3], 300 + i, 6));
  }

  // roots spilling over the crown's edge and hanging out into the air (real, grippable),
  // tips kept above 2.1 so none can be reached from the ground
  for (let i = 0; i < 26; i++) {
    const th = (i / 26) * Math.PI * 2 + (R() - 0.5) * 0.2;
    // they start just outside the table's rim, so climbing one also leads up to the tabletop
    const sp = surfacePoint(th, 3.9 * H, 0);
    const sl = Math.hypot(sp.x, sp.z);
    const dir = { x: sp.x / sl, z: sp.z / sl };
    const edge = slabEdge(dir.x, dir.z) + 0.16;
    const base = { x: dir.x * edge, y: TABLE_TOP_Y - 0.12, z: dir.z * edge };
    const reach = 0.6 + R() * 0.9, drop = 1.0 + R() * 1.3;
    const p1 = { x: base.x + dir.x * reach * 0.45, y: base.y + 0.08, z: base.z + dir.z * reach * 0.45 };
    const p2 = { x: base.x + dir.x * reach * 0.85, y: base.y - drop * 0.45, z: base.z + dir.z * reach * 0.85 };
    const p3 = { x: base.x + dir.x * reach + (R() - 0.5) * 0.2, y: Math.max(2.6, base.y - drop), z: base.z + dir.z * reach + (R() - 0.5) * 0.2 };
    const pts = [base, p1, p2, p3];
    const radii = [0.11, 0.085, 0.055, 0.02];
    for (let k = 0; k < 3; k++) addCapsule(world, pts[k], pts[k + 1], Math.max(0.025, (radii[k] + radii[k + 1]) / 2), { label: 'hanging root', kind: 'root', grip: 'all' });
    batch.add('rootDark', taperedTube(pts, radii, 900 + i, 7));
    for (let f = 0; f < 3; f++) {
      const q = { x: p3.x + (R() - 0.5) * 0.35, y: p3.y - 0.2 - R() * 0.4, z: p3.z + (R() - 0.5) * 0.35 };
      batch.add('rootDark', taperedTube([p2, p3, q], [0.03, 0.016, 0.004], 950 + i * 3 + f, 5));
    }
  }
  return { core: coreBody, synced, roots };
}

function lumpySphere(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 3);
  const R = rng(seed);
  const ph = [R() * 9, R() * 9, R() * 9];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + 0.18 * Math.sin(x * 6 + ph[0]) * Math.sin(y * 7 + ph[1]) + 0.1 * Math.sin(z * 9 + ph[2]);
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals();
  return g;
}
