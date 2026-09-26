try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // no .env file: rely on real environment variables (deploy)
}

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const CONFIG = {
  port: int(process.env.PORT, 8787),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  /** Override the Gemini endpoint (tests / proxies). */
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? '',
  /** Hard cap so the client's 8 s abort is never hit by a healthy server. */
  llmTimeoutMs: int(process.env.LLM_TIMEOUT_MS, 6000),
  /** Scripts cached by request seed (replays hit the cache, not the LLM). */
  cacheSize: int(process.env.CACHE_SIZE, 500),
  /** Comma-separated origins allowed by CORS; "*" for any. */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
