// THE PLAYER — four verbs applied uniformly to everything: move, jump, grab/release, climb (+sprint).
// Everything it touches, tries to grip, pushes, jumps, falls or routes through is logged,
// including refused attempts.
import {
  GRAVITY, PLAYER_RADIUS, PLAYER_MASS, MOVE_SPEED, CLIMB_SPEED, GROUND_ACCEL, AIR_ACCEL, JUMP_SPEED,
  GRAB_REACH, PUSH_REACH, PUSH_SPEED, SPRINT_MULTIPLIER, COYOTE_TIME, TABLE_TOP_Y, SPAWN,
  DEATH_HEIGHT, FALL_LOG_HEIGHT, VOID_Y, POISON_SECONDS,
} from './constants.js';
import { closestPoint, bodiesNear, breakBody, wake, vec } from './physics.js';

const CUP_TIP_FALL = 0.5; // landing on a cup from this high knocks it over

const { v, sub, add, scale, dot, len } = vec;
const cross = (a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a) => { const l = len(a); return l > 1e-9 ? scale(a, 1 / l) : v(0, 0, 0); };

// "underside" grip: only from a contact normal pointing down, and never on a capsule's end cap.
// While already climbing, the upper end cap is allowed so the climber can top out over it.
function isUnderside(b, p, cp, climbing = false) {
  let t = 0.5;
  if (b.shape === 'capsule') {
    const ab = sub(b.b, b.a);
    t = dot(sub(p, b.a), ab) / dot(ab, ab);
    const upper = b.b.y >= b.a.y ? t > 0.98 : t < 0.02;
    if (climbing && upper) return true;
    if (t <= 0.02 || t >= 0.98) return false;
  }
  return cp.normal.y < -0.15;
}

export class Player {
  constructor(world, model, log) {
    this.world = world;
    this.model = model;
    this.log = log;
    this.mass = PLAYER_MASS;
    this.R = PLAYER_RADIUS;
    this.reset();
  }

  reset() {
    this.pos = v(SPAWN.x, SPAWN.y, SPAWN.z);
    this.vel = v();
    this.onGround = true;
    this.ground = null;
    this.coyote = 0;
    this.grip = null; // { body, since }
    this.airMaxY = this.pos.y;
    this.wasGround = true;
    this.facing = v(-0.6, 0, -0.8);
    this.yaw = Math.atan2(this.facing.x, this.facing.z);
    this.alive = true;
    this.locked = false; // a new life is never still held by the giant
    this.poisonT = -1;
    this.stepPhase = 0;
    this.idleT = 0;
    this.idleLogged = false;
    this.sampleT = 0;
    this.lastContact = new Map();
    this.touchedClimbable = false;
    this.tableReached = false;
    this.route = null; // { id, start, maxY, last, ending }
    this.climbLogT = 0;
    this.writhe = 0;
    this.t = 0;
  }

  startPoison(cup, how = 'drank') {
    if (this.poisonT >= 0 || !this.alive) return;
    this.release('poison');
    this.locked = false;
    this.poisonT = 0;
    this.log('poison', { cup, how });
    this.hooks && this.hooks.onPoison();
  }

  applyImpulse(dv) {
    this.vel = add(this.vel, dv);
    if (this.grip) this.release('knocked off');
    this.onGround = false;
  }

  release(reason = 'released') {
    if (!this.grip) return;
    this.log('release', { target: this.grip.body.label, reason });
    if (this.route) this.route.ending = reason;
    this.grip = null;
  }

  // One fixed step. `input`: { fwd, right, jump, grabHeld, grabPressed, sprint, camYaw }
  step(dt, input, hooks) {
    this.hooks = hooks;
    this.t += dt;
    if (!this.alive) return;
    if (this.poisonT >= 0) return this.stepPoison(dt, hooks);
    if (this.locked) { this.updateModel(dt, { fwd: 0, right: 0 }); this.writhe = 0; return; }

    const any = Math.abs(input.fwd) > 0.1 || Math.abs(input.right) > 0.1 || input.jump || input.grabPressed;
    if (any) { this.idleT = 0; this.idleLogged = false; } else {
      this.idleT += dt;
      if (this.idleT > 3 && !this.idleLogged) { this.idleLogged = true; this.log('idle', { at: this.p3() }); }
    }

    const camF = v(-Math.sin(input.camYaw), 0, -Math.cos(input.camYaw));
    const camR = v(Math.cos(input.camYaw), 0, -Math.sin(input.camYaw));

    if (input.grabPressed) this.tryGrab(input, camF, camR);
    // holding E keeps you climbing: walking into a climbable surface takes hold of it again
    else if (input.grabHeld && !this.grip && this.t - (this.autoGrabT || 0) > 0.25 && (Math.abs(input.fwd) > 0.1 || Math.abs(input.right) > 0.1)) {
      this.autoGrabT = this.t;
      this.tryGrab(input, camF, camR, true);
    }
    if (this.grip && !input.grabHeld) this.release('released');

    if (this.grip) this.stepClimb(dt, input, camF, camR);
    else this.stepFree(dt, input, camF, camR);

    // void
    if (this.pos.y < VOID_Y) return this.die('void', hooks);

    // routes: an attempt ends 0.6s after the last touch of that route
    if (this.route && this.t - this.route.last > 0.6) this.endRoute(this.route.ending || 'left');

    // table
    if (!this.tableReached && this.ground && this.ground.meta.tableTop && this.pos.y > TABLE_TOP_Y - 0.03) {
      this.tableReached = true;
      if (this.route) this.endRoute('table');
      this.log('table_reached', { at: this.p3() });
      hooks.onTable();
    }
    // poison
    if (this.ground && this.ground.meta.cupInterior && this.poisonT < 0) this.startPoison(this.ground.meta.cup);

    this.sampleT += dt;
    if (this.sampleT >= 0.1) { this.sampleT = 0; this.log('px', this.p3(), true); }
    this.updateModel(dt, input);
  }

  p3() { return { x: +this.pos.x.toFixed(3), y: +this.pos.y.toFixed(3), z: +this.pos.z.toFixed(3) }; }

  stepFree(dt, input, camF, camR) {
    let mx = input.fwd, mr = input.right;
    const m = Math.hypot(mx, mr);
    if (m > 1) { mx /= m; mr /= m; }
    const speed = MOVE_SPEED * (input.sprint ? SPRINT_MULTIPLIER : 1);
    const want = add(scale(camF, mx * speed), scale(camR, mr * speed));
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const dv = sub(v(want.x, 0, want.z), v(this.vel.x, 0, this.vel.z));
    const dl = len(dv), maxDv = accel * dt;
    const applied = dl > maxDv ? scale(dv, maxDv / dl) : dv;
    this.vel.x += applied.x; this.vel.z += applied.z;
    if (len(v(want.x, 0, want.z)) > 0.05) this.facing = norm(v(want.x, 0, want.z));

    if (this.onGround) this.coyote = COYOTE_TIME; else this.coyote -= dt;
    if (input.jump && this.coyote > 0) {
      this.vel.y = JUMP_SPEED;
      this.coyote = 0;
      this.onGround = false;
      this.log('jump', { from: this.ground ? this.ground.label : 'air', at: this.p3() });
    }
    this.vel.y -= GRAVITY * dt;
    this.pos = add(this.pos, scale(this.vel, dt));
    this.collide();

    if (!this.onGround) {
      this.airMaxY = Math.max(this.airMaxY, this.pos.y);
    } else if (!this.wasGround) {
      const h = this.airMaxY - this.pos.y;
      if (h > FALL_LOG_HEIGHT) this.log('fall', { height: +h.toFixed(3), cause: this.fallCause || 'fell', onto: this.ground.label });
      // landing hard on a cup knocks it over the way you were going
      if (h >= CUP_TIP_FALL && this.ground.kind === 'cup' && this.ground.meta.cup) {
        const hv = Math.hypot(this.vel.x, this.vel.z);
        this.hooks && this.hooks.onLandCup(this.ground.meta.cup, hv > 0.1 ? { x: this.vel.x, z: this.vel.z } : this.facing);
      }
      // onto the ground — including the roots lying on it
      if (h >= DEATH_HEIGHT && (this.ground.kind === 'ground' || this.pos.y < 0.4)) { this.die('fall', this.hooks); }
      this.fallCause = null;
    }
    if (this.onGround) this.airMaxY = this.pos.y;
    this.wasGround = this.onGround;
  }

  collide() {
    this.onGround = false;
    this.ground = null;
    let bestUp = 0.6;
    for (let it = 0; it < 3; it++) {
      for (const b of bodiesNear(this.world, this.pos, this.R + 0.02)) {
        const cp = closestPoint(b, this.pos);
        if (cp.dist >= this.R) continue;
        const depth = this.R - cp.dist;
        if (cp.normal.y > 0.6) {
          // something to stand on: rest on it rather than being pushed sideways off it, so
          // narrow tops (a cup's rim, a root, an arm) can be stood and balanced on
          this.pos = add(this.pos, v(0, depth / cp.normal.y, 0));
          if (this.vel.y < 0) this.vel.y = 0;
        } else {
          this.pos = add(this.pos, scale(cp.normal, depth));
          const vn = dot(this.vel, cp.normal);
          if (vn < 0) this.vel = sub(this.vel, scale(cp.normal, vn));
        }
        if (cp.normal.y > bestUp) { bestUp = cp.normal.y; this.onGround = true; this.ground = b; }
        this.touch(b, cp);
      }
    }
    if (this.onGround) {
      // ground friction on landing / standing (horizontal accel handles walking)
      if (this.ground.dynamic && !this.ground.sleeping) {
        // standing on something moving: ride along, but never move it
        this.pos = add(this.pos, scale(v(this.ground.vel.x, 0, this.ground.vel.z), 1 / 60));
      }
    }
  }

  touch(b, cp) {
    const now = this.t;
    const last = this.lastContact.get(b.id) ?? -1;
    if (now - last > 0.5) this.log('contact', { label: b.label, kind: b.kind, normalY: +cp.normal.y.toFixed(2) });
    this.lastContact.set(b.id, now);
    if (!this.touchedClimbable && b.grip !== 'none' && b.kind !== 'ground' && b.kind !== 'slab') {
      this.touchedClimbable = true;
      this.log('first_climbable_contact', { label: b.label, route: b.route });
    }
    if (b.route) this.touchRoute(b.route);
  }

  touchRoute(id) {
    if (!this.route || this.route.id !== id) {
      if (this.route) this.endRoute('switched');
      this.route = { id, start: this.t, maxY: this.pos.y, last: this.t, ending: null };
    }
    this.route.last = this.t;
    this.route.maxY = Math.max(this.route.maxY, this.pos.y);
  }

  endRoute(ending) {
    const r = this.route;
    if (!r) return;
    this.log('route_attempt', { route: r.id, height_reached: +r.maxY.toFixed(3), ending, duration_ms: Math.round((this.t - r.start) * 1000) });
    this.route = null;
  }

  tryGrab(input, camF, camR, auto = false) {
    // standing on a cup's rim: shove the cup itself
    if (!auto && this.onGround && this.ground && this.ground.meta.lip) {
      this.log('push', { target: this.ground.meta.cup, cup: true });
      this.hooks && this.hooks.onPushCup(this.ground.meta.cup, this.facing);
      return;
    }
    const near = bodiesNear(this.world, this.pos, GRAB_REACH + 0.05);
    // 1) on the ground with a loose object in front: shove it
    if (this.onGround && !auto) {
      let best = null;
      for (const b of near) {
        if (!b.dynamic || b === this.ground) continue;
        const cp = closestPoint(b, this.pos);
        if (cp.dist > PUSH_REACH) continue;
        const toward = norm(v(-cp.normal.x, 0, -cp.normal.z));
        if (dot(toward, this.facing) < 0.5) continue;
        if (!best || cp.dist < best.cp.dist) best = { b, cp };
      }
      if (best) {
        const s = PUSH_SPEED * Math.min(1, 1 / best.b.mass);
        best.b.vel = add(best.b.vel, v(this.facing.x * s, 0.15, this.facing.z * s));
        wake(best.b);
        this.log('push', { target: best.b.label, mass: best.b.mass });
        if (best.b.route) this.touchRoute(best.b.route);
        return;
      }
    }
    // 2) reach for the nearest surface within GRAB_REACH (floors you stand on don't count)
    let best = null;
    for (const b of near) {
      if (b.dynamic && !b.broken) continue;
      const cp = closestPoint(b, this.pos);
      if (cp.dist > GRAB_REACH) continue;
      if (b === this.ground && cp.normal.y > 0.6) continue;
      if (b.kind === 'ground') continue;
      if (auto && (cp.normal.y > 0.6 || dot(v(-cp.normal.x, 0, -cp.normal.z), this.facing) < 0.3)) continue;
      if (!best || cp.dist < best.cp.dist) best = { b, cp };
    }
    if (!best) {
      if (!auto) this.log('grab_attempt', { target: null, surface: null, succeeded: false });
      return;
    }
    if (auto && best.b.grip === 'none') return;
    const { b, cp } = best;
    let ok = b.grip === 'all';
    if (b.grip === 'underside') ok = isUnderside(b, this.pos, cp);
    this.log('grab_attempt', { target: b.label, surface: b.grip, kind: b.kind, route: b.route, succeeded: ok });
    if (b.route) this.touchRoute(b.route);
    if (!ok) { if (this.route) this.route.ending = 'refused'; return; }
    this.touch(b, cp);
    this.grip = { body: b, since: this.t };
    this.vel = v();
    this.log('grab', { target: b.label, route: b.route });
    this.log('mount', { target: b.label, at: this.p3() });
  }

  stepClimb(dt, input, camF, camR) {
    const b = this.grip.body;
    let cp = closestPoint(b, this.pos);
    let n = cp.normal;
    // "up" follows a slanted root/vine/stave along its length; world-up elsewhere
    let upRef = v(0, 1, 0);
    if (b.shape === 'capsule' && b.len > 1e-6 && Math.abs(b.axis.y) > 0.2) upRef = b.axis.y > 0 ? b.axis : scale(b.axis, -1);
    let up = sub(upRef, scale(n, dot(upRef, n)));
    if (len(up) < 0.2) up = b.shape === 'capsule' ? upRef : sub(camF, scale(n, dot(camF, n)));
    up = norm(up);
    let right = sub(camR, scale(n, dot(camR, n)));
    right = len(right) < 0.2 ? cross(up, n) : norm(right);
    const move = add(scale(up, input.fwd), scale(right, input.right));
    const ml = len(move);
    const step = ml > 1 ? scale(move, 1 / ml) : move;
    this.pos = add(this.pos, scale(step, CLIMB_SPEED * dt));
    // pulled back to the surface each frame
    cp = closestPoint(b, this.pos);
    n = cp.normal;
    if (cp.dist > GRAB_REACH) { this.release('slipped'); this.fallCause = 'slipped'; return; }
    if (b.grip === 'underside' && n.y <= 0.7 && !isUnderside(b, this.pos, cp, true)) { this.release('slipped'); this.fallCause = 'slipped'; return; }
    this.pos = add(cp.point, scale(n, this.R + 0.002));
    this.vel = v();
    this.facing = norm(v(-n.x, 0, -n.z));
    this.collideOthers(b, step);
    if (this.grip && this.grip.body !== b) return;
    this.airMaxY = this.pos.y;
    this.wasGround = false;
    if (this.route) { this.route.last = this.t; this.route.maxY = Math.max(this.route.maxY, this.pos.y); }
    this.climbLogT += dt;
    if (ml > 0.1 && this.climbLogT > 0.5) { this.climbLogT = 0; this.log('climb', { target: b.label, y: +this.pos.y.toFixed(3) }); }
    if (ml > 0.1) this.stepPhase += dt * 14;

    // stress on surfaces that can break
    if (b.breakThreshold > 0) {
      b.stress += GRAVITY * PLAYER_MASS * dt;
      if (b.stress > b.breakThreshold) {
        this.log('break', { target: b.label, stress: +b.stress.toFixed(1), threshold: b.breakThreshold });
        for (const o of this.world.bodies) if (o.route === b.route && o.breakThreshold > 0) breakBody(this.world, o);
        this.release('broke');
        this.fallCause = 'surface broke';
        return;
      }
    }
    // over the top of a knot while still holding on: take the vine above it again
    if (n.y > 0.85 && b.shape === 'sphere' && b.route && input.grabHeld) {
      for (const o of bodiesNear(this.world, this.pos, GRAB_REACH)) {
        if (o === b || o.route !== b.route || o.shape !== 'capsule' || o.grip !== 'all') continue;
        const cpo = closestPoint(o, this.pos);
        if (cpo.dist <= GRAB_REACH && cpo.normal.y < 0.7) {
          this.lastGrip = { body: b, at: this.t };
          this.grip = { body: o, since: this.t };
          this.log('grab', { target: o.label, route: o.route, over: b.label });
          return;
        }
      }
    }
    // topped out: the contact normal points (nearly) straight up
    if (n.y > 0.85) {
      this.release('topped out');
      this.onGround = true;
      this.ground = b;
      this.wasGround = true;
      return;
    }
    if (input.jump) {
      this.release('jumped off');
      this.vel = add(scale(n, 1.1), v(0, JUMP_SPEED * 0.8, 0));
      this.log('jump', { from: b.label, at: this.p3() });
    }
  }

  // Push out of other surfaces while climbing. If the climb runs into another surface that can be
  // gripped, the animal takes hold of that one instead (vine → knot, stem → bowl → lip, arm → fist).
  collideOthers(gripped, step) {
    let transfer = null;
    for (const b of bodiesNear(this.world, this.pos, this.R + 0.02)) {
      if (b === gripped) continue;
      const cp = closestPoint(b, this.pos);
      if (cp.dist >= this.R) continue;
      this.pos = add(this.pos, scale(cp.normal, this.R - cp.dist));
      this.touch(b, cp);
      const justLeft = this.lastGrip && this.lastGrip.body === b && this.t - this.lastGrip.at < 0.4;
      if (step && !justLeft && len(step) > 0.1 && dot(norm(step), cp.normal) < -0.3 && !b.dynamic && cp.normal.y < 0.7) {
        const ok = b.grip === 'all' || (b.grip === 'underside' && isUnderside(b, this.pos, cp));
        if (ok) transfer = b;
        else if (!this.refusedLog || this.t - this.refusedLog > 1) {
          this.refusedLog = this.t;
          this.log('grab_attempt', { target: b.label, surface: b.grip, kind: b.kind, route: b.route, succeeded: false, while: 'climbing' });
        }
      }
    }
    if (transfer) {
      this.log('grab_attempt', { target: transfer.label, surface: transfer.grip, kind: transfer.kind, route: transfer.route, succeeded: true, while: 'climbing' });
      this.log('grab', { target: transfer.label, route: transfer.route });
      this.lastGrip = { body: gripped, at: this.t };
      this.grip = { body: transfer, since: this.t };
      if (transfer.route) this.touchRoute(transfer.route);
    }
  }

  stepPoison(dt, hooks) {
    this.poisonT += dt;
    const k = this.poisonT / POISON_SECONDS;
    // convulsions that come fast, weaken, and leave the body still
    this.writhe = k < 1 ? (1 - k) * (1 - k) : 0;
    this.updateModel(dt, { fwd: 0, right: 0 });
    if (this.poisonT >= POISON_SECONDS) this.die('poison', hooks);
  }

  die(cause, hooks) {
    if (!this.alive) return;
    this.alive = false;
    if (this.grip) this.release('death');
    if (this.route) this.endRoute('death');
    this.log('death', { cause, at: this.p3() });
    (hooks || this.hooks).onDeath(cause);
  }

  updateModel(dt, input) {
    const { root, body, legs } = this.model;
    root.position.set(this.pos.x, this.pos.y - 0.012, this.pos.z);
    const targetYaw = Math.atan2(this.facing.x, this.facing.z);
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 14);
    root.rotation.set(0, this.yaw, 0);
    // climbing: belly to the surface
    body.rotation.x = this.grip ? -1.25 : 0;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const stepping = this.onGround && hs > 0.05;
    if (stepping) this.stepPhase += dt * hs * 42;
    const gait = stepping || (this.grip && Math.abs(input.fwd) + Math.abs(input.right) > 0.1);
    legs.forEach((leg, i) => {
      leg.rotation.x = gait ? Math.sin(this.stepPhase + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI : 0)) * 0.7 : 0;
    });
    body.position.y = stepping ? Math.abs(Math.sin(this.stepPhase)) * 0.006 : 0;
    if (this.writhe > 0) {
      const w = this.writhe;
      body.rotation.z = Math.sin(this.t * 38) * 0.9 * w;
      body.rotation.x = Math.sin(this.t * 27) * 0.5 * w;
      body.position.y = Math.abs(Math.sin(this.t * 31)) * 0.02 * w;
      legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.t * 45 + i) * 1.2 * w; });
    } else if (this.poisonT >= 0) {
      body.rotation.z = 1.4; // still
    }
  }
}

