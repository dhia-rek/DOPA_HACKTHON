import type { BossMods, Prophecy, QuestOutcome, StorySnapshot } from '../core/story';
import { ABILITY_IDS, AbilityId, getAbility, WEAKNESS_IDS, WeaknessId } from '../data/abilities';
import type { GodId } from '../data/gods';
import { MUTATOR_IDS, getMutator } from '../data/mutators';
import { QUEST_TEMPLATE_IDS, QuestTemplateId, getQuestTemplate } from '../data/quests';

/**
 * THE contract between the game and the LLM "Director" (or its offline mock).
 * Once per floor the game sends a PlayerProfile and receives a FloorDirective.
 * The LLM only picks ids from catalogs (src/data/*) and writes text; every
 * number is clamped and every unknown id dropped by validateDirective().
 * Keep everything here JSON-serialisable and free of Phaser imports so the
 * server can share it. See docs/DIRECTOR.md.
 */

export type Voice = 'defiant' | 'humble' | 'trickster' | 'pious' | 'silent';
export type Skill = 'struggling' | 'flow' | 'dominating';
export type Style = 'aggressive' | 'cautious' | 'kiter';

/** 0..1 traits derived in TS from deeds/telemetry so the prompt stays small. */
export interface Traits {
  mercy: number;
  cruelty: number;
  greed: number;
  devotion: number;
  risk: number;
  skill: number;
}

export interface PlayerProfile {
  story: StorySnapshot;
  traits: Traits;
  voice: Voice;
  /** e.g. "homing_swarm", "piercing_sniper", "poison", "tank", "basic". */
  buildArchetype: string;
  style: Style;
  skill: Skill;
  divineAttention: Record<GodId, number>;
  patron: GodId | null;
  quests: { templateId: string; outcome: QuestOutcome }[];
  /** Promises made on earlier floors that this floor MUST honour. */
  prophecies: Prophecy[];
  /** Chronicler output: the run so far in <=3 lines. */
  legend: string;
  performance: {
    hpPct: number;
    dmgTakenLastFloor: number;
    deathsThisSession: number;
    runsPlayed: number;
  };
  /** Difficulty points the Director may spend on this floor. */
  budget: number;
  /** Catalog ids the Director may use (sent so the prompt never goes stale). */
  catalogs: {
    mutators: string[];
    abilities: string[];
    weaknesses: string[];
    quests: string[];
    enemies: string[];
    bosses: string[];
    npcs: string[];
    items: string[];
    /** Weaknesses the player has actually earned this run (items, orbs, secrets). */
    earnedWeaknesses: string[];
  };
}

export interface DirectorRequest {
  profile: PlayerProfile;
  floor: number;
  stageId: string;
  /** Deterministic seed so the mock can replay a run. */
  seed: string;
  language?: string;
}

export interface BossPhase {
  /** 10..90 */
  atHpPct: number;
  add: AbilityId[];
  line: string;
}

export interface BossBlueprint {
  /** Must be one of the stage's bosses (or catalogs.bosses). */
  archetype: string;
  title: string;
  persona: string;
  /** 2..4 */
  abilities: AbilityId[];
  /** <=2 */
  phases: BossPhase[];
  weakness: WeaknessId;
  mods: BossMods;
  /** The concrete deed or choice the boss holds against the player. */
  grudge: string;
}

export interface QuestOffer {
  templateId: QuestTemplateId;
  params: Record<string, number | string>;
  giverNpcId: string;
  hook: string;
  /** Item id or "coins:N" or "heart". */
  reward: string;
}

export interface FloorDirective {
  id: string;
  floorTitle: string;
  /** 2-line in-fiction verdict of the Fates shown between floors. */
  verdict: string;
  /** <=2 mutator ids. */
  mutators: string[];
  /** Weight per enemy id, 0..3; missing = 1. */
  enemyWeights: Record<string, number>;
  /** Boon (negative cost) or curse id; free text for now until src/data/boons.ts lands. */
  modifier?: { id: string; label: string };
  npcs: { id: string; name?: string; role: 'quest_giver' | 'victim' | 'witness' }[];
  quest?: QuestOffer;
  boss: BossBlueprint;
  /** Epithet awarded this floor, e.g. "the Merciful". */
  epithet?: string;
  /** One sentence for the debug overlay / logs. Never shown as fiction. */
  reason: string;
  /** Sum of the costs of what was picked; filled by the validator. */
  spent: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, lo: number, hi: number, dflt: number): number => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : dflt);
const str = (v: unknown, max: number, dflt = ''): string => (typeof v === 'string' ? v.trim().slice(0, max) : dflt);
const ids = <T extends string>(v: unknown, allowed: readonly T[], max: number): T[] =>
  Array.isArray(v) ? (v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x)).slice(0, max) as T[]) : [];

/**
 * Sanitise a directive that came from an LLM. Unknown ids are dropped, numbers
 * clamped, the budget enforced (phases, mutators, then abilities are trimmed
 * from the end; if two abilities still do not fit, the cheapest pair is used).
 * Truthful due prophecies are forced in (boss weakness, returning NPC, promised
 * boon/curse modifier). Returns null only if no usable boss remains.
 */
export function validateDirective(raw: unknown, req: DirectorRequest): FloorDirective | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const cat = req.profile.catalogs;
  const budget = req.profile.budget;

  const bossRaw = (typeof r.boss === 'object' && r.boss !== null ? r.boss : null) as Record<string, unknown> | null;
  if (!bossRaw) return null;
  const archetype = str(bossRaw.archetype, 40);
  if (!cat.bosses.includes(archetype)) return null;

  let abilities = ids(bossRaw.abilities, ABILITY_IDS, 4);
  if (abilities.length < 2) return null;
  const phases: BossPhase[] = [];
  if (Array.isArray(bossRaw.phases)) {
    for (const p of bossRaw.phases.slice(0, 2)) {
      if (typeof p !== 'object' || p === null) continue;
      const ph = p as Record<string, unknown>;
      const add = ids(ph.add, ABILITY_IDS, 2);
      if (add.length === 0) continue;
      phases.push({ atHpPct: num(ph.atHpPct, 10, 90, 50), add, line: str(ph.line, 160) });
    }
  }
  const due = req.profile.prophecies.filter((p) => p.truthful);
  const earned = cat.earnedWeaknesses.filter((w): w is WeaknessId => (WEAKNESS_IDS as readonly string[]).includes(w));
  const promisedWeakness = due.find((p) => p.kind === 'boss_weakness' && (WEAKNESS_IDS as readonly string[]).includes(p.payload))?.payload as WeaknessId | undefined;
  const wantedWeakness = str(bossRaw.weakness, 40);
  const weakness: WeaknessId =
    promisedWeakness ?? (earned.includes(wantedWeakness as WeaknessId) ? (wantedWeakness as WeaknessId) : earned[0] ?? 'stagger_after_charge');
  const modsRaw = (typeof bossRaw.mods === 'object' && bossRaw.mods !== null ? bossRaw.mods : {}) as Record<string, unknown>;

  let mutators = ids(r.mutators, MUTATOR_IDS, 2);

  const cost = (): number =>
    abilities.reduce((s, a) => s + abilityCost(a), 0) + phases.reduce((s, p) => s + p.add.reduce((t, a) => t + abilityCost(a), 0), 0) + mutators.reduce((s, m) => s + (getMutator(m)?.cost ?? 0), 0);
  // Trim until affordable: phases first, then mutators, then abilities (keep at least 2).
  while (cost() > budget && phases.length > 0) phases.pop();
  while (cost() > budget && mutators.some((m) => (getMutator(m)?.cost ?? 0) > 0)) {
    const last = mutators.map((m) => (getMutator(m)?.cost ?? 0) > 0).lastIndexOf(true);
    mutators = mutators.filter((_, i) => i !== last);
  }
  while (cost() > budget && abilities.length > 2) abilities = abilities.slice(0, -1);
  if (cost() > budget) abilities = cheapestPair(abilities);

  const enemyWeights: Record<string, number> = {};
  if (typeof r.enemyWeights === 'object' && r.enemyWeights !== null) {
    for (const [k, v] of Object.entries(r.enemyWeights as Record<string, unknown>)) if (cat.enemies.includes(k)) enemyWeights[k] = num(v, 0, 3, 1);
  }

  const npcs: FloorDirective['npcs'] = [];
  if (Array.isArray(r.npcs)) {
    for (const n of r.npcs.slice(0, 3)) {
      if (typeof n !== 'object' || n === null) continue;
      const o = n as Record<string, unknown>;
      const id = str(o.id, 40);
      if (!cat.npcs.includes(id)) continue;
      const role = o.role === 'quest_giver' || o.role === 'victim' || o.role === 'witness' ? o.role : 'witness';
      npcs.push({ id, name: str(o.name, 24) || undefined, role });
    }
  }
  for (const p of due) {
    if (p.kind === 'npc_returns' && cat.npcs.includes(p.payload) && !npcs.some((n) => n.id === p.payload)) npcs.push({ id: p.payload, role: 'witness' });
  }

  let quest: QuestOffer | undefined;
  if (typeof r.quest === 'object' && r.quest !== null) {
    const q = r.quest as Record<string, unknown>;
    const templateId = str(q.templateId, 40);
    const giverNpcId = str(q.giverNpcId, 40);
    if ((QUEST_TEMPLATE_IDS as readonly string[]).includes(templateId) && cat.npcs.includes(giverNpcId)) {
      const params = questParams(templateId as QuestTemplateId, q.params, cat);
      quest = { templateId: templateId as QuestTemplateId, params, giverNpcId, hook: str(q.hook, 200), reward: questReward(str(q.reward, 40), cat) };
    }
  }

  const modifierRaw = typeof r.modifier === 'object' && r.modifier !== null ? (r.modifier as Record<string, unknown>) : null;
  const promisedMod = due.find((p) => p.kind === 'boon_next_floor' || p.kind === 'curse');
  const modifier =
    modifierRaw && str(modifierRaw.id, 40)
      ? { id: str(modifierRaw.id, 40), label: str(modifierRaw.label, 60) }
      : promisedMod
        ? { id: promisedMod.payload.slice(0, 40), label: promisedMod.kind === 'curse' ? 'A curse sworn at the shrine' : 'A boon sworn at the shrine' }
        : undefined;

  return {
    id: str(r.id, 80) || `director_${req.stageId}_${req.seed}`,
    floorTitle: str(r.floorTitle, 40) || req.profile.story.stageName,
    verdict: str(r.verdict, 240),
    mutators,
    enemyWeights,
    modifier,
    npcs,
    quest,
    boss: {
      archetype,
      title: str(bossRaw.title, 60) || archetype,
      persona: str(bossRaw.persona, 200),
      abilities,
      phases,
      weakness,
      mods: {
        hpMul: num(modsRaw.hpMul, 0.5, 2, 1),
        damageMul: num(modsRaw.damageMul, 0.5, 2, 1),
        speedMul: num(modsRaw.speedMul, 0.5, 2, 1),
      },
      grudge: str(bossRaw.grudge, 160),
    },
    epithet: str(r.epithet, 30) || undefined,
    reason: str(r.reason, 240),
    spent: cost(),
  };
}

const abilityCost = (id: AbilityId): number => getAbility(id).cost;

/** Two cheapest abilities; ties go to the ones the Director asked for. */
function cheapestPair(wanted: AbilityId[]): AbilityId[] {
  const rank = (a: AbilityId): number => abilityCost(a) * 2 + (wanted.includes(a) ? 0 : 1);
  return [...ABILITY_IDS].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
}

/**
 * True if the directive delivers the promise. Lies (`truthful: false`, Hermes)
 * are never "honoured" but still settle. Used to decide which prophecies to
 * remove from StoryState once the floor is applied.
 */
export function honours(p: Prophecy, d: FloorDirective): boolean {
  if (!p.truthful) return true;
  switch (p.kind) {
    case 'boss_weakness':
      return d.boss.weakness === p.payload;
    case 'npc_returns':
      return d.npcs.some((n) => n.id === p.payload);
    case 'boon_next_floor':
    case 'curse':
      return d.modifier?.id === p.payload;
  }
}

/** Loose param names the model tends to use for each spec name. */
const PARAM_ALIASES: Record<string, string[]> = {
  n: ['n', 'count', 'targetCount', 'amount', 'rooms', 'kills'],
  enemyId: ['enemyId', 'targetType', 'target', 'enemy'],
  npcId: ['npcId', 'npc', 'target'],
  itemId: ['itemId', 'item'],
  floors: ['floors', 'n'],
  seconds: ['seconds', 'time', 'n'],
  hearts: ['hearts', 'n'],
};

/** Keep only the template's declared params, accept common aliases, clamp ints and check catalog ids. */
function questParams(templateId: QuestTemplateId, raw: unknown, cat: PlayerProfile['catalogs']): Record<string, number | string> {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number | string> = {};
  for (const spec of getQuestTemplate(templateId).params) {
    const v = (PARAM_ALIASES[spec.name] ?? [spec.name]).map((k) => src[k]).find((x) => x !== undefined);
    if (spec.kind === 'int') {
      const n = typeof v === 'number' && isFinite(v) ? Math.round(v) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : spec.min ?? 1;
      out[spec.name] = clamp(n, spec.min ?? 1, spec.max ?? 300);
    } else {
      const pool = spec.kind === 'enemyId' ? cat.enemies : spec.kind === 'npcId' ? cat.npcs : cat.items;
      if (typeof v === 'string' && pool.includes(v)) out[spec.name] = v;
    }
  }
  return out;
}

/** "heart" | "coins:N" | a catalog item id; anything else becomes a small coin reward. */
function questReward(raw: string, cat: PlayerProfile['catalogs']): string {
  if (raw === 'heart' || cat.items.includes(raw)) return raw;
  const coins = /coins?:?\s*(\d+)/i.exec(raw);
  if (coins) return `coins:${clamp(Number(coins[1]), 1, 30)}`;
  return 'coins:5';
}
