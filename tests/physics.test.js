import { test, expect } from 'bun:test';
import { createWorld, addBox, addCapsule, addSphere, closestPoint, stepWorld, breakBody, impulseFrom, refreshBounds } from '../src/game/physics.js';

const close = (a, b, e = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(e);

test('box closestPoint: outside gives positive distance and outward normal', () => {
  const w = createWorld();
  const b = addBox(w, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  const cp = closestPoint(b, { x: 3, y: 0, z: 0 });
  close(cp.dist, 2);
  close(cp.normal.x, 1);
  expect(cp.inside).toBe(false);
});

test('box closestPoint: inside picks the least-penetration axis', () => {
  const w = createWorld();
  const b = addBox(w, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  const cp = closestPoint(b, { x: 0.1, y: 0.9, z: 0 });
  expect(cp.inside).toBe(true);
  close(cp.normal.y, 1);
  close(cp.dist, -0.1);
});

test('capsule closestPoint measures from the segment', () => {
  const w = createWorld();
  const c = addCapsule(w, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5);
  const cp = closestPoint(c, { x: 1.5, y: 1, z: 0 });
  close(cp.dist, 1);
  close(cp.normal.x, 1);
  const end = closestPoint(c, { x: 0, y: 3, z: 0 });
  close(end.dist, 0.5);
  close(end.normal.y, 1);
});

test('refreshBounds recomputes a capsule moved by its ends', () => {
  const w = createWorld();
  const c = addCapsule(w, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.1);
  c.b = { x: 3, y: 0, z: 0 };
  refreshBounds(c);
  close(c.len, 3);
  close(c.axis.x, 1);
  close(c.pos.x, 1.5);
  close(c.bounds.max.x, 3.1);
});

test('a dynamic box falls, lands on the floor and sleeps', () => {
  const w = createWorld();
  const b = addBox(w, { x: 0, y: 1, z: 0 }, { x: 0.1, y: 0.1, z: 0.1 }, { dynamic: true });
  b.sleeping = false;
  for (let i = 0; i < 240; i++) stepWorld(w, 1 / 60);
  close(b.pos.y, 0.1, 1e-3);
  expect(b.sleeping).toBe(true);
});

test('breakBody turns a static surface into a loose, grip-less falling object', () => {
  const w = createWorld();
  const c = addCapsule(w, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }, 0.05, { breakThreshold: 27 });
  breakBody(w, c);
  expect(c.dynamic).toBe(true);
  expect(c.grip).toBe('none');
  expect(w.dyn).toContain(c);
  const y0 = c.pos.y;
  for (let i = 0; i < 30; i++) stepWorld(w, 1 / 60);
  expect(c.pos.y).toBeLessThan(y0);
});

test('impulseFrom falls off with distance and stops at 3.6', () => {
  const w = createWorld();
  const near = addSphere(w, { x: 0.5, y: 0.1, z: 0 }, 0.05, { dynamic: true });
  const far = addSphere(w, { x: 2.0, y: 0.1, z: 0 }, 0.05, { dynamic: true });
  const out = addSphere(w, { x: 4.0, y: 0.1, z: 0 }, 0.05, { dynamic: true });
  impulseFrom(w, { x: 0, y: 0.1, z: 0 }, 4.2, null);
  const sp = (b) => Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  expect(sp(near)).toBeGreaterThan(sp(far));
  expect(sp(out)).toBe(0);
  expect(near.vel.y).toBeGreaterThan(0); // upward bias
  close(sp(near), 4.2 * Math.exp(-0.5 / 0.75), 1e-6);
});
