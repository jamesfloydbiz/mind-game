// LOAD-IN — for the first LOAD_IN_SECONDS the world resolves out of coarse pixels while the camera
// pulls in and swings behind the animal, physics at 0.4x.
//
// The brief renders into a 64x36 nearest-neighbour target and blits it up through a quad with a
// pow(rgb, 1/2.2) fix. Here the canvas's own drawing buffer is shrunk instead and upscaled with
// CSS `image-rendering: pixelated`: same picture, and tone mapping / sRGB output stay correct
// without a second colour-conversion pass.
import { LOAD_IN_SECONDS, LOAD_IN_START_RES } from './constants.js';

export function loadInState(t) {
  const k = Math.min(1, Math.max(0, t / LOAD_IN_SECONDS));
  const e = Math.pow(k, 0.8);
  return {
    done: k >= 1,
    k,
    // target drawing-buffer height, from LOAD_IN_START_RES up to native
    height: (native) => Math.round(LOAD_IN_START_RES + (native - LOAD_IN_START_RES) * e),
    camDist: 3.4 + (0.9 - 3.4) * e,
    physicsScale: k >= 1 ? 1 : 0.4,
    yawBlend: e,
  };
}
