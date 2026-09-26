import { aiEndpoint, postJson } from '../core/ai';
import { Rng } from '../core/rng';
import { FloorOmen, OmenRequest, validateOmen } from './types';

const SKULL = [
  '...##...##...',
  '..#.......#..',
  '..#.E...E.#..',
  '.............',
  '...#.#.#.#...',
  '....P...P....',
  '....E........',
];
const TRIDENT = [
  '.............',
  '..#.#...#.#..',
  '..#.#.E.#.#..',
  '..###...###..',
  '...#.....#...',
  '...#.E.E.#...',
  '.............',
];
const LABYRINTH = [
  '.#####.#####.',
  '.....#.#.....',
  '.###.....###.',
  '..E#.#.#.#E..',
  '.###.#.#.###.',
  '.....#.#.....',
  '.#####.####E.',
];

/** Offline omen: seeded, but still reads the story (cruel → blood, heroic → hallowed…). */
export function mockOmen(req: OmenRequest): FloorOmen {
  const rng = new Rng(`omen:${req.seed}`);
  const s = req.story;
  const gentle = req.floor <= 1;
  const bias = [rng.pick(req.enemyPool)];
  let raw: Record<string, unknown>;
  if (s.flags.includes('godslayer')) {
    raw = { name: 'Ashes of Olympus', line: 'The gods you slew rain down as ash. Nothing here will pray for you.', theme: 'ashen', density: 0.18, pitChance: 0.4, enemyDelta: gentle ? 0 : 2, npcChance: 0, shrineChance: 0.3, extraRooms: 1, enemyBias: bias, signatureRoom: SKULL };
  } else if (s.alignment === 'cruel' || s.npcsKilled >= 2) {
    raw = { name: 'The Weeping Streets', line: `${s.recentDeeds[s.recentDeeds.length - 1] ?? 'Blood follows you'}. The stones remember, and the ground splits open.`, theme: 'blood', density: 0.16, pitChance: 0.5, enemyDelta: gentle ? 0 : 1, npcChance: 0.1, shrineChance: 0.4, extraRooms: 1, enemyBias: bias, signatureRoom: SKULL };
  } else if (s.alignment === 'heroic') {
    raw = { name: 'Poseidon’s Favour', line: `Word of your mercy has reached the sea-god, ${s.characterName}. The halls open to you, and the lost seek your help.`, theme: 'hallowed', density: 0.08, pitChance: 0.15, enemyDelta: 0, npcChance: 0.5, shrineChance: 1, extraRooms: 0, enemyBias: [], signatureRoom: TRIDENT };
  } else {
    const drowned = rng.chance(0.5);
    raw = drowned
      ? { name: 'The Drowned Halls', line: 'The Styx has risen. Undecided souls wander until someone chooses for them.', theme: 'drowned', density: 0.12, pitChance: 0.45, enemyDelta: 0, npcChance: 0.35, shrineChance: 0.75, extraRooms: 0, enemyBias: bias, signatureRoom: LABYRINTH }
      : { name: 'Hall of Gilded Lies', line: 'Gold glitters in every corner. Greed or mercy: the choice is still yours.', theme: 'gilded', density: 0.1, pitChance: 0.2, enemyDelta: 0, npcChance: 0.35, shrineChance: 0.75, extraRooms: 0, enemyBias: bias, signatureRoom: LABYRINTH };
  }
  const omen = validateOmen(raw, req);
  if (!omen) throw new Error('mock produced invalid omen');
  return omen;
}

/**
 * Floors are generated synchronously, so the AI omen is fetched ahead of time:
 * prefetched when the previous boss falls and awaited (briefly) by
 * FloorIntroScene. Omens are keyed by seed + deeds, so a deed done after the
 * prefetch triggers a fresh request; anything not ready in time uses the mock.
 */
export class OmenDirector {
  private readonly ready = new Map<string, FloorOmen>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly url = aiEndpoint('/omen');

  prefetch(req: OmenRequest): void {
    void this.load(req, 0);
  }

  /** Resolves once the omen for `req` is ready, or after `timeoutMs` (never rejects). */
  load(req: OmenRequest, timeoutMs = 3000): Promise<void> {
    if (!this.url) return Promise.resolve();
    const key = omenKey(req);
    if (this.ready.has(key)) return Promise.resolve();
    let p = this.pending.get(key);
    if (!p) {
      p = postJson(this.url, req)
        .then((raw) => {
          const omen = validateOmen(raw, req);
          if (omen) this.ready.set(key, omen);
          else console.warn('[omen] invalid omen from server, using mock');
        })
        .catch((err) => console.warn('[omen] falling back to mock:', err))
        .finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return Promise.race([p, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  }

  get(req: OmenRequest): FloorOmen {
    return this.ready.get(omenKey(req)) ?? mockOmen(req);
  }
}

/** Seed + the player's deeds; excludes the front-dependent war/lore/stage fields so a prefetch made before descending still matches. */
function omenKey(req: OmenRequest): string {
  const s = req.story;
  return `${req.seed}:${JSON.stringify([s.karma, s.flags, s.npcsKilled, s.npcsSpared, s.bossesKilled, s.recentDeeds, s.shades, s.items])}`;
}
