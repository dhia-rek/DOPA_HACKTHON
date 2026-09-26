import { Rng } from '../core/rng';
import { getEnemy } from '../data/enemies';
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

/** Prompt the LLM service should use as the system message. Exported so the server can import/copy it. */
export const SYSTEM_PROMPT = `You write short in-character dialogue for Nekyia, a Greek-mythology roguelike set during the war of the gods:
Olympians (Zeus's house) against the Titans (Cronus's kin, loosed from Tartarus) and the Giants (Gaia's earthborn, who can only be killed with a mortal's help). Not a video-game adaptation: use real myth only.
Return ONLY JSON matching:
{"lines": string[1-3], "options": [{"id": string, "text": string, "reply": string,
 "effects": {"karma": number, "flags": string[], "boss": {"hpMul": number, "damageMul": number, "speedMul": number}, "hp": number, "coins": number, "favor": {"olympian": number, "titan": number, "giant": number}}}] (2-4 items)}
You receive story.lore (true genealogy/kinship lines between the speaker and the hero — use them: a son of Zeus is an enemy to a Titan, a monster remembers who slew its kin),
story.war (tide per faction, which faction holds this floor and why), and story.shades (NAMES of innocents the hero killed — name them, let them haunt; never invent other victims).
Rules: stay in persona; react to deeds (shades, karma, bosses slain, oaths/flags); options must be meaningfully different (defiant / humble / cunning / merciful / swear to a faction);
"favor" shifts the war toward a faction (-20..20 each) and should follow from the choice (kneel to a Titan -> titan +, honour Zeus -> olympian +, feed blood to the earth -> giant +).
Effects must be fair: karma -30..30, boss multipliers 0.5..2, hp -4..4, coins -20..20. Never break character, never mention JSON.`;

export class HttpDialogueProvider implements DialogueProvider {
  constructor(
    private readonly url: string,
    private readonly fallback: DialogueProvider,
    private readonly timeoutMs = 8000,
  ) {}

  async generate(req: DialogueRequest): Promise<DialogueScript> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`dialogue service ${res.status}`);
      const script = validateScript(await res.json(), req);
      if (!script) throw new Error('dialogue service returned an invalid script');
      return script;
    } catch (err) {
      console.warn('[dialogue] falling back to mock:', err);
      return this.fallback.generate(req);
    }
  }
}

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

    const memory = shadeName
      ? rng.pick([
          `${shadeName} walks behind you, ${you}. Did you think the dead stay where they fall?`,
          `I smell ${s.shades.length > 1 ? `${s.shades.length} innocents` : shadeName} on your hands. Gaia drank that blood, and she is grateful.`,
          `${shadeName} asked me for justice. I said the hero would come to me soon enough.`,
        ])
      : s.npcsSpared > 0
        ? rng.pick([`They say you spared the weak. Weakness recognises weakness.`, `Mercy, from ${you}? The gods must be laughing.`])
        : rng.pick([`So ${s.stageName} sends me ${you}.`, `Another hero comes to die on floor ${s.floor}.`]);

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
                    effects: { karma: -10, boss: { damageMul: 0.75, hpMul: 1.3 }, favor: speakerFaction ? { [speakerFaction]: 6 } : undefined },
                  },
                  {
                    id: 'honour',
                    text: rng.pick(['"Let us fight with honour, no tricks."', '"You were wronged. I fight you with respect."']),
                    reply: 'Honour… a word I had forgotten. Very well.',
                    effects: { karma: 10, boss: { speedMul: 0.85 } },
                  },
                  {
                    id: 'bargain',
                    text: rng.pick(['Offer your coins for a weaker foe.', '"Take my gold, take it easy on me."']),
                    reply: 'Gold buys little in the dark, but I will take it.',
                    effects: { karma: -5, coins: -10, boss: { hpMul: 0.8 } },
                  },
                ])
                .slice(0, 2),
            ],
          }
        : req.kind === 'npc' && req.speakerId === 'shade'
          ? {
              lines: [
                shadeName
                  ? `I am ${shadeName}. You remember me, ${you}? You did not stop to look.`
                  : `I died in these halls before you came. The living never look.`,
                rng.pick([`The earth keeps count of every one of us.`, `Down here they say the Giants are winning. They say you helped.`]),
              ],
              options: [
                { id: 'atone', text: 'Kneel and give the shade a coin for the ferryman.', reply: 'Charon will take it. I will not forget who paid.', effects: { karma: 12, coins: -3, favor: { olympian: 6, giant: -6 }, flags: ['paid_ferryman'] } },
                { id: 'ignore', text: 'Walk past. The dead are dead.', reply: 'Yes. Walk. We will all be waiting below.', effects: { karma: -6, favor: { giant: 6 } } },
                { id: 'ask', text: '"Who holds this place now?"', reply: `${s.war.frontReason}`, effects: { karma: 0, flags: ['knows_front'] } },
              ],
            }
          : req.kind === 'npc'
            ? {
                lines: [
                  front === 'olympian'
                    ? rng.pick([`Please, ${you}, I am no fighter. I only tend the goats.`, `Don't hurt me! I know a secret of this place…`])
                    : front === 'titan'
                      ? rng.pick([`They took the temple and made us burn Zeus's altars. Please, I only did as I was told.`, `The Titans promise a golden age. My son believed them. Have you seen him?`])
                      : rng.pick([`The ground opened and swallowed my street, ${you}. Gaia is angry. Is it true it is your fault?`, `Don't let them feed me to the earth…`]),
                ],
                options: [
                  { id: 'spare', text: 'Let them go.', reply: 'May the gods remember this.', effects: { karma: 10, favor: { olympian: 4 } } },
                  { id: 'rob', text: 'Take their coins and leave.', reply: 'Take it… just go.', effects: { karma: -5, coins: 5, favor: { giant: 3 } } },
                  { id: 'threaten', text: 'Demand the secret.', reply: bossHint(front), effects: { karma: -2, flags: ['knows_boss_weakness'] } },
                ],
              }
          : req.kind === 'shrine'
            ? {
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
