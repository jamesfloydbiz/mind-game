import { formatTime } from './formatTime.js';

const CONTROLS = [['A / D', 'Move'], ['Space', 'Jump'], ['E', 'Grab / Push'], ['Shift', 'Sprint'], ['Drag', 'Look'], ['M', 'Sound']];

export default function Hud({ lives, runMs }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/55 to-transparent px-5 pb-4 pt-14 text-[11px] font-light mg-track text-field">
      <span className="shrink-0 whitespace-nowrap bg-black px-5 py-2.5 text-3xl font-light mg-track text-[#FF0000]">Lives: {String(Math.max(0, lives)).padStart(2, '0')}/03</span>
      <span className="hidden min-w-0 flex-wrap justify-center gap-x-6 gap-y-1 text-field/80 lg:flex">
        {CONTROLS.map(([k, v]) => (
          <span key={k}><span className="text-field">{k}</span> — {v}</span>
        ))}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[9px] text-field/60">Last run</span>
        <span className="text-sm tabular-nums">{formatTime(runMs)}</span>
      </span>
    </div>
  );
}
