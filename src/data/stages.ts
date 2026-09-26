export interface StageDef {
  id: string;
  name: string;
  /** Enemy ids that can spawn in normal rooms. */
  enemyPool: string[];
  /** Boss ids; one is picked per floor. */
  bossPool: string[];
  /** Number of rooms on this floor, inclusive range. */
  roomCount: [number, number];
  /** Enemies per normal room, inclusive range. */
  enemiesPerRoom: [number, number];
  /** Innocent NPC ids that may appear in normal rooms (see EnemyDef.innocent). */
  npcPool?: string[];
  /** Chance (0..1) that a normal room contains one NPC. */
  npcChance?: number;
  palette: {
    floor: number;
    wall: number;
    accent: number;
  };
}

/**
 * Floors are visited in order; adding a floor = adding a stage.
 * The last stage's boss ends the run with a win.
 */
export const STAGES: StageDef[] = [
  {
    id: 'polis',
    name: 'Ruined Polis',
    enemyPool: ['bandit', 'harpy', 'centaur_archer', 'boar'],
    bossPool: ['minotaur'],
    roomCount: [5, 7],
    enemiesPerRoom: [1, 3],
    npcPool: ['villager', 'priestess', 'child'],
    npcChance: 0.35,
    palette: { floor: 0xffffff, wall: 0xffffff, accent: 0xc9a45c },
  },
  {
    id: 'labyrinth',
    name: 'Labyrinth of Knossos',
    enemyPool: ['skeleton', 'living_statue', 'boar', 'centaur_archer', 'harpy'],
    bossPool: ['hydra', 'minotaur'],
    roomCount: [9, 12],
    enemiesPerRoom: [3, 5],
    npcPool: ['wounded_soldier', 'priestess', 'child'],
    npcChance: 0.2,
    palette: { floor: 0x9fb4d8, wall: 0x8898c0, accent: 0x7fd0ff },
  },
];
