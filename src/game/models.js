// Models built from primitives (docs/BRIEF.md → THE GIANT, THE CUPS). Dimensions follow the brief;
// the shapes are softened (rounded boxes, tapered strands, surface wobble) for the beauty pass.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { strandGeometry } from './world.js';
import { CUP_S } from './constants.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function lumpy(geo, amt, seed) {
  const r = rng(seed);
  const p = geo.attributes.position;
  const ph = [r() * 9, r() * 9, r() * 9];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + amt * (Math.sin(x * 5 + ph[0]) * Math.sin(y * 4 + ph[1]) + 0.5 * Math.sin(z * 7 + ph[2]));
    p.setXYZ(i, x * f, y * f, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

function capsuleY(r, len, mat, seed) {
  return mesh(lumpy(new THREE.CapsuleGeometry(r, len, 8, 16), 0.04, seed), mat);
}

// THE GIANT. Returned pivots are driven by giant.js; markers give the limb collider points.
export function buildGiant(mats) {
  const root = new THREE.Group();
  root.name = 'giant';
  const lean = new THREE.Group(); // leans from the feet so the face comes down to the table
  root.add(lean);

  // legs (implied by the walk)
  for (const sx of [-1, 1]) {
    const leg = capsuleY(0.3, 1.2, mats.hideDark, 70 + sx);
    leg.position.set(0.38 * sx, 0.9, 0);
    lean.add(leg);
  }
  const hip = mesh(lumpy(new THREE.CylinderGeometry(0.62, 0.55, 0.5, 20, 2), 0.04, 3), mats.hideDark);
  hip.position.y = 1.65;
  lean.add(hip);
  const torso = mesh(lumpy(new RoundedBoxGeometry(1.25, 1.7, 0.75, 6, 0.3), 0.05, 4), mats.hide);
  torso.position.y = 2.35;
  lean.add(torso);
  const shoulders = mesh(lumpy(new RoundedBoxGeometry(1.85, 0.42, 0.8, 6, 0.2), 0.05, 5), mats.hide);
  shoulders.position.y = 3.15;
  lean.add(shoulders);

  const neck = new THREE.Group();
  neck.position.y = 3.35;
  lean.add(neck);
  const neckMesh = capsuleY(0.28, 0.25, mats.hide, 6);
  neckMesh.position.y = 0.1;
  neck.add(neckMesh);
  const head = mesh(lumpy(new RoundedBoxGeometry(1.05, 1.25, 0.95, 6, 0.38), 0.04, 7), mats.hide);
  head.position.set(0, 0.62, 0.02);
  neck.add(head);
  const brow = mesh(lumpy(new RoundedBoxGeometry(0.98, 0.2, 0.3, 4, 0.08), 0.06, 8), mats.hideDark);
  brow.position.set(0, 0.92, 0.42);
  brow.rotation.x = -0.25;
  neck.add(brow);
  const jaw = mesh(lumpy(new RoundedBoxGeometry(0.85, 0.35, 0.7, 4, 0.15), 0.05, 9), mats.hide);
  jaw.position.set(0, 0.12, 0.18);
  neck.add(jaw);
  for (const sx of [-1, 1]) {
    const sock = mesh(new THREE.SphereGeometry(0.12, 16, 12), mats.socket, false);
    sock.position.set(0.25 * sx, 0.78, 0.46);
    sock.scale.set(1, 0.7, 0.5);
    neck.add(sock);
    const eyeBall = mesh(new THREE.SphereGeometry(0.055, 16, 12), mats.eye, false);
    eyeBall.position.set(0.25 * sx, 0.78, 0.52);
    neck.add(eyeBall);
    const ear = mesh(lumpy(new THREE.SphereGeometry(0.16, 10, 8), 0.1, 10 + sx), mats.hideDark);
    ear.position.set(0.56 * sx, 0.7, -0.05);
    ear.scale.set(0.4, 1, 0.7);
    neck.add(ear);
  }
  const eye = new THREE.Object3D(); // the target of the leap that ends him
  eye.position.set(0, 0.78, 0.54);
  neck.add(eye);
  const eyeLight = new THREE.PointLight(0x66ff00, 0.6, 1.2, 2);
  eyeLight.position.set(0, 0.78, 0.7);
  neck.add(eyeLight);

  // root beard: nine strands hanging from the jaw onto the chest, plus finer tendrils
  const R = rng(99);
  const beardParts = [];
  for (let i = 0; i < 9; i++) {
    const x = -0.36 + (i / 8) * 0.72;
    const a = { x, y: 0.05, z: 0.45 + R() * 0.05 };
    const b = { x: x * 1.15 + (R() - 0.5) * 0.15, y: -0.7 - R() * 0.6, z: 0.4 + R() * 0.15 };
    beardParts.push(strandGeometry(a, b, 0.045, 0.006, 300 + i, 6));
  }
  for (let i = 0; i < 26; i++) {
    const x = (R() - 0.5) * 0.8, y = R() * 0.3;
    const a = { x, y: y - 0.05, z: 0.4 + R() * 0.12 };
    const b = { x: x + (R() - 0.5) * 0.3, y: y - 0.4 - R() * 0.9, z: a.z + (R() - 0.5) * 0.2 };
    beardParts.push(strandGeometry(a, b, 0.018, 0.003, 400 + i, 5));
  }
  const beard = mesh(mergeAll(beardParts), mats.rootDark);
  neck.add(beard);

  // vines wrapping the body (26 wraps) and 10 tendrils
  const wraps = [];
  for (let i = 0; i < 26; i++) {
    const y = 1.6 + R() * 1.7, ang = R() * Math.PI * 2;
    const r0 = 0.66;
    const a = { x: Math.cos(ang) * r0, y, z: Math.sin(ang) * r0 * 0.62 };
    const b = { x: Math.cos(ang + 0.9) * r0, y: y + (R() - 0.5) * 0.4, z: Math.sin(ang + 0.9) * r0 * 0.62 };
    wraps.push(strandGeometry(a, b, 0.04, 0.03, 600 + i, 6));
  }
  for (let i = 0; i < 10; i++) {
    const x = (R() - 0.5) * 1.6, y = 3.0 + R() * 0.3;
    wraps.push(strandGeometry({ x, y, z: 0.3 }, { x: x * 1.1, y: y - 0.6 - R() * 0.8, z: 0.45 }, 0.025, 0.004, 700 + i, 5));
  }
  lean.add(mesh(mergeAll(wraps), mats.vine));

  // ARMS: pivot at (±0.92, 3.1, 0); upper arm, forearm (rotated x -0.35), fist.
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.92 * sx, 3.1, 0);
    lean.add(pivot);
    const upper = capsuleY(0.24, 1.15, mats.hide, 20 + sx);
    upper.position.y = -0.62;
    pivot.add(upper);
    const fore = capsuleY(0.2, 1.25, mats.hide, 30 + sx);
    fore.position.set(0.05 * sx, -1.72, 0.32);
    fore.rotation.x = -0.35;
    pivot.add(fore);
    const fist = mesh(lumpy(new RoundedBoxGeometry(0.62, 0.4, 0.62, 5, 0.14), 0.06, 40 + sx), mats.hide);
    fist.position.set(0.05 * sx, -2.45, 0.62);
    pivot.add(fist);
    // knuckle ridges
    for (let k = 0; k < 4; k++) {
      const kn = mesh(new THREE.SphereGeometry(0.075, 10, 8), mats.hideDark);
      kn.position.set(0.05 * sx - 0.21 + k * 0.14, -2.3, 0.9);
      pivot.add(kn);
    }
    const marks = {};
    for (const [k, p] of Object.entries({
      shoulder: [0, 0, 0], elbow: [0, -1.2, 0.05], wrist: [0.05 * sx, -2.3, 0.53], hand: [0.05 * sx, -2.45, 0.62],
    })) {
      const o = new THREE.Object3D();
      o.position.set(...p);
      pivot.add(o);
      marks[k] = o;
    }
    const hold = new THREE.Object3D(); // things he carries ride inside the fist
    hold.position.set(0.05 * sx, -2.45, 0.62);
    pivot.add(hold);
    arms.push({ side: sx, pivot, fist, marks, hold });
  }
  return { root, lean, neck, eye, arms, eyeLight };
}

function mergeAll(list) {
  // small local merge to avoid importing BufferGeometryUtils twice
  let count = 0;
  for (const g of list) count += g.index ? g.index.count : g.attributes.position.count;
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const pos = new Float32Array(geos.reduce((n, g) => n + g.attributes.position.array.length, 0));
  const nor = new Float32Array(pos.length);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  void count;
  return out;
}

// THE CUP — drawn from the same two numbers its colliders use (bowl underside, lip tube).
export const CUP = {
  bowlBottom: 0.165, // underside of the bowl (model units)
  bowlH: 0.2,
  rTop: 0.122,
  rBot: 0.075,
  lipTube: 0.018,
  liquidY: 0.3, // drawn surface of what he poured in
};

export function buildCup(mats) {
  const g = new THREE.Group();
  const S = CUP_S;
  const inner = new THREE.Group();
  inner.scale.setScalar(S);
  g.add(inner);
  const C = CUP;
  const bowl = mesh(new THREE.CylinderGeometry(C.rTop, C.rBot, C.bowlH, 36, 1, true), mats.goblet);
  bowl.material = mats.goblet;
  bowl.position.y = C.bowlBottom + C.bowlH / 2;
  inner.add(bowl);
  const lip = mesh(new THREE.TorusGeometry(C.rTop, C.lipTube, 10, 40), mats.goblet);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = C.bowlBottom + C.bowlH;
  inner.add(lip);
  const bottom = mesh(new THREE.CircleGeometry(C.rBot, 24), mats.goblet);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = C.bowlBottom + 0.001;
  inner.add(bottom);
  const foot = mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.018, 28), mats.goblet);
  foot.position.y = 0.009;
  inner.add(foot);
  const stem = mesh(new THREE.CylinderGeometry(0.022, 0.028, C.bowlBottom - 0.02, 16), mats.goblet);
  stem.position.y = 0.02 + (C.bowlBottom - 0.02) / 2;
  inner.add(stem);
  // contents: dark liquid, glowing band proud of it, a point light
  const rAt = (y) => C.rBot + ((y - C.bowlBottom) / C.bowlH) * (C.rTop - C.rBot);
  const liquid = mesh(new THREE.CylinderGeometry(rAt(C.liquidY) - 0.002, C.rBot, C.liquidY - C.bowlBottom, 32), mats.liquid, false);
  liquid.position.y = C.bowlBottom + (C.liquidY - C.bowlBottom) / 2;
  inner.add(liquid);
  const band = mesh(new THREE.CylinderGeometry(rAt(C.liquidY) - 0.004, rAt(C.liquidY) - 0.004, 0.006, 32), mats.glow, false);
  band.position.y = C.liquidY + 0.004;
  inner.add(band);
  const light = new THREE.PointLight(0x66ff00, 0.9, 0.9, 2);
  light.position.y = C.liquidY + 0.05;
  inner.add(light);
  // a net of three rings and six strands over the mouth (and draped down the bowl)
  const net = [];
  for (let k = 0; k < 3; k++) {
    const y = C.bowlBottom + 0.06 + k * 0.065;
    const t = new THREE.TorusGeometry(rAt(y) + 0.004, 0.0025, 4, 40);
    t.rotateX(Math.PI / 2);
    t.translate(0, y, 0);
    net.push(t);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    for (let s = 0; s < 4; s++) {
      const y1 = C.bowlBottom + (s / 4) * (C.bowlH + 0.01), y2 = C.bowlBottom + ((s + 1) / 4) * (C.bowlH + 0.01);
      const a1 = a + s * 0.12, a2 = a + (s + 1) * 0.12;
      net.push(strandGeometry(
        { x: Math.cos(a1) * (rAt(y1) + 0.005), y: y1, z: Math.sin(a1) * (rAt(y1) + 0.005) },
        { x: Math.cos(a2) * (rAt(y2) + 0.005), y: y2, z: Math.sin(a2) * (rAt(y2) + 0.005) }, 0.003, 0.003, 800 + k * 4 + s, 4));
    }
    net.push(strandGeometry({ x: Math.cos(a) * 0.03, y: 0.03, z: Math.sin(a) * 0.03 }, { x: Math.cos(a) * 0.08, y: C.bowlBottom, z: Math.sin(a) * 0.08 }, 0.003, 0.003, 850 + k, 4));
  }
  inner.add(mesh(mergeAll(net), mats.net, false));
  return g;
}

// Collider recipe for a cup at table position (x, z) on the surface y0, in world units.
export function cupColliderSpec(x, y0, z) {
  const S = CUP_S, C = CUP;
  const rAt = (y) => C.rBot + ((y - C.bowlBottom) / C.bowlH) * (C.rTop - C.rBot);
  const lipY = C.bowlBottom + C.bowlH;
  const staves = [], beads = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const yTop = lipY + C.lipTube - 0.015 - 0.004; // just under the top of the lip
    staves.push({
      a: { x: x + Math.cos(a) * rAt(C.bowlBottom) * S, y: y0 + C.bowlBottom * S, z: z + Math.sin(a) * rAt(C.bowlBottom) * S },
      b: { x: x + Math.cos(a) * rAt(yTop) * S, y: y0 + yTop * S, z: z + Math.sin(a) * rAt(yTop) * S },
      r: 0.015 * S,
    });
    const ab = a + Math.PI / 10;
    beads.push({ p: { x: x + Math.cos(ab) * C.rTop * S, y: y0 + lipY * S, z: z + Math.sin(ab) * C.rTop * S }, r: C.lipTube * S });
  }
  const floorHalfY = 0.035 * S;
  return {
    staves,
    beads,
    column: { a: { x, y: y0 + 0.02 * S, z }, b: { x, y: y0 + (C.liquidY - 0.035) * S, z }, r: 0.05 * S },
    floor: { p: { x, y: y0 + C.liquidY * S - floorHalfY, z }, half: { x: 0.07 * S, y: floorHalfY, z: 0.07 * S } },
  };
}

export function buildCheese(mats) {
  // custom 6-vertex wedge, 0.42 x 0.3 x 0.36
  const w = 0.42, h = 0.3, d = 0.36;
  const v = [
    [0, 0, 0], [w, 0, d / 2], [0, 0, d],
    [0, h, 0], [w, h * 0.35, d / 2], [0, h, d],
  ];
  const tris = [[0, 2, 1], [3, 4, 5], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]];
  const pos = [];
  for (const t of tris) for (const i of t) pos.push(...v[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  geo.translate(-w / 2, 0, -d / 2);
  const g = new THREE.Group();
  g.add(mesh(geo, mats.cheese));
  // holes
  const R = rng(5);
  for (let i = 0; i < 9; i++) {
    const hole = mesh(new THREE.SphereGeometry(0.02 + R() * 0.025, 10, 8), mats.socket, false);
    hole.position.set(-w / 2 + 0.002, 0.05 + R() * 0.18, -d / 2 + 0.05 + R() * 0.26);
    hole.scale.set(0.25, 1, 1);
    g.add(hole);
  }
  return g;
}

export function buildLoaf(mats) {
  const g = new THREE.Group();
  const loaf = mesh(lumpy(new THREE.SphereGeometry(0.28, 28, 18), 0.03, 12), mats.loaf);
  loaf.scale.set(1.4, 0.62, 0.9);
  loaf.position.y = 0.17;
  g.add(loaf);
  return g;
}

// THE MOUSE — 0.05 radius; legs are animated by player.js.
export function buildMouse(mats) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = mesh(lumpy(new THREE.SphereGeometry(0.05, 20, 14), 0.05, 1), mats.fur);
  torso.scale.set(0.95, 0.8, 1.35);
  torso.position.set(0, 0.0, -0.005);
  body.add(torso);
  const belly = mesh(new THREE.SphereGeometry(0.035, 14, 10), mats.furLight);
  belly.scale.set(1, 0.7, 1.5);
  belly.position.set(0, -0.015, 0.0);
  body.add(belly);
  const head = mesh(new THREE.SphereGeometry(0.03, 16, 12), mats.fur);
  head.scale.set(0.9, 0.85, 1.35);
  head.position.set(0, 0.012, 0.058);
  body.add(head);
  const nose = mesh(new THREE.SphereGeometry(0.006, 8, 6), mats.furLight);
  nose.position.set(0, 0.008, 0.098);
  body.add(nose);
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.016, 12, 8), mats.furLight);
    ear.scale.set(1, 1, 0.35);
    ear.position.set(0.018 * sx, 0.04, 0.045);
    body.add(ear);
    const e = mesh(new THREE.SphereGeometry(0.0045, 8, 6), mats.socket, false);
    e.position.set(0.014 * sx, 0.02, 0.08);
    body.add(e);
  }
  const tail = mesh(strandGeometry({ x: 0, y: -0.01, z: -0.06 }, { x: 0, y: 0.0, z: -0.16 }, 0.006, 0.0015, 2, 6), mats.furLight);
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.025, 0.035], [0.025, 0.035], [-0.025, -0.03], [0.025, -0.03]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.02, z);
    const leg = mesh(new THREE.CapsuleGeometry(0.007, 0.018, 4, 6), mats.fur);
    leg.position.y = -0.014;
    pivot.add(leg);
    body.add(pivot);
    legs.push(pivot);
  }
  return { root, body, legs };
}
