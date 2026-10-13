// THE GIANT — his table is already set (two cups, cheese, a loaf). When the animal reaches the
// tabletop he walks in, slams his hands down hard enough to throw loose things, and asks his
// question. He is solid: fists, arms, head and jaw are colliders that follow his real body, so his
// arm is a ramp to his face. Reach his eye and you are in it — mash to finish him, or he shakes
// you off.
import * as THREE from 'three';
import { addBox, addCapsule, addSphere, placeBody, impulseFrom } from './physics.js';
import { buildGiant, buildCup, buildCheese, buildLoaf, cupColliderSpec } from './models.js';
import { LEAN, HEAD_TILT, ARM_PULL, ARM_DOWN, SLAM_STRENGTH, EYE_HIT_RADIUS, TABLE_TOP_Y } from './constants.js';

const PARK = { x: 0, y: -40, z: 0 };
const STAND_Z = -3.3; // feet; further back than the brief's -2.7 because the table is bigger
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export const BURROW_PRESSES = 18;
const LEAN_IN = 0.09; // extra lean (rad) over the table: brings his chin down onto it
export const BURROW_GRACE = 2.2; // seconds without a press before he shakes you off

export class Giant {
  constructor(world, scene, mats, log, notice) {
    this.world = world;
    this.scene = scene;
    this.log = log;
    this.notice = notice;
    this.model = buildGiant(mats);
    scene.add(this.model.root);

    // limb colliders — created parked far below the world
    this.limbs = this.model.arms.map((arm) => ({
      arm,
      fist: addBox(world, PARK, { x: 0.3, y: 0.2, z: 0.3 }, { label: 'giant fist', kind: 'giant', grip: 'all' }),
      caps: [0.25, 0.26, 0.21].map((r, i) => addCapsule(world, PARK, { x: 0, y: -40.1, z: 0 }, r, { label: ['giant upper arm', 'giant forearm', 'giant hand'][i], kind: 'giant', grip: 'all' })),
    }));
    this.head = addSphere(world, PARK, 0.55, { label: 'giant head', kind: 'giant', grip: 'all' });
    this.jaw = addSphere(world, PARK, 0.4, { label: 'giant jaw', kind: 'giant', grip: 'all' });
    this.parkAll();

    // his table, already set
    this.items = [
      { name: 'left cup', kind: 'cup', x: -0.42, z: 0.55 },
      { name: 'right cup', kind: 'cup', x: 0.42, z: 0.55 },
      { name: 'cheese', kind: 'cheese', x: -1.6, z: -0.9 },
      { name: 'loaf', kind: 'loaf', x: 1.65, z: -0.8 },
    ];
    for (const it of this.items) {
      it.mesh = it.kind === 'cup' ? buildCup(mats) : it.kind === 'cheese' ? buildCheese(mats) : buildLoaf(mats);
      it.mesh.position.set(it.x, TABLE_TOP_Y, it.z);
      scene.add(it.mesh);
      if (it.kind === 'cup') {
        const spec = cupColliderSpec(it.x, TABLE_TOP_Y, it.z);
        const meta = { cup: it.name };
        for (const s of spec.staves) addCapsule(world, s.a, s.b, s.r, { label: `${it.name} wall`, kind: 'cup', meta });
        for (const s of spec.beads) addCapsule(world, s.a, s.b, s.r, { label: `${it.name} lip`, kind: 'cup', meta });
        addCapsule(world, spec.column.a, spec.column.b, spec.column.r, { label: `${it.name} stem`, kind: 'cup', meta });
        addBox(world, spec.floor.p, spec.floor.half, { label: `${it.name} drink`, kind: 'drink', grip: 'none', meta: { cupInterior: true, cup: it.name } });
      } else if (it.kind === 'cheese') {
        addBox(world, { x: it.x, y: TABLE_TOP_Y + 0.15, z: it.z }, { x: 0.21, y: 0.15, z: 0.18 }, { label: 'cheese', kind: 'food' });
      } else {
        addBox(world, { x: it.x, y: TABLE_TOP_Y + 0.16, z: it.z }, { x: 0.36, y: 0.16, z: 0.23 }, { label: 'loaf', kind: 'food' });
      }
    }

    // ichor — a pool of droplets thrown out of the eye
    this.drops = [];
    const dropGeo = new THREE.IcosahedronGeometry(0.018, 0);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b2412, roughness: 0.4 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x66ff00, emissive: 0x66ff00, emissiveIntensity: 1.4 });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(dropGeo, i % 3 ? dark : glow);
      m.visible = false;
      scene.add(m);
      this.drops.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.reset();
  }

  parkAll() {
    for (const l of this.limbs) {
      l.fist.parked = true;
      placeBody(l.fist, PARK);
      l.caps.forEach((c) => { c.parked = true; placeBody(c, null, PARK, { x: 0, y: -40.1, z: 0 }); });
    }
    for (const b of [this.head, this.jaw]) { b.parked = true; placeBody(b, PARK); }
  }

  reset() {
    this.state = 'away'; // away | arriving | present | burrow | reeling | falling | gone
    this.t = 0;
    this.slammed = false;
    this.leanIn = 0;
    this.eyeCooldown = 0;
    const m = this.model;
    m.root.visible = false;
    m.root.position.set(0, 0, -9.5);
    m.root.rotation.set(0, 0, 0);
    m.lean.rotation.set(0, 0, 0);
    m.neck.rotation.set(0, 0, 0);
    m.arms.forEach((a) => a.pivot.rotation.set(0, 0, 0));
    this.parkAll();
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

  // one press while burrowing into the eye
  press() {
    if (this.state !== 'burrow') return;
    this.presses += 1;
    this.lastPress = this.t;
    this.jolt = 1;
    this.spray(10);
    this.log('eye_press', { n: this.presses });
    this.onShake && this.onShake(0.6 + this.presses / BURROW_PRESSES);
    if (this.presses >= BURROW_PRESSES) {
      this.log('stage_complete', { stage: 'giant', giant_slain: true, presses: this.presses, seconds: +(this.t).toFixed(2) });
      this.spray(40);
      this.state = 'reeling';
      this.t = 0;
      this.releasePlayer(0.2);
    }
  }

  releasePlayer(push) {
    const p = this.player;
    if (!p) return;
    p.locked = false;
    const e = this.eyeWorld();
    p.pos = { x: e.x, y: e.y, z: e.z + 0.12 };
    p.vel = { x: 0, y: 0.5, z: push };
    p.onGround = false;
    p.airMaxY = p.pos.y;
  }

  spray(n) {
    const e = this.eyeWorld();
    let k = 0;
    for (const d of this.drops) {
      if (d.life > 0) continue;
      d.life = 0.8 + Math.random() * 0.8;
      d.m.visible = true;
      d.m.position.copy(e);
      d.v.set((Math.random() - 0.5) * 2.2, Math.random() * 1.8, 0.6 + Math.random() * 1.4);
      d.m.scale.setScalar(0.6 + Math.random() * 1.6);
      if (++k >= n) break;
    }
  }

  updateDrops(dt) {
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < TABLE_TOP_Y + 0.01 && Math.abs(d.m.position.x) < 2.6 && Math.abs(d.m.position.z) < 1.75) {
        d.m.position.y = TABLE_TOP_Y + 0.01; d.v.set(0, 0, 0);
      }
      if (d.life <= 0) d.m.visible = false;
    }
  }

  update(dt, player) {
    this.player = player;
    this.updateDrops(dt);
    if (this.state === 'away' || this.state === 'gone') return;
    this.t += dt;
    this.eyeCooldown = Math.max(0, this.eyeCooldown - dt);
    const t = this.t, m = this.model;

    if (this.state === 'arriving' || this.state === 'present') {
      // walk in (0 -> 1.7s), leaning and tilting so his face comes down to the table
      const w = ease(seg(t, 0, 1.7));
      m.root.position.z = -9.5 + (STAND_Z + 9.5) * w;
      m.root.position.y = t < 1.7 ? Math.abs(Math.sin(t * 7.4)) * 0.12 * (1 - w * 0.5) : 0;
      m.neck.rotation.x = HEAD_TILT * w;
      // arms: swing while walking, raise (1.7 -> 2.1), slam (2.1 -> 2.4), then stay planted
      let armX;
      if (t < 1.7) armX = Math.sin(t * 7.4) * 0.25 * (1 - w);
      else if (t < 2.1) armX = ARM_PULL * ease(seg(t, 1.7, 2.1));
      else if (t < 2.4) armX = ARM_PULL + (ARM_DOWN - ARM_PULL) * easeIn(seg(t, 2.1, 2.4));
      else armX = ARM_DOWN;
      // once his hands are down he leans right in over the table to watch the animal, face low
      // behind the cups; his hands stay planted while he does
      const near = t > 2.4 && player.pos.y > TABLE_TOP_Y - 0.1 ? 1 : 0;
      this.leanIn += (near - this.leanIn) * Math.min(1, dt * 0.9);
      const extra = this.leanIn * LEAN_IN;
      m.arms.forEach((a, i) => { a.pivot.rotation.x = t < 1.7 ? armX * (i ? 1 : -1) : armX - (t >= 2.4 ? extra : 0); a.pivot.rotation.z = 0; });
      const breath = this.state === 'present' ? Math.sin(t * 1.3) * 0.015 : 0;
      m.lean.rotation.x = LEAN * w + breath + extra;
      if (t >= 2.4) this.plantFists();

      if (t >= 2.4 && !this.slammed) {
        this.slammed = true;
        m.root.updateMatrixWorld(true);
        for (const a of m.arms) {
          const p = new THREE.Vector3();
          a.fist.getWorldPosition(p);
          impulseFrom(this.world, { x: p.x, y: p.y, z: p.z }, SLAM_STRENGTH, player);
        }
        this.log('giant_slam', {});
        this.onShake && this.onShake(1.2);
        this.notice(['Make a choice, one is poison, one is paradise', '(but both are poison)'], 9);
        this.log('choice_prompt', {});
      }
      if (t >= 3.3 && this.state === 'arriving') {
        this.state = 'present';
        this.log('stage_complete', { stage: 'giant_arrives' });
      }
      if (this.state === 'present') {
        const toP = Math.atan2(player.pos.x - m.root.position.x, player.pos.z - m.root.position.z);
        m.neck.rotation.y += (Math.max(-0.35, Math.min(0.35, toP)) - m.neck.rotation.y) * Math.min(1, dt * 1.5);
      }
      m.root.updateMatrixWorld(true);
      this.syncColliders();
      // reaching his eye puts you in it
      if (t > 2.4 && player.alive && !player.locked && this.eyeCooldown <= 0) {
        const e = this.eyeWorld();
        const d = Math.hypot(player.pos.x - e.x, player.pos.y - e.y, player.pos.z - e.z);
        if (d < EYE_HIT_RADIUS) {
          this.state = 'burrow';
          this.t = 0;
          this.presses = 0;
          this.lastPress = 0;
          this.jolt = 1;
          player.locked = true;
          if (player.grip) player.release('in the eye');
          this.log('eye_reached', { at: player.p3() });
          this.notice([], 0);
          this.spray(25);
          this.onShake && this.onShake(1.5);
        }
      }
      return;
    }

    if (this.state === 'burrow') {
      // he thrashes; every press digs deeper. Stop pressing and he shakes you off.
      this.jolt = Math.max(0, this.jolt - dt * 3);
      const fury = 0.35 + this.presses / BURROW_PRESSES;
      m.neck.rotation.x = HEAD_TILT - 0.25 * fury + Math.sin(t * 31) * 0.08 * fury + (Math.random() - 0.5) * 0.12 * this.jolt;
      m.neck.rotation.z = Math.sin(t * 23) * 0.15 * fury + (Math.random() - 0.5) * 0.2 * this.jolt;
      m.arms.forEach((a, i) => {
        a.pivot.rotation.x = ARM_DOWN - this.leanIn * LEAN_IN - 0.6 * fury - Math.abs(Math.sin(t * (9 + i * 2))) * 0.9 * fury;
        a.pivot.rotation.z = (i ? 1 : -1) * (0.2 + Math.sin(t * 7 + i) * 0.25) * fury;
      });
      m.root.updateMatrixWorld(true);
      this.syncColliders();
      // the animal rides in the eye
      const e = this.eyeWorld();
      player.pos = { x: e.x, y: e.y, z: e.z };
      player.vel = { x: 0, y: 0, z: 0 };
      if (Math.random() < dt * 8) this.spray(2);
      if (t - this.lastPress > BURROW_GRACE) {
        // shaken off: flung out over the table
        this.log('giant_shook_off', { presses: this.presses });
        this.state = 'present';
        this.t = 3.3;
        this.eyeCooldown = 1.5;
        this.releasePlayer(1.6);
        this.onShake && this.onShake(1);
      }
      return;
    }

    if (this.state === 'reeling') {
      const k = seg(t, 0, 0.45);
      m.neck.rotation.x = HEAD_TILT - k * 0.9;
      m.neck.rotation.z = Math.sin(t * 40) * 0.2 * (1 - k);
      m.arms.forEach((a, i) => { a.pivot.rotation.x = ARM_DOWN + k * 1.4; a.pivot.rotation.z = (i ? 1 : -1) * k * 0.6; });
      if (Math.random() < dt * 20) this.spray(3);
      m.root.updateMatrixWorld(true);
      this.syncColliders();
      if (t >= 0.45) {
        this.state = 'falling';
        this.t = 0;
        this.parkAll();
      }
      return;
    }

    if (this.state === 'falling') {
      const k = easeIn(seg(t, 0, 1.5));
      m.lean.rotation.x = LEAN - k * 1.7;
      m.root.position.y = -k * 1.2;
      m.root.position.z = STAND_Z - k * 1.5;
      if (t >= 1.5) {
        this.state = 'gone';
        m.root.visible = false;
        this.log('stage_complete', { stage: 'giant_gone' });
        this.onSlain && this.onSlain();
      }
    }
  }

  // keep his fists resting on the tabletop whatever his lean (a few secant steps on the arm angle)
  plantFists() {
    const target = TABLE_TOP_Y + 0.2, p = new THREE.Vector3();
    for (const a of this.model.arms) {
      const yAt = (ang) => { a.pivot.rotation.x = ang; this.model.root.updateMatrixWorld(true); a.fist.getWorldPosition(p); return p.y - target; };
      let x0 = a.pivot.rotation.x, x1 = x0 + 0.05, f0 = yAt(x0), f1 = yAt(x1);
      for (let k = 0; k < 4 && Math.abs(f1) > 0.002; k++) {
        const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0 || 1e-6);
        x0 = x1; f0 = f1; x1 = Math.max(-3, Math.min(-0.8, x2)); f1 = yAt(x1);
      }
    }
  }

  syncColliders() {
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
    this.model.headMark.getWorldPosition(w);
    this.head.parked = false;
    placeBody(this.head, w);
    this.model.jawMark.getWorldPosition(w);
    this.jaw.parked = false;
    placeBody(this.jaw, w);
  }
}
