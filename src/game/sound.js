// Sound, all synthesised with WebAudio (no files): wind, the giant's footsteps out of the fog, the
// slam, his voice, cracking roots, spilling poison, the eye, death. M toggles mute.
const ctxOf = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  return AC ? new AC() : null;
};

export class Sound {
  constructor() {
    this.ctx = ctxOf();
    this.muted = false;
    try { this.muted = localStorage.getItem('mg_muted') === '1'; } catch {}
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise(2);
    this.startWind();
  }

  resume() { this.ctx?.resume?.(); }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('mg_muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    if (m) window.speechSynthesis?.cancel();
  }

  toggle() { this.setMuted(!this.muted); return this.muted; }

  makeNoise(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  noise({ dur = 0.5, gain = 0.5, type = 'lowpass', freq = 800, q = 1, sweepTo = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 60, to = null, dur = 0.6, gain = 0.6, type = 'sine' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.07;
    // slow gusts
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg).connect(g.gain);
    const lfo2 = this.ctx.createOscillator();
    lfo2.frequency.value = 0.11;
    const lg2 = this.ctx.createGain();
    lg2.gain.value = 160;
    lfo2.connect(lg2).connect(f.frequency);
    src.connect(f).connect(g).connect(this.master);
    src.start(); lfo.start(); lfo2.start();
  }

  // ---- the events ----
  footstep(near = 1) { this.tone({ freq: 46, to: 28, dur: 0.5, gain: 0.5 * near }); this.noise({ dur: 0.35, gain: 0.18 * near, freq: 180 }); }
  slam() { this.tone({ freq: 58, to: 22, dur: 1.4, gain: 0.95 }); this.noise({ dur: 0.9, gain: 0.6, freq: 420, sweepTo: 90 }); }
  crack() { this.noise({ dur: 0.25, gain: 0.5, type: 'bandpass', freq: 1800, q: 3 }); this.tone({ freq: 140, to: 60, dur: 0.3, gain: 0.25, type: 'triangle' }); }
  clatter() { for (let i = 0; i < 3; i++) setTimeout(() => this.noise({ dur: 0.18, gain: 0.35, type: 'bandpass', freq: 900 + i * 300, q: 4 }), i * 90); }
  splash() { this.noise({ dur: 1.1, gain: 0.55, type: 'bandpass', freq: 1400, q: 0.8, sweepTo: 400 }); }
  squelch() { this.noise({ dur: 0.22, gain: 0.5, type: 'bandpass', freq: 600 + Math.random() * 300, q: 6, sweepTo: 200 }); this.tone({ freq: 90, to: 50, dur: 0.2, gain: 0.3, type: 'sawtooth' }); }
  roar() { this.tone({ freq: 70, to: 40, dur: 1.6, gain: 0.5, type: 'sawtooth' }); this.noise({ dur: 1.6, gain: 0.35, freq: 300, sweepTo: 120, attack: 0.15 }); }
  whoosh() { this.noise({ dur: 1.2, gain: 0.4, type: 'bandpass', freq: 300, q: 1, sweepTo: 2000, attack: 0.3 }); }
  death() { this.tone({ freq: 110, to: 40, dur: 2.2, gain: 0.35, type: 'triangle' }); }
  gulp() { [0, 220, 440].forEach((d) => setTimeout(() => this.tone({ freq: 160, to: 70, dur: 0.25, gain: 0.35 }), d)); }

  // his voice: the browser's speech, pitched down and slowed
  voice(text) {
    if (this.muted || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.1;
    u.rate = 0.72;
    u.volume = 0.9;
    const v = speechSynthesis.getVoices().find((x) => /Daniel|Fred|Ralph|Bruce|Male/i.test(x.name));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  dispose() { window.speechSynthesis?.cancel(); this.ctx?.close?.(); }
}
