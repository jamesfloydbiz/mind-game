// Tuning — exact values from docs/BRIEF.md. Do not change without changing the brief.
export const GRAVITY = 9.8;
export const PLAYER_RADIUS = 0.05;
export const PLAYER_MASS = 1;
export const MOVE_SPEED = 1.25;
export const CLIMB_SPEED = 0.62;
export const GROUND_ACCEL = 16;
export const AIR_ACCEL = 5;
export const JUMP_SPEED = 1.97;
export const GRAB_REACH = 0.21;
export const PUSH_REACH = 0.13;
export const PUSH_SPEED = 1.5;
export const SPRINT_MULTIPLIER = 1.85;
export const COYOTE_TIME = 0.14;
// James (2026-10-13): the tree, table, giant and cups are 1.6x the brief's size; the mouse is not.
export const WORLD_SCALE = 1.6;
export const TABLE_TOP_Y = 2.7 * WORLD_SCALE;
// Brief had {3.2, 0.06, 2.4}; moved further out (James, 2026-10-13) so the tree is approached
// out of the mist rather than started beside.
export const SPAWN = { x: 7.8, y: 0.06, z: 6.2 };
export const LIVES_PER_RUN = 3;
export const DEATH_HEIGHT = 0.9;
export const FALL_LOG_HEIGHT = 0.45;
export const VOID_Y = -4;
export const POISON_SECONDS = 3.1;
export const LOAD_IN_SECONDS = 4;
export const LOAD_IN_START_RES = 40;
export const FOG_COLOR = 0xe7ebe5;
export const FOG_DENSITY = 0.3;

// Physics core
export const SUBSTEP = 1 / 60;
export const SLEEP_TIME = 0.35;
export const SLEEP_SPEED = 0.06;
export const SHOCK_RADIUS = 3.6 * WORLD_SCALE;
export const SHOCK_FALLOFF = 0.75 * WORLD_SCALE;

// Giant timeline
export const LEAN = 0.4;
export const HEAD_TILT = 0.25;
export const ARM_PULL = -2.55;
export const ARM_DOWN = -1.72;
export const SLAM_STRENGTH = 4.2;
export const EYE_HIT_RADIUS = 0.34;
export const CUP_S = 1.5 * 1.25 * WORLD_SCALE;
export const GLOW = 0x66ff00;
