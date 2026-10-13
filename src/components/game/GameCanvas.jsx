import { useEffect, useRef, useState } from 'react';
import { Engine } from '../../game/engine.js';
import Hud from './Hud.jsx';
import Notice from './Notice.jsx';
import GameOverScreen from './GameOverScreen.jsx';

export default function GameCanvas({ playerName, runNumber, onRestart, onPout }) {
  const canvas = useRef(null);
  const engine = useRef(null);
  const [hud, setHud] = useState({ lives: 3, runMs: 0 });
  const [notice, setNotice] = useState({ lines: [], until: 0, id: 0 });
  const [over, setOver] = useState(null);

  useEffect(() => {
    const e = new Engine(canvas.current, {
      playerName,
      runNumber,
      onHud: setHud,
      onNotice: (lines, secs) => setNotice((n) => ({ lines, secs, id: n.id + 1 })),
      onGameOver: setOver,
    });
    engine.current = e;
    return () => e.dispose();
  }, [playerName, runNumber]);

  const pout = () => { engine.current?.logger.abandon(); onPout(); };

  return (
    <div className="fixed inset-0 overflow-hidden bg-field font-oswald uppercase">
      <canvas ref={canvas} className="block h-full w-full touch-none select-none" />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(18,22,16,.38) 100%)' }} />
      <Notice {...notice} />
      <Hud lives={hud.lives} runMs={hud.runMs} />
      {over && <GameOverScreen runMs={over.runMs} onRestart={onRestart} onPout={pout} />}
    </div>
  );
}
