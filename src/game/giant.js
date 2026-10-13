// THE GIANT — his table is already set (two cups, cheese, a loaf). When the animal reaches the
// tabletop he walks in, slams his hands down hard enough to throw loose things, and asks his
// question. He is solid: fists, arms, head and jaw are colliders that follow his real body.
//
// Ways to beat him (none is marked; the world just allows them):
//  - reach his eye: you are in it — mash to finish him, or he shakes you off
//  - tip a cup onto him: push one over from its rim, or land on a rim hard from above (his hand,
//    his arm). If the poison splashes his hands or face, it does to him what it does to you.
// Trying to get past him — round behind the table, or along his arm to his shoulder — and he
// grabs you and throws you back to the start: "You must make the choice on the table."
import * as THREE from 'three';
import { addBox, addCapsule, addSphere, placeBody, impulseFrom } from './physics.js';
import { buildGiant, buildCup, buildCheese, buildLoaf, cupColliderSpec, CUP } from './models.js';
import { LEAN, HEAD_TILT, ARM_PULL, ARM_DOWN, SLAM_STRENGTH, EYE_HIT_RADIUS, TABLE_TOP_Y, GIANT_SCALE as GS, WORLD_SCALE as WS, CUP_S, SPAWN } from './constants.js';
import { SLAB, onSlab } from './world.js';

const PARK = { x: 0, y: -40, z: 0 };
const PARK2 = { x: 0, y: -40.1, z: 0 };
const STAND_Z = -5.6; // feet; just behind the table, close enough to lean his face over it
const START_Z = -9.5 * GS;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export const BURROW_PRESSES = 18;
export const BURROW_GRACE = 2.2; // seconds without a press before he shakes you off
const LEAN_IN_MAX = 0.9; // most he will lean in over the table
const BEHIND = -(SLAB.az + 0.4); // past this z you are getting round him
const CUP_TIP_FALL = 0.5; // landing on a rim from this high knocks the cup over
const PATIENCE_WARN = 18; // seconds on his table without choosing before he says "Choose."
const PATIENCE_CRUSH = 28; // ...and before he brings his fist down on you

export class Giant {
  constructor(world, scene, mats, log, notice) {
    this.world = world;
    this.scene = scene;
    this.log = log;
    this.notice = notice;
    this.model = buildGiant(mats);
    this.model.root.scale.setScalar(GS);
    scene.add(this.model.root);

    // limb colliders — created parked far below the world
    this.limbs = this.model.arms.map((arm) => ({
      arm,
      fist: addBox(world, PARK, { x: 0.3 * GS, y: 0.2 * GS, z: 0.3 * GS }, { label: 'giant fist', kind: 'giant', grip: 'all' }),
      caps: [0.25, 0.26, 0.21].map((r, i) => addCapsule(world, PARK, PARK2, r * GS, { label: ['giant upper arm', 'giant forearm', 'giant hand'][i], kind: 'giant', grip: 'all' })),
    }));
    this.head = addSphere(world, PARK, 0.55 * GS, { label: 'giant head', kind: 'giant', grip: 'all' });
    this.jaw = addSphere(world, PARK, 0.4 * GS, { label: 'giant jaw', kind: 'giant', grip: 'all' });
    // his body once he has fallen: lies on the ground and can be walked on
    this.corpse = [addCapsule(world, PARK, PARK2, 0.62 * GS, { label: 'giant body', kind: 'giant', grip: 'all' })];
    this.parkAll();

    // his table, already set
    this.items = [
      { name: 'left cup', kind: 'cup', x: -0.42 * WS, z: -0.4 * WS },
      { name: 'right cup', kind: 'cup', x: 0.42 * WS, z: -0.4 * WS },
      { name: 'cheese', kind: 'cheese', x: -1.75 * WS, z: -0.2 * WS },
      { name: 'loaf', kind: 'loaf', x: 1.75 * WS, z: -0.3 * WS },
    ];
    for (const it of this.items) {
      it.mesh = it.kind === 'cup' ? buildCup(mats) : it.kind === 'cheese' ? buildCheese(mats) : buildLoaf(mats);
      it.mesh.position.set(it.x, TABLE_TOP_Y, it.z);
      if (it.kind !== 'cup') it.mesh.scale.setScalar(WS);
      scene.add(it.mesh);
      it.bodies = [];
      if (it.kind === 'cup') {
        const spec = cupColliderSpec(it.x, TABLE_TOP_Y, it.z);
        const meta = { cup: it.name };
        for (const s of spec.staves) it.bodies.push(addCapsule(world, s.a, s.b, s.r, { label: `${it.name} wall`, kind: 'cup', meta }));
        for (const s of spec.beads) it.bodies.push(addCapsule(world, s.a, s.b, s.r, { label: `${it.name} lip`, kind: 'cup', meta: { ...meta, lip: true } }));
        it.bodies.push(addCapsule(world, spec.column.a, spec.column.b, spec.column.r, { label: `${it.name} stem`, kind: 'cup', meta }));
        it.bodies.push(addBox(world, spec.floor.p, spec.floor.half, { label: `${it.name} drink`, kind: 'drink', grip: 'none', meta: { cupInterior: true, cup: it.name } }));
        for (const b of it.bodies) b.home = b.shape === 'capsule' ? { a: { ...b.a }, b: { ...b.b } } : { p: { ...b.pos } };
        // the cup lying on its side, once knocked over
        it.fallen = addCapsule(world, PARK, PARK2, CUP.rTop * CUP_S * 0.8, { label: `${it.name} (knocked over)`, kind: 'cup', meta });
        it.fallen.parked = true;
        // a puddle of poison where it spills
        it.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mats.glow);
        it.puddle.rotation.x = -Math.PI / 2;
        it.puddle.visible = false;
        scene.add(it.puddle);
      } else if (it.kind === 'cheese') {
        addBox(world, { x: it.x, y: TABLE_TOP_Y + 0.15 * WS, z: it.z }, { x: 0.21 * WS, y: 0.15 * WS, z: 0.18 * WS }, { label: 'cheese', kind: 'food' });
      } else {
        addBox(world, { x: it.x, y: TABLE_TOP_Y + 0.16 * WS, z: it.z }, { x: 0.36 * WS, y: 0.16 * WS, z: 0.23 * WS }, { label: 'loaf', kind: 'food' });
      }
    }

    // droplets: ichor from the eye, poison from a spilled cup
    this.drops = [];
    const dropGeo = new THREE.IcosahedronGeometry(0.022, 0);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b2412, roughness: 0.4 });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x66ff00, emissive: 0x66ff00, emissiveIntensity: 1.4 });
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(dropGeo, i % 3 ? dark : this.glowMat);
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
      l.caps.forEach((c) => { c.parked = true; placeBody(c, null, PARK, PARK2); });
    }
    for (const b of [this.head, this.jaw]) { b.parked = true; placeBody(b, PARK); }
    for (const b of this.corpse || []) { b.parked = true; placeBody(b, null, PARK, PARK2); }
  }

  reset() {
    this.state = 'away'; // away | arriving | present | burrow | poisoned | reeling | falling | gone
    this.t = 0;
    this.slammed = false;
    this.leanIn = 0;
    this.extra = 0;
    this.eyeCooldown = 0;
    this.throwing = null;
    this.killedBy = null;
    this.patience = 0;
    this.warned = false;
    this.crush = null;
    const m = this.model;
    m.root.visible = false;
    m.root.position.set(0, 0, START_Z);
    m.root.rotation.set(0, 0, 0);
    m.lean.rotation.set(0, 0, 0);
    m.neck.rotation.set(0, 0, 0);
    m.arms.forEach((a) => a.pivot.rotation.set(0, 0, 0));
    this.parkAll();
    // put the table back as it was
    for (const it of this.items || []) {
      if (it.kind !== 'cup' || !it.tipped) continue;
      this.scene.add(it.mesh);
      it.mesh.position.set(it.x, TABLE_TOP_Y, it.z);
      it.mesh.quaternion.identity();
      if (it.pivot) { this.scene.remove(it.pivot); it.pivot = null; }
      for (const b of it.bodies) { b.parked = false; if (b.home.p) placeBody(b, b.home.p); else placeBody(b, null, b.home.a, b.home.b); }
      it.fallen.parked = true;
      placeBody(it.fallen, null, PARK, PARK2);
      it.puddle.visible = false;
      it.tipped = null;
    }
    this.poisonPart = null;
    this.model.eyeLight.intensity = 0.12;
  }

  start() {
    if (this.state !== 'away') return;
    this.state = 'arriving';
    this.t = 0;
    this.model.root.visible = true;
  }

  get here() { return (this.state === 'arriving' && this.t > 2.4) || this.state === 'present'; }

  eyeWorld() {
    const p = new THREE.Vector3();
    this.model.eye.getWorldPosition(p);
    return p;
  }

  // ---- the eye ----------------------------------------------------------------------------
  press() {
    if (this.state !== 'burrow') return;
    this.presses += 1;
    this.lastPress = this.t;
    this.jolt = 1;
    this.spray(this.eyeWorld(), 10, { x: 0, y: 1, z: 1 });
    this.log('eye_press', { n: this.presses });
    this.onShake && this.onShake(0.6 + this.presses / BURROW_PRESSES);
    if (this.presses >= BURROW_PRESSES) {
      this.killedBy = 'eye';
      this.log('stage_complete', { stage: 'giant', giant_slain: true, method: 'eye', presses: this.presses, seconds: +(this.t).toFixed(2) });
      this.spray(this.eyeWorld(), 40, { x: 0, y: 1, z: 1 });
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

  // ---- the cups -----------------------------------------------------------------------------
  cupByName(name) { return this.items.find((i) => i.name === name); }

  // push a cup over in direction dir (from its rim) — or knock it by landing on it
  tipCup(name, dir, cause) {
    const it = this.cupByName(name);
    if (!it || it.tipped) return false;
    const l = Math.hypot(dir.x, dir.z) || 1;
    const d = { x: dir.x / l, z: dir.z / l };
    it.tipped = { t: 0, d, done: false, cause };
    this.log('cup_tipped', { cup: name, cause, dir: { x: +d.x.toFixed(2), z: +d.z.toFixed(2) } });
    // the upright cup's colliders leave; whoever stood on it falls with it
    for (const b of it.bodies) { b.parked = true; placeBody(b, b.shape === 'capsule' ? null : PARK, PARK, PARK2); }
    // pivot round the edge of its foot
    const footR = 0.09 * CUP_S;
    const pivot = new THREE.Group();
    pivot.position.set(it.x + d.x * footR, TABLE_TOP_Y, it.z + d.z * footR);
    this.scene.add(pivot);
    pivot.add(it.mesh);
    it.mesh.position.set(-d.x * footR, 0, -d.z * footR);
    it.pivot = pivot;
    it.axis = new THREE.Vector3(d.z, 0, -d.x); // rotating about this tips the top toward d
    return true;
  }

  updateCups(dt, player) {
    for (const it of this.items) {
      if (it.kind !== 'cup' || !it.tipped || it.tipped.done) continue;
      const tp = it.tipped;
      tp.t += dt;
      const k = easeIn(seg(tp.t, 0, 0.5));
      it.pivot.quaternion.setFromAxisAngle(it.axis, k * (Math.PI / 2 - 0.12));
      // the drink pours out as it goes over
      const h = (CUP.bowlBottom + CUP.bowlH) * CUP_S;
      const rim = { x: it.pivot.position.x + tp.d.x * Math.sin(k * 1.45) * h, y: TABLE_TOP_Y + Math.cos(k * 1.45) * h, z: it.pivot.position.z + tp.d.z * Math.sin(k * 1.45) * h };
      if (k > 0.35 && Math.random() < dt * 60) this.spray(rim, 4, { x: tp.d.x, y: 0.2, z: tp.d.z }, true);
      if (tp.t >= 0.5) {
        tp.done = true;
        this.onShake && this.onShake(0.8);
        const reach = h + 0.25;
        const land = { x: it.pivot.position.x + tp.d.x * reach, z: it.pivot.position.z + tp.d.z * reach };
        // the fallen cup is something to climb over
        const base = { x: it.pivot.position.x, y: TABLE_TOP_Y + CUP.rTop * CUP_S * 0.8, z: it.pivot.position.z };
        it.fallen.parked = false;
        placeBody(it.fallen, null, base, { x: land.x - tp.d.x * 0.3, y: base.y, z: land.z - tp.d.z * 0.3 });
        // the poison spreads where it lands
        const pr = 0.9;
        it.puddle.position.set(land.x, TABLE_TOP_Y + 0.006, land.z);
        it.puddle.scale.setScalar(pr);
        it.puddle.visible = onSlab(land.x, land.z);
        this.spray({ x: land.x, y: TABLE_TOP_Y + 0.2, z: land.z }, 30, { x: tp.d.x, y: 0.6, z: tp.d.z }, true);
        // does it reach him? his hands, his jaw, his face
        if (this.here) {
          // where it lands decides what it does to him: in his mouth he drinks it; in his eyes it
          // blinds him; on his hands it works in through the skin
          const near = (p, r) => Math.hypot(p.x - land.x, p.z - land.z) < r && p.y < TABLE_TOP_Y + 1.6 * GS;
          const mouth = new THREE.Vector3();
          this.model.mouthMark.getWorldPosition(mouth);
          const eye = this.eyeWorld();
          const hands = this.limbs.flatMap((l, i) => [l.fist.pos, l.caps[2].pos].map((p) => ({ p, side: i })));
          // a spill that reaches his face: poured (pushed) it runs into his mouth and he drinks it;
          // knocked over by something landing on it, it splashes up into his eyes
          const face = near(mouth, pr + 0.7) || near(eye, pr + 0.7);
          let part = null, side = 0;
          if (face) part = tp.cause === 'pushed' ? 'mouth' : 'eyes';
          else { const l = hands.find((q) => near(q.p, pr + 0.45)); if (l) { part = 'hands'; side = l.side; } }
          if (part) this.poison(it.name, part, side);
          else this.log('cup_spilled', { cup: it.name, reached_giant: false });
        } else this.log('cup_spilled', { cup: it.name, reached_giant: false });
        // if the animal is in the spill, the poison does what it does
        if (player && player.alive && player.pos.y < TABLE_TOP_Y + 0.2 && Math.hypot(player.pos.x - land.x, player.pos.z - land.z) < pr) {
          this.onPoisonPlayer && this.onPoisonPlayer(it.name);
        }
      }
    }
  }

  poison(cup, part = 'hands', side = 0) {
    this.state = 'poisoned';
    this.t = 0;
    this.poisonPart = part;
    this.poisonSide = side;
    this.killedBy = `poison_${part}`;
    this.log('giant_poisoned', { cup, part });
    this.notice([], 0);
    if (this.player && this.player.locked && !this.throwing) this.releasePlayer(0.5);
  }

  // ---- getting round him ----------------------------------------------------------------------
  startThrow(player) {
    this.throwing = { t: 0, from: { ...player.pos } };
    player.locked = true;
    if (player.grip) player.release('grabbed by the giant');
    this.log('giant_throw', { from: player.p3() });
    this.onShake && this.onShake(1.2);
  }

  updateThrow(dt, player) {
    const th = this.throwing;
    th.t += dt;
    const k = ease(seg(th.t, 0, 1.6));
    const f = th.from, to = SPAWN;
    player.pos = { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k + Math.sin(Math.PI * k) * 6, z: f.z + (to.z - f.z) * k };
    player.vel = { x: 0, y: 0, z: 0 };
    if (th.t >= 1.6) {
      this.throwing = null;
      player.locked = false;
      player.pos = { x: to.x, y: to.y, z: to.z };
      player.airMaxY = to.y;
      player.onGround = true;
      player.wasGround = true;
      this.notice(['You must make the choice on the table'], 5);
      this.onThrown && this.onThrown();
    }
  }

  // ---- particles ----------------------------------------------------------------------------
  spray(at, n, dir, poison = false) {
    let k = 0;
    for (const d of this.drops) {
      if (d.life > 0) continue;
      if (poison && d.m.material !== this.glowMat && Math.random() < 0.7) continue;
      d.life = 0.8 + Math.random() * 0.8;
      d.m.visible = true;
      d.m.position.set(at.x, at.y, at.z);
      d.v.set(dir.x * (0.8 + Math.random() * 2) + (Math.random() - 0.5) * 1.6, dir.y * (0.6 + Math.random() * 2) + Math.random() * 0.8, dir.z * (0.8 + Math.random() * 2) + (Math.random() - 0.5) * 1.6);
      d.m.scale.setScalar(0.6 + Math.random() * 1.8);
      if (++k >= n) break;
    }
  }

  updateDrops(dt) {
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < TABLE_TOP_Y + 0.01 && onSlab(d.m.position.x, d.m.position.z)) {
        d.m.position.y = TABLE_TOP_Y + 0.01; d.v.set(0, 0, 0);
      }
      if (d.life <= 0) d.m.visible = false;
    }
  }

  // ---- the frame ----------------------------------------------------------------------------
  update(dt, player) {
    this.player = player;
    this.updateDrops(dt);
    this.updateCups(dt, player);
    if (this.throwing) this.updateThrow(dt, player);
    if (this.state === 'away' || this.state === 'gone') return;
    this.t += dt;
    this.eyeCooldown = Math.max(0, this.eyeCooldown - dt);
    const t = this.t, m = this.model;

    if (this.state === 'arriving' || this.state === 'present') {
      // walk in (0 -> 1.7s), leaning and tilting so his face comes down to the table
      const w = ease(seg(t, 0, 1.7));
      m.root.position.z = START_Z + (STAND_Z - START_Z) * w;
      m.root.position.y = t < 1.7 ? Math.abs(Math.sin(t * 7.4)) * 0.12 * GS * (1 - w * 0.5) : 0;
      // arms: swing while walking, raise (1.7 -> 2.1), slam (2.1 -> 2.4), then stay planted
      let armX;
      if (t < 1.7) armX = Math.sin(t * 7.4) * 0.25 * (1 - w);
      else if (t < 2.1) armX = ARM_PULL * ease(seg(t, 1.7, 2.1));
      else if (t < 2.4) armX = ARM_PULL + (ARM_DOWN - ARM_PULL) * easeIn(seg(t, 2.1, 2.4));
      else armX = ARM_DOWN;
      // once his hands are down he leans in over the table until his eye hangs just above it
      const near = t > 2.4 && player.pos.y > TABLE_TOP_Y - 0.1 ? 1 : 0;
      this.leanIn += (near - this.leanIn) * Math.min(1, dt * 0.9);
      if (t > 2.4) {
        // he lowers his face until his chin rests on the tabletop
        const jaw = new THREE.Vector3();
        this.model.jawMark.getWorldPosition(jaw);
        const want = TABLE_TOP_Y + 0.4 * GS - 0.08; // chin pressed on the table: no gap to run under
        this.extra = Math.max(0, Math.min(LEAN_IN_MAX, this.extra + (jaw.y - want) * dt * 0.6 * this.leanIn - (1 - this.leanIn) * this.extra * dt));
      }
      const extra = this.extra;
      m.arms.forEach((a, i) => { a.pivot.rotation.x = t < 1.7 ? armX * (i ? 1 : -1) : armX - (t >= 2.4 ? extra : 0); a.pivot.rotation.z = 0; });
      const breath = this.state === 'present' ? Math.sin(t * 1.3) * 0.015 : 0;
      m.lean.rotation.x = LEAN * w + breath + extra;
      // he lifts his face as he leans, so it looks at the table rather than down into it
      m.neck.rotation.x = HEAD_TILT * w - (LEAN * w + extra) * 0.6;
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
        this.notice(['Make a choice, one is poison, one is paradise'], 9);
        this.log('choice_prompt', {});
      }
      if (t >= 3.3 && this.state === 'arriving') {
        this.state = 'present';
        this.log('stage_complete', { stage: 'giant_arrives' });
      }
      if (this.state === 'present') {
        const toP = Math.atan2(player.pos.x - m.root.position.x, player.pos.z - m.root.position.z);
        m.neck.rotation.y += (Math.max(-0.35, Math.min(0.35, toP)) - m.neck.rotation.y) * Math.min(1, dt * 1.5);
        this.updatePatience(dt, player);
      }
      if (this.crush) this.updateCrush(dt, player);
      m.root.updateMatrixWorld(true);
      this.syncColliders();
      if (t > 2.4 && player.alive && !player.locked && !this.throwing) {
        // reaching his eye puts you in it
        const e = this.eyeWorld();
        const d = Math.hypot(player.pos.x - e.x, player.pos.y - e.y, player.pos.z - e.z);
        if (this.eyeCooldown <= 0 && d < EYE_HIT_RADIUS) {
          this.state = 'burrow';
          this.t = 0;
          this.presses = 0;
          this.lastPress = 0;
          this.jolt = 1;
          player.locked = true;
          if (player.grip) player.release('in the eye');
          this.log('eye_reached', { at: player.p3() });
          this.notice([], 0);
          this.spray(e, 25, { x: 0, y: 1, z: 1 });
          this.onShake && this.onShake(1.5);
        } else if (player.pos.z < BEHIND) {
          // getting round him: he won't have it
          const onHead = (b) => b && b.kind === 'giant' && /head|jaw/.test(b.label);
          if (!onHead(player.ground) && !(player.grip && onHead(player.grip.body))) this.startThrow(player);
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
        a.pivot.rotation.x = ARM_DOWN - this.extra - 0.6 * fury - Math.abs(Math.sin(t * (9 + i * 2))) * 0.9 * fury;
        a.pivot.rotation.z = (i ? 1 : -1) * (0.2 + Math.sin(t * 7 + i) * 0.25) * fury;
      });
      m.root.updateMatrixWorld(true);
      this.syncColliders();
      const e = this.eyeWorld();
      player.pos = { x: e.x, y: e.y, z: e.z };
      player.vel = { x: 0, y: 0, z: 0 };
      if (Math.random() < dt * 8) this.spray(e, 2, { x: 0, y: 1, z: 1 });
      if (t - this.lastPress > BURROW_GRACE) {
        this.log('giant_shook_off', { presses: this.presses });
        this.state = 'present';
        this.t = 3.3;
        this.eyeCooldown = 1.5;
        this.releasePlayer(1.6);
        this.onShake && this.onShake(1);
      }
      return;
    }

    if (this.state === 'poisoned') {
      // three ways the poison takes him, depending on where it landed
      const part = this.poisonPart;
      const dur = part === 'mouth' ? 2.0 : part === 'eyes' ? 2.8 : 3.4;
      const k = seg(t, 0, dur);
      const w = (1 - k) * (1 - k);
      if (part === 'mouth') {
        // he swallows it: head snaps back, hands go to his throat, he gags
        m.neck.rotation.x = HEAD_TILT - 0.7 * ease(seg(t, 0, 0.3)) + Math.sin(t * 34) * 0.1 * w;
        m.neck.rotation.z = Math.sin(t * 19) * 0.08 * w;
        m.arms.forEach((a, i) => { a.pivot.rotation.x = ARM_DOWN - this.extra - 1.1 * ease(seg(t, 0.1, 0.6)); a.pivot.rotation.z = (i ? -1 : 1) * 0.55 * ease(seg(t, 0.1, 0.6)) + Math.sin(t * 27 + i) * 0.08 * w; });
        m.lean.rotation.x = LEAN + this.extra - 0.15 * k + Math.sin(t * 23) * 0.03 * w;
        if (Math.random() < dt * 14) this.spray(this.model.jaw ? this.eyeWorld() : this.eyeWorld(), 2, { x: 0, y: 0.4, z: 1 }, true);
      } else if (part === 'eyes') {
        // blinded: head thrashes side to side, arms flail at his face, he staggers back
        m.neck.rotation.y = Math.sin(t * 9) * 0.5 * (0.4 + w);
        m.neck.rotation.x = HEAD_TILT - 0.3 + Math.sin(t * 13) * 0.15;
        m.arms.forEach((a, i) => { a.pivot.rotation.x = ARM_DOWN - this.extra - 0.8 - Math.abs(Math.sin(t * (7 + i * 2))) * 1.2 * (0.3 + w); a.pivot.rotation.z = (i ? 1 : -1) * (0.3 + Math.sin(t * 5 + i) * 0.4); });
        m.root.position.z = STAND_Z - k * 0.6 * GS;
        this.model.eyeLight.intensity = 0;
        if (Math.random() < dt * 12) this.spray(this.eyeWorld(), 3, { x: 0, y: 0.6, z: 1 }, true);
      } else {
        // through the skin: the poisoned arm goes dead and drops, he stares at it, then folds
        const s2 = this.poisonSide;
        m.arms.forEach((a, i) => {
          if (i === s2) { a.pivot.rotation.x = (ARM_DOWN - this.extra) * (1 - ease(seg(t, 0, 1.2))); a.pivot.rotation.z = (i ? 1 : -1) * 0.15 * ease(seg(t, 0, 1.2)); }
          else { a.pivot.rotation.x = ARM_DOWN - this.extra + Math.sin(t * 15) * 0.15 * w; a.pivot.rotation.z = 0; }
        });
        m.neck.rotation.y = (s2 ? 1 : -1) * 0.45 * ease(seg(t, 0.4, 1.2));
        m.neck.rotation.x = HEAD_TILT + 0.2 * ease(seg(t, 0.4, 1.2)) + Math.sin(t * 21) * 0.06 * seg(t, 1.8, dur);
        m.lean.rotation.x = LEAN + this.extra + Math.sin(t * 17) * 0.03 * seg(t, 1.8, dur);
        this.model.eyeLight.intensity = 0.12 * (Math.random() < 0.25 * k ? 0 : 1);
      }
      m.root.updateMatrixWorld(true);
      this.syncColliders();
      if (t >= dur) {
        this.log('stage_complete', { stage: 'giant', giant_slain: true, method: this.killedBy });
        this.state = 'falling';
        this.t = 0;
        this.parkAll();
      }
      return;
    }

    if (this.state === 'reeling') {
      const k = seg(t, 0, 0.45);
      m.neck.rotation.x = HEAD_TILT - k * 0.9;
      m.neck.rotation.z = Math.sin(t * 40) * 0.2 * (1 - k);
      m.arms.forEach((a, i) => { a.pivot.rotation.x = ARM_DOWN + k * 1.4; a.pivot.rotation.z = (i ? 1 : -1) * k * 0.6; });
      if (Math.random() < dt * 20) this.spray(this.eyeWorld(), 3, { x: 0, y: 1, z: 1 });
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
      // he topples back away from the table and lies on the ground, where he stays
      const k = easeIn(seg(t, 0, 1.6));
      m.lean.rotation.x = (LEAN + this.extra) * (1 - k) - k * (Math.PI / 2 - 0.08);
      m.neck.rotation.x = HEAD_TILT * (1 - k) + k * 0.3;
      m.arms.forEach((a, i) => { a.pivot.rotation.x = ARM_DOWN * (1 - k) - k * 2.6; a.pivot.rotation.z = (i ? 1 : -1) * k * 0.9; });
      m.root.position.z = STAND_Z - k * 0.9 * GS;
      m.root.position.y = 0.42 * GS * k;
      if (t >= 1.6) {
        this.state = 'gone';
        this.onShake && this.onShake(1.5);
        this.model.eyeLight.intensity = 0;
        this.layCorpse();
        this.log('stage_complete', { stage: 'giant_down', method: this.killedBy });
        this.onSlain && this.onSlain(this.killedBy);
      }
    }
  }

  // ---- refusing to choose ----------------------------------------------------------------------
  updatePatience(dt, player) {
    const onTable = player.alive && !player.locked && player.pos.y > TABLE_TOP_Y - 0.15 && onSlab(player.pos.x, player.pos.z);
    if (player.pos.y < TABLE_TOP_Y - 1) { this.patience = 0; this.warned = false; }
    if (!onTable || this.crush || this.throwing) return;
    this.patience += dt;
    if (this.patience > PATIENCE_WARN && !this.warned) {
      this.warned = true;
      this.notice(['Choose.'], 3);
      this.log('giant_impatient', {});
    }
    if (this.patience > PATIENCE_CRUSH) this.startCrush(player);
  }

  startCrush(player) {
    // the nearer hand comes up and down on the animal
    const side = player.pos.x < 0 ? 0 : 1;
    const a = this.model.arms[side];
    this.crush = { t: 0, side, from: { rx: a.pivot.rotation.x, rz: a.pivot.rotation.z }, raise: null, slam: null, struck: false };
    this.log('giant_crush', { at: player.p3() });
    this.notice([], 0);
  }

  // place a fist at a world point by turning the arm (a few Gauss-Newton steps on two angles)
  solveArm(a, target, start) {
    const p = new THREE.Vector3();
    const at = (rx, rz) => { a.pivot.rotation.x = rx; a.pivot.rotation.z = rz; this.model.root.updateMatrixWorld(true); a.fist.getWorldPosition(p); return [p.x - target.x, p.y - target.y, p.z - target.z]; };
    let rx = start.rx, rz = start.rz;
    for (let k = 0; k < 8; k++) {
      const f = at(rx, rz), e = 1e-3;
      const fx = at(rx + e, rz), fz = at(rx, rz + e);
      const J = [0, 1, 2].map((i) => [(fx[i] - f[i]) / e, (fz[i] - f[i]) / e]);
      // normal equations (2x2)
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < 3; i++) { a11 += J[i][0] ** 2; a12 += J[i][0] * J[i][1]; a22 += J[i][1] ** 2; b1 += J[i][0] * f[i]; b2 += J[i][1] * f[i]; }
      const det = a11 * a22 - a12 * a12 || 1e-9;
      rx -= Math.max(-0.4, Math.min(0.4, (a22 * b1 - a12 * b2) / det));
      rz -= Math.max(-0.4, Math.min(0.4, (a11 * b2 - a12 * b1) / det));
      rx = Math.max(-3.4, Math.min(0.2, rx)); rz = Math.max(-1.2, Math.min(1.2, rz));
    }
    return { rx, rz };
  }

  updateCrush(dt, player) {
    const c = this.crush;
    c.t += dt;
    const a = this.model.arms[c.side];
    const top = TABLE_TOP_Y + 0.2 * GS;
    if (!c.raise) c.raise = this.solveArm(a, { x: player.pos.x, y: top + 1.6 * GS, z: player.pos.z }, c.from);
    let pose;
    if (c.t < 0.8) {
      // up — the raised fist follows the animal, then fixes on where it is half a second before
      // it comes down (so moving away in time saves you)
      if (c.t < 0.55) { c.raise = this.solveArm(a, { x: player.pos.x, y: top + 1.6 * GS, z: player.pos.z }, c.raise); c.aim = { ...player.pos }; }
      const k = ease(seg(c.t, 0, 0.5));
      pose = { rx: c.from.rx + (c.raise.rx - c.from.rx) * k, rz: c.from.rz + (c.raise.rz - c.from.rz) * k };
    } else if (c.t < 1.05) {
      if (!c.slam) c.slam = this.solveArm(a, { x: c.aim.x, y: top, z: c.aim.z }, c.raise);
      const k = easeIn(seg(c.t, 0.8, 1.05));
      pose = { rx: c.raise.rx + (c.slam.rx - c.raise.rx) * k, rz: c.raise.rz + (c.slam.rz - c.raise.rz) * k };
    } else {
      pose = c.slam;
      if (!c.struck) {
        c.struck = true;
        const f = new THREE.Vector3();
        a.pivot.rotation.x = pose.rx; a.pivot.rotation.z = pose.rz;
        this.model.root.updateMatrixWorld(true);
        a.fist.getWorldPosition(f);
        impulseFrom(this.world, { x: f.x, y: f.y, z: f.z }, SLAM_STRENGTH * 0.7, player);
        this.onShake && this.onShake(1.4);
        const hit = player.alive && Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < 0.3 * GS + 0.08 && player.pos.y < f.y + 0.2 * GS + 0.1;
        this.log('giant_crush_result', { hit });
        if (hit) player.die('crushed');
      }
    }
    a.pivot.rotation.x = pose.rx;
    a.pivot.rotation.z = pose.rz;
    if (c.t > 1.8) { this.crush = null; this.patience = PATIENCE_WARN; }
  }

  // the body on the ground becomes something to walk on and climb
  layCorpse() {
    const m = this.model;
    m.root.updateMatrixWorld(true);
    const feet = new THREE.Vector3(), head = new THREE.Vector3();
    m.root.getWorldPosition(feet);
    m.headMark.getWorldPosition(head);
    const c = this.corpse[0];
    c.parked = false;
    placeBody(c, null, { x: feet.x, y: 0.55 * GS, z: feet.z - 0.9 * GS }, { x: head.x, y: 0.55 * GS, z: head.z + 0.3 * GS });
    this.head.parked = false;
    placeBody(this.head, head);
  }

  // keep his fists resting on the tabletop whatever his lean (a few secant steps on the arm angle)
  plantFists() {
    const target = TABLE_TOP_Y + 0.2 * GS, p = new THREE.Vector3();
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

export { CUP_TIP_FALL };
