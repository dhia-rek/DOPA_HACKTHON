import type { Rng } from '../core/rng';
import type { StorySnapshot } from '../core/story';
import type { DialogueRequest } from '../dialogue/types';

/**
 * Dying words for bosses (`kind: 'boss_outro'`). Pure flavour, no options.
 * Templates may use `{you}` (character name), `{name}` (boss name) and `{n}` (innocents killed).
 *
 * A script is 1–3 lines: a death line, a reaction to how the fight was set up
 * (`BossOutroMood`, resolved in priority order below), and an omen of what
 * waits below. Missing mood tables fall back to GENERIC_BOSS_OUTRO.
 */
export type BossOutroMood =
  /** Player knelt in the intro (`knelt_<boss>`). */
  | 'knelt'
  /** Player bought a weaker fight (`bargained_<boss>`). */
  | 'bargained'
  /** Player used the NPC secret (`knows_boss_weakness`). */
  | 'weakness'
  /** Player taunted the boss (`defied_<boss>`). */
  | 'defied'
  /** Player asked for a fair fight (`honoured_<boss>`). */
  | 'honoured'
  /** Innocent blood on the player's hands. */
  | 'butcher'
  | 'cruel'
  | 'heroic'
  /** Spared innocents without being heroic yet. */
  | 'merciful'
  | 'neutral';

export interface BossOutroVoice {
  /** First line: the boss meets its end, in its own voice. */
  dying: string[];
  /** Second line: reaction to the player's deeds / intro choice. */
  moods: Partial<Record<BossOutroMood, string[]>>;
  /** Third line: foreshadowing of the next floor. */
  omen: string[];
}

export const GENERIC_BOSS_OUTRO: BossOutroVoice = {
  dying: ['So… this is how it ends. Not with a roar.', 'The dark takes me, {you}. Remember the name {name}.', 'The {name}, struck down by a mortal. The Fates laugh.'],
  moods: {
    knelt: ['You knelt to me, and still you struck. Even my death is a coward\'s work.', 'On your knees you begged. Standing, you murder. Which one is the real {you}?'],
    bargained: ['You paid for this victory. It was never yours.', 'Gold for my head… the merchants of Hades will love you.'],
    weakness: ['Someone whispered my weakness to you. There was no glory in this.', 'You knew where to strike. A thief\'s victory, not a hero\'s.'],
    defied: ['You spoke boldly, and your hands kept the promise. Good.', 'Big words… and a bigger blow. I would have said the same.'],
    honoured: ['You fought as you said you would. I go without hatred.', 'No tricks, as promised. Go on, {you}. You have earned the road.'],
    butcher: ['{n} innocents… and now me. The Furies will not need to search for you.', 'The shades of the {n} you slaughtered are already waiting for you below.'],
    cruel: ['Cruel thing. What waits below is crueller still, and it knows your name.', 'You are no hero. You are the next monster of this place.'],
    heroic: ['A hero after all. The old songs are not all lies.', 'Go, {you}. Perhaps you will be the one to end this.'],
    merciful: ['You showed mercy to the weak and none to me. The gods keep strange ledgers.', 'You spared them. Remember that when the dark asks you why.'],
    neutral: ['Another hero, another corpse. Yours will come.', 'You fought well enough. It will not be enough below.'],
  },
  omen: ['The floor beneath is hungrier than I ever was.', 'Listen… do you hear it breathing under the stone?', 'What waits below does not talk. It only feeds.'],
};

export const BOSS_OUTRO: Record<string, BossOutroVoice> = {
  minotaur: {
    dying: [
      'The labyrinth… is quiet at last.',
      'Not a monster. Tell them… I was not a monster.',
      'My horns… you said you would take them. Take them, then.',
      'Asterion. My name was Asterion. Say it, {you}.',
    ],
    moods: {
      knelt: ['You knelt to me. You begged. And then you struck. That is what a monster does, {you}.', 'On your knees you called me "great one". Cowards win fights too, it seems.'],
      bargained: ['You bought my blood with coins. Was it worth the price?', 'Gold for a soft fight… my mother sold me cheaper. Choke on your change.'],
      weakness: ['Someone told you where to strike. The shepherds always did talk too much.', 'You knew of the old wound. A whispered secret felled what a thousand spears could not.'],
      defied: ['You promised me a fight and you kept your word. There is honour even in a taunt.', 'You said you would wear my horns. Wear them well… they are heavy.'],
      honoured: ['Honour… you gave it back to me at the end. The bull thanks you.', 'A clean death, as you promised. I had forgotten they existed.'],
      butcher: ['{n} innocents dead by your hand… and you called ME the beast.', 'The shepherds you butchered will greet you below, {you}. They are less forgiving than I.'],
      cruel: ['I was made a monster. You chose to become one.', 'You strike like something that hates the living. The dark below will recognise you.'],
      heroic: ['A true hero. Theseus was never so kind.', 'Go with my blessing, {you}. Few have earned it.'],
      merciful: ['You spared the weak. Mercy… I never knew it. Perhaps you will teach it to the dark.', 'You let the shepherds live. Somewhere, a bull-headed boy would have wept at that.'],
      neutral: ['Neither cruel nor kind… you simply came, and I simply died.', 'Another hero for the maze to forget.'],
    },
    omen: ['The Hydra sleeps below. Every head you cut will remember you.', 'You have not seen the rest of the maze. Nor has anyone who lived.', 'Below, the stone is wet. Nothing that drinks there stays dead.'],
  },
  hydra: {
    dying: [
      'One head speaks: "Impossible." Another: "Inevitable." The rest are silent.',
      'We fall… we fall… we FALL… no, only one of us is finished.',
      'Cut the last head and still we whisper, {you}. Riddles do not bleed.',
      'A thousand years of voices… and now only echoes.',
    ],
    moods: {
      knelt: ['"It knelt!" laughs one head. "It grovelled!" hisses another. Pathetic even in victory.', 'You begged us for passage, then took it with steel. Which mouth of yours was lying?'],
      bargained: ['"It paid!" the heads cackle. "Coins for a slower death!" Your gold sinks with us.', 'A bargain struck, a bargain broken. We have riddled with better liars.'],
      weakness: ['Someone spoke of fire and pride. The shepherds… always the shepherds.', 'You knew the riddle\'s answer before we asked it. That is not cleverness; it is theft.'],
      defied: ['You promised a fight and every head felt it. We do not regret you.', 'Bold words, bold hands. One head, at least, admires you.'],
      honoured: ['No tricks, as sworn. Rare. The heads argue, but all agree: you were fair.', 'An honourable ending. We had forgotten the taste.'],
      butcher: ['{n} innocents… we count them in every mouth. You will hear them in the dark.', 'Blood on your hands, blood in our jaws. We are more alike than you wish, {you}.'],
      cruel: ['Cruelty grows heads too, mortal. Cut one and two more come.', 'Every head we lost was a warning. Every innocent you killed was a promise.'],
      heroic: ['Heracles had your eyes. He also had our hatred. You have only our respect.', 'A hero of the old kind. The heads fall silent for you, {you}.'],
      merciful: ['You spared the small ones. The heads argue whether that was wisdom or weakness.', 'Mercy for the weak, death for us. The gods will riddle over that one.'],
      neutral: ['Nothing to remember, nothing to curse. The heads have already forgotten your face.', 'You came, you cut, you leave. So do all of them.'],
    },
    omen: ['Below us waits something with no heads at all… and it does not need them.', 'The riddle was never us. Descend and learn the answer.', 'Deeper, {you}. The stairs go deeper than the light.'],
  },
};

/** Which reaction fits the run, most specific first. */
export function bossOutroMood(bossId: string, s: StorySnapshot): BossOutroMood {
  const has = (f: string): boolean => s.flags.includes(f);
  if (has(`knelt_${bossId}`)) return 'knelt';
  if (has(`bargained_${bossId}`)) return 'bargained';
  if (s.npcsKilled > 0 || has('blood_on_hands')) return 'butcher';
  if (has('knows_boss_weakness')) return 'weakness';
  if (has(`honoured_${bossId}`)) return 'honoured';
  if (has(`defied_${bossId}`)) return 'defied';
  if (s.alignment === 'cruel') return 'cruel';
  if (s.alignment === 'heroic') return 'heroic';
  if (s.npcsSpared > 0) return 'merciful';
  return 'neutral';
}

/** 1–3 dying lines for a boss, deterministic for a given rng. */
export function bossOutroLines(req: Pick<DialogueRequest, 'speakerId' | 'speakerName' | 'story'>, rng: Rng): string[] {
  const s = req.story;
  const voice = BOSS_OUTRO[req.speakerId] ?? GENERIC_BOSS_OUTRO;
  const mood = bossOutroMood(req.speakerId, s);
  const moodLines = voice.moods[mood] ?? GENERIC_BOSS_OUTRO.moods[mood] ?? GENERIC_BOSS_OUTRO.moods.neutral!;
  const fill = (t: string): string =>
    t
      .replace(/\{you\}/g, s.characterName)
      .replace(/\{name\}/g, req.speakerName)
      .replace(/\{n\}/g, String(Math.max(1, s.npcsKilled)));

  const lines = [rng.pick(voice.dying)];
  if (mood !== 'neutral' || rng.chance(0.6)) lines.push(rng.pick(moodLines));
  if (rng.chance(0.7)) lines.push(rng.pick(voice.omen));
  return lines.map(fill);
}
