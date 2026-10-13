// RESEARCH LOGGING — every life is one record, streamed with everything unfiltered. A grab the
// physics refused is recorded exactly like one that worked.
const MAX_EVENTS = 800;
const MAX_SAMPLES = 900;
const PARTIAL_EVERY_MS = 30000;
const PARTIAL_MIN_EVENTS = 40;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export class Logger {
  constructor({ playerName, character = 'mouse', runNumber = 1, endpoint = '/api/runlog' }) {
    this.endpoint = endpoint;
    this.playerName = playerName || 'ANON';
    this.character = character;
    this.runNumber = runNumber;
    this.runId = uuid();
    this.lifeIndex = 0;
    this.life = null;
    this.onHide = () => { if (document.visibilityState === 'hidden') this.abandon(); };
    this.onPageHide = () => this.abandon();
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPageHide);
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  startLife() {
    this.lifeIndex += 1;
    this.life = {
      start: performance.now(),
      startedAt: new Date().toISOString(),
      events: [],
      samples: [],
      sampleEvery: 1,
      sampleTick: 0,
      fall_count: 0,
      grab_attempts: 0,
      grab_successes: 0,
      reached_table: false,
      status: 'partial',
      lastPartial: performance.now(),
      persisted: false,
      ended: false,
    };
    this.event('spawn', {});
  }

  ms() { return this.life ? Math.round(performance.now() - this.life.start) : 0; }

  // `sample` = a 10Hz position sample ("px"); kept in its own capped buffer.
  event(type, data = {}, sample = false) {
    const L = this.life;
    if (!L || L.ended) return;
    if (sample) {
      L.sampleTick++;
      if (L.sampleTick % L.sampleEvery !== 0) return;
      L.samples.push({ t: this.ms(), type: 'px', ...data });
      if (L.samples.length > MAX_SAMPLES) {
        // the interval doubles and every other sample is kept
        L.samples = L.samples.filter((_, i) => i % 2 === 0);
        L.sampleEvery *= 2;
      }
      return;
    }
    L.events.push({ t: this.ms(), type, ...data });
    if (L.events.length > MAX_EVENTS) L.events.shift();
    if (type === 'fall') L.fall_count++;
    if (type === 'grab_attempt') { L.grab_attempts++; if (data.succeeded) L.grab_successes++; }
    if (type === 'table_reached') { L.reached_table = true; L.status = 'table_reached'; this.persist(); }
    const now = performance.now();
    if (L.events.length >= PARTIAL_MIN_EVENTS && now - L.lastPartial > PARTIAL_EVERY_MS) {
      L.lastPartial = now;
      this.persist();
    }
  }

  record() {
    const L = this.life;
    const events = [...L.events, ...L.samples].sort((a, b) => a.t - b.t);
    return {
      run_id: this.runId,
      life_index: this.lifeIndex,
      run_number: this.runNumber,
      player_name: this.playerName,
      character: this.character,
      status: L.status,
      reached_table: L.reached_table,
      duration_ms: this.ms(),
      fall_count: L.fall_count,
      grab_attempts: L.grab_attempts,
      grab_successes: L.grab_successes,
      started_at: L.startedAt,
      events,
    };
  }

  persist(beacon = false) {
    if (!this.life) return;
    const body = JSON.stringify(this.record());
    this.life.persisted = true;
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }

  endLife(status = 'life_end') {
    const L = this.life;
    if (!L || L.ended) return;
    this.event('life_end', { status });
    L.status = status;
    L.ended = true;
    this.persist();
  }

  abandon() {
    const L = this.life;
    if (!L || L.ended) return;
    L.events.push({ t: this.ms(), type: 'abandoned' });
    L.status = 'abandoned';
    L.ended = true;
    this.persist(true);
  }
}
