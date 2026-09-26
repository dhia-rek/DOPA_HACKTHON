import type { BossMods, StorySnapshot } from '../core/story';

/**
 * THE contract between the game and whatever writes dialogue (LLM service or
 * the offline mock). The game never sees prompts; it only sends a
 * DialogueRequest and receives a DialogueScript. Keep this JSON-serialisable.
 */

export type DialogueKind =
  /** Boss speaks before the fight; choice tunes the boss (BossMods) and karma. */
  | 'boss_intro'
  /** Boss reacts to being killed / player at low hp (flavour, no options needed). */
  | 'boss_outro'
  /** An innocent NPC met in a room. */
  | 'npc'
  /** Shrine / altar / oracle style encounter. */
  | 'shrine';

export interface DialogueRequest {
  kind: DialogueKind;
  /** Who is talking (enemy/npc id, e.g. "minotaur"). */
  speakerId: string;
  speakerName: string;
  /** One-line personality for the speaker; the LLM stays in character. */
  persona: string;
  story: StorySnapshot;
  /** Deterministic seed so a run can be replayed by the mock provider. */
  seed: string;
  /** Language code for the generated text (default "en"). */
  language?: string;
}

/** What picking an option does. Every field optional; the game clamps values. */
export interface DialogueEffects {
  /** -30..30 */
  karma?: number;
  /** Story flags to set, e.g. "swore_oath_to_minotaur". */
  flags?: string[];
  /** Multipliers applied to the upcoming boss (0.5..2). */
  boss?: Partial<BossMods>;
  /** Heal/hurt the player in half-hearts (-4..4). */
  hp?: number;
  coins?: number;
  /** Item id granted (must exist in data/items.ts). */
  itemId?: string;
}

export interface DialogueOption {
  id: string;
  /** Short, what the player says/does (max ~60 chars). */
  text: string;
  effects: DialogueEffects;
  /** What the speaker replies after this pick (1-2 sentences). */
  reply: string;
}

export interface DialogueScript {
  id: string;
  kind: DialogueKind;
  speakerId: string;
  speakerName: string;
  /** Speaker's lines, shown one after another. */
  lines: string[];
  /** 2-4 options. Empty for pure flavour dialogues. */
  options: DialogueOption[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Sanitise anything that came from an LLM: wrong shapes, missing fields, out
 * of range numbers. Returns null if unusable so the caller can fall back.
 */
export function validateScript(raw: unknown, req: DialogueRequest): DialogueScript | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0).slice(0, 4) : [];
  if (lines.length === 0) return null;

  const options: DialogueOption[] = [];
  if (Array.isArray(r.options)) {
    for (const o of r.options.slice(0, 4)) {
      if (typeof o !== 'object' || o === null) continue;
      const opt = o as Record<string, unknown>;
      if (typeof opt.text !== 'string') continue;
      const fx = (typeof opt.effects === 'object' && opt.effects !== null ? opt.effects : {}) as Record<string, unknown>;
      const boss = (typeof fx.boss === 'object' && fx.boss !== null ? fx.boss : {}) as Record<string, unknown>;
      const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : undefined);
      const effects: DialogueEffects = {
        karma: num(fx.karma, -30, 30),
        hp: num(fx.hp, -4, 4),
        coins: num(fx.coins, -20, 20),
        flags: Array.isArray(fx.flags) ? fx.flags.filter((f): f is string => typeof f === 'string').slice(0, 4) : undefined,
        itemId: typeof fx.itemId === 'string' ? fx.itemId : undefined,
        boss: {
          hpMul: num(boss.hpMul, 0.5, 2),
          damageMul: num(boss.damageMul, 0.5, 2),
          speedMul: num(boss.speedMul, 0.5, 2),
        },
      };
      options.push({
        id: typeof opt.id === 'string' ? opt.id : `opt_${options.length}`,
        text: opt.text.slice(0, 80),
        effects,
        reply: typeof opt.reply === 'string' ? opt.reply : '',
      });
    }
  }
  if (req.kind !== 'boss_outro' && options.length < 2) return null;

  return {
    id: typeof r.id === 'string' ? r.id : `${req.kind}_${req.speakerId}_${req.seed}`,
    kind: req.kind,
    speakerId: req.speakerId,
    speakerName: req.speakerName,
    lines,
    options,
  };
}
