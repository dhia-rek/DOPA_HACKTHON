# Nekyia

A Greek-mythology roguelike in the style of *The Binding of Isaac*. You go down
through the underworld, room by room. AI-written dialogue, trials and omens
react to what you do. It runs in the browser (Phaser 3 + TypeScript).

## Run it

```bash
npm install
npm run dev      # open http://localhost:5173
```

The game works offline without an API key. AI features fall back to a built-in mock.

## Controls

- **Move:** `W A S D`
- **Shoot:** arrow keys (or `I J K L`)
- **Talk / shrine:** walk into an NPC or altar
- **Dialogue:** `↑ / ↓` or `1–4` to pick an answer, `Enter` / `Space` to confirm, `M` to mute the voice
- **Menus:** `↑ / ↓` to move, `Enter` / `Space` to select, `Esc` to go back
- **Hero select:** `← / →` to pick a hero, `R` for a new seed

## What to know

- **Choices matter.** You can spare, rob or kill innocent villagers. This changes your **karma**, and bosses remember it.
- **Bosses talk first.** Before each fight the boss speaks and knows your deeds. Your answer makes the fight easier or harder.
- **AI trials:** each floor, a god gives you a challenge (for example, "take no damage"). Passing gives rewards and failing costs you.
- **AI omens:** each floor changes based on how you play. Cruel runs get darker, deadlier floors, and heroic runs get holy ones.
- **The war of the gods:** Olympians, Titans and Giants are fighting. Your deeds decide who holds the next floor and which boss you face.
- **Voiced dialogue:** with the AI server, lines use Gemini TTS. Without it, the browser's own voice reads them.
- **Heroes:** Achilles, Atalanta, Heracles, Orpheus. **Kratos** is locked and unlocks through achievements.
- **Endless mode:** the stages repeat with higher difficulty. Floors are procedural (add `?seed=ANY` to replay the same run).

## Judge shortcuts

Add `?debug=1` to the URL:

- `G` god mode
- `B` jump to the boss
- `N` next floor
- `X` kill everything in the room
- `T` random item
- `H` heal
- `[` / `]` karma −25 / +25

## Optional: AI server

Run the server with a `GEMINI_API_KEY` to get live LLM dialogue, trials, omens and voices:

```bash
cd server && npm install && GEMINI_API_KEY=... PORT=8787 npx tsx src/index.ts
cd .. && printf 'VITE_DIALOGUE_API=http://localhost:8787\nVITE_DIRECTOR_API=http://localhost:8787/director\n' > .env.local
```

More docs: [STORY.md](STORY.md) (lore), [ARCHITECTURE.md](ARCHITECTURE.md) (code), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (dev guide).
