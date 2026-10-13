import { useEffect, useState } from 'react';
import LandingScreen from './components/landing/LandingScreen.jsx';
import GameCanvas from './components/game/GameCanvas.jsx';
import LogsPage from './components/run-log/LogsPage.jsx';

// Routes: "/" = landing → game (mounted on the "mindgame:start" event), "/logs" = researcher viewer.
export default function App() {
  const [path] = useState(() => window.location.pathname);
  const [game, setGame] = useState(null); // { name, run }

  useEffect(() => {
    const start = (e) => setGame((g) => ({ name: e.detail?.name || 'ANON', run: (g?.run || 0) + 1 }));
    window.addEventListener('mindgame:start', start);
    return () => window.removeEventListener('mindgame:start', start);
  }, []);

  if (path.startsWith('/logs')) return <LogsPage />;
  if (game) {
    return (
      <GameCanvas
        key={game.run}
        playerName={game.name}
        runNumber={game.run}
        onRestart={() => setGame((g) => ({ ...g, run: g.run + 1 }))}
        onPout={() => setGame(null)}
      />
    );
  }
  return <LandingScreen />;
}
