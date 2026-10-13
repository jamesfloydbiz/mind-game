# MIND GAME — Level 03

A physics-driven 3D browser game. You are a mouse in a world built at 1:50 against a giant, climbing a
colossal tree-table to reach him. No tutorial, no hints, no marked path; everything obeys the same
physics. Every attempt is logged for review, including the ones the physics refused.

The spec is James's Base44 MVP brief, kept verbatim in [docs/BRIEF.md](docs/BRIEF.md).

## Run

```bash
bun install
bun run dev        # http://localhost:4280
```

- `/` — landing → game. `/logs` — researcher viewer (password = `LOGS_PASSWORD` in `.env`).
- `bun test` — physics unit tests.
- `bun run build && bun run start` — production build served on :4281.

`.env` (gitignored, see `.env.example`): `LOGS_PASSWORD`, `WORLDLABS_API_KEY`.
Run logs are stored in `data/runlogs.sqlite` (gitignored — they can contain participant data).

## Testing in the browser

`tests/harness.js` drives `window.game` at a fixed step, independent of the frame loop:

```js
const { T } = await import('/tests/harness.js');
T.ready().giant();                 // skip load-in, bring the giant in
T.put(0.6, 3.5, 0.27).run(1, i => ({ fwd: 1, jump: i === 8 }));
T.st(); T.evs();
```

## Differences from the brief

- **Backend:** a local Bun server + SQLite replaces Base44 entities/auth. Create is open; reading
  `/api/runlog` needs `LOGS_PASSWORD`. No TanStack Start.
- **Load-in:** the canvas drawing buffer is shrunk and upscaled with `image-rendering: pixelated`
  instead of a 64×36 render target + blit quad. Same look; tone mapping and sRGB stay correct.
- **Routes D and E** have no coordinates in the brief. D (dead-end lattice) sits on the +z face at
  x 0.65–1.55; E (debris) sits off the −z face, under a hanging root whose lowest point is just out of
  reach from the ground — push a box under it.
- **Route C** is grippable only from below: jump up underneath it from the trunk side and grab.
- **Climbing hand-over:** when a climb runs into another grippable surface (stem → bowl → lip,
  vine → knot), the grip transfers to it.
- **The giant leans in** a little when the animal is up by his cups, so the leap to his eye is
  possible from a rim with a running jump.
- **Backdrop:** a painted sky dome with layered misty hills until a World Labs Marble splat world is
  dropped in at `public/backdrops/world.spz` (rendered with Spark).
