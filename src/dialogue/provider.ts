import { Rng } from '../core/rng';
import { bossOutroLines } from '../data/bossOutro';
import { ENEMIES, getEnemy } from '../data/enemies';
import type { WarFaction } from '../data/lore';
import { factionOf } from '../data/war';
import { DialogueRequest, DialogueScript, validateScript } from './types';

/**
 * Where dialogue text comes from. The game only depends on this interface.
 *
 *  - MockDialogueProvider: offline, seeded, template based. Always available,
 *    used in dev and as the fallback when the LLM is down.
 *  - HttpDialogueProvider: POSTs the DialogueRequest to a small server that
 *    holds the LLM API key (never put the key in the browser) and returns a
 *    DialogueScript JSON. See ROADMAP.md for the server contract.
 */
export interface DialogueProvider {
  generate(req: DialogueRequest): Promise<DialogueScript>;
}

export { SYSTEM_PROMPT } from './prompt';

export class HttpDialogueProvider implements DialogueProvider {
  /** Live scripts (or in-flight fetches) keyed by seed + story; failed fetches are evicted so they retry next time. */
  private readonly cache = new Map<string, Promise<DialogueScript>>();

  constructor(
    private readonly url: string,
    private readonly fallback: DialogueProvider,
    private readonly timeoutMs = 15000,
    private readonly retries = 1,
  ) {}

  generate(req: DialogueRequest): Promise<DialogueScript> {
    const key = `${req.seed}:${req.kind}:${req.speakerId}:${req.language ?? 'en'}:${JSON.stringify(req.story)}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.fetchWithRetry(req);
      this.cache.set(key, pending);
      pending.catch(() => this.cache.delete(key));
    }
    return pending.catch((err) => {
      console.warn('[dialogue] falling back to mock:', err);
      return this.fallback.generate(req);
    });
  }

  /** Fire-and-forget warm-up (e.g. boss intro when a floor starts) so the dialogue opens instantly. */
  prefetch(req: DialogueRequest): void {
    void this.generate(req);
  }

  private async fetchWithRetry(req: DialogueRequest): Promise<DialogueScript> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.fetchOnce(req);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  private async fetchOnce(req: DialogueRequest): Promise<DialogueScript> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`dialogue service ${res.status}`);
      const script = validateScript(await res.json(), req);
      if (!script) throw new Error('dialogue service returned an invalid script');
      return script;
    } finally {
      clearTimeout(timer);
    }
  }
}

const NPC_LINES: Record<string, string[]> = {
  villager: ['Please, {you}, I am no fighter. I only tend the goats.', "Don't hurt me! I know a secret of this place…"],
  priestess: ['Athena sees all you have done, {you}. Speak, and be judged.', 'I do not beg. The goddess weighs your deeds, not my life.'],
  child: ['Are you… are you my father? You look like a hero from the stories.', 'The monsters took everyone. Please don\'t leave me here.'],
  wounded_soldier: ['Water… or a quick end, {you}. Either is a kindness.', 'I held this line until my shield broke. I know what waits ahead.'],
};

/** Second line for non-villager NPCs on a floor the Olympians have lost. */
const FRONT_ASIDE: Record<Exclude<WarFaction, 'olympian'>, string> = {
  titan: 'The Titans hold these halls now. They make us burn the altars of Zeus.',
  giant: "The ground here is hungry. Gaia's children are close.",
};

const nameOf = (id: string): string => ENEMIES.find((e) => e.id === id)?.name ?? id;

/**
 * Seeded, offline dialogue. Deliberately simple: it proves the pipeline
 * (request → script → choice → effects) and is the safety net for the LLM.
 */
export class MockDialogueProvider implements DialogueProvider {
  async generate(req: DialogueRequest): Promise<DialogueScript> {
    const rng = new Rng(`${req.seed}:${req.kind}:${req.speakerId}`);
    const s = req.story;
    const you = s.characterName;
    const front = s.war.front;
    const speakerFaction = factionOf(speakerLore(req.speakerId));
    const kin = s.lore.find((l) => l.startsWith('Link:'))?.slice(6);
    const lastShade = s.shades[s.shades.length - 1];
    const shadeName = lastShade?.split(' ')[0];

    const brokeOath = s.flags.includes(`broke_oath_to_${req.speakerId}`);
    const returning = req.kind === 'boss_intro' && s.bossesKilled.includes(req.speakerId);
    const fallen = s.bossesKilled.filter((id) => id !== req.speakerId);
    const memory = brokeOath
      ? rng.pick([`You swore an oath to me, ${you}, then spilled innocent blood. Oathbreaker.`, `Your word is worth less than the dust of this place, oathbreaker.`])
      : returning
        ? rng.pick([`You again, ${you}? Hades would not keep me. I have walked back out of the dark for you.`, `I remember your blade, ${you}. Death was only a door, and I came back through it.`])
      : shadeName
        ? rng.pick([
            `${shadeName} walks behind you, ${you}. Did you think the dead stay where they fall?`,
            `I smell ${s.shades.length > 1 ? `${s.shades.length} innocents` : shadeName} on your hands. Gaia drank that blood, and she is grateful.`,
            `${shadeName} asked me for justice. I said the hero would come to me soon enough.`,
          ])
        : fallen.length > 0 && s.flags.includes(`slew_${fallen[fallen.length - 1]}`)
          ? `So you are the one who killed the ${nameOf(fallen[fallen.length - 1])}. I will not fall so easily.`
        : s.flags.includes('spared_many')
          ? rng.pick([`Every shade in the ${s.stageName} speaks of your mercy, ${you}. It will not save you here.`, `So many spared… you carry their gratitude like armour. Let us see if it holds.`])
        : s.npcsSpared > 0
          ? rng.pick([`They say you spared the weak. Weakness recognises weakness.`, `Mercy, from ${you}? The gods must be laughing.`])
          : rng.pick([`So the ${s.stageName} sends me ${you}.`, `Another hero comes to die in the ${s.stageName}.`]);

    const kinLine = kin ? `The poets sing that ${kin.trim().replace(/\.$/, '')}. Let us see if they lie.` : rng.pick([`Speak, before I end you.`, `Choose your last words carefully.`, `What do you want, mortal?`]);

    const swear =
      speakerFaction === 'titan'
        ? {
            id: 'swear_titan',
            text: rng.pick(['"Cronus ruled a golden age. Let it return."', 'Swear yourself to the Titans.']),
            reply: 'Then the old blood remembers you. Zeus will not.',
            effects: { karma: -5, boss: { damageMul: 0.8 }, favor: { titan: 15, olympian: -10 }, flags: ['sworn_titan'] },
          }
        : speakerFaction === 'giant'
          ? {
              id: 'feed_earth',
              text: rng.pick(['Cut your palm and let the earth drink.', '"Gaia is owed. Take my blood, not theirs."']),
              reply: 'The Mother tastes you… and lets you pass lighter.',
              effects: { karma: -5, hp: -2, boss: { hpMul: 0.75 }, favor: { giant: 15, olympian: -10 }, flags: ['fed_gaia'] },
            }
          : {
              id: 'swear_zeus',
              text: rng.pick(['"By Zeus who threw down your fathers, stand aside."', 'Invoke the Thunderer.']),
              reply: 'You call on the sky. The sky is far, and I am here.',
              effects: { karma: 5, boss: { speedMul: 0.9 }, favor: { olympian: 15, titan: -5, giant: -5 }, flags: ['sworn_zeus'] },
            };

    const raw =
      req.kind === 'boss_intro'
        ? {
            lines: [memory, kinLine],
            options: [
              swear,
              ...rng
                .shuffle([
                  {
                    id: 'defy',
                    text: rng.pick(['"I will wear your hide as a trophy."', '"Enough talk. Fight."']),
                    reply: 'Then die proud.',
                    effects: { karma: 0, boss: { damageMul: 1.25 }, flags: ['defied_' + req.speakerId] },
                  },
                  {
                    id: 'kneel',
                    text: rng.pick(['Kneel and beg for passage.', '"Spare me, great one."']),
                    reply: 'Pathetic. I will be gentle, so you feel every blow.',
                    effects: { karma: -10, boss: { damageMul: 0.75, hpMul: 1.3 }, favor: speakerFaction ? { [speakerFaction]: 6 } : undefined, flags: ['knelt_' + req.speakerId] },
                  },
                  {
                    id: 'honour',
                    text: rng.pick(['"Let us fight with honour, no tricks."', '"You were wronged. I fight you with respect."']),
                    reply: 'Honour… a word I had forgotten. Very well.',
                    effects: { karma: 10, boss: { speedMul: 0.85 }, flags: ['honoured_' + req.speakerId, 'swore_oath_to_' + req.speakerId] },
                  },
                  {
                    id: 'bargain',
                    text: rng.pick(['Offer your coins for a weaker foe.', '"Take my gold, take it easy on me."']),
                    reply: 'Gold buys little in the dark, but I will take it.',
                    effects: { karma: -5, coins: -10, boss: { hpMul: 0.8 }, flags: ['bargained_' + req.speakerId] },
                  },
                ])
                .slice(0, 2),
            ],
          }
        : req.kind === 'boss_outro'
          ? { lines: bossOutroLines(req, rng), options: [] }
          : req.kind === 'npc' && req.speakerId === 'restless_shade'
          ? {
              lines: [
                shadeName
                  ? `I am ${shadeName}. You remember me, ${you}? You did not stop to look.`
                  : `I died in these halls before you came. The living never look.`,
                rng.pick([`The earth keeps count of every one of us.`, `Down here they say the Giants are winning. They say you helped.`]),
              ],
              options: [
                { id: 'atone', text: 'Kneel and give the shade a coin for the ferryman.', reply: 'Charon will take it. I will not forget who paid.', effects: { karma: 12, coins: -3, favor: { olympian: 6, giant: -6 }, flags: ['paid_ferryman'], npcOutcome: 'spared' } },
                { id: 'ignore', text: 'Walk past. The dead are dead.', reply: 'Yes. Walk. We will all be waiting below.', effects: { karma: -6, favor: { giant: 6 }, npcOutcome: 'wronged' } },
                { id: 'ask', text: '"Who holds this place now?"', reply: `${s.war.frontReason}`, effects: { karma: 0, flags: ['knows_front'], npcOutcome: 'spared' } },
              ],
            }
          : req.kind === 'npc'
            ? {
                lines: [
                  req.speakerId === 'villager' || !NPC_LINES[req.speakerId]
                    ? front === 'olympian'
                      ? rng.pick(NPC_LINES.villager).replace(/\{you\}/g, you)
                      : front === 'titan'
                        ? rng.pick([`They took the temple and made us burn Zeus's altars. Please, I only did as I was told.`, `The Titans promise a golden age. My son believed them. Have you seen him?`])
                        : rng.pick([`The ground opened and swallowed my street, ${you}. Gaia is angry. Is it true it is your fault?`, `Don't let them feed me to the earth…`])
                    : rng.pick(NPC_LINES[req.speakerId]).replace(/\{you\}/g, you),
                  ...(req.speakerId !== 'villager' && front !== 'olympian' ? [FRONT_ASIDE[front]] : []),
                ],
                options: [
                  { id: 'spare', text: 'Let them go.', reply: 'May the gods remember this.', effects: { karma: 10, favor: { olympian: 4 }, npcOutcome: 'spared' } },
                  { id: 'rob', text: 'Take their coins and leave.', reply: 'Take it… just go.', effects: { karma: -5, coins: 5, favor: { giant: 3 }, npcOutcome: 'wronged' } },
                  { id: 'threaten', text: 'Demand the secret.', reply: bossHint(front), effects: { karma: -2, flags: ['knows_boss_weakness'], npcOutcome: 'wronged' } },
                ],
              }
          : req.kind === 'shrine'
            ? s.flags.includes('godslayer')
              ? {
                  lines: [
                    rng.pick([
                      `The altar goes cold as you approach. Olympus remembers what you did, ${you}.`,
                      `The flame gutters and dies. No god will hear a godslayer's prayer.`,
                    ]),
                    'What do you offer to those who have already turned away?',
                  ],
                  options: [
                    { id: 'blood', text: 'Offer blood (lose 1 heart).', reply: 'Your blood hisses on the stone. Nothing answers.', effects: { hp: -2, karma: -5 } },
                    { id: 'gold', text: 'Offer 5 coins.', reply: 'The coins slide off the altar into the dark. Spurned.', effects: { coins: -5, karma: 0 } },
                    { id: 'nothing', text: 'Turn your back on the altar.', reply: 'You need no gods. They need to fear you.', effects: { karma: 0, flags: ['spurned_gods'] } },
                  ],
                }
              : {
                  lines: ['An altar hums with divine attention. What do you offer?'],
                  options: [
                    { id: 'blood', text: 'Offer blood (lose 1 heart).', reply: 'Ares approves.', effects: { hp: -2, karma: -5, boss: { hpMul: 0.85 } } },
                    { id: 'gold', text: 'Offer 5 coins.', reply: 'Hermes smiles.', effects: { coins: -5, karma: 5 } },
                    { id: 'nothing', text: 'Offer nothing.', reply: 'The gods take note.', effects: { karma: 0 } },
                  ],
                }
            : {
                lines: [rng.pick(['Remember me… when you face what waits below.', 'You only delay the inevitable, ' + you + '.'])],
                options: [],
              };

    const script = validateScript(raw, req);
    if (!script) throw new Error('mock produced invalid script');
    return script;
  }
}

function speakerLore(enemyId: string): string | undefined {
  try {
    return getEnemy(enemyId).lore;
  } catch {
    return undefined;
  }
}

function bossHint(front: WarFaction): string {
  switch (front) {
    case 'titan':
      return 'The Titan below keeps its distance and blinks away when cornered. Stay close, strike when it lands.';
    case 'giant':
      return 'The Giant stomps before it charges. When the earth trembles, run to its side, not away.';
    default:
      return 'The beast below fears fire… and pride.';
  }
}

/** Pick the provider from env: set VITE_DIALOGUE_API=https://your-server/dialogue to use the LLM. */
export function createDialogueProvider(): DialogueProvider {
  const mock = new MockDialogueProvider();
  const url = import.meta.env.VITE_DIALOGUE_API as string | undefined;
  return url ? new HttpDialogueProvider(url, mock) : mock;
}

export const dialogueProvider = createDialogueProvider();
