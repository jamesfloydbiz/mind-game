import { useEffect, useState } from 'react';
import RunTable from './RunTable.jsx';
import EventTimeline from './EventTimeline.jsx';

// Researcher viewer at /logs (noindex). Reads need the LOGS_PASSWORD set in .env.
export default function LogsPage() {
  const [pw, setPw] = useState(() => sessionStorage.getItem('mg_logs_pw') || '');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [record, setRecord] = useState(null);

  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  const call = async (q = '') => {
    const r = await fetch('/api/runlog' + q, { headers: { 'x-logs-password': pw } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  };
  const refresh = async () => {
    setError('');
    try { setRows(await call()); sessionStorage.setItem('mg_logs_pw', pw); } catch (e) { setError(e.message); setRows(null); }
  };
  const open = async (row) => {
    try { setRecord(await call(`?run_id=${encodeURIComponent(row.run_id)}&life=${row.life_index}`)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (pw) refresh(); }, []);

  return (
    <div className="min-h-full bg-field px-6 py-8 font-oswald text-ink">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center gap-4 border-b border-ink/20 pb-4 uppercase">
          <span className="inline-block h-2 w-2 rotate-45 bg-ink" />
          <h1 className="text-lg font-light mg-track">Mind Game · Run logs</h1>
          <form className="ml-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); refresh(); }}>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="PASSWORD" className="border-b border-ink/30 bg-transparent px-1 text-xs mg-track outline-none focus:border-cyan" />
            <button className="bg-ink px-4 py-1.5 text-xs mg-track text-field hover:bg-cyan hover:text-ink">Refresh</button>
          </form>
        </header>
        {error && <p className="mt-4 text-sm text-lred">{error}</p>}
        {rows && <RunTable rows={rows} onOpen={open} selected={record} />}
        {record && <EventTimeline record={record} onClose={() => setRecord(null)} />}
      </div>
    </div>
  );
}
