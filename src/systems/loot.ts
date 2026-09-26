import type { Rng } from '../core/rng';
import { ItemDef, itemsInPool } from '../data/items';

/** Weighted pick from a pool, skipping items the run already owns. Falls back to the whole pool. */
export function pickItemFromPool(rng: Rng, pool: ItemDef['pools'][number], owned: string[]): string {
  const all = itemsInPool(pool);
  const candidates = all.filter((i) => !owned.includes(i.id));
  const list = candidates.length ? candidates : all;
  const total = list.reduce((n, i) => n + (i.weight ?? 1), 0);
  let roll = rng.float(0, total);
  for (const item of list) {
    roll -= item.weight ?? 1;
    if (roll <= 0) return item.id;
  }
  return list[list.length - 1].id;
}
