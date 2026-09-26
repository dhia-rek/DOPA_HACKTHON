import { ROOM_COLS, ROOM_ROWS } from '../config';
import { Rng } from '../core/rng';

/**
 * Procedural room layouts in the same 13x7 ASCII format as data/rooms.ts.
 * Every generated room is guaranteed to have a walkable path between all four
 * door tiles, and keeps the door approach tiles clear.
 */
export interface RoomGenOptions {
  /** 0..1 how much of the interior becomes obstacles. */
  density: number;
  /** Enemy spawn slots to place. */
  enemySlots: number;
  /** Mirror layout horizontally/vertically for that hand-crafted look. */
  symmetry?: 'none' | 'horizontal' | 'both';
}

const MID_C = Math.floor(ROOM_COLS / 2);
const MID_R = Math.floor(ROOM_ROWS / 2);

/**
 * Shrine room: an altar ('A') on a raised dais flanked by pillars. Same ASCII
 * format as data/rooms.ts; 'A' is only meaningful in shrine rooms.
 */
export const SHRINE_TEMPLATES: string[][] = [
  [
    '.............',
    '...#.....#...',
    '.............',
    '......A......',
    '.............',
    '...#.....#...',
    '.............',
  ],
  [
    '.............',
    '.#.........#.',
    '....PP.PP....',
    '....P.A.P....',
    '....PP.PP....',
    '.#.........#.',
    '.............',
  ],
];

/** Interior tiles right in front of each door; never blocked. */
const DOOR_APPROACHES: [number, number][] = [
  [MID_C, 0],
  [MID_C, 1],
  [MID_C, ROOM_ROWS - 1],
  [MID_C, ROOM_ROWS - 2],
  [0, MID_R],
  [1, MID_R],
  [ROOM_COLS - 1, MID_R],
  [ROOM_COLS - 2, MID_R],
];

export function generateRoom(rng: Rng, opts: RoomGenOptions): string[] {
  for (let attempt = 0; attempt < 30; attempt++) {
    const grid = tryGenerate(rng, opts);
    if (grid) return grid;
  }
  return Array.from({ length: ROOM_ROWS }, () => '.'.repeat(ROOM_COLS));
}

function tryGenerate(rng: Rng, opts: RoomGenOptions): string[] | null {
  const g: string[][] = Array.from({ length: ROOM_ROWS }, () => Array(ROOM_COLS).fill('.'));
  const symmetry = opts.symmetry ?? rng.pick(['none', 'horizontal', 'both', 'both'] as const);

  const isProtected = (c: number, r: number): boolean => DOOR_APPROACHES.some(([pc, pr]) => pc === c && pr === r);

  const place = (c: number, r: number, ch: string): void => {
    const targets: [number, number][] = [[c, r]];
    if (symmetry === 'horizontal' || symmetry === 'both') targets.push([ROOM_COLS - 1 - c, r]);
    if (symmetry === 'both') {
      targets.push([c, ROOM_ROWS - 1 - r]);
      targets.push([ROOM_COLS - 1 - c, ROOM_ROWS - 1 - r]);
    }
    for (const [tc, tr] of targets) {
      if (!isProtected(tc, tr)) g[tr][tc] = ch;
    }
  };

  // Obstacles: scatter singles plus a few short lines/blocks.
  const cells = Math.round(ROOM_COLS * ROOM_ROWS * opts.density);
  let placed = 0;
  let guard = 0;
  while (placed < cells && guard++ < 400) {
    const c = rng.int(0, ROOM_COLS - 1);
    const r = rng.int(0, ROOM_ROWS - 1);
    if (g[r][c] !== '.' || isProtected(c, r)) continue;
    const ch = rng.chance(0.25) ? 'P' : '#';
    const shape = rng.pick(['single', 'single', 'hline', 'vline', 'block']);
    const len = rng.int(2, 3);
    if (shape === 'single') {
      place(c, r, ch);
      placed++;
    } else if (shape === 'hline') {
      for (let i = 0; i < len && c + i < ROOM_COLS; i++) place(c + i, r, ch);
      placed += len;
    } else if (shape === 'vline') {
      for (let i = 0; i < len && r + i < ROOM_ROWS; i++) place(c, r + i, ch);
      placed += len;
    } else {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (c + i < ROOM_COLS && r + j < ROOM_ROWS) place(c + i, r + j, ch);
      placed += 4;
    }
  }

  if (!doorsConnected(g)) return null;

  // Enemy slots on free tiles away from the doors.
  const free: [number, number][] = [];
  for (let r = 0; r < ROOM_ROWS; r++) {
    for (let c = 0; c < ROOM_COLS; c++) {
      const nearDoor = DOOR_APPROACHES.some(([pc, pr]) => Math.abs(pc - c) + Math.abs(pr - r) <= 1);
      if (g[r][c] === '.' && !nearDoor) free.push([c, r]);
    }
  }
  if (free.length < opts.enemySlots) return null;
  rng.shuffle(free);
  for (let i = 0; i < opts.enemySlots; i++) {
    const [c, r] = free[i];
    g[r][c] = 'E';
  }

  return g.map((row) => row.join(''));
}

/** Flood fill from the top door approach; all four approaches must be reached. */
function doorsConnected(g: string[][]): boolean {
  const seen = new Set<string>();
  const stack: [number, number][] = [[MID_C, 0]];
  while (stack.length) {
    const [c, r] = stack.pop()!;
    const k = `${c},${r}`;
    if (seen.has(k)) continue;
    if (c < 0 || r < 0 || c >= ROOM_COLS || r >= ROOM_ROWS) continue;
    if (g[r][c] !== '.') continue;
    seen.add(k);
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return DOOR_APPROACHES.every(([c, r]) => seen.has(`${c},${r}`));
}
