import type { GodId } from '../data/gods';
import { GOD_IDS } from '../data/gods';
import { events } from './events';
import { type FloorDirective, honours } from '../director/types';

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

/**
 * A promise the game made to the player (oracle line, shrine reply) that the
 * Director must honour on a later floor. Foreshadow → payoff.
 */
export interface Prophecy {
  kind: 'boss_weakness' | 'boon_next_floor' | 'npc_returns' | 'curse';
  god?: GodId;
  /** Catalog id or free text the Director must reflect (weakness id, boon id, npc id…). */
  payload: string;
  /** Floor on which it was made; honoured on the next floor. */
  madeOnFloor: number;
  /** Only Hermes may lie, and only once per run. */
  truthful: boolean;
}

export type QuestOutcome = 'active' | 'done' | 'failed' | 'betrayed';

export interface QuestRecord {
  templateId: string;
  hook: string;
  floor: number;
  outcome: QuestOutcome;
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
  readonly deeds: Deed[] = [];
  /** Accumulated boss modifiers from dialogue outcomes; consumed per boss fight. */
  bossMods: BossMods = { hpMul: 1, damageMul: 1, speedMul: 1 };
  /** Orbs collected / offerings made per god. Read by the Director. */
  readonly divineAttention: Record<GodId, number> = Object.fromEntries(GOD_IDS.map((g) => [g, 0])) as Record<GodId, number>;
  /** Open promises the Director must honour; consumed by `takeProphecies()`. */
  readonly prophecies: Prophecy[] = [];
  readonly quests: QuestRecord[] = [];

  record(deed: Deed): void {
    this.deeds.push(deed);
    if (deed.karmaDelta) this.adjustKarma(deed.karmaDelta);
  }

  adjustKarma(delta: number): void {
    this.karma = Math.max(-100, Math.min(100, this.karma + delta));
    events.emit('story_changed', { karma: this.karma });
  }

  addFlag(flag: string): void {
    this.flags.add(flag);
  }

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
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

  favour(god: GodId, amount = 1): void {
    this.divineAttention[god] += amount;
    events.emit('story_changed', { karma: this.karma });
  }

  /** God with the most attention, or null when nobody is watching yet. */
  get patron(): GodId | null {
    let best: GodId | null = null;
    for (const g of GOD_IDS) if (this.divineAttention[g] > 0 && (best === null || this.divineAttention[g] > this.divineAttention[best])) best = g;
    return best;
  }

  promise(p: Prophecy): void {
    this.prophecies.push(p);
  }

  /** Prophecies due on `floor` (made earlier). Read-only; call `settleProphecies` once the directive honoured them. */
  dueProphecies(floor: number): Prophecy[] {
    return this.prophecies.filter((p) => p.madeOnFloor < floor);
  }

  /**
   * Remove due prophecies once a floor directive has been applied. Pass the
   * directive to keep unfulfilled truthful promises pending for a later floor
   * (e.g. an `npc_returns` whose NPC is not in this stage's pool).
   */
  settleProphecies(floor: number, directive?: FloorDirective): void {
    for (const p of this.dueProphecies(floor)) {
      if (directive && !honours(p, directive)) continue;
      this.prophecies.splice(this.prophecies.indexOf(p), 1);
    }
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
