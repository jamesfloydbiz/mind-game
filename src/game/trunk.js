// The trunk as an hourglass of braided root fibres: flared at the foot, pinched at the waist, wide
// under the crown, with roots spilling off the corners and hanging out into the air.
// Every fibre you see is a collider of the same size (grip none: the root wall is sheer and slick),
// so there are no invisible walls and no ghost geometry. The hanging roots are real and grippable.
import * as THREE from 'three';
import { addBox, addCapsule, addSphere } from './physics.js';

// Profile of the fibre centre-line: half-extents of a rounded rectangle at each height.
export const PROFILE = [
  { y: 0.0, hx: 2.75, hz: 1.95, cr: 1.3 },
  { y: 0.45, hx: 2.45, hz: 1.7, cr: 1.2 },
  { y: 1.1, hx: 2.05, hz: 1.35, cr: 1.0 },
  { y: 1.8, hx: 2.25, hz: 1.5, cr: 1.0 },
  { y: 2.45, hx: 2.5, hz: 1.68, cr: 0.9 },
];
export const FIBRE_R = [0.15, 0.12, 0.105, 0.11, 0.115];
const FIBRES = 64;

// Outer surface of the trunk (centre-line + fibre radius) on the ±x side at height y and depth z,
// and on the ±z side at height y and position x. Used to hang the climb routes off the trunk.
export function outerX(y, z) {
  const p = profileAt(y), r = radiusAt(y);
  const az = Math.abs(z), flat = p.hz - p.cr;
  if (az <= flat) return p.hx + r;
  const d = Math.min(p.cr, az - flat);
  return p.hx - p.cr + Math.sqrt(p.cr * p.cr - d * d) + r;
}
export function outerZ(y, x) {
  const p = profileAt(y), r = radiusAt(y);
  const ax = Math.abs(x), flat = p.hx - p.cr;
  if (ax <= flat) return p.hz + r;
  const d = Math.min(p.cr, ax - flat);
  return p.hz - p.cr + Math.sqrt(p.cr * p.cr - d * d) + r;
}
function radiusAt(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    if (y <= PROFILE[i + 1].y || i === PROFILE.length - 2) {
      const k = Math.max(0, Math.min(1, (y - PROFILE[i].y) / (PROFILE[i + 1].y - PROFILE[i].y)));
      return FIBRE_R[i] + (FIBRE_R[i + 1] - FIBRE_R[i]) * k;
    }
  }
  return FIBRE_R[0];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Point and outward normal at parameter t (0..1) round a rounded rectangle.
export function rrPoint(t, hx, hz, cr) {
  const sx = hx - cr, sz = hz - cr;
  const arc = (Math.PI / 2) * cr;
  const seg = [2 * sz, arc, 2 * sx, arc, 2 * sz, arc, 2 * sx, arc];
  const total = seg.reduce((a, b) => a + b, 0);
  let d = (((t % 1) + 1) % 1) * total;
  const corners = [[sx, sz, 0], [-sx, sz, Math.PI / 2], [-sx, -sz, Math.PI], [sx, -sz, Math.PI * 1.5]];
  // side +x (z from -sz..sz), corner (+x,+z), side +z (x from sx..-sx), corner (-x,+z), ...
  for (let i = 0; i < 8; i++) {
    if (d <= seg[i] || i === 7) {
      const k = Math.min(1, d / seg[i]);
      if (i % 2 === 0) {
        const side = i / 2;
        if (side === 0) return { x: hx, z: -sz + 2 * sz * k, nx: 1, nz: 0 };
        if (side === 1) return { x: sx - 2 * sx * k, z: hz, nx: 0, nz: 1 };
        if (side === 2) return { x: -hx, z: sz - 2 * sz * k, nx: -1, nz: 0 };
        return { x: -sx + 2 * sx * k, z: -hz, nx: 0, nz: -1 };
      }
      const [cx, cz, a0] = corners[(i - 1) / 2];
      const a = a0 + k * (Math.PI / 2);
      return { x: cx + Math.cos(a) * cr, z: cz + Math.sin(a) * cr, nx: Math.cos(a), nz: Math.sin(a) };
    }
    d -= seg[i];
  }
  return { x: hx, z: 0, nx: 1, nz: 0 };
}

// A tube along a smooth curve whose radius follows `radii` (one per point), with bark wobble.
export function taperedTube(points, radii, seed, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  const L = curve.getLength();
  const rings = Math.max(8, Math.ceil(L * 14));
  const frames = curve.computeFrenetFrames(rings, false);
  const r = rng(seed);
  const ph = r() * 10;
  const pos = [], nor = [], uv = [], idx = [];
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
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, u * L * 2);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTrunk(world, batch, group, mats, routeSegs = []) {
  const R = rng(4242);

  // a dark core behind the fibres, sized to the waist so nothing can be reached through a gap
  const coreBody = addBox(world, { x: 0, y: 1.225, z: 0 }, { x: 1.9, y: 1.225, z: 1.2 }, { label: 'trunk', kind: 'bark', grip: 'none' });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.45, 24), mats.barkDeep);
  core.scale.set(1.9, 1, 1.2);
  core.position.y = 1.225;
  group.add(core);

  // 50 braided main fibres, twisting in two opposed groups
  for (let i = 0; i < FIBRES; i++) {
    const t0 = i / FIBRES + (R() - 0.5) * 0.004;
    const twist = (i % 2 ? 1 : -1) * (0.008 + R() * 0.01);
    const out = (R() - 0.5) * 0.08;
    const pts = PROFILE.map((p, k) => {
      const q = rrPoint(t0 + twist * k, p.hx + out, p.hz + out, p.cr);
      return { x: q.x, y: p.y + (k === 0 ? -0.04 : 0), z: q.z };
    });
    const radii = FIBRE_R.map((r) => r * (0.9 + R() * 0.2));
    for (let k = 0; k < pts.length - 1; k++) {
      addCapsule(world, pts[k], pts[k + 1], (radii[k] + radii[k + 1]) / 2, { label: 'trunk root', kind: 'bark', grip: 'none' });
    }
    batch.add(R() < 0.55 ? 'barkDeep' : 'rootDark', taperedTube(pts, radii, 100 + i));
  }

  // finer fibres laid over the braid (inside the collision envelope — look only)
  for (let i = 0; i < 70; i++) {
    const t0 = R();
    const twist = (R() < 0.5 ? 1 : -1) * (0.02 + R() * 0.03);
    const y0 = R() * 0.6, y1 = 1.6 + R() * 0.85;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const y = y0 + (y1 - y0) * (k / 4);
      const p = profileAt(y);
      const q = rrPoint(t0 + twist * k, p.hx + 0.07, p.hz + 0.07, p.cr);
      pts.push({ x: q.x, y, z: q.z });
    }
    const r0 = 0.02 + R() * 0.025;
    batch.add(R() < 0.5 ? 'root' : 'vine', taperedTube(pts, [r0 * 1.3, r0, r0, r0 * 0.8, r0 * 0.4], 300 + i, 6));
  }

  // dark masses on the four corners of the crown, roots spilling off them
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [sx, sz] of corners) {
    const c = { x: sx * 2.2, y: 2.38, z: sz * 1.4 };
    addSphere(world, c, 0.28, { label: 'crown knot', kind: 'root', grip: 'all' });
    const lump = new THREE.Mesh(lumpySphere(0.33, 700 + sx * 3 + sz), mats.rootDark);
    lump.position.set(c.x, c.y, c.z);
    lump.scale.set(1.2, 0.9, 1.0);
    lump.castShadow = lump.receiveShadow = true;
    group.add(lump);
  }

  // roots spilling over the crown's edge and hanging out into the air (real, grippable).
  // Their lowest points stay above 1.3 so none of them can be reached from the ground.
  const hangers = [];
  for (const [sx, sz] of corners) for (let k = 0; k < 4; k++) hangers.push({ sx, sz, k });
  for (let i = 0; i < 6; i++) hangers.push({ side: i });
  // keep every hanging root at least 0.4 (horizontally) from the six climb routes
  const ROUTE_SEGS = routeSegs;
  const segDist = (p, [a, b]) => {
    const abx = b[0] - a[0], abz = b[1] - a[1], l2 = abx * abx + abz * abz;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * abx + (p.z - a[1]) * abz) / l2)) : 0;
    return Math.hypot(p.x - (a[0] + abx * t), p.z - (a[1] + abz * t));
  };
  const clear = (pts) => pts.every((p) => ROUTE_SEGS.every((sg) => segDist(p, sg) > 0.4));
  hangers.forEach((h, i) => {
   for (let attempt = 0; attempt < 8; attempt++) {
    let base, dir;
    if (h.side === undefined) {
      const a = Math.atan2(h.sz * 1.6, h.sx * 2.4) + (R() - 0.5) * 0.7;
      base = { x: h.sx * 2.3 + Math.cos(a) * 0.15, y: 2.4 - R() * 0.15, z: h.sz * 1.5 + Math.sin(a) * 0.15 };
      dir = { x: Math.cos(a), z: Math.sin(a) };
    } else {
      // along the long sides, between the routes
      const xs = [-1.2, 0.0, 1.2][h.side % 3], sz = h.side < 3 ? 1 : -1;
      base = { x: xs + (R() - 0.5) * 0.3, y: 2.42, z: sz * 1.7 };
      dir = { x: (R() - 0.5) * 0.4, z: sz };
    }
    const reach = 0.45 + R() * 0.55, drop = 0.6 + R() * 0.6;
    const p1 = { x: base.x + dir.x * reach * 0.45, y: base.y + 0.05, z: base.z + dir.z * reach * 0.45 };
    const p2 = { x: base.x + dir.x * reach * 0.85, y: base.y - drop * 0.45, z: base.z + dir.z * reach * 0.85 };
    const p3 = { x: base.x + dir.x * reach + (R() - 0.5) * 0.15, y: Math.max(1.35, base.y - drop), z: base.z + dir.z * reach + (R() - 0.5) * 0.15 };
    const pts = [base, p1, p2, p3];
    if (!clear(pts)) continue;
    const radii = [0.075, 0.06, 0.04, 0.015];
    for (let k = 0; k < 3; k++) addCapsule(world, pts[k], pts[k + 1], Math.max(0.02, (radii[k] + radii[k + 1]) / 2), { label: 'hanging root', kind: 'root', grip: 'all' });
    batch.add('rootDark', taperedTube(pts, radii, 900 + i, 7));
    // a few hair-roots off the tip
    for (let f = 0; f < 3; f++) {
      const q = { x: p3.x + (R() - 0.5) * 0.25, y: p3.y - 0.15 - R() * 0.3, z: p3.z + (R() - 0.5) * 0.25 };
      batch.add('rootDark', taperedTube([p2, p3, q], [0.02, 0.012, 0.003], 950 + i * 3 + f, 5));
    }
    break;
   }
  });
  return coreBody;
}

function profileAt(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i], b = PROFILE[i + 1];
    if (y <= b.y || i === PROFILE.length - 2) {
      const k = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
      return { hx: a.hx + (b.hx - a.hx) * k, hz: a.hz + (b.hz - a.hz) * k, cr: a.cr + (b.cr - a.cr) * k };
    }
  }
  return PROFILE[0];
}

function lumpySphere(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 3);
  const R = rng(seed);
  const ph = [R() * 9, R() * 9, R() * 9];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + 0.18 * Math.sin(x * 9 + ph[0]) * Math.sin(y * 11 + ph[1]) + 0.1 * Math.sin(z * 13 + ph[2]);
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals();
  return g;
}
