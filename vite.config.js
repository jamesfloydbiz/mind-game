import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev: Vite serves the app and hands /api/* to the same handler the production server uses.
// Run under Bun (`bun run dev`) so bun:sqlite is available.
function api() {
  return {
    name: 'mind-game-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        const { handleApi } = await import('./server/api.js');
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body });
        const out = await handleApi(request);
        if (!out) return next();
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await out.arrayBuffer()));
      });
    },
  };
}

// GitHub Pages serves the site at /mind-game/ (set GH_PAGES=1 for that build)
export default defineConfig({
  base: process.env.GH_PAGES ? '/mind-game/' : '/',
  plugins: [react(), tailwindcss(), api()],
  server: { port: 4280, strictPort: true },
});
