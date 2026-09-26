export const TILE = 64;

/** Playable interior of a room, in tiles (Isaac uses 13x7). */
export const ROOM_COLS = 13;
export const ROOM_ROWS = 7;

/** Interior plus the 1-tile wall border on each side. */
export const GRID_COLS = ROOM_COLS + 2;
export const GRID_ROWS = ROOM_ROWS + 2;

export const GAME_WIDTH = GRID_COLS * TILE;
export const GAME_HEIGHT = GRID_ROWS * TILE;

export const PLAYER = {
  /** How quickly the player reaches max speed (px/s²). */
  acceleration: 3400,
  /** How quickly the player stops (px/s²). */
  drag: 2600,
  /** Radians of body tilt at full horizontal speed. */
  lean: 0.09,
  radius: 20,
  /** Invulnerability after being hit, ms. */
  iFramesMs: 700,
  /** Contact damage knockback. */
  knockback: 380,
};

export const ENEMY = {
  /** Enemies are harmless and untargetable while spawning in. */
  spawnDelayMs: 450,
  hitFlashMs: 90,
  knockbackDamping: 0.85,
};

export const PROJECTILE = {
  playerRadius: 9,
  enemyRadius: 8,
  homingTurnRate: 0.08,
  poisonDps: 1.5,
  poisonMs: 2500,
};

export const COLORS = {
  floor: 0x2a2530,
  floorAlt: 0x2f2936,
  wall: 0x4a3f4f,
  wallEdge: 0x1a1620,
  door: 0x7a5c3a,
  doorFrame: 0xc9a45c,
  doorClosed: 0x3a2f2a,
  rock: 0x6b6470,
  rockShade: 0x4b4550,
  playerEye: 0x1a1620,
  tear: 0xe8e0ff,
  enemyTear: 0xff6a5a,
  heart: 0xe04848,
  heartEmpty: 0x3a2a2a,
  coin: 0xf0c040,
  pedestal: 0x8a8090,
  trapdoor: 0x0b0a0f,
  text: '#c9a45c',
  textDim: '#b2a486',
  uiPanel: 0x151a20,
  uiBorder: 0x75674e,
  uiIvory: '#ebe0c5',
  karmaCursed: 0xd96667,
  karmaFallen: 0xc78768,
  karmaNeutral: 0xd0b878,
  karmaJust: 0x86b6a8,
  karmaBlessed: 0xa9d8c4,
};

export type Dir = 'up' | 'down' | 'left' | 'right';

export const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export const DIR_VECTORS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
