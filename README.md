# Nekyia

A Greek-mythology roguelike in the spirit of *The Binding of Isaac*.
Currently a proof of concept: one Isaac-style room, a character you can move, doors that lead to the next room.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Controls: **WASD / arrow keys** to move. Walk into a door to change room.

## Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload       |
| `npm run build`     | Typecheck + production build to `dist/` |
| `npm run preview`   | Serve the production build locally    |
| `npm run typecheck` | `tsc --noEmit`                        |

## Stack

- [Phaser 3](https://phaser.io/) (arcade physics, scenes, input)
- TypeScript + [Vite](https://vite.dev/)
- No art assets yet: placeholder textures are generated at runtime in `BootScene`.

## Layout

```
src/
  main.ts            Phaser game config
  config.ts          Tile size, room dimensions, player tuning, palette
  data/rooms.ts      ASCII room templates (13x7) — add a room by adding an entry
  entities/Player.ts Player sprite + movement (acceleration/drag, WASD/arrows)
  scenes/BootScene.ts Generates placeholder textures, then starts the room
  scenes/RoomScene.ts Builds walls/doors/obstacles from a template, handles room transitions
```

## Tuning movement

Everything about movement feel lives in `PLAYER` in `src/config.ts`:
`maxSpeed`, `acceleration` (how fast you get going), `drag` (how fast you stop).
