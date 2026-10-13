import { DEBRIEF } from '../../game/debrief.js';
import { formatTime } from './formatTime.js';

export default function Debrief({ s }) {
  const verdict = !s ? null
    : s.breakMs != null ? `You stepped outside it at ${formatTime(s.breakMs)}${s.promptMs != null ? `, ${formatTime(Math.max(0, s.breakMs - s.promptMs))} after he put the choice to you` : ''}.`
    : s.promptMs != null ? 'You never stepped outside it.'
    : 'You never reached the choice.';
  return (
    <section className="mt-8 w-full max-w-xl border-t border-ink/15 pt-6 text-left normal-case">
      <h3 className="text-[11px] font-light uppercase mg-track text-cyan">What this was</h3>
      {DEBRIEF.map((p, i) => <p key={i} className={`mt-3 text-sm font-light leading-relaxed tracking-wide ${i === 0 ? 'text-ink' : 'text-ink/75'}`}>{p}</p>)}
      {verdict && <p className="mt-4 text-sm font-normal tracking-wide text-ink">{verdict}</p>}
    </section>
  );
}
