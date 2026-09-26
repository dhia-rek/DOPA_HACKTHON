# Nekyia — Roadmap & team workflow

Phase 1 (done, on `main`): playable Isaac-style foundation — seeded floors,
procedural rooms, 8-dir firing, enemies/bosses, items, hearts, achievements,
Kratos unlock chain, endless mode. See `ARCHITECTURE.md`.

Phase 2 (now): **a living story**. Every run is written on the fly by an LLM,
and what the player *does* (who they kill, what they say) changes what the
bosses say, how hard they hit, and how the story ends.

---

## 1. Design: how the story layer works

```
 player deed ──▶ StoryState (karma, flags, deeds) ──▶ StorySnapshot (JSON)
                                                          │
                       DialogueProvider.generate(request) ◀┘
                       (LLM server or offline mock)
                                │
                       DialogueScript (validated JSON)
                                │
                       DialogueScene (UI: lines → 2-4 options → reply)
                                │
                       option.effects ──▶ karma / flags / boss mods / hp / coins
```

* **Deeds** — anything the story should remember: `npc_killed`, `npc_spared`,
  `boss_killed`, `dialogue_choice`… recorded in `src/core/story.ts`.
* **Karma** −100…+100 → alignment `cruel | neutral | heroic`. Cruel players get
  angrier bosses (`takeBossMods()` adds up to +25 % boss hp at −100).
* **Flags** — free strings set by dialogue (`swore_oath_to_minotaur`,
  `knows_boss_weakness`, `blood_on_hands`) that later prompts and code can test.
* **NPCs** — `EnemyDef.innocent = true`. They flee, never hurt you, never block
  the room from clearing. Walk into one → dialogue (spare / rob / threaten).
  Shoot one → `npc_killed`, karma −15, flag `blood_on_hands`. Stages list
  their NPCs in `npcPool` / `npcChance`.
* **Boss intro** — entering a boss room pauses the game and the boss speaks,
  already knowing your deeds (the snapshot is in the prompt). Your answer
  applies `BossMods` (hp/damage/speed ×0.5…2) to *that* boss right away.
* **Contract first** — the LLM never touches game code. It returns a
  `DialogueScript` JSON; `validateScript()` clamps every number and drops
  anything malformed; if the service fails, the mock takes over so the game
  never blocks. All types live in `src/dialogue/types.ts`.
* **Same seed = same story** with the mock provider (it is seeded by
  `run.seed + floor + room`). With the LLM the story is new every run.

### Ideas queued (pick one when your stream is free)
1. **Boss outro** (`kind: 'boss_outro'`) — a dying line that references the intro choice.
2. **Oracle / shrine rooms** (`kind: 'shrine'`) — new `RoomType 'shrine'`, an altar sprite, sacrifice choices.
3. **Named NPCs with memory** — an NPC id that recurs across floors ("the shepherd you robbed on floor 1 now guards the Hydra").
4. **Story-driven boss pick** — `stage.bossPool` weighted by flags (`defied_minotaur` → Minotaur returns enraged).
5. **Endings** — at loop end, an LLM epilogue summarising the run's deeds; different achievement per alignment ("Saint", "Butcher").
6. **Karma in the HUD** — small laurel/blood icon; toast on alignment change.
7. **LLM room generator** — reuse the 13×7 grid contract in `roomGen.ts` (already planned in ARCHITECTURE.md).
8. **Kratos hook** — Kratos starts at karma −40 and gods refuse his shrine offerings.

---

## 2. Team split (3 streams, 3 branches)

| Stream | Owner | Branch | Owns (files) | Must NOT edit without a ping |
|---|---|---|---|---|
| **A. Story & content** | Dhia (`dhia-rek`) | `dhia/story` | `src/core/story.ts`, `src/dialogue/types.ts` (contract), `src/data/*` (NPCs, personas, stages, items, achievements), `ROADMAP.md`, prompt wording in `provider.ts:SYSTEM_PROMPT` | `src/scenes/*`, `src/entities/*` |
| **B. Gameplay & UI** | Julien | `julien/gameplay-ui` | `src/scenes/*` (DialogueScene look & feel, HUD karma, shrine room), `src/entities/*`, `src/systems/behaviours.ts` (new NPC/boss behaviours), art/design | `src/dialogue/*`, `server/*` |
| **C. LLM service** | Parthiv | `parthiv/llm-service` | `server/` (new: the HTTP service that holds the API key), `src/dialogue/provider.ts` (HttpDialogueProvider, retries, caching, prefetch), `.env.example`, deploy docs | `src/scenes/*`, `src/data/*` |

Shared/blocking file: **`src/dialogue/types.ts`**. Changing it needs a PR
reviewed by all three — it is the API between B (UI) and C (service).

### Stream C — server contract (what Parthiv builds)
```
POST {VITE_DIALOGUE_API}            body: DialogueRequest   (src/dialogue/types.ts)
200  application/json               body: DialogueScript
```
* Any stack (Node/Express, Cloudflare Worker, Vercel function, FastAPI…).
* System prompt: `SYSTEM_PROMPT` in `src/dialogue/provider.ts`; user message =
  `JSON.stringify(request)`. Ask the model for JSON mode / structured output.
* Validate with the same rules as `validateScript()` server-side, return 502
  on failure — the client then falls back to the mock automatically.
* Never ship the API key to the browser. Client reads only `VITE_DIALOGUE_API`.
* Nice-to-have: cache by `request.seed` (replays), prefetch the boss intro
  when the floor starts, 8 s timeout (client already aborts at 8 s).

### Stream B — first tasks (Julien)
* Make `DialogueScene` pretty: portrait box for the speaker (`def.shape/color`
  or real art), typewriter text, option hover/selection sound.
* Karma/alignment indicator in `HudScene` (listen to `story_changed`).
* NPC visuals: distinct look, "!" bubble when talkable, flee animation.
* Shrine room type + altar sprite → triggers `kind: 'shrine'`.

### Stream A — first tasks (Dhia)
* More NPCs (`priestess`, `child`, `wounded_soldier`) with personas; per-stage pools.
* Boss personas + which `flags` each boss should react to.
* Achievements for the moral axis (`saint`, `butcher`, `oathbreaker`).
* Tune karma values / `takeBossMods()` curve.

---

## 3. Workflow

1. `git checkout main && git pull`, then `git checkout -b <you>/<feature>` (or push to your stream branch).
2. Small PRs into `main` (≤ ~300 lines), one feature each. `npm run typecheck && npm run build` must pass.
3. Every PR description says which stream it belongs to and whether it touches `src/dialogue/types.ts`.
4. Merge order for phase 2: contract (done) → mock loop (done) → UI polish & service in parallel → live LLM behind `VITE_DIALOGUE_API`.
5. Dev without credentials: just run `npm run dev` — the mock provider is the default.
6. Test seeds: `?seed=OLYMPUS-0001` etc. Report bugs with the seed + floor.

Devin (orchestrator) reviews PRs, keeps `ARCHITECTURE.md`/`ROADMAP.md` current,
resolves contract disputes, and integrates when streams collide.
