# The Director — LLM judgement that reshapes the run

Phase 3 design. Phase 2 gave every speaker an LLM voice (`DialogueProvider`);
phase 3 gives the *floor itself* one: once per floor an LLM **Director** reads a
`PlayerProfile` and returns a `FloorDirective` that changes the stage, the
enemies, the quest, the NPCs and — above all — the boss.

Code on `main` today (contract first, no gameplay wired yet):

| Piece | File |
|---|---|
| Contracts `PlayerProfile`, `DirectorRequest`, `FloorDirective`, `BossBlueprint`, `QuestOffer` + `validateDirective()` | `src/director/types.ts` |
| `DirectorProvider`: `MockDirectorProvider` (offline, seeded) and `HttpDirectorProvider` (`VITE_DIRECTOR_API`) | `src/director/provider.ts` |
| System prompt (no Phaser imports, importable by `server/`) | `src/director/prompt.ts` |
| Profile builder + telemetry (skill, style, build, traits, budget, legend) | `src/core/profile.ts` |
| Divine attention, prophecies, quest log | `src/core/story.ts` |
| Catalogs the LLM picks from | `src/data/gods.ts`, `mutators.ts`, `abilities.ts`, `quests.ts` |

---

## 1. The one rule

**The LLM never invents numbers or mechanics. It picks ids from catalogs and writes words.**

* Every knob is data with an id and a **cost** in `src/data/*`.
* The Director gets a **budget** (`budgetFor()`): grows with depth, ×0.6 when the
  player is struggling, ×1.4 when dominating. `validateDirective()` trims phases →
  mutators → abilities until the directive fits, drops unknown ids, clamps numbers.
* If the service is down/slow the seeded mock answers. Combat never waits on an LLM.

```
 events bus ─▶ telemetry + StoryState ─▶ buildProfile(run) ─▶ PlayerProfile
                                                                  │
                          directorProvider.direct(request)  ◀─────┘   (prefetched after the boss intro choice)
                                                                  │
                                              FloorDirective (validated, budgeted)
                                                                  │
      ┌───────────────┬────────────────┬──────────────┬───────────┴───────┬─────────────┐
   mutators      enemyWeights       quest offer      npc casting     BossBlueprint     verdict / epithet
 (RunScene)     (floorGen/spawn)   (quest tracker)   (spawn)         (Enemy.compose)   (HUD between floors)
```

## 2. What the Director sees — `PlayerProfile`

Hard facts (`StorySnapshot`: karma, deeds, flags, items) plus **derived** fields
computed in TS so the prompt carries conclusions, not raw logs:

| Field | From | Meaning |
|---|---|---|
| `voice` | dialogue option ids (`defy`, `kneel`, `bargain`, `honour`…) | defiant · humble · trickster · pious · silent |
| `buildArchetype` | `run.flags` | `homing_swarm`, `piercing_sniper`, `poison`, `tank`… |
| `style` | avg room clear time, range | aggressive · cautious · kiter |
| `skill` | hp %, damage this floor, flawless rooms, deaths | struggling · flow · dominating → drives the budget |
| `traits` | counts normalised 0..1 | mercy, cruelty, greed, devotion, risk, skill |
| `divineAttention`, `patron` | orbs picked / offerings (`story.favour(god)`) | which god watches; the patron's **rival** tends to send the boss |
| `quests` | `story.quests` | done / failed / betrayed |
| `prophecies` | `story.dueProphecies(floor)` | promises the directive **must** honour |
| `legend` | last deeds (Chronicler later) | ≤3 lines of "the run so far" |
| `catalogs` | stage pools + data ids | what the LLM may reference; `earnedWeaknesses` = what the player has actually got |

## 3. What the Director returns — `FloorDirective`

* `floorTitle`, `verdict` (2 lines, the Fates speaking — make judgement *visible*).
* `mutators` ≤2 ids (`haunted`, `flooded`, `darkness`, `plague`, `arena`, `pilgrim_road`, `oathbound`, `palette_shift`).
* `enemyWeights` 0..3 per enemy id of the stage pool.
* `modifier` boon/curse (free id until `src/data/boons.ts` exists).
* `npcs` with role `quest_giver | victim | witness`, optional name (recurring NPCs).
* `quest` = template id + params + giver + hook + reward (tracking is TS over the event bus).
* `boss` = **`BossBlueprint`**: archetype from the stage pool, 2–4 ability modules, ≤2 phases,
  a weakness the player *earned*, clamped `BossMods`, a `grudge` quoting a real deed.
* `epithet` (HUD: "Achilles the Butcher"), `reason` (debug overlay only), `spent`.

### Boss rules (in the prompt, enforced by the validator where possible)
1. One concrete grudge.
2. Counter the build once, reward it once (`AbilityDef.counters / rewards`).
3. Weakness ∈ `catalogs.earnedWeaknesses`, else `stagger_after_charge`.
4. Cost ≤ budget. Struggling → 2 abilities, no phase, boon.
5. The boss intro dialogue still applies `BossMods`; humbling it may remove an ability, defying may add one.

## 4. Orbs, shrines, quests

* **Orbs** are god-coloured pickups → `story.favour(god)`. Ignored god for 2 floors → curse; patron's rival → boss.
* **Shrines** make **prophecies** (`story.promise({...})`): `boss_weakness`, `boon_next_floor`, `npc_returns`, `curse`.
  Only Hermes may set `truthful: false`, once per run. `dueProphecies(floor)` goes into the profile;
  `settleProphecies(floor, directive)` after the directive is applied — only promises the directive `honours()` are removed (validator forces truthful ones in when the stage catalog allows; lies from Hermes always settle).
* **Quests** are templates (`slay`, `spare_all`, `deliver`, `no_damage_rooms`, `reach_boss_under`, `betray`, `sacrifice`)
  with param specs; outcomes land in `story.quests` and feed the next judgement.

## 5. Latency

One Director call per floor (~1.5k tokens in / 400 out). Request floor *N+1* when the
player enters floor *N*'s boss room (`directorRequest(run, run.floor + 1)`), keep it,
apply on `floor_started`. Cache by `request.seed` server-side. Server validates with the
same `validateDirective()` and returns 502 on failure → client falls back to the mock.

## 6. Wiring (as implemented)

```
MenuScene ──► FloorIntroScene ──► RunScene (rooms…) ──► boss room ──► trapdoor ──► FloorIntroScene ──► …
                 │                    │                     │
                 │                    │                     └─ boss intro choice → director.prefetch(run, floor+1)   (systems/director.ts)
                 │                    └─ run.ensureFloor() → generateFloor() → applyDirective()  (director/apply.ts)
                 └─ await director.forFloor(run, floor) → run.directive; settleProphecies; questTracker.offer
```

* **FloorIntroScene** shows `floorTitle`, `verdict`, epithet, omens (mutators + god), modifier, quest hook and the boss title/grudge. `?director=1` prints `reason`, abilities, weakness, spent.
* **director/apply.ts** (pure): boss archetype, `enemyWeights` re-roll, `arena`/`pilgrim_road` enemy counts, `haunted` shades, NPC casting into empty rooms.
* **RunScene**: `palette_shift` (walls tinted by patron god), `flooded` (0.85 speed + tint), `darkness` (mask around the player), `plague` (poison burst on kills); boss intro speaker uses the blueprint title/persona/grudge; earned weakness multiplies matching shots ×1.6 (`stagger_after_charge` doubles damage during the longer stagger); `steal_hearts` heals the boss on contact; shrine offerings call `story.favour(god)` and make a prophecy (boss weakness or boon; Hermes may lie once).
* **systems/bossAbilities.ts**: `boss_directed` behaviour composes `BossBlueprint.abilities` + phases in round-robin (charge, ground_slam, projectile_ring, summon_minions, teleport_behind, call_shades, mirror_build) with passives (orbit_shields, poison_trail, enrage_below, split_on_hp).
* **systems/quests.ts**: tracks `slay`, `spare_all`, `no_damage_rooms`, `reach_boss_under`, `betray`, `sacrifice`, `deliver` over the event bus; rewards `heart` / `coins:N` / item; result recorded as a deed the next Director call sees.
* **server/**: `POST /director` (Gemini, `DIRECTOR_SYSTEM_PROMPT`, `validateDirective`, cache by seed+profile hash). Client: `VITE_DIRECTOR_API`; without it (or on any failure) the seeded `MockDirectorProvider` runs, so every run still differs offline.

## 7. Next ideas (ranked for the hackathon)

1. **Free-text answers to bosses** — `kind: 'boss_intro_free'`, LLM classifies intent into an existing option.
2. **Trial of the Dead** — game over becomes a judgement by Minos/Rhadamanthus/Aeacus; verdict = boon/curse for the next run (`save.ts`).
3. **Named elites** — normal enemy + 1 ability + name + grudge.
4. **Epithets in HUD + Fates verdict** — already in the contract, needs UI.
5. **Player-written vows** → LLM maps to a quest template.
6. Later: Book of the Dead (cross-run memory), spared boss → ally/traitor, rival hero, item lore evolution, memory rooms, shared legends.

Full brainstorm with reasoning: see the session notes (parts 1 & 2) linked from the PR.
