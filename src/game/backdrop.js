// The distant world. A Marble (World Labs) Gaussian-splat world is used when one is present in
// /backdrops; until then a painted sky dome stands in: pale grey-green mist with layered hills
// fading into it. Neither is touched by the playfield's fog, and both meet the fog colour at the
// horizon so the seam disappears.
import * as THREE from 'three';
import { FOG_COLOR } from './constants.js';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uFog;
uniform vec3 uSkyTop;
uniform vec3 uHill;
uniform float uTime;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float fbm(float x) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(x); x *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.z, d.x);
  float el = d.y;
  // sky: fog colour at the horizon, a touch cooler and brighter overhead
  vec3 col = mix(uFog, uSkyTop, smoothstep(0.02, 0.7, el));
  // layered hills, nearer layers darker and higher; each fades into the mist
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float h = 0.035 + 0.05 * fi + 0.09 * fbm(az * (2.0 + fi * 1.3) + fi * 17.0);
    float edge = smoothstep(h + 0.004, h - 0.004, el);
    float depth = 1.0 - fi / 4.0;              // 1 = far
    vec3 layer = mix(uHill, uFog, 0.35 + 0.55 * depth);
    // soft mist pooling in the valleys
    float mist = smoothstep(h, h - 0.12, el) * 0.35;
    col = mix(col, mix(layer, uFog, mist), edge);
  }
  // drifting haze bands
  float haze = 0.06 * fbm(az * 3.0 + uTime * 0.01) * smoothstep(0.25, 0.0, abs(el - 0.08));
  col = mix(col, uFog * 1.02, haze);
  if (el < 0.0) col = uFog;
  // the far side, where the giant comes from, is lost in fog
  col = mix(col, uFog, smoothstep(0.05, -0.55, d.z) * 0.97);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildBackdrop(scene) {
  const fog = new THREE.Color(FOG_COLOR);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uFog: { value: fog.clone() },
      uSkyTop: { value: new THREE.Color(0xdfe6df) },
      uHill: { value: new THREE.Color(0x58654f) },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);
  return {
    dome,
    update(t, camPos) { mat.uniforms.uTime.value = t; dome.position.copy(camPos); },
    async tryMarble() {
      // Marble splat worlds go in public/backdrops/world.spz; loaded with Spark when present.
      try {
        const head = await fetch('/backdrops/world.spz', { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('html')) return false;
        const { SplatMesh } = await import('@sparkjsdev/spark');
        const splat = new SplatMesh({ url: '/backdrops/world.spz' });
        splat.scale.setScalar(40);
        splat.position.set(0, -2, 0);
        scene.add(splat);
        return true;
      } catch {
        return false;
      }
    },
  };
}
