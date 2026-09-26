import type { VoiceMood, VoiceName, VoiceRequest } from '../../src/voice/types';
import { CONFIG } from './config';

export const gradiumConfigured = CONFIG.gradiumApiKey !== '';

/** Gradium flagship voice ids standing in for each game voice (low, grave voices for the bosses). */
const DEFAULT_VOICES: Record<VoiceName, string> = {
  Fenrir: 'POBHtemksfWQbng0', // Garrett: low-pitched, quiet menace
  Charon: 'r2sIQdqqoqgRJuXw', // Marcus: resonant, unshakeable
  Orus: 'I7GYfpcKbafFrYUv', // Declan: calm, steady
  Kore: 'gqn4ytOULe-TQfjl', // Saoirse: warm, expressive
  Aoede: '4rdlkbxRv4m3UQTW', // Tilly: bright
  Leda: 'YVzbrdWnnu9FgRn5', // Sunnie: young, high
  Puck: 'KUpE0JVhjiIzp1Fk', // Damon: excitable
  Zephyr: '4SZHfMpw-p46Ywgs', // Harper: confident
};

/** `GRADIUM_VOICES="Fenrir=<id>,Charon=<id>"` overrides individual voices (e.g. custom or designed voices). */
function voiceMap(): Record<VoiceName, string> {
  const map = { ...DEFAULT_VOICES };
  for (const pair of CONFIG.gradiumVoices.split(',')) {
    const [name, id] = pair.split('=').map((s) => s.trim());
    if (name && id && name in map) map[name as VoiceName] = id;
  }
  return map;
}

const VOICES = voiceMap();

/** padding_bonus: negative = faster, positive = slower. temp: expressiveness. */
const MOOD_SETTINGS: Record<VoiceMood, { padding_bonus: number; temp: number }> = {
  calm: { padding_bonus: 0, temp: 0.6 },
  angry: { padding_bonus: -0.5, temp: 0.9 },
  fearful: { padding_bonus: -1, temp: 0.9 },
  mournful: { padding_bonus: 1.5, temp: 0.6 },
  mocking: { padding_bonus: 0.3, temp: 1 },
  reverent: { padding_bonus: 1, temp: 0.5 },
};

/** Speak a line with Gradium TTS (REST, one shot). Returns a WAV file or throws. */
export async function synthesizeGradium(req: VoiceRequest): Promise<Buffer> {
  if (!gradiumConfigured) throw new Error('GRADIUM_API_KEY is not set');
  const res = await fetch(`${CONFIG.gradiumBaseUrl}/post/speech/tts`, {
    method: 'POST',
    headers: { 'x-api-key': CONFIG.gradiumApiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: req.text,
      voice_id: VOICES[req.voice],
      model_name: CONFIG.gradiumModel,
      output_format: 'wav',
      only_audio: true,
      json_config: MOOD_SETTINGS[req.mood],
    }),
    signal: AbortSignal.timeout(CONFIG.llmTimeoutMs),
  });
  if (!res.ok) throw new Error(`Gradium HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}
