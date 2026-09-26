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
  maxSpeed: 320,
  acceleration: 2400,
  drag: 1800,
  radius: 20,
};

export const COLORS = {
  floor: 0x2a2530,
  floorAlt: 0x2f2936,
  wall: 0x4a3f4f,
  wallEdge: 0x1a1620,
  door: 0x7a5c3a,
  doorFrame: 0xc9a45c,
  rock: 0x6b6470,
  rockShade: 0x4b4550,
  player: 0xd9b26a,
  playerShade: 0x8a6a2e,
  playerEye: 0x1a1620,
};

export type Dir = 'up' | 'down' | 'left' | 'right';

export const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};
