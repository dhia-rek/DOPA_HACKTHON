/**
 * The gods who watch the run. Orbs and shrine offerings are god-coloured and
 * feed `StoryState.divineAttention`; the Director reads that vector to pick
 * boons, curses and which god's champion shows up as the boss.
 */
export type GodId = 'ares' | 'athena' | 'hades' | 'apollo' | 'poseidon' | 'hermes';

export interface GodDef {
  id: GodId;
  name: string;
  /** Orb / shrine tint. */
  color: number;
  /** The god whose favour offends this one; the rival tends to send the boss. */
  rival: GodId;
  /** What pleases this god — used in prompts, not code. */
  likes: string;
}

export const GODS: GodDef[] = [
  { id: 'ares', name: 'Ares', color: 0xd94a3a, rival: 'athena', likes: 'aggression, fast room clears, defiance' },
  { id: 'athena', name: 'Athena', color: 0xd9c76a, rival: 'ares', likes: 'mercy, honour, flawless rooms' },
  { id: 'hades', name: 'Hades', color: 0x6a4fa0, rival: 'apollo', likes: 'killing, cruelty, oaths kept to the letter' },
  { id: 'apollo', name: 'Apollo', color: 0xf2e4a2, rival: 'hades', likes: 'sparing, healing, truth' },
  { id: 'poseidon', name: 'Poseidon', color: 0x3f9fd9, rival: 'hermes', likes: 'sacrifice, patience, respect' },
  { id: 'hermes', name: 'Hermes', color: 0x7fd7b0, rival: 'poseidon', likes: 'cunning, gold, lies that work' },
];

export const GOD_IDS: readonly GodId[] = GODS.map((g) => g.id);

export function getGod(id: GodId): GodDef {
  const g = GODS.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown god: ${id}`);
  return g;
}
