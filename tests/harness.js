// In-browser test harness. Load in the page console / preview:
//   const { T } = await import('/tests/harness.js');
// Drives window.game with scripted inputs at a fixed 1/60 step (independent of rAF).
export const T = {
  get g() { return window.game; },
  ready() { this.g.loadT = 99; return this; },
  run(sec, f) {
    const g = this.g;
    const orig = g.readInput.bind(g);
    let i = 0;
    g.readInput = () => Object.assign({ fwd: 0, right: 0, jump: false, grabHeld: false, grabPressed: false, sprint: false, camYaw: g.cam.yaw }, f ? f(i++) : {});
    try { for (let k = 0; k < Math.round(sec * 60); k++) g.advance(1 / 60); } finally { g.readInput = orig; }
    return this;
  },
  put(x, y, z) {
    const p = this.g.player;
    const table = p.tableReached;
    p.reset();
    p.tableReached = table;
    p.pos = { x, y, z };
    p.airMaxY = y;
    p.alive = true;
    return this;
  },
  st() {
    const p = this.g.player;
    return { pos: p.p3(), grip: p.grip && p.grip.body.label, ground: p.ground && p.ground.label, alive: p.alive, lives: this.g.lives, poison: p.poisonT >= 0, giant: this.g.giant.state };
  },
  evs(n = 12) {
    return this.g.logger.life.events.slice(-n).map((e) => e.type + (e.target ? ':' + e.target : '') + (e.succeeded !== undefined ? (e.succeeded ? '✓' : '✗') : '') + (e.ending ? ':' + e.ending : '') + (e.cause ? ':' + e.cause : '') + (e.reason ? ':' + e.reason : ''));
  },
  // bring the giant in and let him finish setting the table
  giant() {
    if (this.g.giant.state === 'away') {
      this.put(0, 2.76, -0.2).run(0.3);
      this.g.player.tableReached = true;
      this.g.giant.start();
    }
    this.run(8);
    return this;
  },
};
