/**
 * Player stat pipeline: base → +flat → ×mult → clamp.
 * Items only ever register modifiers; they never poke at the player directly.
 * This is what makes item synergies "just work".
 */
export interface Stats {
  /** Max health in half-hearts (6 = 3 hearts). */
  maxHp: number;
  speed: number;
  damage: number;
  /** Shots per second. */
  fireRate: number;
  shotSpeed: number;
  /** Projectile travel distance in px. */
  range: number;
  luck: number;
}

export type StatName = keyof Stats;

export interface StatModifier {
  add?: number;
  mul?: number;
}

export type StatModifiers = Partial<Record<StatName, StatModifier>>;

/** Behaviour flags a projectile can carry (Isaac's "tear flags"). */
export interface ShotFlags {
  piercing?: boolean;
  homing?: boolean;
  /** Extra projectiles fired at once. */
  extraShots?: number;
  /** Projectile splits on wall hit. */
  splitOnWall?: boolean;
  spectral?: boolean;
  /** Knockback multiplier. */
  knockback?: number;
  poison?: boolean;
}

const CLAMPS: Record<StatName, [number, number]> = {
  maxHp: [2, 24],
  speed: [120, 520],
  damage: [0.5, 60],
  fireRate: [0.5, 12],
  shotSpeed: [200, 900],
  range: [160, 1200],
  luck: [-10, 10],
};

export function computeStats(base: Stats, modifierSets: StatModifiers[]): Stats {
  const out: Stats = { ...base };
  for (const key of Object.keys(base) as StatName[]) {
    let add = 0;
    let mul = 1;
    for (const mods of modifierSets) {
      const m = mods[key];
      if (!m) continue;
      add += m.add ?? 0;
      mul *= m.mul ?? 1;
    }
    const [lo, hi] = CLAMPS[key];
    out[key] = Math.min(hi, Math.max(lo, (base[key] + add) * mul));
  }
  return out;
}

export function mergeFlags(sets: ShotFlags[]): ShotFlags {
  const out: ShotFlags = {};
  for (const f of sets) {
    if (f.piercing) out.piercing = true;
    if (f.homing) out.homing = true;
    if (f.splitOnWall) out.splitOnWall = true;
    if (f.spectral) out.spectral = true;
    if (f.poison) out.poison = true;
    if (f.extraShots) out.extraShots = (out.extraShots ?? 0) + f.extraShots;
    if (f.knockback) out.knockback = (out.knockback ?? 1) * f.knockback;
  }
  return out;
}
