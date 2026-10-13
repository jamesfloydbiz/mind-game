# MIND GAME — Base44 MVP build brief (verbatim, from James, 2026-10-13)

This is the spec the rebuild follows. Tuning numbers are used exactly.
Deviations are listed in the README under "Differences from the brief".

```
You are rebuilding "MIND GAME" (Level 03) from scratch. Build this exactly as specified.

PREMISE
A minimalist, physics-driven 3D platformer in the browser. You play a small animal (a mouse)
in a world built to a giant's scale, climbing a colossal tree-table to reach him. It is a test
of how someone thinks when the problem won't cooperate: no tutorial, no hints, no marked path,
no waypoints. The player works out what the world allows by trying things and watching what
happens. Three lives per run, unlimited runs. Everything in the world obeys the same physics —
no scripted exceptions, no invisible walls, no trigger-gated movement. Only physical geometry.

STACK
TanStack Start (React 19, file-based routes under src/routes/, server functions in
src/lib/server-fns.js, entities in base44/entities/) + Tailwind + JavaScript on Vite, Three.js
(^0.171.0) for rendering, and a purpose-built rigid-body core (do NOT use an engine's physics).

FILE LAYOUT
src/game/: constants.js, physics.js, materials.js, world.js, models.js, loadin.js, player.js,
giant.js, logger.js, engine.js
src/components/game/: GameCanvas.jsx, Hud.jsx, Notice.jsx, GameOverScreen.jsx, formatTime.js
src/components/landing/: LandingScreen.jsx, LandingStatusBar.jsx, Stages.jsx, EntryBlock.jsx
src/components/run-log/: RunTable.jsx, EventTimeline.jsx
src/routes/: index.jsx (landing -> game), _authed.jsx + _authed/logs.jsx (researcher viewer),
plus the four auth routes (login, register, forgot-password, reset-password).
base44/entities/RunLog.jsonc

THE PHYSICS CORE (src/game/physics.js)
A small world of bodies, each described identically: mass, friction, grip surface, break
threshold, collision mesh. Shapes: axis-aligned boxes, capsules (a segment + radius), spheres.
createWorld() -> { bodies, dyn, time, seq }. addBox / addCapsule / addSphere push a body;
dynamic bodies also go into dyn. Bodies are static unless dynamic:true; dynamic bodies sleep
after 0.35s below a speed threshold and wake on any contact.
Core query: closestPoint(body, p) -> { point, normal, dist, inside } — signed distance, outward
normal; for a box the "inside" case picks the least-penetration axis. bodiesNear(body,p,r) is a
broad-phase AABB test used by both the player and the dynamic step.
stepWorld(world, dt) advances in fixed 1/60 substeps: integrate dynamic capsules by moving both
ends, then resolve each dynamic body against the world (box-vs-box axis of least penetration,
box-vs-round via closestPoint), apply a floor clamp at y=0, damp, then sleep-check.
breakBody() turns a static surface into a loose, grip-less falling object.
impulseFrom(world, origin, strength, player) is the radial shockwave used by the giant's slam:
within 3.6 units, magnitude strength * exp(-dist/0.75), with an upward bias, applied to every
dynamic body and to the player.
export refreshBounds(b) — recomputes a capsule's pos/half/bounds AND its len/axis from a and b,
so a capsule that is moved by its ends stays correct.

TUNING (src/game/constants.js — use these exact values)
GRAVITY 9.8, PLAYER_RADIUS 0.05, PLAYER_MASS 1, MOVE_SPEED 1.25, CLIMB_SPEED 0.62,
GROUND_ACCEL 16, AIR_ACCEL 5, JUMP_SPEED 1.97, GRAB_REACH 0.21, PUSH_REACH 0.13,
PUSH_SPEED 1.5, SPRINT_MULTIPLIER 1.85, COYOTE_TIME 0.14, TABLE_TOP_Y 2.7,
SPAWN {3.2, 0.06, 2.4}, LIVES_PER_RUN 3, DEATH_HEIGHT 0.9, VOID_Y -4, POISON_SECONDS 3.1,
LOAD_IN_SECONDS 4, LOAD_IN_START_RES 40, FOG_COLOR 0xe7ebe5, FOG_DENSITY 0.3.
The player is 0.05 units in radius under a table whose top is 2.7: roughly 1:50 against the
giant, and the whole design follows from that ratio.

THE WORLD (src/game/world.js)
Ground: a 120 x 1 x 120 box, top at y=0.
The table is a colossal tree cut off flat across the crown, at 1:50 scale:
- slab: half (2.18, 0.125, 1.32) centred at y 2.575, so its top is TABLE_TOP_Y (2.7). Its edges
  are trimmed to sit just clear of the climbing lines so an animal coming up is not stopped by
  a lip; a darker band is drawn around the cut edge.
- crown/apron: a solid heart plus a matching collision box half (2.18, 0.2, 1.32) at y 2.28,
  with braided root capsules running right round it, tightening as they rise, and 20 veins of
  root climbing into the underside of the slab.
- trunk: one solid box, half (2.07, 1.225, 1.34) at y 1.225, grip "none" — the whole footprint
  is solid, so there is no space to walk into. Four leg boxes (half 0.22, 1.225, 0.22 at
  x ±1.85, z ±1.12) also carry grip "none": the root wall is sheer and slick, which is what
  makes the six routes the way up. A dark tapered cylinder reads as the body of the trunk
  between the roots.
- stilt roots: a tapered strandMesh helper (CylinderGeometry(rTo, rFrom, len), oriented with
  setFromUnitVectors) draws every root — flared where it meets the ground, drawn to a point as
  it climbs, because a capsule's rounded end cannot. ~37 wall roots around the rim (rim
  RIM_X 2.06, RIM_Z 1.33, every foot kept inside the collision footprint so the player is
  stopped by root and never by air), 26 crowding the inside, 16 arching out onto the ground in
  two segments, 10 vines strangling the wall, 18 lianas hanging off the crown.
SIX CLIMB ROUTES, each registered as a route so every touch is a logged attempt:
- A: a thick vine capsule (r 0.075) at x 2.42, z -0.85, from y 0.1 to 2.88, that holds, with
  three knots (r 0.1 spheres/capsules) to rest on.
- B: identical at x -2.42, z 0.85, but breakThreshold 27 — it gives way under a climber's load.
- C: a root at (-3.05..-2.36, 0.12..2.8, z -1.25) whose grip is "underside" only: grippable
  from below, slick from above.
- D: a lattice of three root boxes stepping up to a shelf, then a wide overhang that dead-ends
  above it.
- E: a pile of eight loose debris boxes (dynamic, mass 0.22-1.6, sleeping) that can only be
  moved by deliberately pushing them, plus nine loose stone decorations.
- F: like the others at x 2.42, z 1.55, but the upper half (above y 1.28) is grip "none" — wet.
Across the ground, two fans of solid root ridges (12 long roots at 70/85/100/115/130/145/180/
255/270/285/300/315 degrees reaching 2.6-6.2 out, plus 20 short ones at 4/12/20/88/96/104/112/
120/128/174/182/190/264/272/280/288/296/304/354/358 degrees reaching 1.7-3.6) make the ring
around the trunk root on every side while leaving all six routes, the debris pile and the spawn
clear. 40 distant roots and two rocks fade into the fog. Nine loose crumbs sit on the tabletop.

THE PLAYER (src/game/player.js)
Four verbs, applied uniformly to everything: move, jump, grab/release, climb. Plus sprint.
- Move: input is expressed on the camera basis (W/S forward-back, A/D strafe — A goes left, D
  goes right); ground accel 16, air accel 5, top speed 1.25 (x1.85 while Shift is held).
  A model yaw turns to face travel; a step bob and a procedural leg gait run only while the
  animal is actually stepping on something (never mid-air).
- Jump: Space, 0.14s of coyote time; gravity 9.8.
- Grab / E: one press does one of two things. If the animal is on the ground and a loose object
  is in front of it (within PUSH_REACH 0.13, and in front by a facing dot test) it shoves it
  (PUSH_SPEED 1.5) — objects are NEVER moved by brushing or standing on them. Otherwise it
  reaches for the nearest surface within GRAB_REACH 0.21 and grips it, if the surface allows:
  grip "none" refuses, grip "underside" only from a normal pointing down. Hold E to climb:
  the animal sticks to the surface, moves along the surface's tangent basis at CLIMB_SPEED,
  is pulled back to the surface each frame, and detaches if it slips off or tops out (a contact
  normal pointing up). Surfaces with a break threshold accumulate stress while climbed; past it
  the surface snaps and becomes a loose falling object.
- Everything the player touches, tries to grip, pushes, jumps, falls or routes through is
  logged, including refused attempts.
Death and lives: a fall of more than 0.45 is logged; landing from a fall of 0.9 or more onto the
ground kills; below VOID_Y -4 kills; poison kills. The first two deaths respawn the animal at
the spawn immediately; the third ends the run and raises the game-over screen. Touching the
table-top body above TABLE_TOP_Y - 0.03 banks the run as table_reached and starts the giant.

THE GIANT (src/game/models.js + src/game/giant.js)
Built from primitives, in the same palette as the tree (he is part of it): torso box
1.25x1.7x0.75 at y 2.35, a hip cylinder, shoulders box 1.85x0.42x0.8 at 3.15, a neck pivot at
3.35 carrying a head box 1.05x1.25x0.95 with a brow, jaw, dark eye sockets and two glowing eye
spheres (0x66ff00) at (±0.25, 0.78, 0.52). An empty Object3D `eye` sits at (0, 0.78, 0.54) on
the neck — that point is the target of the leap that ends him. Nine beard capsules hang off the
trunk. Arms: a pivot at (±0.92, 3.1, 0); an upper arm capsule (r 0.24, len 1.15) at y -0.62; a
forearm capsule (r 0.2, len 1.25) at (±0.05, -1.72, 0.32) rotated x -0.35; a fist box
0.62x0.4x0.62 at (±0.05, -2.45, 0.62). 26 vine wraps and 10 tendrils make him overgrown. Props:
a cheese wedge (custom 6-vertex wedge geometry, 0.42x0.3x0.36) and a squashed sphere loaf.
Arrival, on a fixed timeline: he walks in from z -9.5 to -2.7 with a bob (0 -> 1.7s), leaning
forward to LEAN 0.4 with the neck tilting to HEAD_TILT 0.25 so his face comes down to the
animal's level; his arms raise (1.7 -> 2.1s, ARM_PULL -2.55) then slam down (2.1 -> 2.4s,
ARM_DOWN -1.72), and at the moment of impact two impulseFrom shockwaves (strength 4.2) fire
from his fists; he holds (to 3.3s). Then he sets things down on the table, one at a time, each
lowered over 0.75s from inside the relevant fist: two chalices at (±0.6, 0.5), the cheese at
(-0.35, -0.55), the loaf at (0.6, -0.9) (3.3 / 4.15 / 5.0 / 5.7s); at 6.55s the stage is
complete. The instant both cups are down he asks his question, as a centred notice over the
world: "Make a choice, one is poison, one is paradise" / "(but both are poison)", for 9s.
HIS LIMBS ARE SOLID: the two fists carry box colliders (half 0.3, 0.2, 0.3) and each arm carries
a chain of three capsules (r 0.25, 0.26, 0.21) running shoulder -> elbow -> wrist -> hand, all
static, grip "all". They are created parked far below the world at y -40 and are synced to the
giant's actual limb world positions every frame he is active, so the arm is something to climb
on and to be cleared out of as it sweeps down. If the animal's body reaches the eye point
(within 0.34), he reels for 0.45s, then falls away over 1.5s and vanishes; anything he was
still holding is dropped onto the table, and his colliders are parked off-world.

THE CUPS (in giant.js, scaled S = 1.5 * 1.25 = 1.875 from the model's own units)
A chalice drawn from primitives: a flared bowl (CylinderGeometry(0.122, 0.075, 0.2, open-ended)
whose underside sits at y 0.165, a rolled lip torus of tube 0.018 at the bowl's top, a flat
bottom disc, a squat foot disc (r 0.085/0.09, 0.018 tall), and a stem (r 0.022-0.028) running
from inside the foot at y 0.02 up into the underside of the bowl at 0.165 — the stem's length is
that one number, and the bowl, lip, net and contents hang off a single group at the same height,
so shortening the stem brings everything with it. Inside: a dark liquid cylinder, a glowing band
(0x66ff00, emissive) proud of its surface, and a point light, with a net of three rings and six
strands over the mouth.
IT IS A VESSEL, NOT A BLOCK — the drawn chalice and its colliders are both written from the same
two numbers (bowl underside, lip tube), so the two never drift apart:
- 10 wall staves (capsules r 0.015*S) following the flare of the bowl from the rim's bottom up to
  just under the top of the lip, so the animal stands on the rim and not inside it.
- 10 lip beads (spheres of radius 0.018*S on the tube's centre circle) set between the staves so
  the two rings make one continuous rolled edge: their tops, outer edge and underside match the
  drawn lip exactly, which is what makes the overhanging rim something the animal can take hold
  of from outside and climb over, and stand on (the 20 crowns sit ~0.07 apart, closer than the
  animal is wide).
- a stem column capsule (r 0.05*S) drawn up into the floor box, closing the space under the bowl
  so the mouth is the only way in; the gaps between column, staves and floor are all narrower
  than the animal, so nothing can be squeezed through.
- a floor box (half 0.07*S, 0.035*S, 0.07*S) whose top sits exactly at the drawn surface of what
  he poured in, carrying meta.cupInterior and the poison.
Standing in it: the moment the animal's ground is a cupInterior surface, its grip is released,
the world's notice is cleared, and it starts to writhe — convulsions that come fast, weaken, and
leave the body still (3.1s) — then it dies of poison and the life ends.

THE ENGINE LOOP (src/game/engine.js)
Renderer: pixels capped at 1.75x DPR, PCFSoft 2048 shadow map, ACES tone mapping, exposure 1.05,
sRGB output. Scene: background and FogExp2 of 0xe7ebe5 at density 0.3, hemisphere + key
directional + ambient. Camera: a 58-degree perspective, orbited by click-drag (yaw from
horizontal drag, lift clamped 0.03-0.95 from vertical), distance easing to 0.9, vertical follow
softer than horizontal so a jump reads as movement rather than a jolt; it auto-aligns behind the
animal when it is moving forward and the player has not looked for 0.8s, and drifts slowly while
idle on the table.
Load-in: for the first LOAD_IN_SECONDS (4s) the scene is rendered into a 64x36 nearest-neighbour
render target and blitted back up through a full-screen quad (the target holds linear values, so
the shader applies pow(rgb, 1/2.2) to match the full-fidelity render); the target's height
climbs from a 40px-equivalent resolution to native over pow(t, 0.8) while the camera pulls in
from 3.4 to 0.9 and swings its yaw behind the animal, physics running at 0.4x speed. Then play
begins. This is why the first frames read as resolving pixels.
Input: keyboard (WASD/arrows, Space, E, Shift) plus gamepad (left stick, A, triggers,
d-pad). Pointer input on the canvas; keys are cleared on window blur.
The animal keeps answering the controls after the giant arrives: the tabletop is somewhere to be,
not the end of play.

LOOK (src/game/materials.js)
Palette: desaturated grey-green, damp, low contrast. Procedural canvas textures — wood (planks
with grain), ground (speckled moss), bark (vertical bezier striations), and a dark weathered slab
— finished with RepeatWrapping and sRGB. Materials: slab #2b2d25-ish dark, slabEdge lighter,
barkDeep/root/rootDark/vine greens, stone, hide/hideDark for the giant, a very dark liquid, and
the one strong colour in the whole world: the goblet's glow, 0x66ff00 emissive.

RESEARCH LOGGING (src/game/logger.js + base44/entities/RunLog.jsonc)
Every life is one record, streamed with everything unfiltered — a grab the physics refused is
recorded exactly like one that worked, so a player who tried something impossible stays
distinguishable from one who stood still.
Entity RunLog fields: run_id (uuid shared by every life of one run), life_index, run_number,
player_name, character (mouse|frog|beetle), status (partial | life_end | table_reached |
abandoned), reached_table, duration_ms, fall_count, grab_attempts, grab_successes, events (array
of objects; required along with run_id, player_name, character). Access rules: create open
(published runs must be writable by any player), read/update/delete admins only.
Event stream, each stamped with ms since the life began: spawn; 10Hz position samples ("px");
contact (deduped at 0.5s, with the surface's label and kind); mount; climb; jump; idle; fall
(height, cause, onto); grab_attempt (target, surface, succeeded); grab; release; push; break
(stress, threshold); route_attempt (route, height_reached, ending, duration_ms);
first_climbable_contact; table_reached; giant_slam; giant_places; choice_prompt; poison; death;
life_end; stage_complete (including giant_slain). Buffers cap at 800 events (oldest dropped) and
900 samples (the interval doubles and every other sample is kept); a "partial" record is
persisted every 30s once a life has 40+ events, endLife persists on death or table, abandon
persists on tab hide/pagehide.
Viewer: a signed-in route at /logs (noindex) loading the 200 newest via server functions that
require a signed-in user. A clinical table — Started, Player, Body, Status, Life, Falls, Grabs,
Run — with a Refresh, and clicking a row loads that record and shows the event timeline with an
Export JSON button (downloads the record as
mind-game-<run_id>-life<life_index>.json). Server functions live in src/lib/server-fns.js and use
a requireUser middleware.

UI AND AESTHETIC (clinical, cold, tablet-interface)
Typography: Oswald throughout, thin/extralight weights, uppercase, wide letterspacing
(utilities mg-track 0.34em, mg-track-lg 0.52em). Landing/boot field: pale near-white #EEF0EC /
hsl(89 12% 93%); ink near-black; cyan #4DD6E8 (hsl(187 77% 61%)) is the ONLY accent; red #E03C31
(hsl 4 74% 54%) appears on the life indicator only. The in-game HUD, however, prints the life box
in #FF0000 on black — that is deliberate.
LANDING SCREEN (/): a top status bar (a small diamond, "MIND GAME LEVEL 03", an editable player
name in wide-tracked caps, a cyan "REFLASH 100%" meter, and a red life box), then a black square
beside the wordmark MIND GAME, a hairline rule, this paragraph verbatim: "A test of how you think
when the problem won't cooperate. You play a mouse in a world built to a giant's scale. Nothing
here explains itself: no tutorial, no hints, no marked path. You work out what the world will let
you do by trying things and watching what happens. Three lives per run. Unlimited runs." Then
"The Stages" list — One: "Reach the top of the table. Several ways up are in front of you and
they look alike. Only some hold your weight."; Two: "Get past the giant's cups. He sets down two
drinks and tells you to choose."; Three: "Cross the open ground to the castle without being hit."
(the stage numerals in cyan) — then the entry block: "ARE YOU READY TO ENTER THE MIND GAME?" and
a square button with a pair of goblet glyphs that flickers on press. Sections rise in sequence
(mg-seq with staggered delays); a soft vignette and faint scanlines sit over the whole page.
Enter anywhere also starts it. On start it dispatches a plain window CustomEvent
"mindgame:start" with { name }; the route only listens for that event and mounts the game.
Player name and last run time persist in localStorage (mg_player_name, mg_last_run_ms), loaded
after mount.
IN GAME: a HUD bottom bar (a gradient scrim; left: "LIVES: 03/03" in a red box; centre, desktop
only: "A / D — Move", "Space — Jump", "E — Grab / Push", "Shift — Sprint", "Drag — Look"; right:
"LAST RUN" and the clock). Notice lines for the giant's question: dark ink over the pale fog,
centred at 22% height, uppercase, wide-tracked, first line larger, staying mounted and fading.
GAME OVER: a 95%-opacity #F0F0F0 overlay with backdrop-blur-sm, showing "LIVES 00/03", the
wordmark-style "GAME OVER", "LAST RUN" with the time, and two square buttons — Restart (solid
black, hover cyan) and Pout (outline, which abandons the run and returns to the landing screen).
Tokens: define the palette in src/index.css under :root and .dark (including --lg-field,
--lg-ink, --lg-cyan, --lg-red, --lg-mute, which keep their values in both themes) and map them in
tailwind.config.js; keep the opacity scale, fonts and radius mapped there too.
Note: a tablet-style boot screen with a character picker and a controls legend exists in the
components (TabletShell, BootTopBar, CharacterPicker, GobletIcon) but the live path is landing ->
game, and the animal is the mouse. The three character models (mouse, frog, beetle) are built
from primitives and differ in shape only — their physics values are identical, so character
choice is purely cosmetic.

ACCEPTANCE — this must all work end to end
Reach the top of the table by any of several visibly similar routes; be refused outright where a
route is slick (grip "none") or grip-only-from-below, and dropped when the breakable one snaps;
climb over the cups' outward-rolled lips and stand on the rim; step off a rim into a cup, land on
the surface, convulse and die of poison; watch the giant walk in, lean down and slam his arms
onto the table, set two cups, the cheese and the loaf down from inside his hands, and ask his
question; climb or leap from a cup's rim into his eye and watch him reel, fall and vanish; die
twice and be put back on the ground, die a third time and get the game-over screen; and find
every life recorded in /logs with its event stream and an Export JSON.
```
