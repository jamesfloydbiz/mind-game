// Height fog: the scene keeps FogExp2 (FOG_COLOR, FOG_DENSITY from the brief) but every material's
// fog is evaluated per fragment from its world position — thick, patchy mist lying low on the
// ground, thinning with height so the trunk and tabletop read through it. No billboards, so no
// visible "panes".
import * as THREE from 'three';

let installed = false;
export function installHeightFog() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef USE_INSTANCING
    vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float mgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float mgNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mgHash(i), mgHash(i + vec2(1, 0)), u.x), mix(mgHash(i + vec2(0, 1)), mgHash(i + vec2(1, 1)), u.x), u.y);
  }
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float mgGround = exp(-max(vFogWorld.y, 0.0) * 1.5);
    float mgPatch = 0.6 + 0.8 * mgNoise(vFogWorld.xz * 0.45) * mgNoise(vFogWorld.xz * 1.3 + 7.0);
    float mgDensity = fogDensity * (0.32 + 0.8 * mgGround * mgPatch);
    float fogFactor = 1.0 - exp(- mgDensity * mgDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
}
