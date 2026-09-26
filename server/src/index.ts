import cors from 'cors';
import express from 'express';
import { type DialogueRequest, validateScript } from '../../src/dialogue/types';
import { cacheKey, ScriptCache } from './cache';
import { CONFIG } from './config';
import { generateRaw, llmConfigured } from './llm';

const KINDS = new Set(['boss_intro', 'boss_outro', 'npc', 'shrine']);

/** Cheap shape check on the incoming body; the LLM output gets the real validation. */
function parseRequest(body: unknown): DialogueRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.kind !== 'string' || !KINDS.has(b.kind)) return null;
  for (const k of ['speakerId', 'speakerName', 'persona', 'seed'] as const) {
    if (typeof b[k] !== 'string' || (b[k] as string).length === 0) return null;
  }
  if (typeof b.story !== 'object' || b.story === null || Array.isArray(b.story)) return null;
  if (JSON.stringify(b.story).length > 8000) return null;
  if (b.language !== undefined && typeof b.language !== 'string') return null;
  return b as unknown as DialogueRequest;
}

const cache = new ScriptCache(CONFIG.cacheSize);

/** Fixed one-minute window per IP; only LLM calls count, cache hits are free. */
const llmCalls = new Map<string, { windowStart: number; count: number }>();
function allowLlmCall(ip: string): boolean {
  const now = Date.now();
  const entry = llmCalls.get(ip);
  if (!entry || now - entry.windowStart >= 60_000) {
    if (llmCalls.size > 10_000) llmCalls.clear();
    llmCalls.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= CONFIG.rateLimitPerMin;
}
const app = express();

app.use(cors({ origin: CONFIG.corsOrigin === '*' ? true : CONFIG.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, llm: llmConfigured, model: CONFIG.model, cached: cache.size });
});

app.post('/', async (req, res) => {
  const request = parseRequest(req.body);
  if (!request) {
    res.status(400).json({ error: 'body must be a DialogueRequest' });
    return;
  }
  if (!llmConfigured) {
    res.status(503).json({ error: 'LLM not configured (GEMINI_API_KEY missing)' });
    return;
  }

  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached) {
    res.setHeader('x-cache', 'hit');
    res.json(cached);
    return;
  }

  if (!allowLlmCall(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'too many dialogue requests, slow down' });
    return;
  }

  try {
    const script = validateScript(await generateRaw(request), request);
    if (!script) {
      res.status(502).json({ error: 'LLM returned an invalid script' });
      return;
    }
    cache.set(key, script);
    res.setHeader('x-cache', 'miss');
    res.json(script);
  } catch (err) {
    console.error('[dialogue]', request.kind, request.speakerId, err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'LLM request failed' });
  }
});

app.listen(CONFIG.port, () => {
  console.log(`nekyia dialogue server on http://localhost:${CONFIG.port} (model ${CONFIG.model}, llm ${llmConfigured ? 'ready' : 'NOT configured'})`);
});
