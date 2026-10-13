// Low drifting mist around the foot of the tree and over the ground (look only — no physics).
import * as THREE from 'three';

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = 60 + Math.random() * 136, y = 80 + Math.random() * 96, r = 30 + Math.random() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.10)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMist(scene) {
  const tex = mistTexture();
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xeef2ec, transparent: true, opacity: 0.22 + Math.random() * 0.2, depthWrite: false, fog: true });
    const s = new THREE.Sprite(mat);
    const ang = Math.random() * Math.PI * 2, d = 1.8 + Math.random() * 3.2;
    const size = 1.5 + Math.random() * 2.5;
    s.scale.set(size * 1.8, size * 0.55, 1);
    s.position.set(Math.cos(ang) * d, 0.15 + Math.random() * 0.5, Math.sin(ang) * d);
    s.userData = { ang, d, speed: (Math.random() - 0.5) * 0.03, bob: Math.random() * 6 };
    s.renderOrder = 5;
    scene.add(s);
    puffs.push(s);
  }
  return {
    update(t) {
      for (const s of puffs) {
        const u = s.userData;
        const a = u.ang + t * u.speed;
        s.position.x = Math.cos(a) * u.d;
        s.position.z = Math.sin(a) * u.d;
        s.position.y += Math.sin(t * 0.3 + u.bob) * 0.0004;
      }
    },
    dispose() { tex.dispose(); puffs.forEach((s) => s.material.dispose()); },
  };
}
