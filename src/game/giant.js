// THE GIANT — arrival on a fixed timeline, a slam that throws loose things, two cups set down.
// His limbs are solid: fist boxes and arm capsule chains follow his real limb positions.
import * as THREE from 'three';
import { addBox, addCapsule, placeBody, impulseFrom, vec } from './physics.js';
import { buildGiant, buildCup, buildCheese, buildLoaf, cupColliderSpec } from './models.js';
import { LEAN, HEAD_TILT, ARM_PULL, ARM_DOWN, SLAM_STRENGTH, EYE_HIT_RADIUS, TABLE_TOP_Y } from './constants.js';

const PARK = { x: 0, y: -40, z: 0 };
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export class Giant {
  constructor(world, scene, mats, log, notice) {
    this.world = world;
    this.log = log;
    this.notice = notice;
    this.model = buildGiant(mats);
    scene.add(this.model.root);
    this.mats = mats;

    // limb colliders — created parked far below the world
    this.limbs = this.model.arms.map((arm) => ({
      arm,
      fist: addBox(world, PARK, { x: 0.3, y: 0.2, z: 0.3 }, { label: 'giant fist', kind: 'giant', grip: 'all' }),
      caps: [0.25, 0.26, 0.21].map((r, i) => addCapsule(world, PARK, { x: 0, y: -40.1, z: 0 }, r, { label: ['giant upper arm', 'giant forearm', 'giant hand'][i], kind: 'giant', grip: 'all' })),
    }));
    for (const l of this.limbs) { l.fist.parked = true; l.caps.forEach((c) => (c.parked = true)); }

    // the things he sets down: spot on the table, which fist carries it, when
    this.items = [
      { name: 'left cup', kind: 'cup', x: -0.6, z: 0.5, side: -1, at: 3.3 },
      { name: 'right cup', kind: 'cup', x: 0.6, z: 0.5, side: 1, at: 4.15 },
      { name: 'cheese', kind: 'cheese', x: -0.35, z: -0.55, side: -1, at: 5.0 },
      { name: 'loaf', kind: 'loaf', x: 0.6, z: -0.9, side: 1, at: 5.7 },
    ];
    for (const it of this.items) {
      it.mesh = it.kind === 'cup' ? buildCup(mats) : it.kind === 'cheese' ? buildCheese(mats) : buildLoaf(mats);
      it.mesh.visible = false;
      scene.add(it.mesh);
      it.bodies = [];
      if (it.kind === 'cup') {
        const spec = cupColliderSpec(it.x, TABLE_TOP_Y, it.z);
        it.spec = spec;
        const meta = { cup: it.name };
        for (const s of spec.staves) it.bodies.push({ b: addCapsule(world, s.a, s.b, s.r, { label: `${it.name} wall`, kind: 'cup', meta }), a: s.a, bb: s.b });
        for (const s of spec.beads) it.bodies.push({ b: addCapsule(world, s.p, s.p, s.r, { label: `${it.name} lip`, kind: 'cup', meta }), a: s.p, bb: s.p });
        it.bodies.push({ b: addCapsule(world, spec.column.a, spec.column.b, spec.column.r, { label: `${it.name} stem`, kind: 'cup', meta }), a: spec.column.a, bb: spec.column.b });
        it.bodies.push({ b: addBox(world, spec.floor.p, spec.floor.half, { label: `${it.name} drink`, kind: 'drink', grip: 'none', meta: { cupInterior: true, cup: it.name } }), p: spec.floor.p });
      } else if (it.kind === 'cheese') {
        const p = { x: it.x, y: TABLE_TOP_Y + 0.15, z: it.z };
        it.bodies.push({ b: addBox(world, p, { x: 0.21, y: 0.15, z: 0.18 }, { label: 'cheese', kind: 'food' }), p });
      } else {
        const p = { x: it.x, y: TABLE_TOP_Y + 0.16, z: it.z };
        it.bodies.push({ b: addBox(world, p, { x: 0.36, y: 0.16, z: 0.23 }, { label: 'loaf', kind: 'food' }), p });
      }
      for (const e of it.bodies) e.b.parked = true;
    }
    this.reset();
  }

  reset() {
    this.state = 'away'; // away | arriving | present | reeling | falling | gone
    this.t = 0;
    this.slammed = false;
    this.asked = false;
    this.complete = false;
    const m = this.model;
    m.root.visible = false;
    m.root.position.set(0, 0, -9.5);
    m.root.rotation.set(0, 0, 0);
    m.lean.rotation.set(0, 0, 0);
    m.neck.rotation.set(0, 0, 0);
    m.arms.forEach((a) => a.pivot.rotation.set(0, 0, 0));
    for (const l of this.limbs) this.parkLimb(l);
    for (const it of this.items) {
      it.placed = false;
      it.mesh.visible = false;
      for (const e of it.bodies) { e.b.parked = true; this.moveItemBody(e, { x: 0, y: -60, z: 0 }); }
    }
  }

  parkLimb(l) {
    l.fist.parked = true;
    placeBody(l.fist, PARK);
    l.caps.forEach((c) => { c.parked = true; placeBody(c, null, PARK, { x: 0, y: -40.1, z: 0 }); });
  }

  start() {
    if (this.state !== 'away') return;
    this.state = 'arriving';
    this.t = 0;
    this.model.root.visible = true;
  }

  eyeWorld() {
    const p = new THREE.Vector3();
    this.model.eye.getWorldPosition(p);
    return p;
  }

  update(dt, player) {
    if (this.state === 'away' || this.state === 'gone') return;
    this.t += dt;
    const t = this.t, m = this.model;

    if (this.state === 'arriving' || this.state === 'present') {
      // walk in from z -9.5 to -2.7 with a bob (0 -> 1.7s), leaning and tilting as he comes
      const w = ease(seg(t, 0, 1.7));
      m.root.position.z = -9.5 + (-2.7 + 9.5) * w;
      m.root.position.y = t < 1.7 ? Math.abs(Math.sin(t * 7.4)) * 0.12 * (1 - w * 0.5) : 0;
      m.lean.rotation.x = LEAN * w;
      m.neck.rotation.x = HEAD_TILT * w;
      // arms: swing while walking, raise (1.7 -> 2.1), slam (2.1 -> 2.4), hold
      let armX;
      if (t < 1.7) armX = Math.sin(t * 7.4) * 0.25 * (1 - w);
      else if (t < 2.1) armX = ARM_PULL * ease(seg(t, 1.7, 2.1));
      else if (t < 2.4) armX = ARM_PULL + (ARM_DOWN - ARM_PULL) * easeIn(seg(t, 2.1, 2.4));
      else armX = ARM_DOWN;
      m.arms.forEach((a, i) => { a.pivot.rotation.x = t < 1.7 ? armX * (i ? 1 : -1) : armX; });

      if (t >= 2.4 && !this.slammed) {
        this.slammed = true;
        m.root.updateMatrixWorld(true);
        for (const a of m.arms) {
          const p = new THREE.Vector3();
          a.fist.getWorldPosition(p);
          impulseFrom(this.world, { x: p.x, y: p.y, z: p.z }, SLAM_STRENGTH, player);
        }
        this.log('giant_slam', {});
        this.onSlam && this.onSlam();
      }
      // set things down one at a time, each lowered over 0.75s from inside the fist
      m.root.updateMatrixWorld(true);
      for (const it of this.items) this.updateItem(it, t);
      if (!this.asked && this.items[0].placed && this.items[1].placed) {
        this.asked = true;
        this.notice(['Make a choice, one is poison, one is paradise', '(but both are poison)'], 9);
        this.log('choice_prompt', {});
      }
      if (t >= 6.55 && !this.complete) {
        this.complete = true;
        this.state = 'present';
        this.log('stage_complete', { stage: 'giant_arrives' });
      }
      if (this.state === 'present') {
        // breathe, and let the head follow the animal a little
        const breath = Math.sin(t * 1.3) * 0.015;
        // he leans in to watch when the animal climbs up by his cups
        const near = player.pos.y > TABLE_TOP_Y + 0.35 && Math.abs(player.pos.z - 0.5) < 0.6 ? 1 : 0;
        this.leanIn = (this.leanIn || 0) + (near - (this.leanIn || 0)) * Math.min(1, dt * 0.8);
        m.lean.rotation.x = LEAN + breath + this.leanIn * 0.1;
        const toP = Math.atan2(player.pos.x - m.root.position.x, player.pos.z - m.root.position.z);
        m.neck.rotation.y += (Math.max(-0.35, Math.min(0.35, toP)) - m.neck.rotation.y) * Math.min(1, dt * 1.5);
      }
      this.syncLimbs();
      // the leap that ends him
      if (t > 2.4 && player.alive) {
        const e = this.eyeWorld();
        const d = Math.hypot(player.pos.x - e.x, player.pos.y - e.y, player.pos.z - e.z);
        if (d < EYE_HIT_RADIUS) {
          this.state = 'reeling';
          this.t = 0;
          this.log('giant_hit', { at: player.p3() });
          this.notice([], 0);
        }
      }
      return;
    }

    if (this.state === 'reeling') {
      // he reels for 0.45s
      const k = seg(t, 0, 0.45);
      m.neck.rotation.x = HEAD_TILT - k * 0.9;
      m.neck.rotation.z = Math.sin(t * 40) * 0.12 * (1 - k);
      m.arms.forEach((a, i) => { a.pivot.rotation.x = ARM_DOWN + k * 1.4; a.pivot.rotation.z = (i ? 1 : -1) * k * 0.5; });
      this.syncLimbs();
      if (t >= 0.45) {
        this.state = 'falling';
        this.t = 0;
        // anything still held is dropped onto the table; his colliders leave the world
        for (const it of this.items) if (!it.placed) this.placeNow(it);
        for (const l of this.limbs) this.parkLimb(l);
      }
      return;
    }

    if (this.state === 'falling') {
      // falls away over 1.5s and vanishes
      const k = easeIn(seg(t, 0, 1.5));
      m.lean.rotation.x = LEAN - k * 1.7;
      m.root.position.y = -k * 1.2;
      m.root.position.z = -2.7 - k * 1.5;
      if (t >= 1.5) {
        this.state = 'gone';
        m.root.visible = false;
        this.log('stage_complete', { stage: 'giant', giant_slain: true });
        this.onSlain && this.onSlain();
      }
    }
  }

  syncLimbs() {
    const w = new THREE.Vector3(), w2 = new THREE.Vector3();
    for (const l of this.limbs) {
      const mk = l.arm.marks;
      l.arm.fist.getWorldPosition(w);
      l.fist.parked = false;
      placeBody(l.fist, w);
      const chain = [mk.shoulder, mk.elbow, mk.wrist, mk.hand];
      l.caps.forEach((c, i) => {
        chain[i].getWorldPosition(w);
        chain[i + 1].getWorldPosition(w2);
        c.parked = false;
        placeBody(c, null, w, w2);
      });
    }
  }

  moveItemBody(e, off) {
    if (e.p) placeBody(e.b, { x: e.p.x + off.x, y: e.p.y + off.y, z: e.p.z + off.z });
    else placeBody(e.b, null, { x: e.a.x + off.x, y: e.a.y + off.y, z: e.a.z + off.z }, { x: e.bb.x + off.x, y: e.bb.y + off.y, z: e.bb.z + off.z });
  }

  updateItem(it, t) {
    if (it.placed) return;
    const arm = this.model.arms[it.side < 0 ? 0 : 1];
    if (t < it.at) return;
    const k = ease(seg(t, it.at, it.at + 0.75));
    const from = new THREE.Vector3();
    arm.hold.getWorldPosition(from);
    from.y -= 0.15;
    const to = new THREE.Vector3(it.x, TABLE_TOP_Y, it.z);
    const p = from.lerp(to, k);
    it.mesh.visible = true;
    it.mesh.position.copy(p);
    const off = { x: p.x - it.x, y: p.y - TABLE_TOP_Y, z: p.z - it.z };
    for (const e of it.bodies) { e.b.parked = false; this.moveItemBody(e, off); }
    if (k >= 1) {
      it.placed = true;
      this.log('giant_places', { item: it.name, x: it.x, z: it.z });
    }
  }

  placeNow(it) {
    it.placed = true;
    it.mesh.visible = true;
    it.mesh.position.set(it.x, TABLE_TOP_Y, it.z);
    for (const e of it.bodies) { e.b.parked = false; this.moveItemBody(e, { x: 0, y: 0, z: 0 }); }
    this.log('giant_places', { item: it.name, x: it.x, z: it.z, dropped: true });
  }
}

export const _v = vec;
