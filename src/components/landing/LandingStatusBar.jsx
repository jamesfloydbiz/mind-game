import { formatTime } from '../game/formatTime.js';

export default function LandingStatusBar({ name, setName, lastRun }) {
  return (
    <header className="mg-seq flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink/15 px-5 py-3 text-[11px] font-light mg-track">
      <span className="flex items-center gap-3">
        <span className="inline-block h-2 w-2 rotate-45 bg-ink" />
        <span>Mind Game</span>
        <span className="text-ink/50">Level 03</span>
      </span>
      <input
        aria-label="Player name"
        value={name}
        onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 18))}
        placeholder="YOUR NAME"
        className="w-40 border-b border-ink/25 bg-transparent py-0.5 uppercase mg-track outline-none placeholder:text-ink/35 focus:border-cyan"
      />
      <span className="flex items-center gap-2">
        <span className="text-ink/60">Reflash</span>
        <span className="relative inline-block h-1.5 w-20 bg-ink/10"><span className="absolute inset-0 bg-cyan" /></span>
        <span className="text-cyan">100%</span>
      </span>
      {lastRun != null && <span className="text-ink/60">Last run {formatTime(lastRun)}</span>}
      <span className="ml-auto border border-lred px-2 py-0.5 text-lred">Lives 03/03</span>
    </header>
  );
}
