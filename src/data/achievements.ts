import type { GameEventName, GameEvents } from '../core/events';
import type { SaveData } from '../core/save';
import type { StoryState } from '../core/story';

/** Snapshot of the current run exposed to achievement conditions. */
export interface RunSnapshot {
  floor: number;
  characterId: string;
  itemsPickedThisRun: number;
  damageTakenThisRun: number;
  damageTakenThisFloor: number;
  killsThisRun: number;
  elapsedMs: number;
}

export interface AchievementContext {
  save: SaveData;
  run: RunSnapshot;
  /** Moral memory of the current run (karma, flags, deeds). */
  story: StoryState;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** Event that triggers the check. */
  on: GameEventName;
  /** Return true when the condition is met. */
  check: (payload: GameEvents[GameEventName], ctx: AchievementContext) => boolean;
  /** Content unlock granted, e.g. "character:kratos". Optional for pure trophies. */
  reward?: string;
  rewardLabel?: string;
  /** Hide from the menu until earned. */
  secret?: boolean;
}

/** Ghost of Sparta: all of these unlock Kratos. */
export const KRATOS_STEPS = ['spartan', 'kinslayer', 'regicide'];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_blood',
    title: 'First Blood',
    description: 'Kill your first enemy.',
    on: 'enemy_killed',
    check: () => true,
  },
  {
    id: 'spartan',
    title: 'Spartan',
    description: 'Clear the first floor without picking up any item.',
    on: 'floor_cleared',
    check: (p, ctx) => (p as GameEvents['floor_cleared']).floor === 1 && ctx.run.itemsPickedThisRun === 0,
  },
  {
    id: 'kinslayer',
    title: 'Kinslayer',
    description: 'Kill a boss without taking damage on its floor.',
    on: 'boss_killed',
    check: (_p, ctx) => ctx.run.damageTakenThisFloor === 0,
  },
  {
    id: 'regicide',
    title: 'Regicide',
    description: 'Kill 3 bosses in total.',
    on: 'boss_killed',
    check: (_p, ctx) => (ctx.save.counters['boss_kills'] ?? 0) >= 3,
  },
  {
    id: 'ghost_of_sparta',
    title: 'Ghost of Sparta',
    description: 'Complete Spartan, Kinslayer and Regicide.',
    on: 'achievement_unlocked',
    check: (_p, ctx) => KRATOS_STEPS.every((id) => ctx.save.achievements.includes(id)),
    reward: 'character:kratos',
    rewardLabel: 'Kratos unlocked',
  },
  {
    id: 'hecatomb',
    title: 'Hecatomb',
    description: 'Kill 100 enemies in total.',
    on: 'enemy_killed',
    check: (_p, ctx) => (ctx.save.counters['kills'] ?? 0) >= 100,
  },
  {
    id: 'nostos',
    title: 'Nostos',
    description: 'Win a run.',
    on: 'run_won',
    check: () => true,
  },
  {
    id: 'swift_footed',
    title: 'Swift-Footed',
    description: 'Win a run in under 8 minutes.',
    on: 'run_won',
    check: (p) => (p as GameEvents['run_won']).timeMs < 8 * 60 * 1000,
    secret: true,
  },
  {
    id: 'saint',
    title: 'Saint',
    description: 'Spare 10 innocents across your descents.',
    on: 'npc_spared',
    check: (_p, ctx) => (ctx.save.counters['npc_spares'] ?? 0) >= 10,
  },
  {
    id: 'butcher',
    title: 'Butcher',
    description: 'Kill 10 innocents across your descents.',
    on: 'npc_killed',
    check: (_p, ctx) => (ctx.save.counters['npc_kills'] ?? 0) >= 10,
    secret: true,
  },
  {
    id: 'oathbreaker',
    title: 'Oathbreaker',
    description: 'Swear to fight a boss with honour, then slay it with a secret wrung from an innocent.',
    on: 'boss_killed',
    check: (p, ctx) => {
      const { enemyId, floor } = p as GameEvents['boss_killed'];
      return ctx.story.hasFlagOnFloor(`swore_oath_to_${enemyId}`, floor) && ctx.story.hasFlagOnFloor('knows_boss_weakness', floor);
    },
  },
];
