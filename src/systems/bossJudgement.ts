import { getAbility } from '../data/abilities';
import type { StorySnapshot } from '../core/story';
import type { Enemy } from '../entities/Enemy';

/**
 * What a Director-judged boss makes of the hero, as colour and words, so the
 * verdict is readable in the fight itself (banner, hp bar, aura), not only in
 * dialogue.
 */
export interface Verdict {
  stance: string;
  color: number;
  css: string;
}

export function verdictOf(alignment: StorySnapshot['alignment']): Verdict {
  switch (alignment) {
    case 'cruel':
      return { stance: 'AVENGER · it names your dead', color: 0xd83838, css: '#ff6a5a' };
    case 'heroic':
      return { stance: 'HONOUR · it meets you as an equal', color: 0xe0b040, css: '#f0c860' };
    default:
      return { stance: 'CURIOSITY · it weighs you', color: 0x9070c8, css: '#b090f0' };
  }
}

/** Banner lines: the boss's own kit, what it added against this hero, and the weakness the hero earned. */
export function judgementLines(enemy: Enemy, heroName: string): string[] {
  const bp = enemy.blueprint;
  if (!bp) return [];
  const kit = enemy.def.abilities ?? [];
  const own = kit.map((a) => getAbility(a).name);
  const extras = bp.abilities
    .filter((a) => !kit.includes(a))
    .map((a) => {
      const def = getAbility(a);
      return def.counters ? `${def.name} (vs ${def.counters.replace(/_/g, ' ')})` : def.name;
    });
  return [
    `Its own: ${own.join(', ') || '—'}`,
    `Against ${heroName}: ${extras.join(' · ') || 'nothing more'}`,
    `Weakness: ${bp.weakness.replace(/_/g, ' ')}`,
  ];
}
