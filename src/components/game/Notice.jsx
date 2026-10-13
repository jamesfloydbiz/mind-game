import { useEffect, useState } from 'react';

// The giant's question: dark ink over the pale fog, centred at 22% height, first line larger.
// Stays mounted and fades.
export default function Notice({ lines, secs, id }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!lines?.length) { setShown(false); return; }
    setShown(true);
    const t = setTimeout(() => setShown(false), (secs || 9) * 1000);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 px-6 text-center text-ink transition-opacity duration-[1500ms]"
      style={{ top: '22%', opacity: shown ? 1 : 0 }}
    >
      {(lines || []).map((l, i) => (
        <p key={i} className={i === 0 ? 'text-xl font-light mg-track sm:text-3xl' : 'mt-3 text-xs font-light mg-track-lg text-ink/70 sm:text-sm'}>{l}</p>
      ))}
    </div>
  );
}
