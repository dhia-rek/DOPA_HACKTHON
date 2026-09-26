# Nekyia — art direction & asset pipeline

![key art](docs/art/keyart.jpg)

## The look in one line

*The Binding of Isaac* proportions and grime, painted with the palette of a
Greek black-figure vase: terracotta, cream marble, bronze gold, near-black —
plus one accent colour per thing (red plume, green venom, purple underworld).

## Rules (apply to every new sprite)

| Rule | Why |
|---|---|
| Chibi: huge round head, stubby body, big sad/angry eyes | Isaac silhouette; readable at ~50 px |
| Thick dark-brown outline (never pure black), flat cel shading, one shadow tone | Everything reads as one set |
| Palette: terracotta `#c4632a`, cream `#e8dcc0`, bronze `#c9a45c`, near-black `#1a1410`, marble `#d8d0c0` | Black-figure pottery mood |
| One accent colour max per sprite | Keeps rooms calm; the accent is the "tell" (Kratos red stripe, Hydra green) |
| Front-facing, full body, centred, ~85 % of the frame | The processing script trims and fits automatically |
| Rooms are low-contrast and desaturated; characters are saturated | Sprites pop on the floor (see `tone` in `scripts/art/process.py`) |
| Greek motifs everywhere: meander (Greek key) bands, Doric columns, laurel, owl coin | Theme without words |

## Texture keys and sizes

The code only ever asks for **texture keys**. `BootScene` loads
`public/art/<key>.png` for every key and draws a flat placeholder shape for
any key that has no file, so new content is always playable.

Sprites are exported at **2× their on-screen size** (`ART_SCALE` in
`src/art/manifest.ts`) and drawn with `setScale(1 / ART_SCALE)`, so they stay
crisp when the 960×576 canvas is scaled up. Room tiles are 1:1. Sizes below
are on-screen; the PNG is twice that where marked ×2.

| Key | On-screen (px) | Used by |
|---|---|---|
| `player_<character.id>` | 56×56 ×2 | in-room hero (physics circle r=20 centred) |
| `portrait_<character.id>` | 96×96 ×2 | menu (falls back to `player_*` at 2×) |
| `enemy_<enemy.id>` | `radius*2+16` square ×2 | `Enemy` (physics circle centred) |
| `item_<item.id>` | 28×28 ×2 | HUD, pedestal, game-over |
| `floor` `floor_1..3` | 64×64 | floor variants mixed per cell (quadrants of one source) |
| `wall` `pit` `door_open` `door_closed` | 64×64 | room tiles; `floor*`/`wall` are tinted by `stage.palette` (keep them light and neutral) |
| `rock` `pedestal` `trapdoor` | 64×64 (transparent) | room props |
| `heart_full` `heart_half` `heart_empty` `pickup_heart` | 26×24 ×2 | HUD / drop |
| `pickup_coin` | 22×22 ×2 | drop |
| `menu_bg` (`.jpg`) | 960×576 | menu background, cropped from the key art |

Generated at boot (no file): `shadow` (soft ellipse under every actor) and
`vignette` (room-sized darkening towards the walls). Actors bob while moving,
squash on hit; behaviours request extra stretch via `Enemy.stretch`.

Doors are authored for the **top** wall (doorway opening down into the room);
`RunScene` rotates them for left/right and mirrors for the bottom wall.

## Pipeline: prompt → 1024² source → game PNG

1. Generate a 1024×1024 source on a **flat pure magenta `#FF00FF` background**
   (characters/props) or a full-frame **seamless tile** (floor/wall/doors).
   Prompt skeleton that produced the current set:

   > A single video game character sprite for a top-down 2D roguelike in the
   > style of The Binding of Isaac: a chibi cartoon *{who, costume, weapon,
   > expression}*. Huge round head with a small stubby body, big expressive
   > eyes, thick dark brown outlines, flat cel shading with one shadow tone,
   > slightly grimy muted palette of terracotta, cream, bronze gold and
   > near-black, ancient Greek black-figure pottery mood. Front-facing, full
   > body, centered, filling about 85% of the frame. Background is a
   > completely flat solid pure magenta color (#FF00FF), no gradient, no
   > ground shadow, no text, no border, only one character.

   Enemies swap the first sentence for "a chunky cartoon *{monster}*, slightly
   creepy but cute"; items add "bold simple silhouette readable at small size".
2. Drop the file in a folder outside the repo (e.g. `~/art_raw/enemy_cyclops.png`;
   the file name is the texture key, except `heart` → `heart_*`/`pickup_heart`,
   `coin` → `pickup_coin`, `player_*` also feeds `portrait_*`).
3. `python3 scripts/art/process.py ~/art_raw enemy_cyclops` — chroma-keys the
   magenta, trims, fits into the size from `SIZES`, writes `public/art/enemy_cyclops.png`.
   Add the key to `SIZES` if it is new content (`radius*2+8` for enemies).
4. Commit only `public/art/*.png` (a few KB each). Sources are not versioned.

Needs `python3` with `pillow` and `numpy`.

## Backlog (art)

- Walk cycle / idle bob (2–3 frames) for players and chasers
- Hit flash is a tint today; add a squash + white flash sprite
- Per-stage floor/wall variants (Labyrinth: blue-grey stone, Underworld: black basalt + purple)
- Tears: replace the circles with small bronze arrowheads / spear tips per character
- NPC "!" talk bubble, shrine altar prop, boss health bar frame with meander
- Menu background: vase-painting frieze
