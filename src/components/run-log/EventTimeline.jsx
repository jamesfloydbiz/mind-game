import { useState } from 'react';
import Replay from './Replay.jsx';

const QUIET = new Set(['px', 'contact']);

function describe(e) {
  const { t, type, ...rest } = e;
  const parts = Object.entries(rest).map(([k, v]) => `${k}: ${typeof v === 'object' && v ? JSON.stringify(v) : v}`);
  return parts.join(' · ');
}

export default function EventTimeline({ record, onClose }) {
  const [showAll, setShowAll] = useState(false);
  const events = showAll ? record.events : record.events.filter((e) => !QUIET.has(e.type));
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mind-game-${record.run_id}-life${record.life_index}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <section className="mt-10 border-t border-ink/20 pt-6">
      <div className="flex flex-wrap items-center gap-4 uppercase">
        <h2 className="text-sm font-light mg-track">{record.player_name} · run #{record.run_number} · life {record.life_index} · {record.status}</h2>
        <label className="ml-auto flex items-center gap-2 text-[11px] mg-track text-ink/60">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Positions + contacts
        </label>
        <button onClick={exportJson} className="bg-ink px-4 py-1.5 text-xs mg-track text-field hover:bg-cyan hover:text-ink">Export JSON</button>
        <button onClick={onClose} className="border border-ink/40 px-4 py-1.5 text-xs mg-track hover:border-cyan hover:text-cyan">Close</button>
      </div>
      <Replay record={record} />
      <ol className="mt-5 space-y-1 font-mono text-[11px]">
        {events.map((e, i) => (
          <li key={i} className={`grid grid-cols-[5rem_10rem_1fr] gap-3 ${e.type === 'death' || e.type === 'poison' ? 'text-lred' : e.type.startsWith('giant') || e.type === 'table_reached' || e.type === 'stage_complete' ? 'text-[#1a8a99]' : ''}`}>
            <span className="tabular-nums text-ink/50">{(e.t / 1000).toFixed(2)}s</span>
            <span>{e.type}{e.type === 'grab_attempt' ? (e.succeeded ? ' ✓' : ' ✗') : ''}</span>
            <span className="text-ink/70">{describe(e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
