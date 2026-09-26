import { Dir } from '../config';
import { Rng } from '../core/rng';
import { ROOM_TEMPLATES, RoomType } from '../data/rooms';
import { StageDef } from '../data/stages';
import { generateRoom, SHRINE_TEMPLATES } from './roomGen';

/** Room kinds the generator can place: the data-defined ones plus the shrine (altar dialogue, no enemies). */
export type FloorRoomType = RoomType | 'shrine';

export interface FloorGenOptions {
  stage: StageDef;
  /** 0 on the first pass through the stages, +1 every loop (endless mode). */
  loop: number;
  pickItem: () => string;
  /** Share of normal rooms that use the procedural generator instead of templates. */
  proceduralShare?: number;
  /** Overrides from whoever holds the floor in the war (systems/chronicle.ts); default to the stage's pools. */
  bossPool?: string[];
  enemyPool?: string[];
  npcPool?: string[];
  /** Chance (0..1) that a floor with a spare dead end gets a shrine room. Default 0.75. */
  shrineChance?: number;
  /** Boss to skip when the stage pool offers another (e.g. the one slain on the previous floor). */
  avoidBossId?: string;
}

export interface RoomNode {
  gx: number;
  gy: number;
  type: FloorRoomType;
  template: string[];
  /** Enemy ids to spawn, one per 'E' slot (empty once cleared). */
  enemies: string[];
  /** Innocent NPC ids still present in the room (removed when killed, spared or talked to). */
  npcs: string[];
  /** Set once the room's dialogue (boss intro, npc talk) has played. */
  dialogueDone: boolean;
  bossId?: string;
  itemId?: string;
  cleared: boolean;
  visited: boolean;
  /** Set once the item pedestal has been taken. */
  itemTaken: boolean;
}

export interface FloorMap {
  rooms: Map<string, RoomNode>;
  start: RoomNode;
  boss: RoomNode;
  width: number;
  height: number;
}

export const key = (gx: number, gy: number): string => `${gx},${gy}`;

const DIRS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function neighbour(map: FloorMap, room: RoomNode, dir: Dir): RoomNode | undefined {
  const [dx, dy] = DIRS[dir];
  return map.rooms.get(key(room.gx + dx, room.gy + dy));
}

export function doorsOf(map: FloorMap, room: RoomNode): Dir[] {
  return (Object.keys(DIRS) as Dir[]).filter((d) => neighbour(map, room, d) !== undefined);
}

/**
 * Isaac-style layout: random walk from the centre until we have N rooms,
 * then the farthest dead end becomes the boss room and another dead end the
 * treasure room. Fully deterministic for a given Rng.
 */
export function generateFloor(rng: Rng, opts: FloorGenOptions): FloorMap {
  const { stage, loop, pickItem } = opts;
  const proceduralShare = opts.proceduralShare ?? 0.6;
  const bossPool = opts.bossPool ?? stage.bossPool;
  const enemyPool = opts.enemyPool ?? stage.enemyPool;
  const npcPool = opts.npcPool ?? stage.npcPool ?? [];
  const width = 9;
  const height = 7;
  const target = Math.min(width * height, rng.int(stage.roomCount[0], stage.roomCount[1]) + loop * 2);

  const cells = new Map<string, { gx: number; gy: number }>();
  const startCell = { gx: Math.floor(width / 2), gy: Math.floor(height / 2) };
  cells.set(key(startCell.gx, startCell.gy), startCell);

  let guard = 0;
  while (cells.size < target && guard++ < 2000) {
    const from = rng.pick([...cells.values()]);
    const [dx, dy] = rng.pick(Object.values(DIRS));
    const nx = from.gx + dx;
    const ny = from.gy + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const k = key(nx, ny);
    if (cells.has(k)) continue;
    // Isaac rule: a new cell may touch at most one existing cell, so the map
    // stays branchy instead of becoming a blob.
    const touching = Object.values(DIRS).filter(([ox, oy]) => cells.has(key(nx + ox, ny + oy))).length;
    if (touching > 1) continue;
    cells.set(k, { gx: nx, gy: ny });
  }

  const dist = bfsDistances(cells, startCell);
  const deadEnds = [...cells.values()]
    .filter((c) => !(c.gx === startCell.gx && c.gy === startCell.gy))
    .filter((c) => Object.values(DIRS).filter(([dx, dy]) => cells.has(key(c.gx + dx, c.gy + dy))).length === 1)
    .sort((a, b) => (dist.get(key(b.gx, b.gy)) ?? 0) - (dist.get(key(a.gx, a.gy)) ?? 0));

  const bossCell = deadEnds[0] ?? [...cells.values()].sort((a, b) => (dist.get(key(b.gx, b.gy)) ?? 0) - (dist.get(key(a.gx, a.gy)) ?? 0))[0];
  const treasureCell =
    deadEnds.find((c) => c !== bossCell) ??
    [...cells.values()]
      .filter((c) => c !== startCell && c !== bossCell)
      .sort((a, b) => (dist.get(key(b.gx, b.gy)) ?? 0) - (dist.get(key(a.gx, a.gy)) ?? 0))[0];
  const spareEnds = deadEnds.filter((c) => c !== bossCell && c !== treasureCell);
  const shrineCell = spareEnds.length && rng.chance(opts.shrineChance ?? 0.75) ? rng.pick(spareEnds) : undefined;

  const rooms = new Map<string, RoomNode>();
  for (const c of cells.values()) {
    const k = key(c.gx, c.gy);
    let type: FloorRoomType = 'normal';
    if (c === startCell) type = 'start';
    else if (c === bossCell) type = 'boss';
    else if (c === treasureCell) type = 'treasure';
    else if (c === shrineCell) type = 'shrine';

    let template = rng.pick(type === 'shrine' ? SHRINE_TEMPLATES : ROOM_TEMPLATES[type]);
    if (type === 'normal' && rng.chance(proceduralShare)) {
      template = generateRoom(rng, {
        density: rng.float(0.06, 0.16),
        enemySlots: rng.int(stage.enemiesPerRoom[0], stage.enemiesPerRoom[1]) + Math.floor(loop / 2),
      });
    }
    const node: RoomNode = {
      gx: c.gx,
      gy: c.gy,
      type,
      template,
      enemies: [],
      npcs: [],
      dialogueDone: false,
      cleared: type === 'start' || type === 'treasure' || type === 'shrine',
      visited: type === 'start',
      itemTaken: false,
    };

    if (type === 'normal') {
      const slots = countChar(template, 'E');
      const wanted = Math.min(slots, rng.int(stage.enemiesPerRoom[0], stage.enemiesPerRoom[1]) + Math.floor(loop / 2));
      for (let i = 0; i < wanted; i++) node.enemies.push(rng.pick(enemyPool));
      if (npcPool.length && rng.chance(stage.npcChance ?? 0)) node.npcs.push(rng.pick(npcPool));
    } else if (type === 'boss') {
      const pool = bossPool.filter((id) => id !== opts.avoidBossId);
      node.bossId = rng.pick(pool.length ? pool : bossPool);
    } else if (type === 'treasure') {
      node.itemId = pickItem();
    }
    rooms.set(k, node);
  }

  return {
    rooms,
    start: rooms.get(key(startCell.gx, startCell.gy))!,
    boss: rooms.get(key(bossCell.gx, bossCell.gy))!,
    width,
    height,
  };
}

function bfsDistances(cells: Map<string, { gx: number; gy: number }>, start: { gx: number; gy: number }): Map<string, number> {
  const dist = new Map<string, number>();
  const queue = [start];
  dist.set(key(start.gx, start.gy), 0);
  while (queue.length) {
    const c = queue.shift()!;
    const d = dist.get(key(c.gx, c.gy))!;
    for (const [dx, dy] of Object.values(DIRS)) {
      const k = key(c.gx + dx, c.gy + dy);
      if (cells.has(k) && !dist.has(k)) {
        dist.set(k, d + 1);
        queue.push(cells.get(k)!);
      }
    }
  }
  return dist;
}

function countChar(template: string[], ch: string): number {
  return template.reduce((n, row) => n + row.split('').filter((c) => c === ch).length, 0);
}
