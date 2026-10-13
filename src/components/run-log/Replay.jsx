import { useEffect, useMemo, useRef, useState } from 'react';

// Watch a life back: a top-down map of where the mouse went (coloured by height), a height-over-
// time strip, and every grab, fall, death and move against the giant marked where and when it
// happened. Built from the life's 10Hz position samples and its event stream.
const TABLE_TOP = 5.4;
const VIEW = { x0: -12, x1: 12, z0: -12, z1: 13 };
const MARK = {
  grab_attempt: (e) => (e.succeeded ? ['#2a9d4b', 'grab'] : ['#c0392b', 'refused']),
  break: () => ['#c0392b', 'root snapped'],
  death: () => ['#000', 'death'],
  table_reached: () => ['#4DD6E8', 'reached the table'],
  choice_prompt: () => ['#4DD6E8', 'the choice'],
  eye_reached: () => ['#66ff00', 'in his eye'],
  cup_tipped: () => ['#66ff00', 'cup knocked over'],
  giant_poisoned: () => ['#66ff00', 'he is poisoned'],
  giant_throw: () => ['#e67e22', 'thrown back'],
  giant_crush: () => ['#e67e22', 'fist comes down'],
  giant_impatient: () => ['#e67e22', '"Choose."'],
  poison: () => ['#000', 'poisoned'],
  stage_complete: (e) => (e.giant_slain ? ['#66ff00', 'giant slain'] : null),
};

export default function Replay({ record }) {
  const map = useRef(null), strip = useRef(null);
  const samples = useMemo(() => record.events.filter((e) => e.type === 'px'), [record]);
  const marks = useMemo(() => record.events.map((e) => {
    const f = MARK[e.type]; const m = f && f(e);
    if (!m) return null;
    const s = nearest(samples, e.t);
    return s ? { t: e.t, color: m[0], label: m[1], x: s.x, y: s.y, z: s.z } : null;
  }).filter(Boolean), [record, samples]);
  const T = samples.length ? samples[samples.length - 1].t : 0;
  const [t, setT] = useState(T);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  useEffect(() => { setT(T); setPlaying(false); }, [record]);
  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (now) => {
      setT((v) => { const n = v + (now - last) * speed; if (n >= T) { setPlaying(false); return T; } return n; });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, T]);

  useEffect(() => drawMap(map.current, samples, marks, t), [samples, marks, t]);
  useEffect(() => drawStrip(strip.current, samples, marks, t, T), [samples, marks, t, T]);

  if (!samples.length) return <p className="mt-4 text-xs text-ink/60">No position samples in this life.</p>;
  const now = nearest(samples, t);
  const last = [...marks].reverse().find((m) => m.t <= t);
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div>
        <canvas ref={map} width={720} height={600} className="w-full border border-ink/15 bg-[#e9ece6]" />
        <canvas ref={strip} width={720} height={110} className="mt-2 w-full cursor-pointer border border-ink/15 bg-[#f3f4f1]"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setT(((e.clientX - r.left) / r.width) * T); }} />
        <div className="mt-2 flex items-center gap-3 text-xs uppercase mg-track">
          <button onClick={() => { if (t >= T) setT(0); setPlaying((p) => !p); }} className="bg-ink px-4 py-1.5 text-field hover:bg-cyan hover:text-ink">{playing ? 'Pause' : 'Play'}</button>
          {[1, 4, 16].map((s) => <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 ${speed === s ? 'text-cyan' : 'text-ink/50'}`}>{s}×</button>)}
          <input type="range" min={0} max={T} value={t} onChange={(e) => setT(+e.target.value)} className="flex-1" />
          <span className="tabular-nums">{(t / 1000).toFixed(1)}s</span>
        </div>
      </div>
      <aside className="text-[11px] font-light">
        <p className="uppercase mg-track text-ink/50">Now</p>
        <p className="mt-1 tabular-nums">x {now.x.toFixed(2)} · z {now.z.toFixed(2)}</p>
        <p className="tabular-nums">height {now.y.toFixed(2)}{now.y > TABLE_TOP - 0.1 ? ' (on the table)' : ''}</p>
        {last && <p className="mt-3"><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: last.color }} /> <span className="align-middle">{last.label} · {(last.t / 1000).toFixed(1)}s</span></p>}
        <p className="mt-6 uppercase mg-track text-ink/50">Key</p>
        <ul className="mt-1 space-y-0.5">
          {[['#2a9d4b', 'grab'], ['#c0392b', 'refused / snapped'], ['#000', 'death'], ['#4DD6E8', 'table / choice'], ['#66ff00', 'move against the giant'], ['#e67e22', 'giant reacts']].map(([c, l]) => (
            <li key={l}><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: c }} /> <span className="align-middle">{l}</span></li>
          ))}
        </ul>
        <p className="mt-4 text-ink/50">Path colour: dark on the ground → cyan at the tabletop.</p>
      </aside>
    </div>
  );
}

function nearest(samples, t) {
  let lo = 0, hi = samples.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].t < t) lo = mid + 1; else hi = mid; }
  return samples[lo];
}

const heightColor = (y) => {
  const k = Math.max(0, Math.min(1, y / TABLE_TOP));
  const a = [40, 46, 36], b = [77, 214, 232];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
};

function drawMap(c, samples, marks, t) {
  if (!c) return;
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const sx = (x) => ((x - VIEW.x0) / (VIEW.x1 - VIEW.x0)) * W;
  const sz = (z) => ((z - VIEW.z0) / (VIEW.z1 - VIEW.z0)) * H;
  g.clearRect(0, 0, W, H);
  // the giant's side
  g.fillStyle = 'rgba(0,0,0,0.05)';
  g.fillRect(0, 0, W, sz(-3.6));
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.font = '11px Oswald, sans-serif';
  g.fillText('THE GIANT’S SIDE', 10, 18);
  // trunk foot and the table
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(sx(0), sz(0), (4.7 / 24) * W, (3.6 / 25) * H, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([5, 4]);
  g.beginPath(); g.ellipse(sx(0), sz(0), (4.6 / 24) * W, (3.2 / 25) * H, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillText('TABLE', sx(0) - 14, sz(0) + 4);
  // the path so far
  g.lineWidth = 2.2;
  for (let i = 1; i < samples.length && samples[i].t <= t; i++) {
    const a = samples[i - 1], b = samples[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 3) continue; // a throw or respawn: don't draw a line
    g.strokeStyle = heightColor(b.y);
    g.beginPath(); g.moveTo(sx(a.x), sz(a.z)); g.lineTo(sx(b.x), sz(b.z)); g.stroke();
  }
  for (const m of marks) {
    if (m.t > t) continue;
    g.fillStyle = m.color;
    g.beginPath(); g.arc(sx(m.x), sz(m.z), m.label === 'death' ? 6 : 4, 0, Math.PI * 2); g.fill();
  }
  const now = nearest(samples, t);
  if (now) {
    g.fillStyle = '#FF0000';
    g.beginPath(); g.arc(sx(now.x), sz(now.z), 5 + Math.min(4, now.y), 0, Math.PI * 2); g.fill();
  }
}

function drawStrip(c, samples, marks, t, T) {
  if (!c || !T) return;
  const g = c.getContext('2d'), W = c.width, H = c.height, pad = 8;
  const ymax = 8;
  const px = (tt) => (tt / T) * W, py = (y) => H - pad - (Math.max(0, y) / ymax) * (H - pad * 2);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(77,214,232,0.6)'; g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(0, py(TABLE_TOP)); g.lineTo(W, py(TABLE_TOP)); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.font = '10px Oswald, sans-serif'; g.fillText('TABLE', 4, py(TABLE_TOP) - 3);
  g.strokeStyle = '#2d3027'; g.lineWidth = 1.5; g.beginPath();
  samples.forEach((s, i) => (i ? g.lineTo(px(s.t), py(s.y)) : g.moveTo(px(s.t), py(s.y))));
  g.stroke();
  for (const m of marks) { g.fillStyle = m.color; g.fillRect(px(m.t) - 1, H - 6, 2, 6); }
  g.fillStyle = '#FF0000'; g.fillRect(px(t) - 1, 0, 2, H);
}
