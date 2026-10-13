import { formatTime } from './formatTime.js';

export default function GameOverScreen({ runMs, onRestart, onPout }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#F0F0F0]/95 text-ink backdrop-blur-sm">
      <span className="text-xs font-light mg-track text-[#FF0000]">Lives 00/03</span>
      <h2 className="mt-4 text-5xl font-extralight mg-track-lg sm:text-7xl">Game Over</h2>
      <p className="mt-6 text-xs font-light mg-track text-ink/60">Last run <span className="ml-2 text-ink tabular-nums">{formatTime(runMs)}</span></p>
      <div className="mt-10 flex gap-4">
        <button autoFocus onClick={onRestart} className="h-12 w-36 bg-ink text-xs font-light mg-track text-field transition-colors hover:bg-cyan hover:text-ink">Restart</button>
        <button onClick={onPout} className="h-12 w-36 border border-ink text-xs font-light mg-track transition-colors hover:border-cyan hover:text-cyan">Pout</button>
      </div>
    </div>
  );
}
