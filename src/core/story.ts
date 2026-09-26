import type { WarFaction } from '../data/lore';
import { factionOf, Shade, Tide, tideDeltaFor, zeroTide } from '../data/war';
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
  /** Lore id of the subject (see data/lore.ts) so the war knows whose side lost. */
  lore?: string;
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

/** The state of the Second Titanomachy as the LLM sees it. */
export interface WarSnapshot {
  tide: Tide;
  /** Faction holding the current floor and why. */
  front: WarFaction;
  frontLabel: string;
  frontReason: string;
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
  war: WarSnapshot;
  /** The innocents killed this run, by name: "Lykos the shepherd was counting the goats…" */
  shades: string[];
  /** Sourced myth about the speaker, the hero and the link between them. */
  lore: string[];
}

export class StoryState {
  karma = 0;
  readonly flags = new Set<string>();
  readonly deeds: Deed[] = [];
  /** Accumulated boss modifiers from dialogue outcomes; consumed per boss fight. */
  bossMods: BossMods = { hpMul: 1, damageMul: 1, speedMul: 1 };
  /** The war: which side is winning, -100..100 each. Deeds push it (data/war.ts). */
  readonly tide: Tide = zeroTide();
  /** Death collectibles: every innocent killed, named. */
  readonly shades: Shade[] = [];

  record(deed: Deed): void {
    this.deeds.push(deed);
    if (deed.karmaDelta) this.adjustKarma(deed.karmaDelta);
    this.pushTide(tideDeltaFor(deed, factionOf(deed.lore)));
  }

  pushTide(delta: Partial<Tide>): void {
    let changed = false;
    for (const f of Object.keys(delta) as WarFaction[]) {
      const d = delta[f] ?? 0;
      if (!d) continue;
      this.tide[f] = Math.max(-100, Math.min(100, this.tide[f] + d));
      changed = true;
    }
    if (changed) events.emit('tide_changed', { tide: { ...this.tide } });
  }

  addShade(shade: Shade): void {
    this.shades.push(shade);
    events.emit('shade_collected', { shadeId: shade.id, name: shade.name, count: this.shades.length });
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

  /**
   * Boss mods for the next boss: dialogue mods × a small karma effect (cruel
   * players face angrier bosses) × the war (a boss whose side is winning is
   * bolder: up to +20% damage at tide 100).
   */
  takeBossMods(bossFaction: WarFaction | null = null): BossMods {
    const karmaFactor = 1 + Math.max(0, -this.karma) / 400; // up to +25% at karma -100
    const tideFactor = bossFaction ? 1 + Math.max(0, this.tide[bossFaction]) / 500 : 1;
    const out: BossMods = {
      hpMul: this.bossMods.hpMul * karmaFactor,
      damageMul: this.bossMods.damageMul * tideFactor,
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

  snapshot(base: Pick<StorySnapshot, 'characterId' | 'characterName' | 'floor' | 'stageName' | 'items' | 'war' | 'lore'>): StorySnapshot {
    return {
      ...base,
      shades: this.shades.map((s) => `${s.epitaph} (floor ${s.floor}, ${s.stageName})`),
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
