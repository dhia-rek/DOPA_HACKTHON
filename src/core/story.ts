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

/**
 * Every karma tuning knob in one place. Deltas are applied via StoryState.record();
 * thresholds drive `alignment`; the boss* values shape karmaBossFactor().
 */
export const KARMA = {
  /** Hard clamp for StoryState.karma. */
  min: -100,
  max: 100,
  /** Shooting an `innocent: true` NPC. Three kills already make you 'cruel'. */
  npcKilled: -15,
  /** Talking to an NPC and letting them go (on top of any dialogue option karma). */
  npcSpared: 5,
  /** alignment === 'heroic' at or above this… */
  heroicThreshold: 25,
  /** …and 'cruel' at or below this. */
  cruelThreshold: -25,
  /** |karma| below this has no effect on bosses (a stray choice should not matter). */
  neutralBand: 10,
  /**
   * Cruel cap at karma = min: boss hp +30%, damage +30%. Contact damage is whole
   * half-hearts (Enemy.applyMods rounds), so a 2-dmg boss hits for 3 once karma ≤ ≈−77.
   */
  cruelBossHp: 0.3,
  cruelBossDamage: 0.3,
  /** Heroic cap at karma = max: boss hp -10%, speed -5%. Rewarding, never trivialising. */
  heroicBossHp: 0.1,
  heroicBossSpeed: 0.05,
  /** Final BossMods multipliers (dialogue × karma) are clamped to this range. */
  bossMulMin: 0.5,
  bossMulMax: 2,
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Pure curve: karma → boss multipliers. |karma| < neutralBand gives {} (no change);
 * beyond it the effect ramps with a smoothstep from 0 to the cap at ±100, so the
 * first few deeds are barely felt and committed play is. See ROADMAP.md for the table.
 */
export function karmaBossFactor(karma: number): Partial<BossMods> {
  const k = clamp(karma, KARMA.min, KARMA.max);
  const mag = Math.abs(k);
  if (mag < KARMA.neutralBand) return {};
  const span = (k < 0 ? -KARMA.min : KARMA.max) - KARMA.neutralBand;
  const t = clamp((mag - KARMA.neutralBand) / span, 0, 1);
  const ease = t * t * (3 - 2 * t);
  if (k < 0) {
    return { hpMul: 1 + KARMA.cruelBossHp * ease, damageMul: 1 + KARMA.cruelBossDamage * ease };
  }
  return { hpMul: 1 - KARMA.heroicBossHp * ease, speedMul: 1 - KARMA.heroicBossSpeed * ease };
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
  /** Orbs collected / offerings made per god. Read by the Director. */
  readonly divineAttention: Record<GodId, number> = Object.fromEntries(GOD_IDS.map((g) => [g, 0])) as Record<GodId, number>;
  /** Open promises the Director must honour; consumed by `takeProphecies()`. */
  readonly prophecies: Prophecy[] = [];
  readonly quests: QuestRecord[] = [];

  constructor(initialKarma = 0, initialFlags: string[] = []) {
    this.karma = Math.max(-100, Math.min(100, initialKarma));
    for (const f of initialFlags) this.flags.add(f);
  }

  record(deed: Deed): void {
    this.deeds.push(deed);
    this.currentFloor = deed.floor;
    if (deed.karmaDelta) this.adjustKarma(deed.karmaDelta);
  }

  adjustKarma(delta: number): void {
    this.karma = clamp(this.karma + delta, KARMA.min, KARMA.max);
    events.emit('story_changed', { karma: this.karma });
  }

  /** Re-adding a flag moves it to the end, so `snapshot().flags` order is "most recently set last". */
  addFlag(flag: string, floor = this.currentFloor): void {
    this.flags.delete(flag);
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

  /**
   * Boss mods for the next boss: dialogue mods × karmaBossFactor(karma), each clamped to
   * [KARMA.bossMulMin, KARMA.bossMulMax]. Dialogue mods reset afterwards; karma persists.
   */
  takeBossMods(): BossMods {
    const k = karmaBossFactor(this.karma);
    const mul = (a: number, b = 1): number => clamp(a * b, KARMA.bossMulMin, KARMA.bossMulMax);
    const out: BossMods = {
      hpMul: mul(this.bossMods.hpMul, k.hpMul),
      damageMul: mul(this.bossMods.damageMul, k.damageMul),
      speedMul: mul(this.bossMods.speedMul, k.speedMul),
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
    if (this.karma >= KARMA.heroicThreshold) return 'heroic';
    if (this.karma <= KARMA.cruelThreshold) return 'cruel';
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
