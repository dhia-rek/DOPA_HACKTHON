const KEY = 'nekyia.save';
const VERSION = 1;

export interface SaveData {
  version: number;
  /** Unlocked content ids, e.g. "character:kratos". */
  unlocks: string[];
  achievements: string[];
  /** Lifetime counters used by achievement conditions. */
  counters: Record<string, number>;
  bestFloor: number;
  runs: number;
  wins: number;
}

function defaults(): SaveData {
  return { version: VERSION, unlocks: [], achievements: [], counters: {}, bestFloor: 0, runs: 0, wins: 0 };
}

class SaveStore {
  data: SaveData = defaults();

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== VERSION) return;
      this.data = { ...defaults(), ...parsed };
    } catch {
      this.data = defaults();
    }
  }

  persist(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  reset(): void {
    this.data = defaults();
    this.persist();
  }

  isUnlocked(id: string): boolean {
    return this.data.unlocks.includes(id);
  }

  unlock(id: string): void {
    if (!this.isUnlocked(id)) {
      this.data.unlocks.push(id);
      this.persist();
    }
  }

  hasAchievement(id: string): boolean {
    return this.data.achievements.includes(id);
  }

  grantAchievement(id: string): void {
    if (!this.hasAchievement(id)) {
      this.data.achievements.push(id);
      this.persist();
    }
  }

  counter(name: string): number {
    return this.data.counters[name] ?? 0;
  }

  bump(name: string, by = 1): number {
    const v = this.counter(name) + by;
    this.data.counters[name] = v;
    this.persist();
    return v;
  }
}

export const save = new SaveStore();
