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

Changes James asked for on 2026-10-13, layered on the brief in `docs/BRIEF.md`:

- **Scale:** tree, table, giant and cups are 1.6x the brief (`WORLD_SCALE`); the mouse and all its
  movement numbers are unchanged. Table top is 4.32.
- **The tree is the way up.** The six separate routes (vines, lattice, debris root) are gone. The
  trunk is an hourglass of 58 braided roots — round and lobed, flared foot, pinched waist, wide
  crown — and every root can be gripped and climbed. They look alike, and only some hold:
  `sound` (reach the table), `rotten` (snap after a second or two of weight), `wet` (slick above
  the waist, faint sheen). Root tops curl out round the table's rim, so a sound root leads onto it.
  Climbing into a neighbouring root hands the grip over; holding E keeps you climbing.
  Every root is a collider of the size drawn (no invisible walls).
- **Ground roots:** ~190, curving, arching up and dipping under the soil, densest between the spawn
  and the tree. All climbable. Big falls that land at ground level (on roots too) kill.
- **The table is already set:** cups, cheese and loaf are there from the start. Reaching the top
  brings the giant in; he slams his hands down, says "Make a choice, one is poison, one is
  paradise", then leans in until his eye hangs just above the table.
- **Killing the giant:** reach his eye (a jump from the table in front of his face, or climbing his
  jaw/head, which are solid). You are then in it: mash any key/button 18 times to finish him (shake
  and ichor); stop for 2.2s and he shakes you off. He topples back and his body lies on the ground,
  solid and walkable.
- **Cup lip:** thicker, one continuous ring; narrow tops can be stood and balanced on.
- **Look:** height fog (thick low mist, thinner higher up) instead of uniform FogExp2; spawn moved
  out to (7.8, 0.06, 6.2); the brief's 40 distant roots are dropped (they read as pale spikes).
- **Backend:** a local Bun server + SQLite replaces Base44 entities/auth (`/logs` needs
  `LOGS_PASSWORD`). Load-in shrinks the canvas buffer instead of a 64x36 render target.
- **Backdrop:** a painted sky dome until a Marble splat world is dropped in at
  `public/backdrops/world.spz`.
