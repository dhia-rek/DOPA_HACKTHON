/**
 * Each hero carries a signature weapon. It is purely presentational: the
 * held sprite, how it swings on each shot and what the projectile looks like.
 * Numbers (damage, fire rate, range) still come from CharacterDef.stats.
 */
export type WeaponId = 'spear' | 'bow' | 'club' | 'lyre' | 'blades';

/** Projectile texture `shot_<look>`; dart/arrow point along their flight, boulder/blade spin, note wobbles. */
export type ShotLook = 'dart' | 'arrow' | 'boulder' | 'note' | 'blade';

export type SwingStyle = 'thrust' | 'draw' | 'smash' | 'strum' | 'slash';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  shot: ShotLook;
  swing: SwingStyle;
  /** Display size relative to the 64px weapon canvas. */
  size: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'spear', name: 'Dory of Achilles', shot: 'dart', swing: 'thrust', size: 1.15 },
  { id: 'bow', name: 'Bow of Atalanta', shot: 'arrow', swing: 'draw', size: 0.9 },
  { id: 'club', name: 'Olive Club', shot: 'boulder', swing: 'smash', size: 0.95 },
  { id: 'lyre', name: 'Lyre of Orpheus', shot: 'note', swing: 'strum', size: 0.7 },
  { id: 'blades', name: 'Blades of Chaos', shot: 'blade', swing: 'slash', size: 0.9 },
];

export function getWeapon(id: WeaponId): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}
