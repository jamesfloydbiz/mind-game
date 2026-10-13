// THE ENGINE LOOP — renderer, scene, camera, input, the fixed-step simulation, lives and load-in.
import * as THREE from 'three';
import { createWorld, stepWorld, wake } from './physics.js';
import { materials } from './materials.js';
import { buildWorld } from './world.js';
import { buildMouse } from './models.js';
import { Player } from './player.js';
import { Giant } from './giant.js';
import { Logger } from './logger.js';
import { loadInState } from './loadin.js';
import { buildBackdrop } from './backdrop.js';
import { installHeightFog } from './fog.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FOG_COLOR, FOG_DENSITY, LIVES_PER_RUN, SUBSTEP } from './constants.js';

const KEYS = {
  fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], grab: ['KeyE'], sprint: ['ShiftLeft', 'ShiftRight'],
};

export class Engine {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts; // { playerName, runNumber, onHud, onNotice, onGameOver }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.dprCap = Math.min(1.75, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dprCap);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    installHeightFog();
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 900);

    const hemi = new THREE.HemisphereLight(0xe9efe6, 0x4a5240, 1.15);
    scene.add(hemi);
    const key = (this.key = new THREE.DirectionalLight(0xf3f1e6, 2.1));
    key.position.set(6, 14, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    scene.add(key.target);
    scene.add(new THREE.AmbientLight(0xdfe5dc, 0.25));

    this.mats = materials();
    this.backdrop = buildBackdrop(scene);
    this.backdrop.tryMarble();

    this.world = createWorld();
    this.level = buildWorld(this.world, scene, this.mats);

    this.logger = new Logger({ playerName: opts.playerName, runNumber: opts.runNumber });
    // every event also feeds the run's measurements shown at the end
    this.stats = newStats();
    const log = (type, data, sample) => { if (!sample) this.observe(type, data || {}); this.logger.event(type, data, sample); };
    this.mouse = buildMouse(this.mats);
    scene.add(this.mouse.root);
    this.player = new Player(this.world, this.mouse, log);
    this.giant = new Giant(this.world, scene, this.mats, log, (lines, secs) => this.notice(lines, secs));
    this.shake = 0;
    this.giant.onShake = (k) => { this.shake = Math.max(this.shake, k); };
    this.giant.onPoisonPlayer = (cup) => this.player.startPoison(cup, 'splashed');
    this.giant.onSlain = (method) => this.onWin(method);

    this.lives = LIVES_PER_RUN;
    this.runTime = 0;
    this.t = 0;
    this.loadT = 0;
    this.over = false;
    this.cam = { yaw: Math.atan2(this.player.pos.x, this.player.pos.z) + 0.9, lift: 0.32, dist: 3.4, tx: 0, ty: 0, tz: 0, lookIdle: 99 };
    this.input = { keys: new Set(), grabPrev: false, jumpPrev: false };
    this.hooks = {
      onTable: () => this.giant.start(),
      onPoison: () => this.notice([], 0),
      onDeath: (cause) => this.onDeath(cause),
      onPushCup: (cup, dir) => this.giant.tipCup(cup, dir, 'pushed'),
      onLandCup: (cup, dir) => this.giant.tipCup(cup, dir, 'landed on'),
    };

    // post: a soft bloom on the one strong colour (the glow), then tone mapping + sRGB
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.bindInput();
    this.resize();
    this.logger.startLife();
    this.raf = requestAnimationFrame((t) => { this.last = t; this.frame(t); });
    window.game = this; // test hook
  }

  notice(lines, seconds) { this.opts.onNotice?.(lines, seconds); }

  bindInput() {
    const c = this.canvas;
    this.onKeyDown = (e) => {
      if (Object.values(KEYS).flat().includes(e.code)) e.preventDefault();
      this.input.keys.add(e.code);
      if (!e.repeat) this.giant.press(); // mashing while in the giant's eye (ignored otherwise)
    };
    this.onKeyUp = (e) => this.input.keys.delete(e.code);
    this.onBlur = () => this.input.keys.clear();
    this.onDown = (e) => { this.drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture?.(e.pointerId); this.giant.press(); };
    this.onMove = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag = { x: e.clientX, y: e.clientY };
      this.cam.yaw -= dx * 0.006;
      this.cam.lift = Math.max(0.03, Math.min(0.95, this.cam.lift + dy * 0.004));
      this.cam.lookIdle = 0;
    };
    this.onUp = () => { this.drag = null; };
    this.onResize = () => this.resize();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('resize', this.onResize);
  }

  readInput() {
    const k = this.input.keys;
    const has = (n) => KEYS[n].some((c) => k.has(c));
    let fwd = (has('fwd') ? 1 : 0) - (has('back') ? 1 : 0);
    let right = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
    let jumpHeld = has('jump'), grabHeld = has('grab'), sprint = has('sprint');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0.2) right = ax;
      if (Math.abs(ay) > 0.2) fwd = -ay;
      if (p.buttons[12]?.pressed) fwd = 1;
      if (p.buttons[13]?.pressed) fwd = -1;
      if (p.buttons[14]?.pressed) right = -1;
      if (p.buttons[15]?.pressed) right = 1;
      const anyBtn = p.buttons.some((b) => b?.pressed);
      if (anyBtn && !this.padPrev) this.giant.press();
      this.padPrev = anyBtn;
      jumpHeld ||= !!p.buttons[0]?.pressed;
      grabHeld ||= !!(p.buttons[7]?.pressed || p.buttons[6]?.pressed);
      sprint ||= !!p.buttons[10]?.pressed;
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (Math.abs(rx) > 0.2) { this.cam.yaw -= rx * 0.04; this.cam.lookIdle = 0; }
      if (Math.abs(ry) > 0.2) this.cam.lift = Math.max(0.03, Math.min(0.95, this.cam.lift + ry * 0.02));
    }
    const jump = jumpHeld && !this.input.jumpPrev;
    const grabPressed = grabHeld && !this.input.grabPrev;
    this.input.jumpPrev = jumpHeld;
    this.input.grabPrev = grabHeld;
    return { fwd, right, jump, grabHeld, grabPressed, sprint, camYaw: this.cam.yaw };
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onDeath(cause) {
    this.logger.endLife('life_end');
    this.lives -= 1;
    this.hud();
    if (this.lives > 0) {
      this.player.reset();
      this.logger.startLife();
      return;
    }
    this.over = true;
    try { localStorage.setItem('mg_last_run_ms', String(Math.round(this.runTime * 1000))); } catch {}
    this.opts.onGameOver?.({ runMs: Math.round(this.runTime * 1000), cause, stats: this.summary(false) });
  }

  hud() { this.opts.onHud?.({ lives: this.lives, runMs: Math.round(this.runTime * 1000) }); }

  onWin(method) {
    if (this.over) return;
    this.over = true;
    this.logger.endLife('giant_slain');
    try { localStorage.setItem('mg_last_run_ms', String(Math.round(this.runTime * 1000))); } catch {}
    this.opts.onWin?.({ runMs: Math.round(this.runTime * 1000), method, stats: this.summary(true) });
  }

  // what the run's events say, for the results screen
  observe(type, d) {
    const S = this.stats, now = this.runTime;
    if (type === 'table_reached' && S.tableAt == null) S.tableAt = now;
    if (type === 'choice_prompt' && S.promptAt == null) S.promptAt = now;
    if (type === 'death') S.deaths.push(d.cause);
    if (type === 'fall') S.falls++;
    if (type === 'grab_attempt') { S.grabs++; if (!d.succeeded) S.refused++; }
    if (type === 'break') S.snapped++;
    if (type === 'poison' && d.how === 'drank') S.drank.push(d.cup);
    if (type === 'route_attempt' && /^root \d+/.test(d.route)) {
      const kind = this.level.roots.find((r) => r.route === d.route)?.kind;
      if (kind) S.rootsTried[kind].add(d.route);
    }
    if (type === 'giant_throw') S.thrown++;
    if (type === 'eye_reached') S.eyeTries++;
    if (type === 'cup_tipped') S.cupsTipped++;
    if (type === 'giant_crush') S.crushes++;
    if (type === 'giant_impatient' && S.impatientAt == null) S.impatientAt = now;
    // breaking the paradigm: the first thing done to him or his table other than choosing a cup
    const offMenu = type === 'eye_reached' || type === 'cup_tipped' || type === 'giant_throw' || (type === 'grab' && /giant/.test(d.target || ''));
    if (offMenu && S.promptAt != null && S.breakAt == null) { S.breakAt = now; S.breakHow = { grab: `took hold of him (${d.target})`, eye_reached: 'went for his eye', cup_tipped: `knocked over the ${d.cup}`, giant_throw: 'tried to get round him' }[type]; }
    if (type === 'stage_complete' && d.giant_slain && S.killedAt == null) { S.killedAt = now; S.method = d.method; }
  }

  summary(won) {
    const S = this.stats;
    return {
      won,
      runMs: Math.round(this.runTime * 1000),
      tableMs: S.tableAt == null ? null : Math.round(S.tableAt * 1000),
      promptMs: S.promptAt == null ? null : Math.round(S.promptAt * 1000),
      breakMs: S.breakAt == null ? null : Math.round(S.breakAt * 1000),
      breakHow: S.breakHow,
      killedMs: S.killedAt == null ? null : Math.round(S.killedAt * 1000),
      method: S.method,
      livesUsed: LIVES_PER_RUN - this.lives + (won ? 1 : 0),
      deaths: S.deaths,
      falls: S.falls, grabs: S.grabs, refused: S.refused, snapped: S.snapped,
      drank: S.drank, thrown: S.thrown, eyeTries: S.eyeTries, cupsTipped: S.cupsTipped, crushes: S.crushes,
      rootsTried: { sound: S.rootsTried.sound.size, rotten: S.rootsTried.rotten.size, wet: S.rootsTried.wet.size },
    };
  }

  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.advance(dt);
    this.render(dt);
  }

  // Simulation only (tests call this directly, since a hidden preview throttles rAF).
  advance(dt) {
    this.t += dt;
    const li = loadInState(this.loadT);
    if (!li.done) this.loadT += dt;
    const input = this.readInput();
    if (!li.done || this.over) { input.fwd = input.right = 0; input.jump = input.grabPressed = false; }
    this.acc = (this.acc || 0) + dt * li.physicsScale;
    while (this.acc >= SUBSTEP) {
      this.acc -= SUBSTEP;
      stepWorld(this.world, SUBSTEP);
      if (!this.over) this.player.step(SUBSTEP, input, this.hooks);
      input.jump = false; input.grabPressed = false;
      this.giant.update(SUBSTEP, this.player);
    }
    if (li.done && !this.over && this.player.alive) this.runTime += dt;
    this.hudT = (this.hudT || 0) + dt;
    if (this.hudT > 0.25) { this.hudT = 0; this.hud(); }
    this.updateCamera(dt, input, li);
    for (const b of this.level.synced) syncMesh(b);
  }

  updateCamera(dt, input, li) {
    const c = this.cam, p = this.player.pos;
    c.lookIdle += dt;
    // vertical follow softer than horizontal, so a jump reads as movement rather than a jolt
    const kH = 1 - Math.exp(-dt * 9), kV = 1 - Math.exp(-dt * 3.5);
    c.tx += (p.x - c.tx) * kH; c.tz += (p.z - c.tz) * kH; c.ty += (p.y - c.ty) * kV;
    if (!li.done) {
      c.dist = li.camDist;
      const behind = Math.atan2(-this.player.facing.x, -this.player.facing.z);
      c.yaw += angleDiff(behind, c.yaw) * Math.min(1, dt * 1.6) * li.yawBlend;
    } else {
      c.dist += (0.9 - c.dist) * (1 - Math.exp(-dt * 2));
      const moving = input.fwd > 0.1 && !this.player.grip;
      if (moving && c.lookIdle > 0.8) {
        const behind = Math.atan2(-this.player.facing.x, -this.player.facing.z);
        c.yaw += angleDiff(behind, c.yaw) * Math.min(1, dt * 1.8);
      } else if (this.player.tableReached && input.fwd === 0 && input.right === 0 && c.lookIdle > 3) {
        c.yaw += dt * 0.05; // drift slowly while idle on the table
      }
    }
    const cl = Math.cos(c.lift), sl = Math.sin(c.lift);
    this.camera.position.set(c.tx + Math.sin(c.yaw) * cl * c.dist, c.ty + 0.06 + sl * c.dist, c.tz + Math.cos(c.yaw) * cl * c.dist);
    this.camera.lookAt(c.tx, c.ty + 0.04, c.tz);
    if (this.shake > 0.01) {
      const k = this.shake * 0.035;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.05;
      this.shake *= Math.exp(-dt * 4);
    }
    this.key.position.set(c.tx + 6, c.ty + 14, c.tz + 9);
    this.key.target.position.set(c.tx, c.ty, c.tz);
    this.backdrop.update(this.t, this.camera.position);
  }

  render() {
    const li = loadInState(this.loadT);
    const nativeH = this.H * this.dprCap;
    const h = li.done ? nativeH : li.height(nativeH);
    const ratio = h / this.H;
    if (Math.abs(ratio - this.renderer.getPixelRatio()) > 1e-3) {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(this.W, this.H, false);
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(this.W, this.H);
    }
    this.canvas.style.imageRendering = li.done ? 'auto' : 'pixelated';
    this.composer.render();
  }

  // For tests / tools: render a frame now.
  draw() { this.render(); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.logger.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.mats)) { m.map?.dispose(); m.bumpMap?.dispose(); }
    this.composer.dispose();
    this.renderer.dispose();
    if (window.game === this) window.game = null;
  }
}

function newStats() {
  return {
    tableAt: null, promptAt: null, breakAt: null, breakHow: null, killedAt: null, method: null,
    deaths: [], falls: 0, grabs: 0, refused: 0, snapped: 0, drank: [], thrown: 0, eyeTries: 0, cupsTipped: 0, crushes: 0, impatientAt: null,
    rootsTried: { sound: new Set(), rotten: new Set(), wet: new Set() },
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
function syncMesh(b) {
  const m = b.mesh;
  if (!m) return;
  if (b.shape === 'capsule') {
    m.position.set(b.pos.x, b.pos.y, b.pos.z);
    tmp.set(b.axis.x, b.axis.y, b.axis.z);
    m.quaternion.setFromUnitVectors(UP, tmp);
  } else {
    m.position.set(b.pos.x, b.pos.y, b.pos.z);
  }
}

export { wake };
