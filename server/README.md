# Nekyia dialogue server (Stream C)

Small Express service that turns a `DialogueRequest` into a `DialogueScript`
using Google Gemini (AI Studio). It holds the API key so the browser never sees it.

```
POST /            body: DialogueRequest  ->  200 DialogueScript
                                             400 bad request body
                                             502 LLM failed / returned an invalid script
                                             429 over RATE_LIMIT_PER_MIN LLM calls for this IP
                                             503 GEMINI_API_KEY not set
POST /director    body: DirectorRequest  ->  200 FloorDirective (same error codes)
POST /trial       body: TrialRequest     ->  200 TrialOffer (same error codes)
POST /voice       body: VoiceRequest     ->  200 audio/wav (Gemini TTS, GEMINI_TTS_MODEL)
GET  /health      { ok, llm, model, cached }
```

`/director` is the LLM Director (`docs/DIRECTOR.md`): it receives the
`PlayerProfile` for the coming floor and returns a `FloorDirective` (floor
title, verdict, mutators, enemy weights, NPC casting, quest, composed boss).
It uses `DIRECTOR_SYSTEM_PROMPT` and `validateDirective` from
`../src/director/`, so an out-of-catalog id or an over-budget boss is clamped
server-side; the client validates again and falls back to the seeded mock
director when the server is down, so the game is always playable.

Types and the validator (`validateScript`) are imported straight from
`../src/dialogue/types.ts`, and the system prompt from
`../src/dialogue/prompt.ts`, so client and server never drift. The client
falls back to the offline mock on any non-200, so a broken server never breaks
the game.

## Local dev

```bash
cd server
npm install
cp .env.example .env        # then paste your GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev                 # http://localhost:8787
```

Point the game at it (repo root):

```bash
printf 'VITE_DIALOGUE_API=http://localhost:8787\nVITE_DIRECTOR_API=http://localhost:8787/director\n' > .env.local
npm run dev
```

Smoke test without the game:

```bash
curl -s localhost:8787/health
curl -s localhost:8787 -H 'content-type: application/json' -d '{
  "kind":"boss_intro","speakerId":"minotaur","speakerName":"The Minotaur",
  "persona":"Proud, cornered beast who despises heroes.",
  "seed":"demo-1",
  "story":{"characterId":"achilles","characterName":"Achilles","floor":2,
           "stageName":"The Labyrinth","karma":-10,"alignment":"neutral","flags":[],
           "npcsKilled":1,"npcsSpared":0,"bossesKilled":[],"items":[],"recentDeeds":["killed a priestess"]}
}' | jq
```

Responses are cached by `seed:kind:speakerId:language:hash(story)` (LRU, `CACHE_SIZE`),
so replaying a run with `?seed=XXXX` reuses the same lines. `x-cache: hit|miss`
header tells you which.

## Deploy

Any Node 20.12+ host works; the start command is `npm start` inside `server/`
(uses `tsx`, no build step). Set `GEMINI_API_KEY` (and optionally
`GEMINI_MODEL`, `CORS_ORIGIN=https://your-game-host`) as environment variables.

- **Render**: new Web Service → root directory `server`, build `npm install`,
  start `npm start`.
- **Railway / Fly**: same commands, root `server`.

Then set `VITE_DIALOGUE_API=https://<your-service>` when building the game
(`.env.local` locally, or the host's env vars for the static site build).
