import { formatTime } from './formatTime.js';
import Results from './Results.jsx';

export default function GameOverScreen({ runMs, stats, won, onRestart, onPout }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto bg-[#F0F0F0]/95 px-6 py-10 text-ink backdrop-blur-sm">
      {won
        ? <span className="text-xs font-light mg-track text-cyan">The giant is down</span>
        : <span className="text-xs font-light mg-track text-[#FF0000]">Lives 00/03</span>}
      <h2 className="mt-4 text-center text-5xl font-extralight mg-track-lg sm:text-7xl">{won ? 'Level complete' : 'Game Over'}</h2>
      <p className="mt-6 text-xs font-light mg-track text-ink/60">Last run <span className="ml-2 text-ink tabular-nums">{formatTime(runMs)}</span></p>
      <Results s={stats} />
      <div className="mt-10 flex gap-4">
        <button autoFocus onClick={onRestart} className="h-12 w-36 bg-ink text-xs font-light mg-track text-field transition-colors hover:bg-cyan hover:text-ink">Restart</button>
        <button onClick={onPout} className="h-12 w-36 border border-ink text-xs font-light mg-track transition-colors hover:border-cyan hover:text-cyan">Pout</button>
      </div>
    </div>
  );
}
