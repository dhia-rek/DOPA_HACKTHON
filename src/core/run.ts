import { CharacterDef, getCharacter } from '../data/characters';
import { getItem, ItemDef } from '../data/items';
import { STAGES, StageDef } from '../data/stages';
import type { RunSnapshot } from '../data/achievements';
import { FloorMap, generateFloor, RoomNode } from '../gen/floorGen';
import { pickItemFromPool } from '../systems/loot';
import { events } from './events';
import { Rng } from './rng';
import { computeStats, mergeFlags, ShotFlags, Stats } from './stats';
import { StoryState, StorySnapshot } from './story';
import type { FloorDirective } from '../director/types';
import { applyDirective } from '../director/apply';

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
  /** The Director's verdict for the current floor; set by FloorIntroScene before `ensureFloor()`. */
  directive: FloorDirective | null = null;

  itemsPickedThisRun = 0;
  damageTakenThisRun = 0;
  damageTakenThisFloor = 0;
  killsThisRun = 0;

  constructor(seed: string, characterId: string) {
    this.seed = seed;
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

  /** Multiplier applied to enemy hp/speed/damage in endless loops. */
  get difficulty(): number {
    return 1 + this.loop * 0.35 + (this.floor - 1) * 0.06;
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
    this.floorMap = generateFloor(this.floorRng.fork(`floor-${this.floor}`), {
      stage: this.stage,
      loop: this.loop,
      avoidBossId: this.story.deeds.filter((d) => d.kind === 'boss_killed' && d.floor === this.floor - 1).pop()?.subject,
      pickItem: () => {
        const id = pickItemFromPool(this.itemRng, 'treasure', picked);
        picked.push(id);
        return id;
      },
    });
    if (this.directive) applyDirective(this.floorMap, this.directive, this.stage, this.floorRng.fork(`director-${this.floor}`));
    this.room = this.floorMap.start;
    events.emit('floor_started', { floor: this.floor, stageId: this.stage.id });
    return this.floorMap;
  }

  nextFloor(): void {
    this.floor++;
    this.damageTakenThisFloor = 0;
    this.floorMap = null;
    this.room = null;
    this.directive = null;
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
