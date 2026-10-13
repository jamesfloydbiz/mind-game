const STAGES = [
  ['One', 'Reach the top of the table. Several ways up are in front of you and they look alike. Only some hold your weight.'],
  ['Two', "Get past the giant's cups. He sets down two drinks and tells you to choose."],
  ['Three', 'Cross the open ground to the castle without being hit.'],
];

export default function Stages() {
  return (
    <section className="mg-seq mt-14" style={{ animationDelay: '0.55s' }}>
      <h2 className="text-xs font-light mg-track-lg text-ink/60">The Stages</h2>
      <ol className="mt-5 space-y-4">
        {STAGES.map(([n, text], i) => (
          <li key={n} className="mg-seq grid grid-cols-[5.5rem_1fr] gap-4" style={{ animationDelay: `${0.7 + i * 0.15}s` }}>
            <span className="text-sm font-light mg-track text-cyan">{n}</span>
            <span className="text-sm font-light normal-case leading-relaxed tracking-wide text-ink/80">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
