import { formatTime } from '../game/formatTime.js';

const COLS = ['Started', 'Player', 'Body', 'Status', 'Life', 'Falls', 'Grabs', 'Run'];

export default function RunTable({ rows, onOpen, selected }) {
  if (!rows.length) return <p className="mt-8 text-sm font-light text-ink/60">No runs recorded yet.</p>;
  return (
    <table className="mt-6 w-full border-collapse text-left text-xs font-light">
      <thead>
        <tr className="uppercase mg-track text-ink/50">{COLS.map((c) => <th key={c} className="border-b border-ink/15 py-2 pr-3 font-light">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const sel = selected && selected.run_id === r.run_id && selected.life_index === r.life_index;
          return (
            <tr key={r.run_id + r.life_index} onClick={() => onOpen(r)} className={`cursor-pointer border-b border-ink/10 hover:bg-ink/5 ${sel ? 'bg-cyan/15' : ''}`}>
              <td className="py-2 pr-3 tabular-nums">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
              <td className="pr-3 uppercase mg-track">{r.player_name}</td>
              <td className="pr-3">{r.character}</td>
              <td className="pr-3">{r.status}{r.reached_table ? ' · table' : ''}</td>
              <td className="pr-3 tabular-nums">{r.life_index}</td>
              <td className="pr-3 tabular-nums">{r.fall_count}</td>
              <td className="pr-3 tabular-nums">{r.grab_successes}/{r.grab_attempts}</td>
              <td className="pr-3 tabular-nums">#{r.run_number} · {formatTime(r.duration_ms)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
