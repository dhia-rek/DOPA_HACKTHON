import type { StorySnapshot } from '../core/story';

/**
 * Contract for AI-written trials ("jobs"): a god or spirit hands the player a
 * challenge that fits their story. The LLM writes the words and picks one of
 * these objective types; the game tracks it (src/systems/trials.ts), so a
 * trial can never ask for something the game cannot check.
 */
export type TrialObjective =
  /** Kill n hostiles this floor (optionally one enemy id from the stage pool). */
  | { type: 'slay'; n: number; enemyId?: string }
  /** Clear n normal rooms without being hit inside them. */
  | { type: 'untouched_rooms'; n: number }
  /** Reach the boss room within `seconds` of accepting. */
  | { type: 'haste'; seconds: number }
  /** Kill no innocent until the floor's boss falls. */
  | { type: 'spare_all' }
  /** Pick up n coins this floor. */
  | { type: 'collect_coins'; n: number };

export type TrialObjectiveType = TrialObjective['type'];

export const TRIAL_OBJECTIVE_TYPES: readonly TrialObjectiveType[] = ['slay', 'untouched_rooms', 'haste', 'spare_all', 'collect_coins'];

/** What succeeding / failing does. The game clamps every value. */
export interface TrialOutcome {
  /** -30..30 */
  karma?: number;
  /** Half-hearts, -4..4 (a failed trial never kills: hp stays >= 1). */
  hp?: number;
  /** -20..20 */
  coins?: number;
  /** Item id from data/items.ts (success only). */
  itemId?: string;
  flags?: string[];
  /** Multiplies this floor's boss hp, 0.7..1.4. */
  bossHpMul?: number;
}

export interface TrialRequest {
  story: StorySnapshot;
  /** run seed + floor: same seed = same trial with the mock. */
  seed: string;
  /** Enemy ids the stage can spawn (valid `slay.enemyId` values). */
  enemyPool: string[];
  /** Normal rooms on this floor (upper bound for `untouched_rooms.n`). */
  normalRooms: number;
  language?: string;
}

export interface TrialOffer {
  id: string;
  /** Who gives the trial, e.g. "Nemesis", "Ares", "the shade of Lykos". */
  giverName: string;
  /** Short title shown in the HUD, e.g. "Atonement". */
  title: string;
  /** 1-3 in-character lines explaining the trial and why this player gets it. */
  lines: string[];
  objective: TrialObjective;
  reward: TrialOutcome;
  penalty: TrialOutcome;
  acceptText: string;
  refuseText: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && isFinite(v) ? clamp(Math.round(v * 100) / 100, lo, hi) : undefined);
const int = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && isFinite(v) ? clamp(Math.round(v), lo, hi) : fallback);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function validateObjective(raw: unknown, req: TrialRequest): TrialObjective | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case 'slay': {
      const enemyId = typeof o.enemyId === 'string' && req.enemyPool.includes(o.enemyId) ? o.enemyId : undefined;
      return { type: 'slay', n: int(o.n, 2, enemyId ? 5 : 10, 5), enemyId };
    }
    case 'untouched_rooms':
      return { type: 'untouched_rooms', n: int(o.n, 1, Math.max(1, Math.min(4, req.normalRooms)), 2) };
    case 'haste':
      return { type: 'haste', seconds: int(o.seconds, 45, 240, 120) };
    case 'spare_all':
      return { type: 'spare_all' };
    case 'collect_coins':
      return { type: 'collect_coins', n: int(o.n, 3, 15, 5) };
    default:
      return null;
  }
}

function validateOutcome(raw: unknown, success: boolean): TrialOutcome {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    karma: num(o.karma, -30, 30),
    hp: success ? num(o.hp, 0, 4) : num(o.hp, -4, 0),
    coins: num(o.coins, -20, 20),
    itemId: success ? str(o.itemId, 40) : undefined,
    flags: Array.isArray(o.flags) ? o.flags.filter((f): f is string => typeof f === 'string').slice(0, 3) : undefined,
    bossHpMul: num(o.bossHpMul, 0.7, 1.4),
  };
}

/** Sanitise an LLM trial. Returns null if unusable so the caller falls back to the mock. */
export function validateTrial(raw: unknown, req: TrialRequest): TrialOffer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines.map((l) => str(l, 220)).filter((l): l is string => !!l).slice(0, 3) : [];
  const objective = validateObjective(r.objective, req);
  const giverName = str(r.giverName, 40);
  if (!lines.length || !objective || !giverName) return null;
  return {
    id: str(r.id, 60) ?? `trial_${req.seed}`,
    giverName,
    title: str(r.title, 32) ?? 'Trial',
    lines,
    objective,
    reward: validateOutcome(r.reward, true),
    penalty: validateOutcome(r.penalty, false),
    acceptText: str(r.acceptText, 60) ?? 'I accept.',
    refuseText: str(r.refuseText, 60) ?? 'I refuse.',
  };
}

export function describeObjective(o: TrialObjective): string {
  switch (o.type) {
    case 'slay':
      return `Slay ${o.n} ${o.enemyId ? o.enemyId.replace(/_/g, ' ') + (o.n > 1 ? 's' : '') : 'foes'}`;
    case 'untouched_rooms':
      return `Clear ${o.n} room${o.n > 1 ? 's' : ''} without being hit`;
    case 'haste':
      return `Reach the boss within ${o.seconds}s`;
    case 'spare_all':
      return 'Kill no innocent this floor';
    case 'collect_coins':
      return `Gather ${o.n} coins`;
  }
}
