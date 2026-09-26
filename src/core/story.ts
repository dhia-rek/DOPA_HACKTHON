import { events } from './events';

/**
 * The run's moral/narrative memory. Everything the player does that the story
 * should "remember" is recorded here as a Deed; dialogue generation reads a
 * snapshot of it, and bosses read the accumulated modifiers.
 *
 * Karma: -100 (monstrous) .. +100 (heroic). 0 is neutral.
 */
export type DeedKind =
  | 'npc_killed'
  | 'npc_spared'
  | 'boss_killed'
  | 'dialogue_choice'
  | 'item_taken'
  | 'custom';

export interface Deed {
  kind: DeedKind;
  /** Free-form id: npc id, boss id, dialogue option id… */
  subject: string;
  floor: number;
  karmaDelta: number;
  /** Short human sentence for the LLM prompt, e.g. "Killed the shepherd Lykos on floor 2". */
  summary: string;
}

/** Multipliers a boss gets from the story (dialogue outcomes, karma). All default to 1. */
export interface BossMods {
  hpMul: number;
  damageMul: number;
  speedMul: number;
}

/** What the LLM (or mock) is allowed to know about the run. Plain JSON. */
export interface StorySnapshot {
  characterId: string;
  characterName: string;
  floor: number;
  stageName: string;
  karma: number;
  /** "heroic" | "neutral" | "cruel" derived from karma; convenient for prompts. */
  alignment: 'heroic' | 'neutral' | 'cruel';
  flags: string[];
  npcsKilled: number;
  npcsSpared: number;
  bossesKilled: string[];
  items: string[];
  recentDeeds: string[];
}

export class StoryState {
  karma = 0;
  readonly flags = new Set<string>();
  /** Floor on which each flag was last set; flags outlive floors, some checks need the encounter. */
  readonly flagFloors = new Map<string, number>();
  readonly deeds: Deed[] = [];
  /** Floor of the most recent deed; flags added without a floor are attributed to it. */
  private currentFloor = 1;
  /** Accumulated boss modifiers from dialogue outcomes; consumed per boss fight. */
  bossMods: BossMods = { hpMul: 1, damageMul: 1, speedMul: 1 };

  record(deed: Deed): void {
    this.deeds.push(deed);
    this.currentFloor = deed.floor;
    if (deed.karmaDelta) this.adjustKarma(deed.karmaDelta);
  }

  adjustKarma(delta: number): void {
    this.karma = Math.max(-100, Math.min(100, this.karma + delta));
    events.emit('story_changed', { karma: this.karma });
  }

  addFlag(flag: string, floor = this.currentFloor): void {
    this.flags.add(flag);
    this.flagFloors.set(flag, floor);
  }

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  /** True if the flag is set and was last set on the given floor. */
  hasFlagOnFloor(flag: string, floor: number): boolean {
    return this.flags.has(flag) && this.flagFloors.get(flag) === floor;
  }

  applyBossMods(mods: Partial<BossMods>): void {
    this.bossMods = {
      hpMul: this.bossMods.hpMul * (mods.hpMul ?? 1),
      damageMul: this.bossMods.damageMul * (mods.damageMul ?? 1),
      speedMul: this.bossMods.speedMul * (mods.speedMul ?? 1),
    };
  }

  /** Boss mods for the next boss: dialogue mods × a small karma effect (cruel players face angrier bosses). */
  takeBossMods(): BossMods {
    const karmaFactor = 1 + Math.max(0, -this.karma) / 400; // up to +25% at karma -100
    const out: BossMods = {
      hpMul: this.bossMods.hpMul * karmaFactor,
      damageMul: this.bossMods.damageMul,
      speedMul: this.bossMods.speedMul,
    };
    this.bossMods = { hpMul: 1, damageMul: 1, speedMul: 1 };
    return out;
  }

  get alignment(): StorySnapshot['alignment'] {
    if (this.karma >= 25) return 'heroic';
    if (this.karma <= -25) return 'cruel';
    return 'neutral';
  }

  count(kind: DeedKind): number {
    return this.deeds.filter((d) => d.kind === kind).length;
  }

  snapshot(base: Pick<StorySnapshot, 'characterId' | 'characterName' | 'floor' | 'stageName' | 'items'>): StorySnapshot {
    return {
      ...base,
      karma: this.karma,
      alignment: this.alignment,
      flags: [...this.flags],
      npcsKilled: this.count('npc_killed'),
      npcsSpared: this.count('npc_spared'),
      bossesKilled: this.deeds.filter((d) => d.kind === 'boss_killed').map((d) => d.subject),
      recentDeeds: this.deeds.slice(-8).map((d) => d.summary),
    };
  }
}
