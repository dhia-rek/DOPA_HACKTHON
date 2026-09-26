import type { DialogueRequest, DialogueScript } from '../../src/dialogue/types';

/** Same seed + kind + speaker always means the same script (mirrors the mock's RNG key). */
export const cacheKey = (req: DialogueRequest): string => `${req.seed}:${req.kind}:${req.speakerId}:${req.language ?? 'en'}`;

/** Tiny LRU: Map keeps insertion order, so the first key is the oldest. */
export class ScriptCache {
  private readonly map = new Map<string, DialogueScript>();

  constructor(private readonly max: number) {}

  get(key: string): DialogueScript | undefined {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }

  set(key: string, script: DialogueScript): void {
    this.map.delete(key);
    this.map.set(key, script);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
