import { Rng } from '../core/rng';
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
export const SYSTEM_PROMPT = `You write short in-character dialogue for a Greek-mythology roguelike.
Return ONLY JSON matching:
{"lines": string[1-3], "options": [{"id": string, "text": string, "reply": string,
 "effects": {"karma": number, "flags": string[], "boss": {"hpMul": number, "damageMul": number, "speedMul": number}, "hp": number, "coins": number}}] (2-4 items)}
Rules: stay in persona; react to the player's deeds (npcs killed/spared, karma, bosses slain); options must be meaningfully different (defiant / humble / cunning / merciful…);
effects must be fair: karma -30..30, boss multipliers 0.5..2, hp -4..4. Never break character, never mention JSON.
If the player's flags include "godslayer", the gods refuse every shrine offering: the shrine still takes what is offered (hp, coins) but grants no boon, no karma gain and no boss modifiers.`;

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

    const memory =
      s.npcsKilled > 0
        ? rng.pick([
            `I smell the blood of the ${s.npcsKilled} innocent${s.npcsKilled > 1 ? 's' : ''} you cut down.`,
            `The shades of those you murdered whisper your name, ${you}.`,
          ])
        : s.npcsSpared > 0
          ? rng.pick([`They say you spared the weak. Weakness recognises weakness.`, `Mercy, from a ${you}? The gods must be laughing.`])
          : rng.pick([`So the ${s.stageName} sends me a ${you}.`, `Another hero comes to die on floor ${s.floor}.`]);

    const raw =
      req.kind === 'boss_intro'
        ? {
            lines: [memory, rng.pick([`Speak, before I end you.`, `Choose your last words carefully.`, `What do you want, mortal?`])],
            options: rng.shuffle([
              {
                id: 'defy',
                text: rng.pick(['"I will wear your horns as a trophy."', '"Enough talk. Fight."']),
                reply: 'Then die proud.',
                effects: { karma: 0, boss: { damageMul: 1.25 }, flags: ['defied_' + req.speakerId] },
              },
              {
                id: 'kneel',
                text: rng.pick(['Kneel and beg for passage.', '"Spare me, great one."']),
                reply: 'Pathetic. I will be gentle, so you feel every blow.',
                effects: { karma: -10, boss: { damageMul: 0.75, hpMul: 1.3 } },
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
            ]).slice(0, 3),
          }
        : req.kind === 'npc'
          ? {
              lines: [
                rng.pick([`Please, ${you}, I am no fighter. I only tend the goats.`, `Don't hurt me! I know a secret of this place…`]),
              ],
              options: [
                { id: 'spare', text: 'Let them go.', reply: 'May the gods remember this.', effects: { karma: 10 } },
                { id: 'rob', text: 'Take their coins and leave.', reply: 'Take it… just go.', effects: { karma: -5, coins: 5 } },
                { id: 'threaten', text: 'Demand the secret.', reply: 'The beast below fears fire… and pride.', effects: { karma: -2, flags: ['knows_boss_weakness'] } },
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

/** Pick the provider from env: set VITE_DIALOGUE_API=https://your-server/dialogue to use the LLM. */
export function createDialogueProvider(): DialogueProvider {
  const mock = new MockDialogueProvider();
  const url = import.meta.env.VITE_DIALOGUE_API as string | undefined;
  return url ? new HttpDialogueProvider(url, mock) : mock;
}

export const dialogueProvider = createDialogueProvider();
