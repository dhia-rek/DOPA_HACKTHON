# Architecture

The goal of this codebase is that **adding content never requires touching
gameplay code**. Content lives in `src/data/*.ts` as plain objects; generic
systems read it. If you find yourself adding an `if (item.id === 'x')` in a
scene, stop and add a field to the data type instead.

```
src/
  config.ts               Tile/room size, movement feel, i-frames, palette
  main.ts                 Phaser config + scene list

  core/                   Engine-agnostic rules (no Phaser imports except types)
    rng.ts                Seeded RNG (mulberry32) — everything random goes through it
    events.ts             Typed event bus — systems talk through it, never directly
    stats.ts              Stat pipeline (base → +add → ×mul → clamp) + shot flags
    run.ts                RunState: current character, floor, room, hp, items, difficulty
    save.ts               localStorage save (unlocks, achievements, counters)
    input.ts              Key bindings + key state that survives scene restarts
    story.ts              StoryState: karma, deeds, flags, boss modifiers, LLM snapshot

  dialogue/               Story layer contract (see ROADMAP.md)
    types.ts              DialogueRequest / DialogueScript JSON + validateScript()
    provider.ts           DialogueProvider: Mock (offline, seeded) and Http (LLM server)

  data/                   CONTENT. Add entries here.
    characters.ts  items.ts  enemies.ts  stages.ts  rooms.ts  achievements.ts

  gen/                    Procedural generation (pure functions of an Rng)
    floorGen.ts           Isaac-style random-walk floor grid → FloorMap
    roomGen.ts            13x7 ASCII room layouts, guaranteed walkable

  systems/
    behaviours.ts         Enemy AI: one function per BehaviourName
    loot.ts               Item pool picking (weights, no duplicates)
    achievements.ts       Listens to events, evaluates AchievementDefs, grants unlocks

  entities/               Phaser sprites: Player, Enemy, Projectile(+Pool), Pickup
  scenes/                 Boot → Menu → Run (+ Hud, Dialogue overlays) → GameOver
```

## The core loop

1. `MenuScene` creates a `RunState(seed, characterId)` and stores it in the
   Phaser registry. Seed comes from `?seed=` or is random.
2. `RunScene` reads `run.room` (a `RoomNode` from the `FloorMap`) and builds it:
   walls, doors, rocks/pits and spawns from the room's ASCII `template`.
3. Enemies run their `behaviour` every frame; projectiles come from two
   `ProjectilePool`s (player / enemy). Collisions are wired once in
   `wireCollisions()`.
4. When the last enemy dies → `room_cleared` → doors open. Walking into a door
   (`leaveThrough(dir)`) sets `run.room` to the neighbour and **restarts
   `RunScene`** for the new room. Room
   state (`cleared`, `visited`, `itemTaken`, remaining `enemies`) is persisted
   on the `RoomNode`, so revisiting a room is cheap and consistent.
5. Boss killed → `floor_cleared` → trapdoor → `run.nextFloor()` generates the
   next `FloorMap`. Stages cycle forever; `run.difficulty` grows each loop
   (enemy HP/speed scale, more rooms, more enemies per room).
6. Every gameplay fact is emitted on the event bus (`enemy_killed`,
   `damage_taken`, `item_picked`, …). `systems/achievements.ts` listens and
   updates the save. Nothing else needs to know achievements exist.

## Determinism

`RunState` owns several `Rng` streams forked from the seed: `floorRng` (floor
and room layouts), `itemRng` (pedestal rolls), `dropRng` (enemy drops) and the
general `rng` (AI wander, particles). Use the right one so that, e.g., an
enemy's random wander doesn't change which item the treasure room rolls.
Never call `Math.random()` in gameplay code.

## Stats and items (why synergies "just work")

```
Stats  = clamp( (character.base + Σ item.add) × Π item.mul )
Flags  = merge(item flags)   // piercing | homing | extraShots | ... (starting items count too)
```

`RunState.recompute()` runs this whenever items change. `Player` reads
`run.stats` / `run.flags` when firing; `ProjectilePool.shoot()` turns flags into
behaviour (spread for `extraShots`, `homing` steering, `piercing` hit-set, …).
An item never touches the player — it only contributes modifiers.

## Rooms

Rooms are 13×7 ASCII (interior only, walls implied):

```
.  floor    #  rock (blocks movement + non-spectral shots)    P  pit (blocks movement only)
E  enemy slot (filled from stage.enemyPool)   B  boss slot   I  item pedestal
```

Hand-made templates: `data/rooms.ts` (per `RoomType`). Procedural:
`gen/roomGen.ts` produces the same format, keeps door approaches clear, and
verifies with a flood-fill that all door tiles are connected. `floorGen.ts`
decides per room whether to use a template or generate one. Because the format
is shared, a future LLM/AI room service just needs to return this grid.

## Recipes

### Add an item
```ts
// src/data/items.ts
{
  id: 'aegis', name: 'Aegis', description: 'Health up, shots knock back',
  color: 0xa0c0ff,
  stats: { maxHp: { add: 2 } },
  flags: { knockback: 2 },
  pools: ['treasure', 'boss'],
}
```
Done. It appears on pedestals, stacks with everything, shows in the HUD/game
over. `BootScene` draws a placeholder texture from `color`.

### Add an enemy with an existing behaviour
```ts
// src/data/enemies.ts
{ id: 'cyclops', name: 'Cyclops', hp: 30, speed: 80, damage: 2,
  behaviour: 'charger', chargeSpeed: 520, shape: 'square', color: 0x8a6a4a, radius: 26, dropChance: 0.3 }
```
Then add `'cyclops'` to a stage's `enemyPool` in `data/stages.ts`.

### Add a new AI behaviour
1. Add the name to `BehaviourName` in `data/enemies.ts`.
2. Add a function to `BEHAVIOURS` in `systems/behaviours.ts`. It gets
   `{ enemy, player, enemyShots, rng, now, delta, difficulty }`; store per-enemy
   state in `enemy.memory`. Use `seek()` for obstacle-aware movement and
   `enemyShots.shoot()` to fire.

### Add a boss
Same as an enemy with `isBoss: true` and its own `boss_*` behaviour; add it to a
stage's `bossPool` **or** to a faction's `FRONTS[stage][faction].bossPool` in
`data/war.ts` so it only appears when that faction holds the floor. Give it a
`lore` id (`data/lore.ts`) so kills move the war tide and dialogue knows its
kin. Boss rooms use the `boss` templates (need a `B`).

### Add a stage
```ts
// src/data/stages.ts
{ id: 'styx', name: 'Banks of the Styx', holder: 'olympian',
  enemyPool: ['skeleton', 'harpy'], bossPool: ['hydra'],
  roomCount: [10, 13], enemiesPerRoom: [3, 6],
  palette: { floor: 0x6f8f9f, wall: 0x4f6f7f, accent: 0x9fdfff } }
```
Stages play in array order, then loop with higher difficulty. `holder` is who
owns the stage when the war is even; add a `FRONTS[id]` entry in `data/war.ts`
to give the Titans / Giants their own version (bosses, extra enemies, palette,
chapter card).

### Add a character
Add an entry to `data/characters.ts` (`stats`, `startingItems`, optional
`passive`). To make it locked, set `unlock: 'character:xyz'` and grant that
string as an achievement `reward`.

### Add a challenge / unlock
```ts
// src/data/achievements.ts
{ id: 'pacifist', title: 'Pacifist', description: 'Clear a floor killing fewer than 5 enemies',
  on: 'floor_cleared',
  check: (_p, ctx) => ctx.run.killsThisRun < 5,
  reward: 'character:odysseus', rewardLabel: 'Odysseus unlocked' }
```
`on` is any event name from `core/events.ts`; `ctx` gives the save (lifetime
counters) and a run snapshot. Need a new fact? Emit a new event (add it to
`GameEvents`) — TypeScript will tell you every listener that needs updating.

### Add a hand-made room
Append a `string[]` (7 rows × 13 chars) to the matching list in `data/rooms.ts`.
Keep door approaches (middle of each edge) walkable.

### Add an innocent NPC
Add an `EnemyDef` with `innocent: true`, `damage: 0`, `behaviour: 'flee'` and a
`persona`, then list its id in a stage's `npcPool`. Touching it starts an `npc`
dialogue; shooting it records `npc_killed` (karma −15) and creates a named
`Shade` (add an epitaph line for the new id in `EPITAPHS`, `data/war.ts`).
Nothing else to wire.

### The war (factions, fronts, shades, verdict)
`StoryState.tide` is a score per faction. `record()` moves it from the deed
kind and the subject's lore faction (`tideDeltaFor`); dialogue moves it with
`effects.favor`. `systems/chronicle.ts` turns it into a `ResolvedFront` when a
floor is generated: pools, palette, a `reason` sentence and a chapter card.
`RunState.storySnapshot(speakerId)` adds `war`, `shades` and `lore` for the
prompt. `judge()` (`data/war.ts`) picks the game-over verdict. All content is
data: `LORE`, `FRONTS`, `EPITAPHS`, `SHADE_NAMES`, verdict texts.

### Make a boss react to the story
Give the boss a `persona`. The boss intro dialogue receives the `StorySnapshot`
(karma, deeds, flags); the chosen option's `effects.boss` multipliers are applied
to that boss via `Enemy.applyMods`. To branch behaviour on a flag, read
`run.story.hasFlag('…')` inside the behaviour.

## Scenes

| Scene           | Role |
| --------------- | ---- |
| `BootScene`     | Generates placeholder textures for every character/enemy/item/pickup from data, loads save, starts menu |
| `MenuScene`     | Character carousel (locked ones greyed with unlock hint), Kratos progress, run stats, seed |
| `RunScene`      | One room. Restarted per room. Owns physics, spawning, doors, pickups, transitions |
| `HudScene`      | Overlay: hearts, coins, stats, item strip, minimap, floor name, toasts |
| `DialogueScene` | Overlay launched by `RunScene.startDialogue`: shows a `DialogueScript`, returns the chosen option |
| `GameOverScene` | Summary of the run |

## Conventions

- Half-hearts everywhere (`maxHp: 6` = 3 hearts, `damage: 1` = half a heart).
- Speeds are px/s, fire rate is shots/s, range is px travelled.
- Arcade groups reset body settings when a sprite is added, so `Enemy` and
  `Pickup` take the group in their constructor and configure the body after
  joining it.
- Placeholder art: `BootScene` draws shapes from `color`/`shape` fields. When
  real sprites arrive, swap the texture keys (`enemy_<id>`, `item_<id>`,
  `player_<id>`) in one place.

## Ideas that fit the design without refactors

- Shops / secret rooms: new `RoomType` + templates + a pool in `loot.ts`.
- Active items / god boons: another modifier source in `RunState.recompute()`.
- Curses ("Wrath of Poseidon"): per-floor `StatModifiers` on the stage.
- LLM room generation: a service returning the 13×7 grid; validate with
  `roomGen`'s connectivity check before use.
- Gamepad: add codes to `BINDINGS` / poll pads in `core/input.ts`.
