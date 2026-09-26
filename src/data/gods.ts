import type { Rng } from '../core/rng';
import type { ShotFlags, StatModifiers } from '../core/stats';

export interface GodDef {
  id: string;
  name: string;
  epithet: string;
  color: number;
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

/**
 * Gods who may take notice of the hero after a room is cleared. A blessing is
 * a permanent modifier set folded into the same stat pipeline as items, so it
 * composes with everything; the god's portrait animates in (BlessingScene).
 */
export const GODS: GodDef[] = [
  {
    id: 'zeus',
    name: 'Zeus',
    epithet: 'Lord of the Sky',
    color: 0xffe066,
    line: 'Strike as the storm strikes.',
    blessing: { name: 'Thunder of Olympus', description: 'Damage up', stats: { damage: { add: 1 } } },
  },
  {
    id: 'athena',
    name: 'Athena',
    epithet: 'Grey-eyed Wisdom',
    color: 0xc9d6e8,
    line: 'Courage is knowing what to protect.',
    blessing: { name: 'Aegis of Wisdom', description: 'Health up, healed', stats: { maxHp: { add: 2 } }, heal: 2 },
  },
  {
    id: 'apollo',
    name: 'Apollo',
    epithet: 'The Far-Shooter',
    color: 0xffc94d,
    line: 'Loose, and the sun guides the arrow.',
    blessing: { name: 'Sunlit Aim', description: 'Fire rate and range up', stats: { fireRate: { mul: 1.25 }, range: { add: 80 } } },
  },
  {
    id: 'hermes',
    name: 'Hermes',
    epithet: 'Swift Messenger',
    color: 0x7fd0ff,
    line: 'Be gone before they know you came.',
    blessing: { name: 'Winged Step', description: 'Speed and shot speed up', stats: { speed: { add: 50 }, shotSpeed: { add: 60 } } },
  },
  {
    id: 'ares',
    name: 'Ares',
    epithet: 'Bane of Mortals',
    color: 0xe04848,
    line: 'Let them feel every blow.',
    blessing: { name: 'Bloodlust', description: 'Damage up, heavy knockback', stats: { damage: { mul: 1.2 } }, flags: { knockback: 1.6 } },
  },
  {
    id: 'poseidon',
    name: 'Poseidon',
    epithet: 'Earth-Shaker',
    color: 0x3fb8b0,
    line: 'The tide breaks on every shore at once.',
    blessing: { name: 'Tidal Surge', description: 'Shots split on walls, shot speed up', stats: { shotSpeed: { add: 60 } }, flags: { splitOnWall: true } },
  },
];

export function getGod(id: string): GodDef {
  const g = GODS.find((x) => x.id === id);
  if (!g) throw new Error(`unknown god: ${id}`);
  return g;
}

/** Random god, avoiding those in `exclude` until every god has been drawn. */
export function pickGod(rng: Rng, exclude: string[]): GodDef {
  const pool = GODS.filter((g) => !exclude.includes(g.id));
  const from = pool.length ? pool : GODS;
  return from[Math.min(from.length - 1, Math.floor(rng.float(0, 1) * from.length))];
}
