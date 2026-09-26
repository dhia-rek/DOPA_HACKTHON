import type { StorySnapshot } from '../core/story';
import { isValidRoom } from '../gen/roomGen';

/**
 * Contract for the AI "omen" that reshapes each floor around the player's
 * story. The LLM picks a theme and bounded knobs (and may draw one signature
 * room); floorGen applies them on top of the seeded generator, so a floor is
 * always walkable and the mock gives the same result offline.
 */
export type OmenTheme = 'none' | 'blood' | 'hallowed' | 'ashen' | 'drowned' | 'gilded';

export const OMEN_TINTS: Record<OmenTheme, number> = {
  none: 0xffffff,
  blood: 0xe07070,
  hallowed: 0xfff2c8,
  ashen: 0x9a9a9a,
  drowned: 0x7fa8e0,
  gilded: 0xf2d270,
};

export interface FloorOmen {
  /** Shown as a banner on floor entry, e.g. "The Weeping Streets". */
  name: string;
  /** One line of narration that ties the floor to the player's deeds. */
  line: string;
  theme: OmenTheme;
  /** Obstacle density for procedural rooms, 0.04..0.22. */
  density: number;
  /** Share of obstacles that are pits, 0..0.6. */
  pitChance: number;
  /** Rooms added to the stage's room count, -1..2. */
  extraRooms: number;
  /** Extra enemies per normal room, -1..2. */
  enemyDelta: number;
  /** Up to 2 enemy ids from the stage pool that spawn twice as often. */
  enemyBias: string[];
  /** Chance a normal room holds an innocent NPC, 0..0.6. */
  npcChance: number;
  /** Chance of a shrine room, 0..1. */
  shrineChance: number;
  /** Optional hand-drawn 13x7 room (. # P E), used for the room farthest from the start. */
  signatureRoom?: string[];
}

export interface OmenRequest {
  story: StorySnapshot;
  /** run seed + floor */
  seed: string;
  floor: number;
  stageName: string;
  enemyPool: string[];
  language?: string;
}

const THEMES: OmenTheme[] = ['none', 'blood', 'hallowed', 'ashen', 'drowned', 'gilded'];
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : fallback);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Sanitise an LLM omen; null if unusable (caller falls back to the mock). */
export function validateOmen(raw: unknown, req: OmenRequest): FloorOmen | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 40);
  const line = str(r.line, 200);
  if (!name || !line) return null;
  return {
    name,
    line,
    theme: THEMES.includes(r.theme as OmenTheme) ? (r.theme as OmenTheme) : 'none',
    density: num(r.density, 0.04, 0.22, 0.11),
    pitChance: num(r.pitChance, 0, 0.6, 0.25),
    extraRooms: Math.round(num(r.extraRooms, -1, 2, 0)),
    enemyDelta: Math.round(num(r.enemyDelta, -1, 2, 0)),
    enemyBias: Array.isArray(r.enemyBias) ? r.enemyBias.filter((e): e is string => typeof e === 'string' && req.enemyPool.includes(e)).slice(0, 2) : [],
    npcChance: num(r.npcChance, 0, 0.6, 0.3),
    shrineChance: num(r.shrineChance, 0, 1, 0.75),
    signatureRoom: isValidRoom(r.signatureRoom) ? r.signatureRoom : undefined,
  };
}

/** Multiply two 0xRRGGBB colours (stage palette × omen tint). */
export function tintWith(base: number, tint: number): number {
  const ch = (c: number, shift: number): number => Math.round((((c >> shift) & 0xff) * ((tint >> shift) & 0xff)) / 255);
  return (ch(base, 16) << 16) | (ch(base, 8) << 8) | ch(base, 0);
}
