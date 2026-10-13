// Production server: serves the built app (dist/) and the RunLog API. `bun run build && bun run start`.
import { handleApi } from './api.js';
import { join } from 'node:path';

const DIST = join(import.meta.dir, '..', 'dist');
const port = Number(process.env.PORT || 4281);

Bun.serve({
  port,
  async fetch(req) {
    const api = await handleApi(req);
    if (api) return api;
    const path = new URL(req.url).pathname;
    const safe = path.replace(/\.\.+/g, '');
    const file = Bun.file(join(DIST, safe === '/' ? 'index.html' : safe));
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(join(DIST, 'index.html'))); // SPA fallback (/logs)
  },
});
console.log(`MIND GAME on http://localhost:${port}`);
