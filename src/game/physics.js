// A small, purpose-built rigid-body core (docs/BRIEF.md → THE PHYSICS CORE).
// Every body is described identically: mass, friction, grip surface, break threshold, shape.
// Shapes: axis-aligned boxes, capsules (segment + radius), spheres. No engine physics.
import { GRAVITY, SUBSTEP, SLEEP_TIME, SLEEP_SPEED, SHOCK_RADIUS, SHOCK_FALLOFF } from './constants.js';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a, s) => v(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
export const vec = { v, sub, add, scale, dot, len };

export function createWorld() {
  return { bodies: [], dyn: [], time: 0, seq: 0, acc: 0, onBreak: null };
}

function base(world, o) {
  return {
    id: ++world.seq,
    mass: o.mass ?? 1,
    friction: o.friction ?? 0.8,
    grip: o.grip ?? 'all', // 'all' | 'none' | 'underside'
    breakThreshold: o.breakThreshold ?? 0,
    stress: 0,
    dynamic: !!o.dynamic,
    vel: v(),
    sleeping: !!o.dynamic,
    sleepT: 0,
    label: o.label ?? 'surface',
    kind: o.kind ?? 'root',
    route: o.route ?? null,
    meta: o.meta ?? {},
    bounds: { min: v(), max: v() },
  };
}

function push(world, b) {
  refreshBounds(b);
  world.bodies.push(b);
  if (b.dynamic) world.dyn.push(b);
  return b;
}

export function addBox(world, pos, half, o = {}) {
  return push(world, { ...base(world, o), shape: 'box', pos: v(pos.x, pos.y, pos.z), half: v(half.x, half.y, half.z) });
}

export function addSphere(world, pos, r, o = {}) {
  return push(world, { ...base(world, o), shape: 'sphere', pos: v(pos.x, pos.y, pos.z), r });
}

export function addCapsule(world, a, b, r, o = {}) {
  return push(world, { ...base(world, o), shape: 'capsule', a: v(a.x, a.y, a.z), b: v(b.x, b.y, b.z), r, pos: v(), half: v(), len: 0, axis: v(0, 1, 0) });
}

// Recomputes a capsule's pos/half/bounds AND len/axis from a and b, so a capsule moved by its
// ends stays correct. Boxes and spheres just get their bounds.
export function refreshBounds(b) {
  if (b.shape === 'capsule') {
    const d = sub(b.b, b.a);
    b.len = len(d);
    b.axis = b.len > 1e-9 ? scale(d, 1 / b.len) : v(0, 1, 0);
    b.pos = scale(add(b.a, b.b), 0.5);
    b.half = v(Math.abs(d.x) / 2 + b.r, Math.abs(d.y) / 2 + b.r, Math.abs(d.z) / 2 + b.r);
  } else if (b.shape === 'sphere') {
    b.half = v(b.r, b.r, b.r);
  }
  b.bounds.min = sub(b.pos, b.half);
  b.bounds.max = add(b.pos, b.half);
}

export function segmentClosest(a, b, p) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return add(a, scale(ab, t));
}

// Signed distance from p to the body's surface, with the outward normal at the closest point.
export function closestPoint(body, p) {
  if (body.shape === 'box') {
    const c = body.pos, h = body.half;
    const d = sub(p, c);
    const q = v(Math.abs(d.x) - h.x, Math.abs(d.y) - h.y, Math.abs(d.z) - h.z);
    if (q.x > 0 || q.y > 0 || q.z > 0) {
      const pt = v(
        Math.max(c.x - h.x, Math.min(c.x + h.x, p.x)),
        Math.max(c.y - h.y, Math.min(c.y + h.y, p.y)),
        Math.max(c.z - h.z, Math.min(c.z + h.z, p.z)),
      );
      const n = sub(p, pt);
      const dist = len(n);
      return { point: pt, normal: dist > 1e-9 ? scale(n, 1 / dist) : v(0, 1, 0), dist, inside: false };
    }
    // Inside: least-penetration axis.
    const pens = [h.x - Math.abs(d.x), h.y - Math.abs(d.y), h.z - Math.abs(d.z)];
    let ax = 0;
    if (pens[1] < pens[ax]) ax = 1;
    if (pens[2] < pens[ax]) ax = 2;
    const n = v();
    const pt = v(p.x, p.y, p.z);
    if (ax === 0) { n.x = d.x >= 0 ? 1 : -1; pt.x = c.x + n.x * h.x; }
    if (ax === 1) { n.y = d.y >= 0 ? 1 : -1; pt.y = c.y + n.y * h.y; }
    if (ax === 2) { n.z = d.z >= 0 ? 1 : -1; pt.z = c.z + n.z * h.z; }
    return { point: pt, normal: n, dist: -pens[ax], inside: true };
  }
  const core = body.shape === 'capsule' ? segmentClosest(body.a, body.b, p) : body.pos;
  const d = sub(p, core);
  const l = len(d);
  const n = l > 1e-9 ? scale(d, 1 / l) : v(0, 1, 0);
  return { point: add(core, scale(n, body.r)), normal: n, dist: l - body.r, inside: l < body.r };
}

// Broad phase: bodies whose AABB overlaps a sphere of radius r around p (excluding `self`).
export function bodiesNear(world, p, r, self = null) {
  const out = [];
  for (const b of world.bodies) {
    if (b === self || b.parked) continue;
    const m = b.bounds;
    if (p.x + r < m.min.x || p.x - r > m.max.x) continue;
    if (p.y + r < m.min.y || p.y - r > m.max.y) continue;
    if (p.z + r < m.min.z || p.z - r > m.max.z) continue;
    out.push(b);
  }
  return out;
}

function moveBody(b, d) {
  if (b.shape === 'capsule') { b.a = add(b.a, d); b.b = add(b.b, d); } else b.pos = add(b.pos, d);
  refreshBounds(b);
}

export function wake(b) {
  if (!b.dynamic) return;
  b.sleeping = false;
  b.sleepT = 0;
}

// Contact for a dynamic body against another body: returns {normal, depth} pushing `b` out.
function contact(b, o) {
  if (b.shape === 'box' && o.shape === 'box') {
    const d = sub(b.pos, o.pos);
    const px = b.half.x + o.half.x - Math.abs(d.x);
    const py = b.half.y + o.half.y - Math.abs(d.y);
    const pz = b.half.z + o.half.z - Math.abs(d.z);
    if (px <= 0 || py <= 0 || pz <= 0) return null;
    if (px < py && px < pz) return { normal: v(Math.sign(d.x) || 1, 0, 0), depth: px };
    if (py < pz) return { normal: v(0, Math.sign(d.y) || 1, 0), depth: py };
    return { normal: v(0, 0, Math.sign(d.z) || 1), depth: pz };
  }
  if (b.shape === 'box') {
    // box vs round: nearest point on the round core to the box, then closestPoint on the box.
    const core = o.shape === 'capsule' ? segmentClosest(o.a, o.b, b.pos) : o.pos;
    const cp = closestPoint(b, core);
    const depth = o.r - cp.dist;
    if (depth <= 0) return null;
    return { normal: scale(cp.normal, -1), depth };
  }
  // round (sphere / capsule) vs anything: test the core point(s) as spheres.
  const pts = b.shape === 'capsule' ? [b.a, b.pos, b.b] : [b.pos];
  let best = null;
  for (const p of pts) {
    const cp = closestPoint(o, p);
    const depth = b.r - cp.dist;
    if (depth > 0 && (!best || depth > best.depth)) best = { normal: cp.normal, depth };
  }
  return best;
}

function lowestY(b) {
  return b.shape === 'capsule' ? Math.min(b.a.y, b.b.y) - b.r : b.pos.y - b.half.y;
}

function substep(world, dt) {
  for (const b of world.dyn) {
    if (b.sleeping || b.parked) continue;
    b.vel.y -= GRAVITY * dt;
    moveBody(b, scale(b.vel, dt));
    let grounded = false;
    for (const o of bodiesNear(world, b.pos, Math.max(b.half.x, b.half.y, b.half.z), b)) {
      const c = contact(b, o);
      if (!c) continue;
      if (o.dynamic) {
        const total = b.mass + o.mass;
        moveBody(b, scale(c.normal, c.depth * (o.mass / total)));
        moveBody(o, scale(c.normal, -c.depth * (b.mass / total)));
        if (o.sleeping && len(b.vel) > SLEEP_SPEED) wake(o);
      } else {
        moveBody(b, scale(c.normal, c.depth));
      }
      const vn = dot(b.vel, c.normal);
      if (vn < 0) b.vel = sub(b.vel, scale(c.normal, vn * 1.2));
      if (c.normal.y > 0.6) grounded = true;
    }
    const low = lowestY(b);
    if (low < 0) {
      moveBody(b, v(0, -low, 0));
      if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.2;
      grounded = true;
    }
    const damp = grounded ? Math.max(0, 1 - b.friction * 6 * dt) : 1 - 0.02 * dt;
    b.vel.x *= damp; b.vel.z *= damp;
    if (grounded) b.vel.y *= Math.max(0, 1 - 4 * dt);
    if (len(b.vel) < SLEEP_SPEED && grounded) {
      b.sleepT += dt;
      if (b.sleepT > SLEEP_TIME) { b.sleeping = true; b.vel = v(); }
    } else b.sleepT = 0;
  }
}

// Advances in fixed 1/60 substeps. Returns the number of substeps run.
export function stepWorld(world, dt) {
  world.acc += Math.min(dt, 0.1);
  let n = 0;
  while (world.acc >= SUBSTEP) {
    substep(world, SUBSTEP);
    world.acc -= SUBSTEP;
    world.time += SUBSTEP;
    n++;
  }
  return n;
}

// Turns a static surface into a loose, grip-less falling object.
export function breakBody(world, b) {
  if (b.dynamic) return;
  b.dynamic = true;
  b.grip = 'none';
  b.broken = true;
  b.vel = v(0, -0.2, 0);
  b.sleeping = false;
  b.sleepT = 0;
  world.dyn.push(b);
  if (world.onBreak) world.onBreak(b);
}

// Radial shockwave (the giant's slam): within 3.6, magnitude strength·exp(-dist/0.75),
// biased upward, applied to every dynamic body and to the player.
export function impulseFrom(world, origin, strength, player) {
  const hit = (pos, mass, apply) => {
    const d = sub(pos, origin);
    const dist = len(d);
    if (dist > SHOCK_RADIUS) return;
    const dir = dist > 1e-6 ? scale(d, 1 / dist) : v(0, 1, 0);
    const biased = add(dir, v(0, 0.8, 0));
    const bl = len(biased);
    const mag = strength * Math.exp(-dist / SHOCK_FALLOFF);
    apply(scale(biased, mag / bl / mass));
  };
  for (const b of world.dyn) {
    if (b.parked) continue;
    hit(b.pos, b.mass, (dv) => { b.vel = add(b.vel, dv); wake(b); });
  }
  if (player) hit(player.pos, player.mass, (dv) => player.applyImpulse(dv));
}

// Moves a static body to a new place (used for the giant's limb colliders each frame).
export function placeBody(b, pos, a, bEnd) {
  if (b.shape === 'capsule') { b.a = v(a.x, a.y, a.z); b.b = v(bEnd.x, bEnd.y, bEnd.z); } else b.pos = v(pos.x, pos.y, pos.z);
  refreshBounds(b);
}
