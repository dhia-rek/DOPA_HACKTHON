import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '../../src/dialogue/prompt';
import type { DialogueRequest } from '../../src/dialogue/types';
import type { VoiceMood, VoiceRequest } from '../../src/voice/types';
import { CONFIG } from './config';

const client = CONFIG.geminiApiKey
  ? new GoogleGenAI({
      apiKey: CONFIG.geminiApiKey,
      httpOptions: { timeout: CONFIG.llmTimeoutMs, ...(CONFIG.geminiBaseUrl ? { baseUrl: CONFIG.geminiBaseUrl } : {}) },
    })
  : null;

export const llmConfigured = client !== null;

/** Ask Gemini for a script. Returns the parsed JSON (unvalidated) or throws. */
export async function generateRaw(req: DialogueRequest): Promise<unknown> {
  if (!client) throw new Error('GEMINI_API_KEY is not set');
  const language = req.language ?? 'en';
  const result = await client.models.generateContent({
    model: CONFIG.model,
    contents: JSON.stringify(req),
    config: {
      systemInstruction: `${SYSTEM_PROMPT}\nWrite all text in language "${language}".`,
      responseMimeType: 'application/json',
      temperature: 0.9,
    },
  });
  const text = result.text;
  if (!text) throw new Error('empty completion');
  return JSON.parse(text);
}

/** Generic JSON generation for the other generators (trials, …). Returns parsed JSON (unvalidated) or throws. */
export async function generateJson(systemPrompt: string, payload: unknown, language = 'en'): Promise<unknown> {
  if (!client) throw new Error('GEMINI_API_KEY is not set');
  const result = await client.models.generateContent({
    model: CONFIG.model,
    contents: JSON.stringify(payload),
    config: {
      systemInstruction: `${systemPrompt}\nWrite all text in language "${language}".`,
      responseMimeType: 'application/json',
      temperature: 0.9,
    },
  });
  const text = result.text;
  if (!text) throw new Error('empty completion');
  return JSON.parse(text);
}

const MOOD_DIRECTION: Record<VoiceMood, string> = {
  calm: 'calmly',
  angry: 'in a furious, growling voice',
  fearful: 'fearfully, voice trembling',
  mournful: 'mournfully, as a last breath',
  mocking: 'mockingly, with cruel amusement',
  reverent: 'solemnly, with reverence',
};

/** Speak a line with Gemini TTS. Returns a WAV file (16-bit mono PCM) or throws. */
export async function synthesizeSpeech(req: VoiceRequest): Promise<Buffer> {
  if (!client) throw new Error('GEMINI_API_KEY is not set');
  const result = await client.models.generateContent({
    model: CONFIG.ttsModel,
    contents: `Say ${MOOD_DIRECTION[req.mood]}: ${req.text}`,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice } } },
    },
  });
  const part = result.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const data = part?.inlineData?.data;
  if (!data) throw new Error('no audio in TTS response');
  const rate = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType ?? '')?.[1] ?? 24000);
  return pcmToWav(Buffer.from(data, 'base64'), rate);
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
