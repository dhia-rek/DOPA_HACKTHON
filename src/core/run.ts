import { CharacterDef, getCharacter } from '../data/characters';
import { getItem, ItemDef } from '../data/items';
import { STAGES, StageDef } from '../data/stages';
import type { RunSnapshot } from '../data/achievements';
import { FloorMap, generateFloor, RoomNode } from '../gen/floorGen';
import { omenDirector } from '../omens/provider';
import type { FloorOmen, OmenRequest } from '../omens/types';
import { pickItemFromPool } from '../systems/loot';
import { debugState } from './debug';
import { events } from './events';
import { Rng } from './rng';
import { computeStats, mergeFlags, ShotFlags, Stats } from './stats';
import { StoryState, StorySnapshot } from './story';

/**
 * All mutable state of a single run. Scenes read from it; systems mutate it
 * and emit events. Recreated on every new run.
 */
export class RunState {
  readonly seed: string;
  readonly character: CharacterDef;
  readonly startedAt = performance.now();

  /** Master RNG; every system forks its own so they stay independent. */
  readonly rng: Rng;
  readonly floorRng: Rng;
  readonly itemRng: Rng;
  readonly dropRng: Rng;
  /** Seeded stream for dialogue generation (mock provider / prompt variety). */
  readonly storyRng: Rng;

  /** Moral memory of the run: karma, deeds, flags, boss modifiers. */
  readonly story: StoryState;

  items: ItemDef[] = [];
  stats: Stats;
  flags: ShotFlags = {};
  hp: number;
  coins = 0;

  floor = 1;
  floorMap: FloorMap | null = null;
  room: RoomNode | null = null;

  itemsPickedThisRun = 0;
  damageTakenThisRun = 0;
  damageTakenThisFloor = 0;
  /** The current floor's omen (theme, banner, generation knobs). */
  omen: FloorOmen | null = null;
  killsThisRun = 0;

  constructor(seed: string, characterId: string) {
    this.seed = seed;
    debugState.god = false;
    this.character = getCharacter(characterId);
    this.story = new StoryState(this.character.startingKarma ?? 0, this.character.storyFlags ?? []);
    this.rng = new Rng(seed);
    this.floorRng = this.rng.fork('floor');
    this.itemRng = this.rng.fork('items');
    this.dropRng = this.rng.fork('drops');
    this.storyRng = this.rng.fork('story');

    this.stats = { ...this.character.stats };
    this.hp = this.stats.maxHp;
    for (const id of this.character.startingItems) this.addItem(id, true);
  }

  /** Stages cycle forever; each full loop raises the difficulty. */
  get stage(): StageDef {
    return STAGES[(this.floor - 1) % STAGES.length];
  }

  get loop(): number {
    return Math.floor((this.floor - 1) / STAGES.length);
  }

  /** Clearing the last stage of the first loop counts as "winning"; the descent continues after. */
  get isVictoryFloor(): boolean {
    return this.floor === STAGES.length;
  }

  /**
   * Multiplier applied to enemy hp/speed/damage. Floor 1 is a quick warm-up
   * (0.75), then it ramps per floor and jumps each endless loop.
   */
  get difficulty(): number {
    return 0.75 + (this.floor - 1) * 0.15 + this.loop * 0.35;
  }

  won = false;

  storySnapshot(): StorySnapshot {
    return this.story.snapshot({
      characterId: this.character.id,
      characterName: this.character.name,
      floor: this.floor,
      stageName: this.stage.name,
      items: this.items.map((i) => i.name),
    });
  }

  get elapsedMs(): number {
    return performance.now() - this.startedAt;
  }

  hasItem(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  addItem(id: string, silent = false): void {
    const item = getItem(id);
    this.items.push(item);
    this.recompute();
    if (item.heal) this.heal(item.heal);
    if (!silent) {
      this.itemsPickedThisRun++;
      events.emit('item_picked', { itemId: id });
    }
    events.emit('hud_update', {});
  }

  recompute(): void {
    const prevMax = this.stats.maxHp;
    this.stats = computeStats(
      this.character.stats,
      this.items.map((i) => i.stats ?? {}),
    );
    this.flags = mergeFlags(this.items.map((i) => i.flags ?? {}));
    if (this.stats.maxHp > prevMax) this.hp += this.stats.maxHp - prevMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  heal(halfHearts: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + halfHearts);
    events.emit('hud_update', {});
  }

  /** Returns true if the player died. */
  takeDamage(amount: number, source: string): boolean {
    if (debugState.god) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damageTakenThisRun += amount;
    this.damageTakenThisFloor += amount;
    events.emit('damage_taken', { amount, hp: this.hp, source });
    events.emit('hud_update', {});
    return this.hp <= 0;
  }

  addCoins(n: number): void {
    this.coins += n;
    events.emit('hud_update', {});
  }

  /** Lazily generates the current floor's map and places the player in its start room. */
  ensureFloor(): FloorMap {
    if (this.floorMap) return this.floorMap;
    const picked: string[] = this.items.map((i) => i.id);
    this.omen = omenDirector.get(this.omenRequest(this.floor));
    this.floorMap = generateFloor(this.floorRng.fork(`floor-${this.floor}`), {
      stage: this.stage,
      loop: this.loop,
      omen: this.omen,
      avoidBossId: this.story.deeds.filter((d) => d.kind === 'boss_killed' && d.floor === this.floor - 1).pop()?.subject,
      pickItem: () => {
        const id = pickItemFromPool(this.itemRng, 'treasure', picked);
        picked.push(id);
        return id;
      },
    });
    this.room = this.floorMap.start;
    events.emit('floor_started', { floor: this.floor, stageId: this.stage.id });
    return this.floorMap;
  }

  omenRequest(floor: number): OmenRequest {
    const stage = STAGES[(floor - 1) % STAGES.length];
    return { story: this.storySnapshot(), seed: `${this.seed}:${floor}:omen`, floor, stageName: stage.name, enemyPool: stage.enemyPool };
  }

  nextFloor(): void {
    this.floor++;
    this.damageTakenThisFloor = 0;
    this.floorMap = null;
    this.room = null;
  }

  snapshot(): RunSnapshot {
    return {
      floor: this.floor,
      characterId: this.character.id,
      itemsPickedThisRun: this.itemsPickedThisRun,
      damageTakenThisRun: this.damageTakenThisRun,
      damageTakenThisFloor: this.damageTakenThisFloor,
      killsThisRun: this.killsThisRun,
      elapsedMs: this.elapsedMs,
    };
  }
}
