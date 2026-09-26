import { ROOM_COLS, ROOM_ROWS } from '../config';

/**
 * Room layouts are 13x7 ASCII grids (interior only, walls are implicit).
 *   .  floor
 *   #  rock (blocks movement)
 *   P  pit (blocks movement, drawn dark)
 *
 * Adding a room = adding an entry here.
 */
export const ROOM_TEMPLATES: string[][] = [
  [
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  [
    '.............',
    '..#.......#..',
    '.............',
    '.............',
    '.............',
    '..#.......#..',
    '.............',
  ],
  [
    '.............',
    '.............',
    '....#...#....',
    '......#......',
    '....#...#....',
    '.............',
    '.............',
  ],
  [
    '.............',
    '.#.........#.',
    '.#..PPPPP..#.',
    '....P...P....',
    '.#..PPPPP..#.',
    '.#.........#.',
    '.............',
  ],
  [
    '.............',
    '.....###.....',
    '.............',
    '.#.........#.',
    '.............',
    '.....###.....',
    '.............',
  ],
];

for (const t of ROOM_TEMPLATES) {
  if (t.length !== ROOM_ROWS || t.some((row) => row.length !== ROOM_COLS)) {
    throw new Error(`Room template must be ${ROOM_COLS}x${ROOM_ROWS}`);
  }
}
