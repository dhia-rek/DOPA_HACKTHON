import cors from 'cors';
import express from 'express';
import { type DialogueRequest, validateScript } from '../../src/dialogue/types';
import { cacheKey, ScriptCache } from './cache';
import { CONFIG } from './config';
import { createHash } from 'node:crypto';
import { TRIAL_SYSTEM_PROMPT } from '../../src/trials/prompt';
import { type TrialOffer, type TrialRequest, validateTrial } from '../../src/trials/types';
import { validateVoiceRequest } from '../../src/voice/types';
import { OMEN_SYSTEM_PROMPT } from '../../src/omens/prompt';
import { type FloorOmen, type OmenRequest, validateOmen } from '../../src/omens/types';
import { generateJson, generateRaw, llmConfigured, synthesizeSpeech } from './llm';

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

function parseTrialRequest(body: unknown): TrialRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.seed !== 'string' || !b.seed) return null;
  if (typeof b.story !== 'object' || b.story === null || Array.isArray(b.story)) return null;
  if (JSON.stringify(b.story).length > 8000) return null;
  if (!Array.isArray(b.enemyPool) || !b.enemyPool.every((e) => typeof e === 'string') || b.enemyPool.length > 20) return null;
  if (typeof b.normalRooms !== 'number') return null;
  if (b.language !== undefined && typeof b.language !== 'string') return null;
  return b as unknown as TrialRequest;
}

const trialCache = new Map<string, TrialOffer>();

app.post('/trial', async (req, res) => {
  const request = parseTrialRequest(req.body);
  if (!request) {
    res.status(400).json({ error: 'body must be a TrialRequest' });
    return;
  }
  if (!llmConfigured) {
    res.status(503).json({ error: 'LLM not configured (GEMINI_API_KEY missing)' });
    return;
  }
  const key = `${request.seed}:${request.language ?? 'en'}:${createHash('sha1').update(JSON.stringify(request.story)).digest('hex')}`;
  const cached = trialCache.get(key);
  if (cached) {
    res.setHeader('x-cache', 'hit');
    res.json(cached);
    return;
  }
  if (!allowLlmCall(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'too many requests, slow down' });
    return;
  }
  try {
    const offer = validateTrial(await generateJson(TRIAL_SYSTEM_PROMPT, request, request.language), request);
    if (!offer) {
      res.status(502).json({ error: 'LLM returned an invalid trial' });
      return;
    }
    if (trialCache.size >= CONFIG.cacheSize) trialCache.clear();
    trialCache.set(key, offer);
    res.setHeader('x-cache', 'miss');
    res.json(offer);
  } catch (err) {
    console.error('[trial]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'LLM request failed' });
  }
});

function parseOmenRequest(body: unknown): OmenRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.seed !== 'string' || !b.seed || typeof b.floor !== 'number' || typeof b.stageName !== 'string') return null;
  if (typeof b.story !== 'object' || b.story === null || Array.isArray(b.story)) return null;
  if (JSON.stringify(b.story).length > 8000) return null;
  if (!Array.isArray(b.enemyPool) || !b.enemyPool.every((e) => typeof e === 'string') || b.enemyPool.length > 20) return null;
  if (b.language !== undefined && typeof b.language !== 'string') return null;
  return b as unknown as OmenRequest;
}

const omenCache = new Map<string, FloorOmen>();

app.post('/omen', async (req, res) => {
  const request = parseOmenRequest(req.body);
  if (!request) {
    res.status(400).json({ error: 'body must be an OmenRequest' });
    return;
  }
  if (!llmConfigured) {
    res.status(503).json({ error: 'LLM not configured (GEMINI_API_KEY missing)' });
    return;
  }
  const key = `${request.seed}:${request.language ?? 'en'}:${createHash('sha1').update(JSON.stringify(request.story)).digest('hex')}`;
  const cached = omenCache.get(key);
  if (cached) {
    res.setHeader('x-cache', 'hit');
    res.json(cached);
    return;
  }
  if (!allowLlmCall(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'too many requests, slow down' });
    return;
  }
  try {
    const omen = validateOmen(await generateJson(OMEN_SYSTEM_PROMPT, request, request.language), request);
    if (!omen) {
      res.status(502).json({ error: 'LLM returned an invalid omen' });
      return;
    }
    if (omenCache.size >= CONFIG.cacheSize) omenCache.clear();
    omenCache.set(key, omen);
    res.setHeader('x-cache', 'miss');
    res.json(omen);
  } catch (err) {
    console.error('[omen]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'LLM request failed' });
  }
});

/** Same line + voice + mood always sounds the same; audio is cached in memory. */
const voiceCache = new Map<string, Buffer>();
const VOICE_CACHE_MAX = 200;

app.post('/voice', async (req, res) => {
  const request = validateVoiceRequest(req.body);
  if (!request) {
    res.status(400).json({ error: 'body must be a VoiceRequest' });
    return;
  }
  if (!llmConfigured) {
    res.status(503).json({ error: 'LLM not configured (GEMINI_API_KEY missing)' });
    return;
  }
  const key = `${request.voice}:${request.mood}:${request.text}`;
  const cached = voiceCache.get(key);
  if (cached) {
    res.setHeader('x-cache', 'hit');
    res.type('audio/wav').send(cached);
    return;
  }
  if (!allowLlmCall(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'too many requests, slow down' });
    return;
  }
  try {
    const wav = await synthesizeSpeech(request);
    if (voiceCache.size >= VOICE_CACHE_MAX) voiceCache.delete(voiceCache.keys().next().value!);
    voiceCache.set(key, wav);
    res.setHeader('x-cache', 'miss');
    res.type('audio/wav').send(wav);
  } catch (err) {
    console.error('[voice]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'TTS request failed' });
  }
});

app.listen(CONFIG.port, () => {
  console.log(`nekyia dialogue server on http://localhost:${CONFIG.port} (model ${CONFIG.model}, llm ${llmConfigured ? 'ready' : 'NOT configured'})`);
});
