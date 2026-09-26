# Working on Nekyia (read this first — humans and AI agents)

Nekyia is a Greek-mythology roguelike (Phaser 3 + TypeScript + Vite). Three
people work in parallel, each on their own stream and branch. Devin acts as
orchestrator/integrator. Full design and backlog: `ROADMAP.md`. How the code
fits together + "how to add X" recipes: `ARCHITECTURE.md`.

## Who works on what

| Person  | Branch                | Stream                 | Owns                                                             |
|---------|-----------------------|------------------------|------------------------------------------------------------------|
| Dhia    | `dhia/story`          | A. Story & content     | `src/core/story.ts`, `src/core/profile.ts`, `src/dialogue/types.ts`, `src/director/types.ts`, `src/data/*`, `ROADMAP.md`, prompt wording (`src/dialogue/prompt.ts`, `src/director/prompt.ts`) |
| Julien  | `julien/gameplay-ui`  | B. Gameplay & UI       | `src/scenes/*`, `src/entities/*`, `src/systems/behaviours.ts`, art/design |
| Parthiv | `parthiv/llm-service` | C. LLM service         | `server/*` (new), `src/dialogue/provider.ts`, `src/director/provider.ts`, `.env.example`, deploy docs |

If you are an AI agent and the user tells you who they are, work only inside
that stream's files. Touching another stream's files needs a note in the PR
and a ping to its owner. `src/dialogue/types.ts` and `src/director/types.ts`
are the shared contracts: changes to them need review from all three.
Phase 3 (the LLM Director that reshapes each floor) is designed in `docs/DIRECTOR.md`.

## Task boards (tick items here as they land on `develop`/`main`)

### Stream A — Dhia
- [x] New NPCs with personas: `priestess`, `child`, `wounded_soldier` (`src/data/enemies.ts`, `innocent: true`), add to stage `npcPool`s
- [x] Boss personas + list of `flags` each boss reacts to (Minotaur, Hydra, next bosses)
- [x] Moral achievements: `saint`, `butcher`, `oathbreaker` (`src/data/achievements.ts`)
- [x] Tune karma values and the `takeBossMods()` curve in `src/core/story.ts`
- [x] Kratos hook: starts at karma −40, gods refuse his shrine offerings
- [x] Boss outro dialogue kind (`boss_outro`) content in the mock provider
- [ ] Director: boons/curses catalog (`src/data/boons.ts`) and epithet achievements (`the Merciful`, `the Butcher`, `Oathbreaker`…)
- [x] Director: shrine content that makes prophecies (`story.promise`), orb flags (`orb_fire`, `orb_holy`) → `earnedWeaknesses`
- [ ] Director: tune `budgetFor()` / trait thresholds in `src/core/profile.ts`, prompt wording in `src/director/prompt.ts`

### Stream B — Julien
- [x] `DialogueScene` look & feel: speaker portrait box, typewriter text, selection sound
- [x] Karma / alignment indicator in `HudScene` (listen to `story_changed` event)
- [x] NPC visuals: distinct look, "!" bubble when talkable, flee animation
- [x] Shrine room type + altar sprite → opens a `kind: 'shrine'` dialogue
- [x] Boss outro: trigger `boss_outro` dialogue when a boss dies (`RunScene.killEnemy`)
- [ ] General art/feel pass (room palettes, hit feedback, menu)
- [x] Director: prefetch `directorRequest(run, floor+1)` after the boss intro choice, apply on `floor_started`; `floorTitle` + `verdict` between floors; `?director=1` overlay showing `reason`
- [x] Director: composable boss abilities (`charge`, `summon_minions`, `orbit_shields`, `call_shades`, `enrage_below`) + `Enemy.compose(BossBlueprint)` in `behaviours.ts`
- [x] Director: mutators `palette_shift`, `haunted`, `flooded`, `arena`; `enemyWeights` in spawning
- [x] Director: shrine offerings → `story.favour(god)`; quest tracker (`systems/quests.ts`) + HUD line (orb pickups still open)

### Stream C — Parthiv
- [x] `server/`: HTTP service `POST DialogueRequest -> DialogueScript` (any stack; key stays server-side)
- [x] Server-side validation mirroring `validateScript()`; return 502 on bad LLM output
- [x] Local dev recipe in `server/README.md` + `.env.example` for the server
- [x] `HttpDialogueProvider`: retries, cache by `request.seed`, prefetch boss intro on floor start
- [ ] Deploy (Vercel/Cloudflare/Render…) and document the `VITE_DIALOGUE_API` URL
- [ ] Later: LLM room generator behind the same pattern (13×7 grid contract in `src/gen/roomGen.ts`)
- [x] Director: `POST /director` (`DirectorRequest -> FloorDirective`) using `DIRECTOR_SYSTEM_PROMPT` + `validateDirective`, cache by `request.seed`, 502 on invalid → client falls back to mock
- [x] Director: document `VITE_DIRECTOR_API` next to `VITE_DIALOGUE_API`

## Rules for every change

1. Branch from `main` (`git checkout main && git pull`), push to your stream
   branch or a `<you>/<feature>` branch, open a PR into `main`.
2. Keep PRs small (≤ ~300 lines, one feature). Say which stream it is and
   whether it touches `src/dialogue/types.ts`.
3. `npm run typecheck && npm run build` must pass before the PR.
4. Content goes in `src/data/*.ts`; systems stay generic (see ARCHITECTURE.md).
5. Never put an LLM API key in the client. The browser only reads
   `VITE_DIALOGUE_API` / `VITE_DIRECTOR_API`; without them the offline mock providers are used.
6. Use `?seed=XXXX` in the URL to reproduce a run; report bugs with seed + floor.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173  (WASD move, arrows shoot, Enter/Space/1-4 in dialogue)
npm run typecheck
npm run build
```
