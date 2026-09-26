import type { Stats } from '../core/stats';

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  description: string;
  color: number;
  shadeColor: number;
  stats: Stats;
  /** Items the character starts with. */
  startingItems: string[];
  /**
   * Special rule handled by the player/run code. Keep these few and generic;
   * most character identity should come from stats + starting items.
   */
  passive?: 'rage' | 'glass' | 'regen';
  /** If set, the character is locked until this unlock id is in the save. */
  unlock?: string;
  unlockHint?: string;
  /** Entry in data/lore.ts: the hero's divine parentage, given to dialogue generation. */
  lore?: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'achilles',
    name: 'Achilles',
    title: 'The Invulnerable',
    description: 'Balanced. Hits hard.',
    color: 0xd9b26a,
    shadeColor: 0x8a6a2e,
    stats: { maxHp: 6, speed: 300, damage: 3.5, fireRate: 2.6, shotSpeed: 520, range: 520, luck: 0 },
    startingItems: [],
    lore: 'achilles',
  },
  {
    id: 'atalanta',
    name: 'Atalanta',
    title: 'The Huntress',
    description: 'Fast, rapid arrows, low damage.',
    color: 0x7fc98a,
    shadeColor: 0x3f7a4a,
    stats: { maxHp: 4, speed: 360, damage: 2.2, fireRate: 4.2, shotSpeed: 600, range: 620, luck: 1 },
    startingItems: [],
    lore: 'atalanta',
  },
  {
    id: 'heracles',
    name: 'Heracles',
    title: 'The Strong',
    description: 'Huge health and damage, slow and short range.',
    color: 0xc96a4a,
    shadeColor: 0x7a3a2a,
    stats: { maxHp: 10, speed: 240, damage: 5.5, fireRate: 1.8, shotSpeed: 420, range: 360, luck: 0 },
    startingItems: [],
    lore: 'heracles',
  },
  {
    id: 'orpheus',
    name: 'Orpheus',
    title: 'The Musician',
    description: 'Fragile. Starts with the Lyre (homing shots) and regenerates.',
    color: 0x8a9ad9,
    shadeColor: 0x4a5a9a,
    stats: { maxHp: 4, speed: 300, damage: 2.8, fireRate: 2.4, shotSpeed: 480, range: 560, luck: 2 },
    startingItems: ['lyre_of_orpheus'],
    passive: 'regen',
    lore: 'orpheus',
  },
  {
    id: 'kratos',
    name: 'Kratos',
    title: 'Ghost of Sparta',
    description: 'Spartan Rage: taking damage massively boosts damage for a few seconds.',
    color: 0xe8e0d0,
    shadeColor: 0xb03030,
    stats: { maxHp: 8, speed: 280, damage: 4.5, fireRate: 2.2, shotSpeed: 460, range: 300, luck: 0 },
    startingItems: ['blades_of_chaos'],
    passive: 'rage',
    unlock: 'character:kratos',
    unlockHint: 'Complete the Ghost of Sparta challenges',
    lore: 'kratos',
  },
];

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown character ${id}`);
  return c;
}
