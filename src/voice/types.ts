import type { StorySnapshot } from '../core/story';

/**
 * Contract for spoken dialogue. The game picks a voice + mood from the speaker
 * and the player's story (voiceFor), so the same NPC sounds grateful to a hero
 * and terrified of a butcher. The server turns (text, voice, mood) into audio;
 * offline the browser's speechSynthesis reads it with a pitch/rate per mood.
 */
export type VoiceMood = 'calm' | 'angry' | 'fearful' | 'mournful' | 'mocking' | 'reverent';

/** Prebuilt TTS voices (Gemini's catalogue; Greek names fit the setting). */
export const VOICE_NAMES = ['Charon', 'Fenrir', 'Orus', 'Kore', 'Aoede', 'Leda', 'Puck', 'Zephyr'] as const;
export type VoiceName = (typeof VOICE_NAMES)[number];

/** Catalogue voices that are female; speechSynthesis picks a matching browser voice. */
const FEMALE_VOICES: ReadonlySet<VoiceName> = new Set<VoiceName>(['Kore', 'Aoede', 'Leda', 'Zephyr']);
export const isFemaleVoice = (v: VoiceName): boolean => FEMALE_VOICES.has(v);

export interface VoiceProfile {
  /** Who speaks: lets the server use a speaker's own custom voice. */
  speakerId?: string;
  voice: VoiceName;
  mood: VoiceMood;
  /** speechSynthesis fallback: 0.1..2 and 0.5..1.6. */
  pitch: number;
  rate: number;
}

export interface VoiceRequest {
  text: string;
  speakerId?: string;
  voice: VoiceName;
  mood: VoiceMood;
  language?: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Base timbre per speaker; unknown speakers get a stable voice from their id. */
const SPEAKER_VOICES: Record<string, { voice: VoiceName; pitch: number; rate: number }> = {
  minotaur: { voice: 'Fenrir', pitch: 0.3, rate: 0.8 },
  hydra: { voice: 'Charon', pitch: 0.4, rate: 0.85 },
  menoetius: { voice: 'Orus', pitch: 0.4, rate: 0.9 },
  campe: { voice: 'Kore', pitch: 0.5, rate: 0.85 },
  alcyoneus: { voice: 'Fenrir', pitch: 0.2, rate: 0.75 },
  porphyrion: { voice: 'Charon', pitch: 0.2, rate: 0.8 },
  talos: { voice: 'Orus', pitch: 0.1, rate: 0.7 },
  villager: { voice: 'Orus', pitch: 1, rate: 1 },
  priestess: { voice: 'Aoede', pitch: 1.2, rate: 0.95 },
  child: { voice: 'Leda', pitch: 1.7, rate: 1.1 },
  wounded_soldier: { voice: 'Orus', pitch: 0.8, rate: 0.85 },
  altar: { voice: 'Kore', pitch: 0.9, rate: 0.85 },
  trial_hermes: { voice: 'Puck', pitch: 1.1, rate: 1.15 },
  trial_ares: { voice: 'Fenrir', pitch: 0.5, rate: 0.9 },
  trial_charon: { voice: 'Charon', pitch: 0.4, rate: 0.8 },
  trial_artemis: { voice: 'Zephyr', pitch: 1.1, rate: 1 },
  trial_athena: { voice: 'Aoede', pitch: 1, rate: 0.9 },
  trial_nemesis: { voice: 'Kore', pitch: 0.8, rate: 0.85 },
};

export type SpeechKind = 'boss_intro' | 'boss_outro' | 'npc' | 'shrine' | 'trial';

/** Deterministic voice + mood from who speaks, what kind of scene it is, and what the player has done. */
export function voiceFor(speakerId: string, kind: SpeechKind, story: StorySnapshot): VoiceProfile {
  const hash = [...speakerId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const base = SPEAKER_VOICES[speakerId] ?? { voice: VOICE_NAMES[hash % VOICE_NAMES.length], pitch: 0.8 + (hash % 5) * 0.1, rate: 0.95 };
  let mood: VoiceMood = 'calm';
  if (kind === 'boss_outro') mood = 'mournful';
  else if (kind === 'boss_intro') mood = story.alignment === 'cruel' || story.npcsKilled > 0 ? 'angry' : story.alignment === 'heroic' ? 'reverent' : 'mocking';
  else if (kind === 'npc') mood = story.alignment === 'cruel' ? 'fearful' : story.alignment === 'heroic' ? 'reverent' : 'calm';
  else if (kind === 'shrine' || kind === 'trial') mood = story.flags.includes('godslayer') || story.alignment === 'cruel' ? 'angry' : 'reverent';

  const moodShift: Record<VoiceMood, [number, number]> = {
    calm: [0, 0],
    angry: [-0.2, 0.1],
    fearful: [0.3, 0.25],
    mournful: [-0.1, -0.2],
    mocking: [0.1, 0.05],
    reverent: [0, -0.1],
  };
  const [dp, dr] = moodShift[mood];
  return { speakerId, voice: base.voice, mood, pitch: clamp(base.pitch + dp, 0.1, 2), rate: clamp(base.rate + dr, 0.5, 1.6) };
}

/** Server-side check of an incoming request. */
export function validateVoiceRequest(raw: unknown): VoiceRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== 'string' || !r.text.trim() || r.text.length > 400) return null;
  if (typeof r.voice !== 'string' || !(VOICE_NAMES as readonly string[]).includes(r.voice)) return null;
  const moods: VoiceMood[] = ['calm', 'angry', 'fearful', 'mournful', 'mocking', 'reverent'];
  if (typeof r.mood !== 'string' || !moods.includes(r.mood as VoiceMood)) return null;
  if (r.language !== undefined && typeof r.language !== 'string') return null;
  if (r.speakerId !== undefined && (typeof r.speakerId !== 'string' || r.speakerId.length > 64)) return null;
  return { text: r.text.trim(), speakerId: r.speakerId as string | undefined, voice: r.voice as VoiceName, mood: r.mood as VoiceMood, language: r.language as string | undefined };
}
