// LOOK: desaturated grey-green, damp, low contrast. Procedural canvas textures, one strong colour
// in the whole world (the goblet's glow). Textures double as bump maps for surface relief.
import * as THREE from 'three';
import { GLOW } from './constants.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function bumpFrom(tex) {
  const b = tex.clone();
  b.colorSpace = THREE.NoColorSpace;
  b.needsUpdate = true;
  return b;
}

const tex = {};
function textures() {
  if (tex.bark) return tex;
  tex.bark = canvasTex(512, (g, n) => {
    const r = rng(7);
    g.fillStyle = '#3d4236'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) {
      const x = r() * n, w = 1 + r() * 5;
      const shade = 40 + r() * 50;
      g.strokeStyle = `rgba(${shade},${shade + 8},${shade - 4},${0.25 + r() * 0.5})`;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, -10);
      g.bezierCurveTo(x + (r() - 0.5) * 40, n * 0.33, x + (r() - 0.5) * 40, n * 0.66, x + (r() - 0.5) * 24, n + 10);
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(20,24,18,${r() * 0.35})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 3, 2 + r() * 8);
    }
  }, 2);
  tex.ground = canvasTex(512, (g, n) => {
    const r = rng(11);
    g.fillStyle = '#4a5143'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 6000; i++) {
      const c = 50 + r() * 60;
      g.fillStyle = `rgba(${c - 6},${c + 6},${c - 10},${0.15 + r() * 0.5})`;
      const s = 1 + r() * 4;
      g.fillRect(r() * n, r() * n, s, s);
    }
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(30,34,26,${0.1 + r() * 0.25})`;
      g.beginPath(); g.arc(r() * n, r() * n, 4 + r() * 22, 0, Math.PI * 2); g.fill();
    }
  }, 40);
  tex.slab = canvasTex(512, (g, n) => {
    const r = rng(23);
    g.fillStyle = '#2d2f27'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 3000; i++) {
      const c = 30 + r() * 30;
      g.fillStyle = `rgba(${c},${c + 3},${c - 4},${r() * 0.5})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3);
    }
    // a lace of fine roots and cracks across the cut
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${12 + r() * 20},${14 + r() * 20},${10 + r() * 14},${0.5 + r() * 0.4})`;
      g.lineWidth = 0.6 + r() * 2.2;
      let x = r() * n, y = r() * n;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); }
      g.stroke();
    }
    // growth rings
    for (let k = 1; k < 30; k++) {
      g.strokeStyle = `rgba(70,74,60,${0.05 + r() * 0.08})`;
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(n / 2, n / 2, k * 9 + r() * 4, k * 6 + r() * 3, 0, 0, Math.PI * 2); g.stroke();
    }
  }, 1);
  tex.wood = canvasTex(256, (g, n) => {
    const r = rng(31);
    g.fillStyle = '#5a5546'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = `rgba(40,38,30,${r() * 0.4})`;
      g.lineWidth = 1 + r() * 2;
      const y = r() * n;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(n / 3, y + (r() - 0.5) * 10, n * 0.66, y + (r() - 0.5) * 10, n, y); g.stroke();
    }
  }, 1);
  tex.hide = canvasTex(512, (g, n) => {
    const r = rng(41);
    g.fillStyle = '#b6b8a6'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 4000; i++) {
      const c = 150 + r() * 60;
      g.fillStyle = `rgba(${c},${c + 2},${c - 12},${r() * 0.25})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 4, 1 + r() * 4);
    }
    for (let i = 0; i < 220; i++) {
      g.strokeStyle = `rgba(80,82,70,${0.08 + r() * 0.18})`;
      g.lineWidth = 0.5 + r() * 1.5;
      const x = r() * n, y = r() * n;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20, x + (r() - 0.5) * 80, y + (r() - 0.5) * 30); g.stroke();
    }
  }, 2);
  tex.stone = canvasTex(256, (g, n) => {
    const r = rng(53);
    g.fillStyle = '#6b6f63'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2500; i++) {
      const c = 70 + r() * 70;
      g.fillStyle = `rgba(${c},${c + 4},${c - 4},${r() * 0.4})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3);
    }
  }, 1);
  return tex;
}

const cache = {};
function std(key, opts) {
  if (!cache[key]) cache[key] = new THREE.MeshStandardMaterial(opts);
  return cache[key];
}

export function materials() {
  const t = textures();
  return {
    ground: std('ground', { map: t.ground, bumpMap: bumpFrom(t.ground), bumpScale: 1.5, color: 0x8a9480, roughness: 1 }),
    slab: std('slab', { map: t.slab, bumpMap: bumpFrom(t.slab), bumpScale: 2, color: 0x8a8a80, roughness: 0.95 }),
    slabEdge: std('slabEdge', { map: t.bark, color: 0x6f7462, roughness: 0.95 }),
    barkDeep: std('barkDeep', { map: t.bark, bumpMap: bumpFrom(t.bark), bumpScale: 3, color: 0x5f6656, roughness: 1 }),
    root: std('root', { map: t.bark, bumpMap: bumpFrom(t.bark), bumpScale: 2.5, color: 0x6c7461, roughness: 0.96 }),
    rootDark: std('rootDark', { map: t.bark, bumpMap: bumpFrom(t.bark), bumpScale: 2.5, color: 0x454c3e, roughness: 1 }),
    vine: std('vine', { map: t.bark, color: 0x56614a, roughness: 0.9 }),
    wet: std('wet', { map: t.bark, color: 0x4a5246, roughness: 0.25, metalness: 0.05 }),
    stone: std('stone', { map: t.stone, bumpMap: bumpFrom(t.stone), bumpScale: 2, color: 0x8b8f84, roughness: 0.92 }),
    wood: std('wood', { map: t.wood, color: 0x9a957f, roughness: 0.9 }),
    hide: std('hide', { map: t.hide, bumpMap: bumpFrom(t.hide), bumpScale: 2.5, color: 0xc8c9b8, roughness: 0.85 }),
    hideDark: std('hideDark', { map: t.hide, color: 0x7d806f, roughness: 0.9 }),
    socket: std('socket', { color: 0x1a1c16, roughness: 1 }),
    liquid: std('liquid', { color: 0x0d120a, roughness: 0.15, metalness: 0.2 }),
    glow: std('glow', { color: GLOW, emissive: GLOW, emissiveIntensity: 2.2, roughness: 0.4 }),
    eye: std('eye', { color: GLOW, emissive: GLOW, emissiveIntensity: 3, roughness: 0.3 }),
    net: std('net', { color: 0x1d1f19, roughness: 1 }),
    goblet: std('goblet', { color: 0x5a3f3a, roughness: 0.55, metalness: 0.15 }),
    cheese: std('cheese', { color: 0xd8b860, roughness: 0.75 }),
    loaf: std('loaf', { color: 0x8a5a3a, roughness: 0.9 }),
    fur: std('fur', { color: 0x8b6a52, roughness: 1 }),
    furLight: std('furLight', { color: 0xc49a82, roughness: 1 }),
  };
}
