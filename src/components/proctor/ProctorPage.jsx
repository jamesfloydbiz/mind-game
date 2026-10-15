import { useState } from 'react';

// For whoever runs a session: make one participant code (and link) per student. No names are
// collected — the code is what appears in /logs. Keep your own key of code → student offline.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const makeCode = (prefix) => `${prefix ? prefix + '-' : ''}${Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;

export default function ProctorPage() {
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState(10);
  const [codes, setCodes] = useState([]);
  const make = () => {
    const set = new Set();
    while (set.size < Math.max(1, Math.min(200, count))) set.add(makeCode(prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)));
    setCodes([...set]);
  };
  const link = (c) => `${window.location.origin}${import.meta.env.BASE_URL}?code=${c}`;
  const copyAll = () => navigator.clipboard?.writeText(codes.map((c) => `${c}\t${link(c)}`).join('\n'));
  return (
    <div className="min-h-full bg-field px-6 py-8 font-oswald text-ink">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center gap-4 border-b border-ink/20 pb-4 uppercase">
          <span className="inline-block h-2 w-2 rotate-45 bg-ink" />
          <h1 className="text-lg font-light mg-track">Mind Game · Session setup</h1>
        </header>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed tracking-wide text-ink/75">
          Make one code per student. Open each student's link on their laptop: the code is filled in and can't be changed, and it is the only identifier saved with their runs. Keep your own list of which code belongs to which student, off this machine.
        </p>
        <form className="mt-6 flex flex-wrap items-end gap-4 text-xs uppercase mg-track" onSubmit={(e) => { e.preventDefault(); make(); }}>
          <label className="flex flex-col gap-1">Session prefix
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. NYC1" className="w-32 border-b border-ink/30 bg-transparent px-1 py-1 outline-none focus:border-cyan" />
          </label>
          <label className="flex flex-col gap-1">How many
            <input type="number" min="1" max="200" value={count} onChange={(e) => setCount(+e.target.value)} className="w-20 border-b border-ink/30 bg-transparent px-1 py-1 outline-none focus:border-cyan" />
          </label>
          <button className="bg-ink px-5 py-2 text-field hover:bg-cyan hover:text-ink">Make codes</button>
          {codes.length > 0 && <button type="button" onClick={copyAll} className="border border-ink/40 px-5 py-2 hover:border-cyan hover:text-cyan">Copy all</button>}
          {codes.length > 0 && <button type="button" onClick={() => window.print()} className="border border-ink/40 px-5 py-2 hover:border-cyan hover:text-cyan">Print</button>}
        </form>
        {codes.length > 0 && (
          <table className="mt-8 w-full text-left text-sm font-light">
            <tbody>
              {codes.map((c) => (
                <tr key={c} className="border-b border-ink/10">
                  <td className="py-2 pr-6 font-normal tracking-widest">{c}</td>
                  <td className="py-2"><a className="text-ink/70 underline decoration-ink/20 hover:text-cyan" href={link(c)} target="_blank" rel="noreferrer">{link(c)}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
