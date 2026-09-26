import { createHash } from 'node:crypto';
import type { DialogueRequest, DialogueScript } from '../../src/dialogue/types';

/** Same seed + kind + speaker + story state always means the same script. */
export const cacheKey = (req: DialogueRequest): string =>
  `${req.seed}:${req.kind}:${req.speakerId}:${req.language ?? 'en'}:${createHash('sha1').update(JSON.stringify(req.story)).digest('hex')}`;

/** Tiny LRU: Map keeps insertion order, so the first key is the oldest. */
export class ScriptCache<T = DialogueScript> {
  private readonly map = new Map<string, T>();

  constructor(private readonly max: number) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }

  set(key: string, script: T): void {
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
