import type { Rng } from '../core/rng';
import type { FloorMap } from '../gen/floorGen';
import type { FloorDirective } from './types';

/** What may spawn on this floor: the war front's pools plus the omen's extra enemies. */
export interface FloorPools {
  bossPool: string[];
  enemyPool: string[];
  npcPool?: string[];
}

/**
 * Applies the map-level part of a FloorDirective to a freshly generated floor:
 * boss archetype, enemy weights, NPC casting and the mutators that change what
 * spawns. Pure (no Phaser) so it can be simulated headless. Room-level visual
 * mutators (palette, darkness, flooded) are read by RunScene at build time.
 */
export function applyDirective(map: FloorMap, d: FloorDirective, pools: FloorPools, rng: Rng): void {
  const normals = [...map.rooms.values()].filter((r) => r.type === 'normal');

  if (pools.bossPool.includes(d.boss.archetype)) map.boss.bossId = d.boss.archetype;

  const weights = [...new Set(pools.enemyPool)].map((id) => ({ id, w: d.enemyWeights[id] ?? 1 })).filter((e) => e.w > 0);
  if (weights.length && Object.keys(d.enemyWeights).length) {
    for (const room of normals) room.enemies = room.enemies.map(() => weighted(rng, weights));
  }

  const delta = (d.mutators.includes('arena') ? 1 : 0) - (d.mutators.includes('pilgrim_road') ? 1 : 0);
  if (delta !== 0) {
    for (const room of normals) {
      if (delta > 0 && room.enemies.length) room.enemies.push(rng.pick(room.enemies));
      if (delta < 0 && room.enemies.length > 1) room.enemies.pop();
    }
  }

  if (d.mutators.includes('haunted')) {
    for (const room of normals) if (room.enemies.length && rng.chance(0.6)) room.enemies.push('shade');
  }

  // Cast the Director's NPCs into rooms that have none (farthest from start first so they are met mid-floor).
  const wanted = d.npcs.map((n) => n.id).filter((id) => !normals.some((r) => r.npcs.includes(id)));
  const empty = normals.filter((r) => r.npcs.length === 0);
  for (const id of wanted) {
    const room = empty.length ? empty.splice(rng.int(0, empty.length - 1), 1)[0] : undefined;
    if (room) room.npcs.push(id);
  }
  if (d.mutators.includes('pilgrim_road') && pools.npcPool?.length) {
    for (const room of empty.slice(0, 2)) room.npcs.push(rng.pick(pools.npcPool));
  }
}

function weighted(rng: Rng, entries: { id: string; w: number }[]): string {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let roll = rng.float(0, total);
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}
