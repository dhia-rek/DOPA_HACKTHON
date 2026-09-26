import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '../../src/dialogue/prompt';
import type { DialogueRequest } from '../../src/dialogue/types';
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
