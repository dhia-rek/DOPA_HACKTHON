import type { Rng } from '../core/rng';
import type { ShotFlags, StatModifiers } from '../core/stats';

/**
 * The gods who watch the run. Orbs and shrine offerings are god-coloured and
 * feed `StoryState.divineAttention`; the Director reads that vector to pick
 * boons, curses and which god's champion shows up as the boss. After a room
 * is cleared a god may also grant a blessing: a permanent modifier set folded
 * into the same stat pipeline as items (see RunState.grantRandomBlessing and
 * BlessingScene, which animates the god's `god_<id>` portrait).
 */
export type GodId = 'ares' | 'athena' | 'hades' | 'apollo' | 'poseidon' | 'hermes';

export interface GodDef {
  id: GodId;
  name: string;
  epithet: string;
  /** Orb / shrine tint. */
  color: number;
  /** The god whose favour offends this one; the rival tends to send the boss. */
  rival: GodId;
  /** What pleases this god — used in prompts, not code. */
  likes: string;
  /** Spoken when the blessing lands. */
  line: string;
  blessing: {
    name: string;
    description: string;
    stats?: StatModifiers;
    flags?: ShotFlags;
    /** Heal on grant, in half-hearts. */
    heal?: number;
  };
}

export const GODS: GodDef[] = [
  {
    id: 'ares',
    name: 'Ares',
    epithet: 'Bane of Mortals',
    color: 0xd94a3a,
    rival: 'athena',
    likes: 'aggression, fast room clears, defiance',
    line: 'Let them feel every blow.',
    blessing: { name: 'Bloodlust', description: 'Damage up, heavy knockback', stats: { damage: { mul: 1.2 } }, flags: { knockback: 1.6 } },
  },
  {
    id: 'athena',
    name: 'Athena',
    epithet: 'Grey-eyed Wisdom',
    color: 0xd9c76a,
    rival: 'ares',
    likes: 'mercy, honour, flawless rooms',
    line: 'Courage is knowing what to protect.',
    blessing: { name: 'Aegis of Wisdom', description: 'Health up, healed', stats: { maxHp: { add: 2 } }, heal: 2 },
  },
  {
    id: 'hades',
    name: 'Hades',
    epithet: 'Lord of the Dead',
    color: 0x6a4fa0,
    rival: 'apollo',
    likes: 'killing, cruelty, oaths kept to the letter',
    line: 'Everything below is already mine. Take some of it with you.',
    blessing: { name: 'Shade Walk', description: 'Shots pass through rocks, damage up', stats: { damage: { add: 0.5 } }, flags: { spectral: true } },
  },
  {
    id: 'apollo',
    name: 'Apollo',
    epithet: 'The Far-Shooter',
    color: 0xf2e4a2,
    rival: 'hades',
    likes: 'sparing, healing, truth',
    line: 'Loose, and the sun guides the arrow.',
    blessing: { name: 'Sunlit Aim', description: 'Fire rate and range up', stats: { fireRate: { mul: 1.25 }, range: { add: 80 } } },
  },
  {
    id: 'poseidon',
    name: 'Poseidon',
    epithet: 'Earth-Shaker',
    color: 0x3f9fd9,
    rival: 'hermes',
    likes: 'sacrifice, patience, respect',
    line: 'The tide breaks on every shore at once.',
    blessing: { name: 'Tidal Surge', description: 'Shots split on walls, shot speed up', stats: { shotSpeed: { add: 60 } }, flags: { splitOnWall: true } },
  },
  {
    id: 'hermes',
    name: 'Hermes',
    epithet: 'Swift Messenger',
    color: 0x7fd7b0,
    rival: 'poseidon',
    likes: 'cunning, gold, lies that work',
    line: 'Be gone before they know you came.',
    blessing: { name: 'Winged Step', description: 'Speed and shot speed up', stats: { speed: { add: 50 }, shotSpeed: { add: 60 } } },
  },
];

export const GOD_IDS: readonly GodId[] = GODS.map((g) => g.id);

export function getGod(id: GodId): GodDef {
  const g = GODS.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown god: ${id}`);
  return g;
}

/** Random god, avoiding those in `exclude` until every god has been drawn. */
export function pickGod(rng: Rng, exclude: readonly GodId[]): GodDef {
  const pool = GODS.filter((g) => !exclude.includes(g.id));
  const from = pool.length ? pool : GODS;
  return from[Math.min(from.length - 1, Math.floor(rng.float(0, 1) * from.length))];
}
