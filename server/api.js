// RunLog storage (replaces the Base44 entity). Create is open so any player's run can be written;
// reading needs the researcher password (LOGS_PASSWORD in .env).
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
mkdirSync(join(ROOT, 'data'), { recursive: true });
const db = new Database(join(ROOT, 'data', 'runlogs.sqlite'));
db.run(`CREATE TABLE IF NOT EXISTS run_logs (
  run_id TEXT NOT NULL, life_index INTEGER NOT NULL, run_number INTEGER, player_name TEXT NOT NULL,
  character TEXT NOT NULL, status TEXT, reached_table INTEGER, duration_ms INTEGER, fall_count INTEGER,
  grab_attempts INTEGER, grab_successes INTEGER, started_at TEXT, events TEXT NOT NULL,
  updated_at TEXT, PRIMARY KEY (run_id, life_index))`);

const upsert = db.prepare(`INSERT INTO run_logs VALUES ($run_id,$life_index,$run_number,$player_name,$character,$status,
  $reached_table,$duration_ms,$fall_count,$grab_attempts,$grab_successes,$started_at,$events,$updated_at)
  ON CONFLICT(run_id, life_index) DO UPDATE SET status=excluded.status, reached_table=MAX(reached_table, excluded.reached_table),
  duration_ms=excluded.duration_ms, fall_count=excluded.fall_count, grab_attempts=excluded.grab_attempts,
  grab_successes=excluded.grab_successes, events=excluded.events, updated_at=excluded.updated_at`);

const STATUSES = new Set(['partial', 'life_end', 'table_reached', 'abandoned', 'giant_slain']);
const CHARACTERS = new Set(['mouse', 'frog', 'beetle']);

function password() { return process.env.LOGS_PASSWORD || ''; }
function authed(req) {
  const p = password();
  return p && req.headers.get('x-logs-password') === p;
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export async function handleApi(req) {
  const url = new URL(req.url);
  if (url.pathname === '/api/runlog' && req.method === 'POST') {
    let r;
    try { r = JSON.parse(await req.text()); } catch { return json({ error: 'bad json' }, 400); }
    if (!r.run_id || !r.player_name || !r.character || !Array.isArray(r.events)) return json({ error: 'missing fields' }, 400);
    if (!CHARACTERS.has(r.character) || !STATUSES.has(r.status)) return json({ error: 'bad enum' }, 400);
    upsert.run({
      $run_id: String(r.run_id).slice(0, 64), $life_index: r.life_index | 0, $run_number: r.run_number | 0,
      $player_name: String(r.player_name).slice(0, 64), $character: r.character, $status: r.status,
      $reached_table: r.reached_table ? 1 : 0, $duration_ms: r.duration_ms | 0, $fall_count: r.fall_count | 0,
      $grab_attempts: r.grab_attempts | 0, $grab_successes: r.grab_successes | 0,
      $started_at: String(r.started_at || ''), $events: JSON.stringify(r.events.slice(0, 2000)), $updated_at: new Date().toISOString(),
    });
    return json({ ok: true });
  }
  if (url.pathname === '/api/runlog' && req.method === 'GET') {
    if (!password()) return json({ error: 'LOGS_PASSWORD is not set in .env' }, 503);
    if (!authed(req)) return json({ error: 'unauthorised' }, 401);
    const id = url.searchParams.get('run_id');
    if (id) {
      const row = db.query('SELECT * FROM run_logs WHERE run_id=? AND life_index=?').get(id, Number(url.searchParams.get('life') || 1));
      if (!row) return json({ error: 'not found' }, 404);
      return json({ ...row, reached_table: !!row.reached_table, events: JSON.parse(row.events) });
    }
    const rows = db.query(`SELECT run_id, life_index, run_number, player_name, character, status, reached_table, duration_ms,
      fall_count, grab_attempts, grab_successes, started_at, updated_at FROM run_logs ORDER BY started_at DESC, life_index DESC LIMIT 200`).all();
    return json(rows.map((r) => ({ ...r, reached_table: !!r.reached_table })));
  }
  return null;
}
