/**
 * The AI service is one server (see server/README.md): dialogue at `/`,
 * other generators at sub-paths. Everything is optional: without
 * VITE_DIALOGUE_API every generator uses its offline mock.
 */
const BASE = ((import.meta.env.VITE_DIALOGUE_API as string | undefined) ?? '').replace(/\/+$/, '');

export function aiEndpoint(path: string): string | null {
  return BASE ? `${BASE}${path}` : null;
}

/** POST JSON, abort after `timeoutMs`, throw on any non-2xx. */
export async function postJson(url: string, body: unknown, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
