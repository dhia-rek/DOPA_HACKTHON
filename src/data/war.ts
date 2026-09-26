import type { Rng } from '../core/rng';
import type { Deed } from '../core/story';
import { LORE, WAR_FACTIONS, WarFaction } from './lore';

/**
 * The Second Titanomachy: numbers and words. `systems/chronicle.ts` applies
 * these; nothing in here knows about scenes.
 *
 * The war is tracked as a "tide" per faction (-100..100). The player's deeds
 * push the tide; the faction with the highest tide holds the next floor
 * (its enemies, its boss, its colours) and the tide decides the ending.
 */

export type Tide = Record<WarFaction, number>;

export const zeroTide = (): Tide => ({ olympian: 0, titan: 0, giant: 0 });

/** Who gains when a faction loses ground: Gaia's two broods share a grudge against Olympus. */
export const RIVALS: Record<WarFaction, WarFaction[]> = {
  olympian: ['titan', 'giant'],
  titan: ['olympian'],
  giant: ['olympian'],
};

export const FACTION_NAME: Record<WarFaction, string> = {
  olympian: 'the Olympians',
  titan: 'the Titans',
  giant: 'the Giants',
};

export function factionOf(loreId: string | undefined): WarFaction | null {
  const f = loreId ? LORE[loreId]?.faction : undefined;
  return f && f !== 'mortal' ? f : null;
}

/** How each kind of deed moves the tide. Returned deltas are added to the tide. */
export function tideDeltaFor(deed: Deed, subjectFaction: WarFaction | null): Partial<Tide> {
  switch (deed.kind) {
    case 'npc_killed':
      // Zeus Xenios protects the helpless; Gaia drinks whatever blood reaches the soil.
      // The child is Hades' own (data/child.ts): Olympus recoils, the earth feasts.
      if (deed.subject === 'child') return { olympian: -12, giant: +14 };
      return { olympian: -6, giant: +7 };
    case 'npc_spared':
      return { olympian: +4 };
    case 'boss_killed': {
      if (!subjectFaction) return {};
      const out: Partial<Tide> = { [subjectFaction]: -18 };
      for (const r of RIVALS[subjectFaction]) out[r] = (out[r] ?? 0) + 9;
      return out;
    }
    default:
      return {};
  }
}

/** Which faction holds a floor: highest tide, ties broken by the stage's default holder. */
export function frontOf(tide: Tide, fallback: WarFaction): WarFaction {
  let best = fallback;
  for (const f of WAR_FACTIONS) if (tide[f] > tide[best]) best = f;
  return best;
}

/** A faction's occupation of a stage: what changes when they hold the floor. */
export interface FrontDef {
  faction: WarFaction;
  /** Shown as "Ruined Polis — <label>". */
  label: string;
  bossPool: string[];
  /** Added to the stage's enemy pool (twice, so they are common). */
  enemies?: string[];
  palette?: { floor?: number; wall?: number; accent?: number };
  /** Chapter card shown on arrival. {hero} {stage} {dead} are substituted. */
  chapter: { title: string; body: string };
}

/**
 * Per stage: the default holder first, then what each rival does with the
 * place. Every boss id must exist in enemies.ts and carry a `lore` id of the
 * matching faction.
 */
export const FRONTS: Record<string, FrontDef[]> = {
  polis: [
    {
      faction: 'olympian',
      label: 'under the eye of Zeus',
      bossPool: ['minotaur'],
      chapter: { title: 'I. The Polis', body: 'Gaia has cracked the roof of Tartarus. The city prays to Zeus and gets a bull-headed answer.' },
    },
    {
      faction: 'titan',
      label: 'preaching the Golden Age',
      bossPool: ['menoetius'],
      enemies: ['cultist'],
      palette: { floor: 0xf0d9a8, wall: 0xc9a45c, accent: 0xffd66b },
      chapter: { title: 'I. The Polis Remembers Cronus', body: 'The people have torn down the altars of Zeus. Menoetius, whom the thunderbolt once threw into Erebus, walks their streets.' },
    },
    {
      faction: 'giant',
      label: 'sinking into the earth',
      bossPool: ['alcyoneus'],
      enemies: ['earthborn'],
      palette: { floor: 0xb08a6a, wall: 0x6a4a3a, accent: 0xff7a3a },
      chapter: { title: 'I. The Earth Opens', body: 'Blood has reached the soil and Gaia has answered. Alcyoneus, deathless on his own ground, has made this ground his own.' },
    },
  ],
  labyrinth: [
    {
      faction: 'olympian',
      label: 'as Daedalus built it',
      bossPool: ['minotaur', 'talos'],
      chapter: { title: 'II. The Labyrinth', body: 'Under Crete, where Rhea hid the infant Zeus from his father. The Olympians still keep their monsters here.' },
    },
    {
      faction: 'titan',
      label: 'become a road to Tartarus',
      bossPool: ['campe'],
      enemies: ['cultist', 'skeleton'],
      palette: { floor: 0x7a6a9a, wall: 0x4a3a6a, accent: 0xc08aff },
      chapter: { title: 'II. The Jailer Walks Free', body: 'The maze has grown downward into the Pit. Campe, whom Zeus slew to free the Cyclopes, guards it again for Cronus.' },
    },
    {
      faction: 'giant',
      label: 'flooded by Lerna',
      bossPool: ['hydra'],
      enemies: ['earthborn'],
      palette: { floor: 0x5a8a6a, wall: 0x3a5a4a, accent: 0x7fff9f },
      chapter: { title: 'II. The Brood of Typhon', body: "Hera's Hydra has left its swamp. Every innocent you buried is one more head." },
    },
  ],
  tartarus: [
    {
      faction: 'olympian',
      label: 'sealed by Hephaestus',
      bossPool: ['talos'],
      chapter: { title: 'III. The Gates of Tartarus', body: 'The Hundred-Handers hold the door. Hephaestus has sent bronze to help them, and Zeus has sent you.' },
    },
    {
      faction: 'titan',
      label: 'thrown open',
      bossPool: ['menoetius', 'campe'],
      enemies: ['cultist'],
      palette: { floor: 0x9a7a4a, wall: 0x5a3a1a, accent: 0xffb040 },
      chapter: { title: 'III. Cronus Stirs', body: 'The chains are loose. The Titans you fed are climbing, and they remember who opened the door.' },
    },
    {
      faction: 'giant',
      label: 'ruled by Porphyrion',
      bossPool: ['porphyrion'],
      enemies: ['earthborn'],
      palette: { floor: 0x8a4a4a, wall: 0x4a1a1a, accent: 0xff4a4a },
      chapter: { title: 'III. The King of the Giants', body: 'Porphyrion, who hurled Delos at the gods, waits at the bottom. A Giant dies only to a god and a mortal together. Which are you?' },
    },
  ],
};

export function frontDef(stageId: string, faction: WarFaction): FrontDef {
  const list = FRONTS[stageId] ?? [];
  return list.find((f) => f.faction === faction) ?? list[0] ?? { faction, label: '', bossPool: [], chapter: { title: '', body: '' } };
}

// -------------------------------------------------------------------- shades

/** One innocent the player killed. Collected for the run; the LLM addresses them by name. */
export interface Shade {
  id: string;
  npcId: string;
  name: string;
  floor: number;
  stageName: string;
  epitaph: string;
}

const SHADE_NAMES = ['Lykos', 'Phaidra', 'Nikias', 'Melitta', 'Dorieus', 'Chloe', 'Kallias', 'Eirene', 'Timon', 'Xanthe', 'Alexios', 'Danae'];

const EPITAPHS: Record<string, string[]> = {
  villager: ['was counting the goats when the arrow came.', 'had a child waiting at home.', 'never learned why.'],
  child: ['was picking flowers in the dark.', 'thought you were her father.', 'had a mother waiting above, and a father below.'],
  restless_shade: ['died a second time, and did not deserve the first.'],
  default: ['was no one\u2019s enemy.', 'asked for nothing.', 'died looking at you.'],
};

export function makeShade(rng: Rng, npcId: string, npcName: string, floor: number, stageName: string, index: number): Shade {
  const name = SHADE_NAMES[(index + rng.int(0, SHADE_NAMES.length - 1)) % SHADE_NAMES.length];
  const epitaph = rng.pick(EPITAPHS[npcId] ?? EPITAPHS.default);
  return { id: `shade_${index}`, npcId, name, floor, stageName, epitaph: `${name} the ${npcName.toLowerCase()} ${epitaph}` };
}

// ------------------------------------------------------------------ verdicts

export interface Verdict {
  title: string;
  body: string;
}

/** The war's ending, judged from the tide, karma and the dead. */
export function judge(tide: Tide, karma: number, shades: number, heroName: string, won: boolean): Verdict {
  const front = frontOf(tide, 'olympian');
  const dead = shades === 0 ? 'No innocent died by your hand.' : shades === 1 ? 'One shade follows you.' : `${shades} shades follow you.`;
  if (front === 'giant') {
    return {
      title: shades >= 3 ? 'GAIA IS FED' : 'THE EARTH RISES',
      body: `${dead} The Giants climb on the blood you spilled. Porphyrion reaches for Olympus, and Zeus asks where his hero was.`,
    };
  }
  if (front === 'titan') {
    return {
      title: 'THE GOLDEN AGE RETURNS',
      body: `${dead} Cronus is loose. The mortals will not toil, and will not be free. ${heroName} is remembered as the one who opened the door.`,
    };
  }
  if (karma >= 25) {
    return {
      title: won ? 'A SEAT AMONG THE STARS' : 'A HERO\u2019S SHADE',
      body: `${dead} Zeus holds the throne. ${heroName} is counted with Heracles: a mortal the gods needed and, for once, deserved.`,
    };
  }
  if (karma <= -25) {
    return {
      title: 'KRATOS, NOT DIKE',
      body: `${dead} Olympus stands because you were cruel enough to hold it. The gods keep you the way they kept Kratos: useful, and never loved.`,
    };
  }
  return { title: 'THE ORDER HOLDS', body: `${dead} Zeus keeps his throne, the Titans their chains, the Giants their graves. Nothing is finished.` };
}
