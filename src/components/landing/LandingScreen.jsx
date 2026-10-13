import { useEffect, useState } from 'react';
import LandingStatusBar from './LandingStatusBar.jsx';
import Stages from './Stages.jsx';
import EntryBlock from './EntryBlock.jsx';

export default function LandingScreen() {
  const [name, setName] = useState('');
  const [lastRun, setLastRun] = useState(null);

  // loaded after mount
  useEffect(() => {
    try {
      setName(localStorage.getItem('mg_player_name') || '');
      const ms = localStorage.getItem('mg_last_run_ms');
      if (ms) setLastRun(Number(ms));
    } catch {}
  }, []);

  const updateName = (n) => {
    setName(n);
    try { localStorage.setItem('mg_player_name', n); } catch {}
  };

  const start = () => window.dispatchEvent(new CustomEvent('mindgame:start', { detail: { name: name.trim() || 'ANON' } }));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') start();
      if (e.key === 'Enter' && document.activeElement?.tagName === 'INPUT') { document.activeElement.blur(); start(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="mg-vignette min-h-full bg-field text-ink font-oswald uppercase">
      <LandingStatusBar name={name} setName={updateName} lastRun={lastRun} />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-14 sm:pt-20">
        <div className="mg-seq flex items-center gap-5" style={{ animationDelay: '0.1s' }}>
          <div className="h-10 w-10 bg-ink sm:h-12 sm:w-12" />
          <h1 className="mg-track-lg text-4xl font-extralight sm:text-6xl">Mind Game</h1>
        </div>
        <div className="mg-seq mt-8 h-px bg-ink/30" style={{ animationDelay: '0.25s' }} />
        <p className="mg-seq mt-8 max-w-2xl text-base font-light normal-case leading-relaxed tracking-wide text-ink/80 sm:text-lg" style={{ animationDelay: '0.4s' }}>
          A test of how you think when the problem won't cooperate. You play a mouse in a world built to a giant's scale.
          Nothing here explains itself: no tutorial, no hints, no marked path. You work out what the world will let you do by
          trying things and watching what happens. Three lives per run. Unlimited runs.
        </p>
        <Stages />
        <EntryBlock onStart={start} />
      </main>
    </div>
  );
}
