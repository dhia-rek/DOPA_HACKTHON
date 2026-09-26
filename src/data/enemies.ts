/**
 * Enemy behaviours are implemented in systems/behaviours.ts.
 * New behaviours = a new function there; new enemies = a new entry here.
 */
export type BehaviourName = 'chaser' | 'wanderer' | 'flee' | 'shooter' | 'charger' | 'orbiter' | 'boss_minotaur' | 'boss_hydra';

export type EnemyShape = 'circle' | 'square' | 'triangle' | 'diamond';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  /** Contact damage in half-hearts. */
  damage: number;
  behaviour: BehaviourName;
  shape: EnemyShape;
  color: number;
  /** Body radius in px. */
  radius: number;
  isBoss?: boolean;
  /** Shooter tuning. */
  fireInterval?: number;
  shotSpeed?: number;
  /** Charger tuning. */
  chargeSpeed?: number;
  /** Chance to drop a pickup on death. */
  dropChance?: number;
  /**
   * Non-hostile NPC: never damages, never blocks room clearing, talks when
   * approached. Killing it is a deed the story remembers.
   */
  innocent?: boolean;
  /** One-line personality used by dialogue generation (bosses and NPCs). */
  persona?: string;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'bandit',
    name: 'Bandit',
    hp: 8,
    speed: 110,
    damage: 1,
    behaviour: 'chaser',
    shape: 'circle',
    color: 0xa05a5a,
    radius: 18,
    dropChance: 0.08,
  },
  {
    id: 'harpy',
    name: 'Harpy',
    hp: 6,
    speed: 170,
    damage: 1,
    behaviour: 'wanderer',
    shape: 'triangle',
    color: 0xc08a40,
    radius: 16,
    dropChance: 0.08,
  },
  {
    id: 'centaur_archer',
    name: 'Centaur Archer',
    hp: 10,
    speed: 90,
    damage: 1,
    behaviour: 'shooter',
    shape: 'diamond',
    color: 0x8a6a4a,
    radius: 20,
    fireInterval: 1600,
    shotSpeed: 260,
    dropChance: 0.12,
  },
  {
    id: 'boar',
    name: 'Calydonian Boar',
    hp: 14,
    speed: 60,
    damage: 2,
    behaviour: 'charger',
    shape: 'square',
    color: 0x6a4a3a,
    radius: 22,
    chargeSpeed: 420,
    dropChance: 0.15,
  },
  {
    id: 'skeleton',
    name: 'Skeleton Hoplite',
    hp: 12,
    speed: 130,
    damage: 1,
    behaviour: 'chaser',
    shape: 'square',
    color: 0xd8d0c0,
    radius: 18,
    dropChance: 0.1,
  },
  {
    id: 'living_statue',
    name: 'Living Statue',
    hp: 18,
    speed: 75,
    damage: 2,
    behaviour: 'orbiter',
    shape: 'diamond',
    color: 0x9a9aa8,
    radius: 22,
    fireInterval: 2200,
    shotSpeed: 220,
    dropChance: 0.12,
  },
  {
    id: 'minotaur',
    name: 'Minotaur',
    hp: 90,
    speed: 80,
    damage: 2,
    behaviour: 'boss_minotaur',
    shape: 'square',
    color: 0x7a3a2a,
    radius: 34,
    chargeSpeed: 520,
    isBoss: true,
    persona: 'Proud, wounded, hates being called a monster; respects honour, despises cowards.',
  },
  {
    id: 'hydra',
    name: 'Hydra',
    hp: 130,
    speed: 60,
    damage: 2,
    behaviour: 'boss_hydra',
    shape: 'circle',
    color: 0x3a7a4a,
    radius: 38,
    fireInterval: 900,
    shotSpeed: 300,
    isBoss: true,
    persona: 'Many-voiced, ancient, speaks in riddles; each head interrupts the others.',
  },
  {
    id: 'villager',
    name: 'Shepherd',
    hp: 4,
    speed: 150,
    damage: 0,
    behaviour: 'flee',
    shape: 'circle',
    color: 0xd8c8a0,
    radius: 15,
    innocent: true,
    persona: 'Frightened peasant who knows local rumours; bargains for their life.',
  },
];

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown enemy ${id}`);
  return e;
}
