import type { StoryState } from '../core/story';

/**
 * The Lost Child arc (STORY.md, Phase 4 #5). The `child` NPC is young Persephone
 * in disguise: protect her through the descent and the last gate reveals it;
 * kill her and every later boss carries Hades' grudge.
 *
 * Flags: `child_floor_<n>` (met and let go on floor n), `child_dead`,
 * `persephone_revealed`. Deed subject `wronged_child` marks a robbed/threatened child.
 */
export const CHILD_ID = 'child';

export const CHILD = {
  /** Killing the child, on top of KARMA.npcKilled. Alone it makes you 'cruel'. */
  killKarma: -20,
  /** Hades' grudge: every boss after the child's death hits this much harder. */
  bossDamageMul: 1.15,
  /** Floors on which she must be met and let go before the gate reveals her. */
  meetingsForReveal: 2,
} as const;

export const childFloorFlag = (floor: number): string => `child_floor_${floor}`;

/** Floors on which the child was spared, ascending. */
export function childFloors(story: StoryState): number[] {
  return [...story.flags]
    .filter((f) => f.startsWith('child_floor_'))
    .map((f) => Number(f.slice('child_floor_'.length)))
    .sort((a, b) => a - b);
}

/** Never harmed, never robbed, met often enough: the gate may reveal her. */
export function childProtected(story: StoryState): boolean {
  if (story.hasFlag('child_dead') || story.hasFlag('godslayer')) return false;
  if (story.deeds.some((d) => d.subject === `wronged_${CHILD_ID}`)) return false;
  return childFloors(story).length >= CHILD.meetingsForReveal;
}

/**
 * Her line on the n-th meeting (0-based) after the first. Each one gives away a
 * little more; the LLM prompt gets the same beats via SYSTEM_PROMPT.
 */
export const CHILD_HINTS: string[] = [
  'You again! I followed the singing down the stairs. Did you hear it too? It sounds like my mother.',
  'The flowers grow back where I sit. Look — asphodel, in the dark. Don\'t tell anyone.',
  'The dog with three heads only growls at strangers. He let me pat him.',
  'He says I have to stay here half the year, {you}. He says the seeds are already in me.',
];

/** Boss-intro memory when the child is dead: the boss speaks for Hades. */
export const CHILD_DEAD_BOSS_LINES: string[] = [
  'Do you know whose daughter you struck down, {you}? Hades has emptied his halls to meet you.',
  'The little girl in the dark. He counted her steps; now he counts yours.',
  'You killed the one the Lord Below was waiting for. Every gate from here is his.',
];

/** Toast at the last gate when she is revealed. */
export const PERSEPHONE_REVEAL = {
  title: 'Kore',
  body: 'The child lifts the hem of her cloak: a crown of asphodel and pomegranate. "Mother is waiting. Walk me home, {you}." The Queen of the Dead takes your hand.',
};
