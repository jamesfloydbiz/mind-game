import { formatTime } from './formatTime.js';

const CONTROLS = [['A / D', 'Move'], ['Space', 'Jump'], ['E', 'Grab / Push'], ['Shift', 'Sprint'], ['Drag', 'Look']];

export default function Hud({ lives, runMs }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/55 to-transparent px-5 pb-4 pt-14 text-[11px] font-light mg-track text-field">
      <span className="bg-black px-2.5 py-1 text-[#FF0000]">Lives: {String(Math.max(0, lives)).padStart(2, '0')}/03</span>
      <span className="hidden gap-6 text-field/80 md:flex">
        {CONTROLS.map(([k, v]) => (
          <span key={k}><span className="text-field">{k}</span> — {v}</span>
        ))}
      </span>
      <span className="text-right">
        <span className="block text-[9px] text-field/60">Last run</span>
        <span className="text-sm tabular-nums">{formatTime(runMs)}</span>
      </span>
    </div>
  );
}
