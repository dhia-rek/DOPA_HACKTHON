import { ABILITY_IDS, WEAKNESS_IDS, WeaknessId } from '../data/abilities';
import { ITEMS } from '../data/items';
import { ENEMIES } from '../data/enemies';
import { MUTATOR_IDS } from '../data/mutators';
import { QUEST_TEMPLATE_IDS } from '../data/quests';
import { STAGES, StageDef } from '../data/stages';
import type { DirectorRequest, PlayerProfile, Skill, Style, Traits, Voice } from '../director/types';
import { loreFor, resolveFront, warSnapshot } from '../systems/chronicle';
import { events } from './events';
import type { RunState } from './run';
import { save } from './save';

/**
 * Builds the PlayerProfile the Director judges. All derivation happens here in
 * plain TS (deterministic, cheap) so the prompt only carries conclusions.
 */

/** Per-run telemetry the event bus feeds; lives outside RunState so it can be reset independently. */
class Telemetry {
  shots = 0;
  roomsCleared = 0;
  roomsFlawless = 0;
  clearMs: number[] = [];
  deathsThisSession = 0;
  private roomStart = 0;
  private roomDamage = 0;
  private listening = false;

  listen(): void {
    if (this.listening) return;
    this.listening = true;
    events.on('run_started', () => this.resetRun());
    events.on('room_entered', () => {
      this.roomStart = performance.now();
      this.roomDamage = 0;
    });
    events.on('damage_taken', ({ amount }) => (this.roomDamage += amount));
    events.on('room_cleared', () => {
      this.roomsCleared++;
      if (this.roomDamage === 0) this.roomsFlawless++;
      this.clearMs.push(performance.now() - this.roomStart);
    });
    events.on('player_shot', () => this.shots++);
    events.on('run_lost', () => this.deathsThisSession++);
  }

  resetRun(): void {
    this.shots = 0;
    this.roomsCleared = 0;
    this.roomsFlawless = 0;
    this.clearMs = [];
  }

  get avgClearMs(): number {
    return this.clearMs.length ? this.clearMs.reduce((a, b) => a + b, 0) / this.clearMs.length : 0;
  }
}

export const telemetry = new Telemetry();

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function buildArchetype(run: RunState): string {
  const f = run.flags;
  if (f.homing && (f.extraShots ?? 0) > 0) return 'homing_swarm';
  if (f.homing) return 'homing';
  if (f.piercing) return 'piercing_sniper';
  if (f.poison) return 'poison';
  if ((f.extraShots ?? 0) > 0 || f.splitOnWall) return 'swarm';
  if (run.stats.maxHp >= 10) return 'tank';
  return 'basic';
}

export function earnedWeaknesses(run: RunState): WeaknessId[] {
  const out: WeaknessId[] = ['stagger_after_charge'];
  if (run.flags.piercing) out.push('piercing_shots');
  if (run.flags.homing) out.push('homing_shots');
  if (run.flags.poison) out.push('poison');
  if ((run.flags.knockback ?? 0) > 1) out.push('knockback');
  if (run.story.hasFlag('knows_boss_weakness')) out.push('known_secret');
  if (run.story.hasFlag('orb_fire')) out.push('fire_orb');
  if (run.story.hasFlag('orb_holy')) out.push('holy_orb');
  return out.filter((w) => WEAKNESS_IDS.includes(w));
}

function voiceOf(run: RunState): Voice {
  const picks = run.story.deeds.filter((d) => d.kind === 'dialogue_choice').map((d) => d.subject);
  if (picks.length === 0) return 'silent';
  const count = (ids: string[]): number => picks.filter((p) => ids.includes(p)).length;
  const scores: [Voice, number][] = [
    ['defiant', count(['defy', 'threaten'])],
    ['humble', count(['kneel', 'spare', 'nothing'])],
    ['trickster', count(['bargain', 'rob'])],
    ['pious', count(['honour', 'blood', 'gold'])],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : 'silent';
}

function skillOf(run: RunState, hpPct: number): Skill {
  const flawless = telemetry.roomsCleared ? telemetry.roomsFlawless / telemetry.roomsCleared : 0.5;
  if (hpPct < 0.35 || run.damageTakenThisFloor >= 6 || telemetry.deathsThisSession >= 2) return 'struggling';
  if (flawless > 0.6 && hpPct > 0.7) return 'dominating';
  return 'flow';
}

function styleOf(run: RunState): Style {
  const avg = telemetry.avgClearMs;
  if (avg > 0 && avg < 12000) return 'aggressive';
  if (run.flags.piercing || run.stats.range > 400) return 'kiter';
  return 'cautious';
}

function traitsOf(run: RunState, skill: Skill): Traits {
  const s = run.story;
  const killed = s.count('npc_killed');
  const spared = s.count('npc_spared');
  const offerings = Object.values(s.divineAttention).reduce((a, b) => a + b, 0);
  const greedy = s.deeds.filter((d) => d.subject === 'rob' || d.subject === 'bargain').length;
  return {
    mercy: clamp01(spared / 3),
    cruelty: clamp01(killed / 3 + Math.max(0, -s.karma) / 200),
    greed: clamp01(greedy / 3),
    devotion: clamp01(offerings / 6),
    risk: clamp01(run.damageTakenThisRun / Math.max(1, run.floor * 6)),
    skill: skill === 'struggling' ? 0.2 : skill === 'flow' ? 0.5 : 0.85,
  };
}

/** Stage the given floor belongs to (mirrors RunState.stage / loop, which only know the current floor). */
export function stageForFloor(floor: number): StageDef {
  return STAGES[(floor - 1) % STAGES.length];
}
const loopForFloor = (floor: number): number => Math.floor((floor - 1) / STAGES.length);

/** Difficulty points for `floor`: grows with depth, shrinks when the player struggles. Never below the cheapest ability pair. */
export function budgetFor(run: RunState, skill: Skill, floor = run.floor): number {
  const base = 4 + floor + loopForFloor(floor) * 2;
  const factor = skill === 'struggling' ? 0.6 : skill === 'dominating' ? 1.4 : 1;
  return Math.max(2, Math.round(base * factor));
}

export function legendOf(run: RunState, stage: StageDef = run.stage): string {
  const s = run.story;
  const deeds = s.deeds.slice(-6).map((d) => d.summary);
  return deeds.length ? deeds.join(' ') : `${run.character.name} descends into the ${stage.name}.`;
}

/**
 * Profile for the floor the Director is judging. `floor` may be `run.floor + 1`
 * (prefetch at boss-room entry): stage catalogs, stageName and budget follow
 * the target floor; deeds, build and performance are the live run.
 */
export function buildProfile(run: RunState, floor = run.floor): PlayerProfile {
  const hpPct = run.hp / run.stats.maxHp;
  const skill = skillOf(run, hpPct);
  const stage = stageForFloor(floor);
  const front = floor === run.floor ? run.currentFront : resolveFront(stage, run.story);
  const previousBoss = floor > run.floor
    ? run.floorMap?.boss.bossId
    : run.story.deeds.filter((d) => d.kind === 'boss_killed' && d.floor === floor - 1).pop()?.subject;
  const freshBosses = stage.bossPool.filter((id) => id !== previousBoss);
  return {
    story: run.story.snapshot({
      characterId: run.character.id,
      characterName: run.character.name,
      floor,
      stageName: front.stageName,
      items: run.items.map((i) => i.name),
      war: warSnapshot(front, run.story),
      lore: loreFor(undefined, run.character.lore, front),
    }),
    traits: traitsOf(run, skill),
    voice: voiceOf(run),
    buildArchetype: buildArchetype(run),
    style: styleOf(run),
    skill,
    divineAttention: { ...run.story.divineAttention },
    patron: run.story.patron,
    quests: run.story.quests.map((q) => ({ templateId: q.templateId, outcome: q.outcome })),
    prophecies: run.story.dueProphecies(floor),
    legend: legendOf(run, stage),
    performance: {
      hpPct,
      dmgTakenLastFloor: run.damageTakenThisFloor,
      deathsThisSession: telemetry.deathsThisSession,
      runsPlayed: save.data.runs,
    },
    budget: budgetFor(run, skill, floor),
    catalogs: {
      mutators: [...MUTATOR_IDS],
      abilities: [...ABILITY_IDS],
      weaknesses: [...WEAKNESS_IDS],
      quests: [...QUEST_TEMPLATE_IDS],
      enemies: [...stage.enemyPool],
      bosses: freshBosses.length ? freshBosses : [...stage.bossPool],
      npcs: [...(stage.npcPool ?? [])].filter((id) => ENEMIES.some((e) => e.id === id && e.innocent)),
      items: ITEMS.map((i) => i.id),
      earnedWeaknesses: earnedWeaknesses(run),
    },
  };
}

/** Request for the floor the player is about to enter (call at boss-room entry to prefetch floor+1). */
export function directorRequest(run: RunState, floor = run.floor): DirectorRequest {
  return {
    profile: buildProfile(run, floor),
    floor,
    stageId: stageForFloor(floor).id,
    seed: `${run.seed}:${floor}`,
  };
}
