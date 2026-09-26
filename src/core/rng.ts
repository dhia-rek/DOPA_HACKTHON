/** Seeded PRNG (mulberry32). Same seed → same run, so bugs are reproducible. */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : Rng.hash(seed);
  }

  static hash(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
  }

  /** Random seed string like "OLYMPUS-7F3A". */
  static randomSeed(): string {
    const words = ['OLYMPUS', 'STYX', 'HADES', 'TROY', 'ITHACA', 'DELPHI', 'SPARTA', 'CRETE', 'TARTARUS', 'ELYSIUM'];
    const w = words[Math.floor(Math.random() * words.length)];
    const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    return `${w}-${hex}`;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent sub-generator (one per system keeps them decoupled). */
  fork(label: string): Rng {
    return new Rng((this.int(0, 0x7fffffff) ^ Rng.hash(label)) >>> 0);
  }
}
