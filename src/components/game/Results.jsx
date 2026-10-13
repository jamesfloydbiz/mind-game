import { formatTime } from './formatTime.js';

// What the run measured. Times are from the start of the run (load-in excluded).
export default function Results({ s }) {
  if (!s) return null;
  const t = (ms) => (ms == null ? '—' : formatTime(ms));
  const gap = (a, b) => (a == null || b == null ? null : b - a);
  const rows = [
    ['Reached the top of the table', t(s.tableMs)],
    ['Faced the choice', t(s.promptMs)],
    ['Broke the paradigm', s.breakMs == null ? 'never' : `${t(s.breakMs)}${gap(s.promptMs, s.breakMs) != null ? `  (+${formatTime(gap(s.promptMs, s.breakMs))} after the choice)` : ''}`],
    ['How', s.breakHow || '—'],
    ['Killed the giant', s.killedMs == null ? 'no' : `${t(s.killedMs)} · ${s.method === 'eye' ? 'through the eye' : s.method === 'poison' ? 'his own poison' : s.method}`],
    ['Drank from a cup', s.drank.length ? `${s.drank.length}× (${s.drank.join(', ')})` : 'never'],
    ['Thrown back for going round him', String(s.thrown)],
    ['Lives used', `${s.livesUsed} of 3${s.deaths.length ? ` · ${Object.entries(s.deaths.reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {})).map(([c, n]) => (n > 1 ? `${c} ×${n}` : c)).join(', ')}` : ''}`],
    ['Roots tried', `${s.rootsTried.sound} held · ${s.rootsTried.rotten} rotten · ${s.rootsTried.wet} wet`],
    ['Grabs · refused · falls', `${s.grabs} · ${s.refused} · ${s.falls}`],
  ];
  return (
    <dl className="mt-8 grid w-full max-w-xl grid-cols-[1fr_auto] gap-x-8 gap-y-2 text-left text-[11px] font-light normal-case tracking-wide">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="uppercase mg-track text-ink/55">{k}</dt>
          <dd className="text-right tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
