import { useState } from 'react';

export function GobletIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M4 3h16l-2 10a6 6 0 0 1-12 0L4 3z" />
      <path d="M5.2 8.5h13.6" opacity=".5" />
      <path d="M12 19v8M7 29h10" />
    </svg>
  );
}

export default function EntryBlock({ onStart }) {
  const [flick, setFlick] = useState(false);
  const press = () => {
    setFlick(true);
    setTimeout(onStart, 450);
  };
  return (
    <section className="mg-seq mt-16 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: '1.2s' }}>
      <p className="text-lg font-extralight mg-track sm:text-xl">Are you ready to enter the Mind Game?</p>
      <button
        type="button"
        onClick={press}
        aria-label="Enter the Mind Game"
        className={`flex h-20 w-20 shrink-0 items-center justify-center gap-1 bg-ink text-field transition-colors hover:text-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${flick ? 'mg-flicker' : ''}`}
      >
        <GobletIcon className="h-8 w-6" />
        <GobletIcon className="h-8 w-6" />
      </button>
    </section>
  );
}
