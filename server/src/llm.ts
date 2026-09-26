import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '../../src/dialogue/prompt';
import type { DialogueRequest } from '../../src/dialogue/types';
import { DIRECTOR_SYSTEM_PROMPT } from '../../src/director/prompt';
import type { DirectorRequest } from '../../src/director/types';
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
  return generateJson(SYSTEM_PROMPT, req, req.language ?? 'en', 0.9);
}

/** Ask the Director for a floor directive. Returns the parsed JSON (unvalidated) or throws. */
export async function directRaw(req: DirectorRequest): Promise<unknown> {
  return generateJson(DIRECTOR_SYSTEM_PROMPT, req, req.language ?? 'en', 0.8);
}

async function generateJson(system: string, payload: unknown, language: string, temperature: number): Promise<unknown> {
  if (!client) throw new Error('GEMINI_API_KEY is not set');
  const result = await client.models.generateContent({
    model: CONFIG.model,
    contents: JSON.stringify(payload),
    config: {
      systemInstruction: `${system}\nWrite all text in language "${language}".`,
      responseMimeType: 'application/json',
      temperature,
    },
  });
  const text = result.text;
  if (!text) throw new Error('empty completion');
  return JSON.parse(text);
}
