import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '../../src/dialogue/prompt';
import type { DialogueRequest } from '../../src/dialogue/types';
import { CONFIG } from './config';

const client = CONFIG.openaiApiKey ? new OpenAI({ apiKey: CONFIG.openaiApiKey, timeout: CONFIG.llmTimeoutMs, maxRetries: 0 }) : null;

export const llmConfigured = client !== null;

/** Ask the model for a script. Returns the parsed JSON (unvalidated) or throws. */
export async function generateRaw(req: DialogueRequest): Promise<unknown> {
  if (!client) throw new Error('OPENAI_API_KEY is not set');
  const language = req.language ?? 'en';
  const completion = await client.chat.completions.create({
    model: CONFIG.model,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\nWrite all text in language "${language}".` },
      { role: 'user', content: JSON.stringify(req) },
    ],
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error('empty completion');
  return JSON.parse(content);
}
