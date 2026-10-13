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
import { buildMist } from './mist.js';
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

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 900);

    const hemi = new THREE.HemisphereLight(0xe9efe6, 0x4a5240, 1.15);
    scene.add(hemi);
    const key = (this.key = new THREE.DirectionalLight(0xf3f1e6, 2.1));
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    scene.add(key.target);
    scene.add(new THREE.AmbientLight(0xdfe5dc, 0.25));

    this.mats = materials();
    this.backdrop = buildBackdrop(scene);
    this.backdrop.tryMarble();
    this.mist = buildMist(scene);

    this.world = createWorld();
    this.level = buildWorld(this.world, scene, this.mats);

    this.logger = new Logger({ playerName: opts.playerName, runNumber: opts.runNumber });
    const log = (type, data, sample) => this.logger.event(type, data, sample);
    this.mouse = buildMouse(this.mats);
    scene.add(this.mouse.root);
    this.player = new Player(this.world, this.mouse, log);
    this.giant = new Giant(this.world, scene, this.mats, log, (lines, secs) => this.notice(lines, secs));

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
    };
    this.onKeyUp = (e) => this.input.keys.delete(e.code);
    this.onBlur = () => this.input.keys.clear();
    this.onDown = (e) => { this.drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture?.(e.pointerId); };
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
    this.opts.onGameOver?.({ runMs: Math.round(this.runTime * 1000), cause });
  }

  hud() { this.opts.onHud?.({ lives: this.lives, runMs: Math.round(this.runTime * 1000) }); }

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
    this.key.position.set(c.tx + 4, c.ty + 9, c.tz + 6);
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
    this.mist.update(this.t);
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
    this.mist.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (window.game === this) window.game = null;
  }
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
