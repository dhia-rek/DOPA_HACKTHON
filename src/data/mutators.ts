import type { GodId } from './gods';

/**
 * Floor-wide changes the Director may apply. Each is an id the LLM picks from
 * plus a cost against the floor budget; the gameplay effect is implemented by
 * the scene layer (stream B) by switching on `id`.
 */
export interface MutatorDef {
  id: string;
  name: string;
  /** Budget cost. Negative = it helps the player (a boon-like mutator). */
  cost: number;
  god?: GodId;
  /** What it does in game terms (for the prompt and for whoever implements it). */
  effect: string;
  /** When the Director should reach for it (prompt hint). */
  when: string;
}

export const MUTATORS: MutatorDef[] = [
  { id: 'palette_shift', name: 'Omen', cost: 0, effect: 'Palette and floor subtitle change only; makes the judgement visible.', when: 'Always allowed; use it to signal mood.' },
  { id: 'haunted', name: 'The Dead Remember', cost: 2, god: 'hades', effect: 'Shades of the NPCs the player killed spawn as weak enemies that whisper their names.', when: 'npcsKilled >= 2.' },
  { id: 'flooded', name: 'Wrath of Poseidon', cost: 2, god: 'poseidon', effect: 'Pits become water: slows the player, blocks enemy projectiles over them.', when: 'Player ignored or angered Poseidon; kiting style.' },
  { id: 'darkness', name: 'Veil of Hades', cost: 3, god: 'hades', effect: 'Fog of war; enemies visible only near the player.', when: 'Cruel alignment or dominating skill.' },
  { id: 'plague', name: "Apollo's Arrows", cost: 2, god: 'apollo', effect: 'Enemies leave poison pools on death.', when: 'Player uses poison (mirror) or defiled an Apollo shrine.' },
  { id: 'arena', name: "Ares' Arena", cost: 2, god: 'ares', effect: 'Fewer rooms, more enemies per room, coins x2.', when: 'Aggressive style, dominating.' },
  { id: 'pilgrim_road', name: 'Pilgrim Road', cost: -2, god: 'hermes', effect: 'More shrines and NPCs, fewer fights.', when: 'Struggling player or high devotion.' },
  { id: 'oathbound', name: 'Oathbound', cost: 1, effect: 'One door stays locked until the floor quest is finished.', when: 'A quest was accepted last floor.' },
];

export const MUTATOR_IDS: readonly string[] = MUTATORS.map((m) => m.id);

export function getMutator(id: string): MutatorDef | undefined {
  return MUTATORS.find((m) => m.id === id);
}
