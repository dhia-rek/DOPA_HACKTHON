import { aiEndpoint, postJson } from '../core/ai';
import { Rng } from '../core/rng';
import { TrialObjective, TrialOffer, TrialRequest, validateTrial } from './types';

export interface TrialProvider {
  offer(req: TrialRequest): Promise<TrialOffer>;
}

/** Offline, seeded trials that still react to the story (used when no AI server is configured or it fails). */
export class MockTrialProvider implements TrialProvider {
  async offer(req: TrialRequest): Promise<TrialOffer> {
    const rng = new Rng(`trial:${req.seed}`);
    const s = req.story;
    const you = s.characterName;
    const lastDeed = s.recentDeeds[s.recentDeeds.length - 1];
    let raw: Omit<TrialOffer, 'id' | 'acceptText' | 'refuseText'>;

    if (s.npcsKilled > 0) {
      raw = {
        giverName: 'Nemesis',
        title: 'Atonement',
        lines: [`${lastDeed ?? 'Innocent blood'}. I keep the ledger, ${you}.`, 'Spill no more innocent blood before this floor’s master falls, and I may yet close the book.'],
        objective: { type: 'spare_all' },
        reward: { karma: 20, hp: 2, flags: ['atoned'] },
        penalty: { karma: -15, bossHpMul: 1.25, flags: ['hunted_by_nemesis'] },
      };
    } else if (s.alignment === 'cruel') {
      const enemyId = rng.pick(req.enemyPool);
      const n = rng.int(3, 5);
      raw = {
        giverName: 'Ares',
        title: 'Blood Tithe',
        lines: [`I like you, ${you}. The weak scatter before you.`, `Bring me ${n} of the ${enemyId.replace(/_/g, ' ')}s and I will make the next beast bleed easier.`],
        objective: { type: 'slay', n, enemyId },
        reward: { coins: 8, bossHpMul: 0.8, flags: ['favoured_by_ares'] },
        penalty: { hp: -2, flags: ['mocked_by_ares'] },
      };
    } else if (s.alignment === 'heroic') {
      const n = Math.min(req.normalRooms, rng.int(2, 3));
      raw = {
        giverName: 'Athena',
        title: 'Flawless',
        lines: [`Your mercy is known on Olympus, ${you}. Now show me your skill.`, `Cross ${n} chambers and let no blade touch you.`],
        objective: { type: 'untouched_rooms', n: Math.max(1, n) },
        reward: { hp: 2, karma: 10, flags: ['blessed_by_athena'] },
        penalty: { karma: -5 },
      };
    } else {
      const objective: TrialObjective = rng.pick<TrialObjective>([
        { type: 'haste', seconds: rng.int(90, 150) },
        { type: 'collect_coins', n: rng.int(4, 7) },
        { type: 'slay', n: rng.int(5, 8) },
      ]);
      const byType = {
        haste: { giverName: 'Hermes', title: 'Swift Feet', lines: [`Still undecided, ${you}? Then at least be quick.`, 'Race me to the lair of this floor’s master.'] },
        collect_coins: { giverName: 'Charon', title: 'The Ferry Fare', lines: ['Every soul pays the ferryman, hero.', 'Gather my fare before the boss falls and I will remember your face.'] },
        slay: { giverName: 'Artemis', title: 'The Hunt', lines: [`A hunt, ${you}. Nothing more, nothing less.`, 'Thin the beasts of this place and I will guide your aim.'] },
      } as const;
      raw = {
        ...byType[objective.type as keyof typeof byType],
        lines: [...byType[objective.type as keyof typeof byType].lines],
        objective,
        reward: { coins: 6, hp: 1 },
        penalty: { coins: -3 },
      };
    }

    const offer = validateTrial({ ...raw, id: `trial_${req.seed}`, acceptText: 'I accept your trial.', refuseText: 'I answer to no god.' }, req);
    if (!offer) throw new Error('mock produced invalid trial');
    return offer;
  }
}

export class HttpTrialProvider implements TrialProvider {
  constructor(
    private readonly url: string,
    private readonly fallback: TrialProvider,
  ) {}

  async offer(req: TrialRequest): Promise<TrialOffer> {
    try {
      const offer = validateTrial(await postJson(this.url, req), req);
      if (offer) return offer;
      throw new Error('invalid trial from server');
    } catch (err) {
      console.warn('[trial] falling back to mock:', err);
      return this.fallback.offer(req);
    }
  }
}

function createTrialProvider(): TrialProvider {
  const mock = new MockTrialProvider();
  const url = aiEndpoint('/trial');
  return url ? new HttpTrialProvider(url, mock) : mock;
}

export const trialProvider = createTrialProvider();
