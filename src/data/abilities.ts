/**
 * Boss ability modules. A boss is composed of an archetype plus 2-4 of these;
 * the Director picks ids, the behaviour layer (stream B) implements each as a
 * composable sub-behaviour. Every ability has a tell and a counter so fights
 * stay fair regardless of the combination.
 */
export type AbilityId =
  | 'charge'
  | 'ground_slam'
  | 'summon_minions'
  | 'orbit_shields'
  | 'poison_trail'
  | 'teleport_behind'
  | 'projectile_ring'
  | 'split_on_hp'
  | 'enrage_below'
  | 'mirror_build'
  | 'steal_hearts'
  | 'call_shades'
  | 'volley';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  cost: number;
  tell: string;
  counter: string;
  /** Which player build it punishes / rewards (prompt hints). */
  counters?: string;
  rewards?: string;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'charge', name: 'Charge', cost: 1, tell: 'Stops and stamps for 0.6 s.', counter: 'Sidestep; boss staggers on the wall.', counters: 'cautious' },
  { id: 'ground_slam', name: 'Ground Slam', cost: 1, tell: 'Raises arms for 0.7 s.', counter: 'Get three tiles away; the shockwave stops there.', counters: 'melee-range play' },
  { id: 'summon_minions', name: 'Summon', cost: 2, tell: 'Roars, minions rise from pits.', counter: 'Piercing / swarm builds clear them fast.', rewards: 'homing_swarm, piercing' },
  { id: 'orbit_shields', name: 'Orbiting Shields', cost: 2, tell: 'Shields visibly circle the boss.', counter: 'Shoot between shields or wait for the open phase.', counters: 'homing_swarm' },
  { id: 'poison_trail', name: 'Poison Trail', cost: 1, tell: 'Green trail behind the boss.', counter: 'Stay off the trail; kite in circles.', counters: 'kiter' },
  { id: 'teleport_behind', name: 'Blink', cost: 2, tell: 'Flickers for 0.4 s.', counter: 'Move on the flicker.', counters: 'piercing_sniper' },
  { id: 'projectile_ring', name: 'Ring of Spears', cost: 1, tell: 'Spins once.', counter: 'Gaps in the ring; stand diagonal.', counters: 'cautious' },
  { id: 'split_on_hp', name: 'Split', cost: 2, tell: 'At 50 % hp the boss divides.', counter: 'Focus one half; halves share the weakness.', rewards: 'triple_shot, poison' },
  { id: 'enrage_below', name: 'Enrage', cost: 1, tell: 'Turns red below 30 % hp.', counter: 'Finish fast; attacks telegraph longer while enraged.', counters: 'cautious' },
  { id: 'mirror_build', name: 'Mirror', cost: 2, tell: 'Copies one of the player\'s shot flags (homing heads if you use homing).', counter: 'The mirrored shots share your weakness (e.g. rocks block them).' },
  { id: 'steal_hearts', name: 'Heart Thief', cost: 2, tell: 'Reaches out; hit = steals a half heart and heals.', counter: 'Knockback cancels it.', counters: 'tank' },
  { id: 'call_shades', name: 'Call the Shades', cost: 2, tell: 'Names the NPCs the player killed; they rise.', counter: 'Shades die in one hit but block shots.' },
  { id: 'volley', name: 'Volley', cost: 1, tell: 'Raises a hand for 0.5 s; a fan of shots follows.', counter: 'Strafe sideways; the fan is narrow.', counters: 'kiter' },
];

export const ABILITY_IDS: readonly AbilityId[] = ABILITIES.map((a) => a.id);

export function getAbility(id: AbilityId): AbilityDef {
  const a = ABILITIES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown ability: ${id}`);
  return a;
}

/** Ways a boss can be beaten faster. The Director must pick one the player has already earned. */
export type WeaknessId =
  | 'stagger_after_charge'
  | 'piercing_shots'
  | 'homing_shots'
  | 'poison'
  | 'knockback'
  | 'fire_orb'
  | 'holy_orb'
  | 'known_secret';

export const WEAKNESS_IDS: readonly WeaknessId[] = [
  'stagger_after_charge',
  'piercing_shots',
  'homing_shots',
  'poison',
  'knockback',
  'fire_orb',
  'holy_orb',
  'known_secret',
];
