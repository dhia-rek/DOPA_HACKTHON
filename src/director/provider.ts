import { aiEndpoint } from '../core/ai';
import { Rng } from '../core/rng';
import type { AbilityId } from '../data/abilities';
import { DirectorRequest, FloorDirective, validateDirective } from './types';

/**
 * Where floor directives come from. The game depends only on this interface.
 *
 *  - MockDirectorProvider: offline, seeded, rule based. Always available and
 *    the fallback when the LLM is down or slow.
 *  - HttpDirectorProvider: POSTs the DirectorRequest to the server that holds
 *    the LLM key (never in the browser) and returns a FloorDirective JSON.
 */
export interface DirectorProvider {
  direct(req: DirectorRequest): Promise<FloorDirective>;
}

export class HttpDirectorProvider implements DirectorProvider {
  constructor(
    private readonly url: string,
    private readonly fallback: DirectorProvider,
    private readonly timeoutMs = 10000,
  ) {}

  async direct(req: DirectorRequest): Promise<FloorDirective> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`director service ${res.status}`);
      const directive = validateDirective(await res.json(), req);
      if (!directive) throw new Error('director service returned an invalid directive');
      return directive;
    } catch (err) {
      console.warn('[director] falling back to mock:', err);
      return this.fallback.direct(req);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Seeded, offline Director. Deliberately simple rules that prove the pipeline
 * (profile → directive → floor) and read well in the debug overlay.
 */
export class MockDirectorProvider implements DirectorProvider {
  async direct(req: DirectorRequest): Promise<FloorDirective> {
    const rng = new Rng(`${req.seed}:director`);
    const p = req.profile;
    const s = p.story;
    const cat = p.catalogs;
    const cruel = s.alignment === 'cruel';
    const struggling = p.skill === 'struggling';

    const mutators: string[] = ['palette_shift'];
    if (s.npcsKilled >= 2) mutators.push('haunted');
    else if (struggling) mutators.push('pilgrim_road');
    else if (p.style === 'aggressive') mutators.push('arena');
    else if (p.patron === 'poseidon' || p.divineAttention.poseidon === 0) mutators.push('flooded');

    const archetype = rng.pick(cat.bosses);
    const kit = cat.bossKits?.[archetype] ?? [];
    const hero = p.character;
    // Extras answer the hero: the kit is the boss's own, these are the Director's reading of the player.
    const wanted: AbilityId[] = [];
    if (p.buildArchetype.startsWith('homing') || hero.passive === 'rage') wanted.push('orbit_shields');
    else if (p.style === 'kiter' || hero.stats.range >= 300) wanted.push('teleport_behind');
    else wanted.push('summon_minions');
    if (hero.passive === 'regen' || p.buildArchetype === 'tank') wanted.push('steal_hearts');
    else if (s.npcsKilled >= 2) wanted.push('call_shades');
    else if (hero.passive === 'glass') wanted.push('volley');
    else if (!struggling) wanted.push(rng.pick<AbilityId>(['projectile_ring', 'poison_trail', 'ground_slam']));
    const abilities = [...new Set(wanted.filter((a) => !kit.includes(a)))];
    if (!abilities.length) abilities.push(kit.includes('ground_slam') ? 'projectile_ring' : 'ground_slam');

    const grudgeDeed = s.recentDeeds[s.recentDeeds.length - 1];
    const promised = p.prophecies.find((x) => x.kind === 'boss_weakness' && x.truthful);
    const returning = p.prophecies.filter((x) => x.kind === 'npc_returns' && x.truthful && cat.npcs.includes(x.payload)).map((x) => ({ id: x.payload, role: 'witness' }));
    const promisedMod = p.prophecies.find((x) => (x.kind === 'boon_next_floor' || x.kind === 'curse') && x.truthful);

    const raw = {
      floorTitle: cruel ? rng.pick(['The Polis Remembers', 'Blood Debt']) : struggling ? 'A Kinder Road' : rng.pick(['Under Watching Eyes', 'The Descent Continues']),
      verdict: cruel
        ? `The shades you made whisper your name.\n${p.patron ? capital(p.patron) : 'Hades'} watches, and does not look away.`
        : `You walk with ${s.npcsSpared > 0 ? 'mercy' : 'steel'} in your hands.\nThe gods take note, ${s.characterName}.`,
      mutators,
      enemyWeights: p.style === 'kiter' ? { centaur_archer: 1.5 } : {},
      modifier: promisedMod
        ? { id: promisedMod.payload, label: promisedMod.kind === 'curse' ? 'The shrine\'s curse follows you' : 'The shrine keeps its word' }
        : struggling
          ? { id: 'boon_heart', label: 'A god pities you: +1 heart' }
          : null,
      npcs: returning.length ? returning : cat.npcs.length ? [{ id: cat.npcs[0], role: 'witness' }] : [],
      quest: cat.npcs.length && !cruel ? { templateId: 'spare_all', params: { floors: 1 }, giverNpcId: cat.npcs[0], hook: 'Spare the innocent of this floor and the gods will remember.', reward: 'coins:10' } : null,
      boss: {
        archetype,
        title: cruel ? `${capital(archetype)}, Avenger of the Innocent` : `${capital(archetype)} of Floor ${req.floor}`,
        persona: cruel ? 'Cold, righteous, names the dead one by one.' : 'Proud, curious about this mortal, fights with honour.',
        abilities,
        phases: struggling ? [] : [{ atHpPct: 40, add: ['enrage_below'], line: cruel ? 'They are watching you die.' : 'Good. Now I am awake.' }],
        weakness: promised?.payload ?? cat.earnedWeaknesses[0] ?? 'stagger_after_charge',
        mods: { hpMul: 1, damageMul: 1, speedMul: 1 },
        grudge: grudgeDeed ?? 'Another hero, another corpse for the labyrinth.',
      },
      epithet: s.npcsKilled >= 2 ? 'the Butcher' : s.npcsSpared >= 2 ? 'the Merciful' : null,
      reason: `mock: alignment=${s.alignment}, skill=${p.skill}, style=${p.style}, build=${p.buildArchetype}, hero=${hero.id}/${hero.passive ?? 'none'}, kit=${kit.join('+') || 'none'}, patron=${p.patron ?? 'none'}, budget=${p.budget}`,
    };

    const directive = validateDirective(raw, req);
    if (!directive) throw new Error('mock produced invalid directive');
    return directive;
  }
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** Pick the provider from env: VITE_DIRECTOR_API, else `<VITE_DIALOGUE_API>/director`, else the offline mock. */
export function createDirectorProvider(): DirectorProvider {
  const mock = new MockDirectorProvider();
  const url = (import.meta.env.VITE_DIRECTOR_API as string | undefined) || aiEndpoint('/director');
  return url ? new HttpDirectorProvider(url, mock) : mock;
}

export const directorProvider = createDirectorProvider();
