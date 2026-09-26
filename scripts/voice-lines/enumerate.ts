/**
 * Lists every line the offline (mock) providers can give a speaker with a
 * recorded voice, so render.py can pre-record them. Build + run:
 *   npx vite build --ssr scripts/voice-lines/enumerate.ts --outDir .voice-lines && node .voice-lines/enumerate.js > scripts/voice-lines/lines.json
 */
import type { StorySnapshot } from '../../src/core/story';
import { CHARACTERS } from '../../src/data/characters';
import { STAGES } from '../../src/data/stages';
import { MockDialogueProvider } from '../../src/dialogue/provider';
import { MockTrialProvider } from '../../src/trials/provider';
import { describeObjective } from '../../src/trials/types';
import { lineKey } from '../../src/voice/lineKey';

const NPCS = ['villager', 'priestess', 'child', 'wounded_soldier'];
const BOSSES = ['minotaur', 'hydra'];
const FRONTS = ['olympian', 'titan', 'giant'] as const;
const SEEDS = 400;
const enemyPool = [...new Set(STAGES.flatMap((s) => s.enemyPool))];

const out = new Map<string, { speakerId: string; text: string }>();
const add = (speakerId: string, text: string | undefined) => {
  if (text) out.set(lineKey(speakerId, text), { speakerId, text });
};

function story(characterName: string, front: (typeof FRONTS)[number], extra: Partial<StorySnapshot> = {}): StorySnapshot {
  return {
    characterId: characterName.toLowerCase(),
    characterName,
    floor: 1,
    stageName: 'Ruined Polis',
    karma: 0,
    alignment: 'neutral',
    flags: [],
    npcsKilled: 0,
    npcsSpared: 0,
    bossesKilled: [],
    items: [],
    recentDeeds: [],
    war: { front, frontReason: '' } as unknown as StorySnapshot['war'],
    shades: [],
    lore: [],
    ...extra,
  };
}

const dialogue = new MockDialogueProvider();
const trials = new MockTrialProvider();

for (const c of CHARACTERS) {
  for (const front of FRONTS) {
    for (let seed = 0; seed < SEEDS; seed++) {
      for (const speakerId of NPCS) {
        const s = await dialogue.generate({ kind: 'npc', speakerId, speakerName: speakerId, persona: '', story: story(c.name, front), seed: `${seed}` });
        s.lines.forEach((l) => add(speakerId, l));
        s.options.forEach((o) => add(speakerId, o.reply));
      }
      for (const flags of [[], ['godslayer']]) {
        const s = await dialogue.generate({ kind: 'shrine', speakerId: 'altar', speakerName: 'Altar', persona: '', story: story(c.name, front, { flags }), seed: `${seed}` });
        s.lines.forEach((l) => add('altar', l));
        s.options.forEach((o) => add('altar', o.reply));
      }
    }
  }
  for (const speakerId of BOSSES) {
    const other = BOSSES.find((b) => b !== speakerId)!;
    const states: Partial<StorySnapshot>[] = [
      {},
      { npcsSpared: 1 },
      { flags: ['spared_many'], npcsSpared: 5 },
      { flags: [`broke_oath_to_${speakerId}`] },
      { bossesKilled: [speakerId] },
      { bossesKilled: [other], flags: [`slew_${other}`] },
      { alignment: 'cruel', karma: -60 },
      { alignment: 'heroic', karma: 60 },
    ];
    for (const stage of STAGES) {
      for (const st of states) {
        for (let seed = 0; seed < 60; seed++) {
          for (const kind of ['boss_intro', 'boss_outro'] as const) {
            const s = await dialogue.generate({ kind, speakerId, speakerName: speakerId, persona: '', story: story(c.name, 'olympian', { stageName: stage.name, ...st }), seed: `${seed}` });
            s.lines.forEach((l) => add(speakerId, l));
            s.options.forEach((o) => add(speakerId, o.reply));
          }
        }
      }
    }
  }
  const variants: Partial<StorySnapshot>[] = [{ npcsKilled: 1 }, { alignment: 'cruel' }, { alignment: 'heroic' }, { alignment: 'neutral' }];
  for (const v of variants) {
    for (let seed = 0; seed < SEEDS; seed++) {
      for (let normalRooms = 1; normalRooms <= 4; normalRooms++) {
        const offer = await trials.offer({ story: story(c.name, 'olympian', v), seed: `${seed}`, enemyPool, normalRooms });
        const id = `trial_${offer.giverName.toLowerCase().replace(/[^a-z]+/g, '_')}`;
        offer.lines.forEach((l) => add(id, l));
        add(id, `Trial: ${describeObjective(offer.objective)}.`);
        add(id, 'Then it is sworn.');
        add(id, 'As you wish. The gods will remember.');
      }
    }
  }
}

console.log(JSON.stringify([...out].map(([key, v]) => ({ key, ...v })), null, 1));
