import type { ShotFlags, StatModifiers } from '../core/stats';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  color: number;
  stats?: StatModifiers;
  flags?: ShotFlags;
  /** Heal on pickup, in half-hearts. */
  heal?: number;
  /** Which item pools this item appears in. */
  pools: ('treasure' | 'boss' | 'shop')[];
  /** Relative weight inside a pool (default 1). */
  weight?: number;
}

/**
 * Adding an item = adding an entry. Stats are modifiers (add/mul) so any
 * combination composes automatically; flags change projectile behaviour.
 */
export const ITEMS: ItemDef[] = [
  {
    id: 'hermes_sandals',
    name: "Hermes' Sandals",
    description: 'Speed up',
    color: 0x7fd0ff,
    stats: { speed: { add: 60 } },
    pools: ['treasure', 'shop'],
  },
  {
    id: 'thunderbolt',
    name: 'Thunderbolt of Zeus',
    description: 'Damage up, shots pierce',
    color: 0xffe066,
    stats: { damage: { add: 1.5 } },
    flags: { piercing: true },
    pools: ['treasure', 'boss'],
  },
  {
    id: 'trident',
    name: 'Trident of Poseidon',
    description: 'Triple shot',
    color: 0x3fb7a8,
    stats: { damage: { mul: 0.75 } },
    flags: { extraShots: 2 },
    pools: ['treasure', 'boss'],
  },
  {
    id: 'golden_fleece',
    name: 'Golden Fleece',
    description: 'Health up',
    color: 0xffc34d,
    stats: { maxHp: { add: 2 } },
    heal: 2,
    pools: ['treasure', 'boss', 'shop'],
  },
  {
    id: 'lyre_of_orpheus',
    name: 'Lyre of Orpheus',
    description: 'Homing shots',
    color: 0xc9a0ff,
    flags: { homing: true },
    pools: ['treasure'],
  },
  {
    id: 'aegis',
    name: 'Aegis',
    description: 'Damage up, range up',
    color: 0xb0b8c8,
    stats: { damage: { add: 1 }, range: { add: 120 } },
    pools: ['treasure', 'boss'],
  },
  {
    id: 'apollos_bow',
    name: "Apollo's Bow",
    description: 'Fire rate up, shot speed up',
    color: 0xffa040,
    stats: { fireRate: { add: 0.8 }, shotSpeed: { add: 100 } },
    pools: ['treasure'],
  },
  {
    id: 'ambrosia',
    name: 'Ambrosia',
    description: 'All stats up',
    color: 0xff8ac0,
    stats: {
      damage: { add: 0.5 },
      speed: { add: 20 },
      fireRate: { add: 0.3 },
      range: { add: 60 },
      luck: { add: 1 },
    },
    heal: 2,
    pools: ['boss'],
  },
  {
    id: 'hydra_venom',
    name: 'Hydra Venom',
    description: 'Poison shots',
    color: 0x7fe040,
    flags: { poison: true },
    pools: ['treasure'],
  },
  {
    id: 'cyclops_eye',
    name: "Cyclops' Eye",
    description: 'Massive damage, slow fire rate',
    color: 0xff5050,
    stats: { damage: { mul: 2.2 }, fireRate: { mul: 0.55 } },
    flags: { knockback: 2 },
    pools: ['treasure', 'boss'],
  },
  {
    id: 'bag_of_winds',
    name: 'Bag of Winds',
    description: 'Shots split on walls',
    color: 0xd0f0ff,
    flags: { splitOnWall: true },
    pools: ['treasure'],
  },
  {
    id: 'helm_of_darkness',
    name: 'Helm of Darkness',
    description: 'Spectral shots pass through rocks',
    color: 0x5a4a7a,
    stats: { luck: { add: 1 } },
    flags: { spectral: true },
    pools: ['treasure'],
  },
  {
    id: 'blades_of_chaos',
    name: 'Blades of Chaos',
    description: 'Damage up, range down',
    color: 0xff7030,
    stats: { damage: { add: 1 }, range: { mul: 0.8 } },
    flags: { knockback: 1.5 },
    pools: [],
  },
];

export function getItem(id: string): ItemDef {
  const it = ITEMS.find((x) => x.id === id);
  if (!it) throw new Error(`Unknown item ${id}`);
  return it;
}

export function itemsInPool(pool: ItemDef['pools'][number]): ItemDef[] {
  return ITEMS.filter((i) => i.pools.includes(pool));
}
