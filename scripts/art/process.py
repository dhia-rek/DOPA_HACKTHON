#!/usr/bin/env python3
"""
Turn 1024x1024 AI-generated source images (magenta background) into the
game-ready PNGs in public/art/. Texture sizes must match what the physics
bodies in src/entities/* expect (see SIZES below).

    python3 scripts/art/process.py ~/art_raw            # all assets
    python3 scripts/art/process.py ~/art_raw enemy_boar # one asset
    python3 scripts/art/process.py ~/art_raw ~/more_raw  # several source folders (first match wins)

Sources live outside the repo (they are ~1 MB each); only the outputs are
committed. Regenerate a source with the prompt in ART.md, rerun this script.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TILE = 64
# Sprites are exported at SCALE x their on-screen size (see ART_SCALE in src/art/manifest.ts).
SCALE = 2
OUT = Path(__file__).resolve().parents[2] / 'public' / 'art'

# key -> (mode, width, height, options)
#   sprite: chroma-key the magenta, trim, fit into the box (fill = fraction of the box the sprite may use)
#   sprite mode is exported at SCALE x unless hires=False (props that share the 64px tile grid)
#   tile:   crop a centered square (crop = fraction of the source kept) and scale to the box, no transparency
SIZES = {
    # players: canvas a bit bigger than the body so the sprite reads ~1 tile tall
    'player_achilles': ('sprite', 56, 56, {'fill': 1.0}),
    'player_atalanta': ('sprite', 56, 56, {'fill': 1.0}),
    'player_heracles': ('sprite', 56, 56, {'fill': 1.0}),
    'player_orpheus': ('sprite', 56, 56, {'fill': 1.0}),
    'player_kratos': ('sprite', 56, 56, {'fill': 1.0}),
    # enemies: EnemyDef.radius * 2 + 16
    'enemy_bandit': ('sprite', 52, 52, {'fill': 1.0}),
    'enemy_harpy': ('sprite', 48, 48, {'fill': 1.0}),
    'enemy_centaur_archer': ('sprite', 56, 56, {'fill': 1.0}),
    'enemy_boar': ('sprite', 60, 60, {'fill': 1.0}),
    'enemy_skeleton': ('sprite', 52, 52, {'fill': 1.0}),
    'enemy_living_statue': ('sprite', 60, 60, {'fill': 1.0}),
    'enemy_minotaur': ('sprite', 84, 84, {'fill': 1.0}),
    'enemy_hydra': ('sprite', 92, 92, {'fill': 1.0}),
    'enemy_villager': ('sprite', 46, 46, {'fill': 1.0}),
    # room
    # room tiles are toned down (Isaac floors are low-contrast so sprites pop) and
    # RunScene multiplies them by the stage palette on top.
    # floor: one quadrant of the source per variant; RunScene mixes floor / floor_1..3 per cell
    'floor': ('tile', TILE, TILE, {'crop': 0.5, 'tone': (0.9, 0.85, 1.0), 'at': (0.25, 0.25)}),
    'floor_1': ('tile', TILE, TILE, {'src': 'floor', 'crop': 0.5, 'tone': (0.9, 0.85, 1.0), 'at': (0.75, 0.25)}),
    'floor_2': ('tile', TILE, TILE, {'src': 'floor', 'crop': 0.5, 'tone': (0.9, 0.85, 1.0), 'at': (0.25, 0.75)}),
    'floor_3': ('tile', TILE, TILE, {'src': 'floor', 'crop': 0.5, 'tone': (0.9, 0.85, 1.0), 'at': (0.75, 0.75)}),
    'wall': ('tile', TILE, TILE, {'crop': 1.0, 'tone': (0.85, 0.85, 0.9)}),
    'pit': ('tile', TILE, TILE, {}),  # blended onto floor.png, run after 'floor'
    'door_open': ('tile', TILE, TILE, {'crop': 0.62}),
    'door_closed': ('tile', TILE, TILE, {'crop': 0.62}),
    'rock': ('sprite', TILE, TILE, {'fill': 0.9, 'hires': False}),
    'pedestal': ('sprite', TILE, TILE, {'fill': 0.8, 'hires': False}),
    'trapdoor': ('sprite', TILE, TILE, {'fill': 0.85, 'hires': False}),
    # menu background: the key art cropped to the canvas aspect
    'menu_bg': ('menu_bg', 960, 576, {'src': 'keyart'}),
    # pickups / HUD
    'pickup_coin': ('sprite', 22, 22, {'src': 'coin', 'fill': 1.0}),
    'heart_full': ('sprite', 26, 24, {'src': 'heart', 'fill': 1.0}),
}
# pose variants share the base sprite's box: enemies get _attack/_hurt (+ _dead for bosses),
# heroes get _back/_side facing views. The game falls back to the base key when a variant is missing.
for _k in [k for k in SIZES if k.startswith('enemy_')]:
    for _v in ('attack', 'hurt', 'dead'):
        SIZES[f'{_k}_{_v}'] = SIZES[_k]
for _c in ('achilles', 'atalanta', 'heracles', 'orpheus', 'kratos'):
    for _v in ('back', 'side'):
        SIZES[f'player_{_c}_{_v}'] = SIZES[f'player_{_c}']
# gods: blessing overlay portraits
for _g in ('hades', 'athena', 'apollo', 'hermes', 'ares', 'poseidon'):
    SIZES[f'god_{_g}'] = ('sprite', 160, 160, {'fill': 1.0})
# menu portraits: hi-res version of each player sprite
for _c in ('achilles', 'atalanta', 'heracles', 'orpheus', 'kratos'):
    SIZES[f'portrait_{_c}'] = ('sprite', 96, 96, {'src': f'player_{_c}', 'fill': 0.96})
# item icons (HUD, pedestal, game over)
for _i in ('hermes_sandals', 'thunderbolt', 'trident', 'golden_fleece', 'lyre_of_orpheus', 'aegis', 'apollos_bow',
           'ambrosia', 'hydra_venom', 'cyclops_eye', 'bag_of_winds', 'helm_of_darkness', 'blades_of_chaos'):
    SIZES[f'item_{_i}'] = ('sprite', 28, 28, {'fill': 1.0})


def chroma_alpha(rgb: np.ndarray) -> np.ndarray:
    """Alpha mask from a pure-magenta background (soft edge, eroded to kill fringe)."""
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    dist = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    alpha = np.clip((dist - 60) / 80.0, 0, 1)
    a = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))
    return np.asarray(a).astype(np.float32) / 255.0


def despill(rgb: np.ndarray) -> np.ndarray:
    """Pull magenta out of edge pixels: green can never be far below the red/blue average."""
    r, g, b = rgb[..., 0].astype(float), rgb[..., 1].astype(float), rgb[..., 2].astype(float)
    spill = np.clip((r + b) / 2 - g - 90, 0, None)
    out = rgb.astype(float).copy()
    out[..., 0] -= spill * 0.5
    out[..., 2] -= spill * 0.5
    return np.clip(out, 0, 255)


def sprite(src: Image.Image, w: int, h: int, fill: float) -> Image.Image:
    rgb = np.asarray(src.convert('RGB'))
    alpha = chroma_alpha(rgb)
    rgb = despill(rgb)
    ys, xs = np.where(alpha > 0.5)
    if len(xs) == 0:
        raise SystemExit('nothing left after chroma key')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]

    # Premultiply so the downscale doesn't bleed background into edges.
    pre = np.dstack([rgb * alpha[..., None], alpha[..., None] * 255]).astype(np.uint8)
    im = Image.fromarray(pre, 'RGBA')
    scale = min(w * fill / im.width, h * fill / im.height)
    tw, th = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    im = im.resize((tw, th), Image.LANCZOS)
    arr = np.asarray(im).astype(float)
    a = arr[..., 3:4]
    rgb_out = np.where(a > 0, arr[..., :3] / np.maximum(a, 1) * 255, 0)
    out = np.dstack([np.clip(rgb_out, 0, 255), a]).astype(np.uint8)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(out, 'RGBA'), ((w - tw) // 2, (h - th) // 2))
    return canvas


def tile(src: Image.Image, w: int, h: int, crop: float, tone: tuple[float, float, float] | None, at: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    im = src.convert('RGB')
    side = int(min(im.size) * crop)
    cx, cy = int(im.width * at[0]), int(im.height * at[1])
    im = im.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))
    im = im.resize((w, h), Image.LANCZOS)
    if tone:
        brightness, contrast, saturation = tone
        arr = np.asarray(im).astype(float)
        grey = arr.mean(axis=2, keepdims=True)
        arr = grey + (arr - grey) * saturation
        arr = arr.mean() + (arr - arr.mean()) * contrast
        arr = arr * brightness
        im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')
    return im.convert('RGBA')


def composite_pit(floor: Image.Image, pit_src: Image.Image, w: int, h: int) -> Image.Image:
    """Pit = the real floor tile with the hole from the pit source blended into its centre."""
    hole = tile(pit_src, w, h, 1.0, SIZES['floor'][3].get('tone'))
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.maximum(np.abs(xx - (w - 1) / 2), np.abs(yy - (h - 1) / 2)) / (w / 2)
    mask = np.clip((0.86 - d) / 0.22, 0, 1)[..., None]
    out = np.asarray(floor).astype(float) * (1 - mask) + np.asarray(hole).astype(float) * mask
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def menu_bg(src: Image.Image, w: int, h: int) -> Image.Image:
    im = src.convert('RGB')
    side_w = min(im.width, int(im.height * w / h))
    side_h = int(side_w * h / w)
    x0, y0 = (im.width - side_w) // 2, (im.height - side_h) // 2
    return im.crop((x0, y0, x0 + side_w, y0 + side_h)).resize((w, h), Image.LANCZOS)


def derive_hearts(full: Image.Image) -> None:
    arr = np.asarray(full).astype(float)
    grey = arr[..., :3].mean(axis=2, keepdims=True)
    empty = arr.copy()
    empty[..., :3] = grey * 0.28 + np.array([40, 22, 22])
    empty_im = Image.fromarray(np.clip(empty, 0, 255).astype(np.uint8), 'RGBA')
    empty_im.save(OUT / 'heart_empty.png')
    half = np.asarray(empty_im).copy()
    half[:, : full.width // 2] = np.asarray(full)[:, : full.width // 2]
    Image.fromarray(half, 'RGBA').save(OUT / 'heart_half.png')
    full.save(OUT / 'pickup_heart.png')


def main() -> None:
    raws = [Path(a).expanduser() for a in sys.argv[1:] if a not in SIZES]
    only = [a for a in sys.argv[1:] if a in SIZES] or list(SIZES)
    OUT.mkdir(parents=True, exist_ok=True)
    for key in only:
        mode, w, h, opt = SIZES[key]
        src_path = next((r / f"{opt.get('src', key)}.png" for r in raws if (r / f"{opt.get('src', key)}.png").exists()), raws[0] / f"{opt.get('src', key)}.png")
        if not src_path.exists():
            if len(sys.argv) > 2:
                print(f'skip {key}: {src_path} missing')
            continue
        src = Image.open(src_path)
        if mode == 'menu_bg':
            menu_bg(src, w, h).save(OUT / f'{key}.jpg', quality=86, optimize=True)
            print(f'{key}: {w}x{h} jpg')
            continue
        if mode == 'sprite' and opt.get('hires', True):
            w, h = w * SCALE, h * SCALE
        out = sprite(src, w, h, opt.get('fill', 0.96)) if mode == 'sprite' else tile(src, w, h, opt.get('crop', 1.0), opt.get('tone'), opt.get('at', (0.5, 0.5)))
        if key == 'pit':
            out = composite_pit(Image.open(OUT / 'floor.png').convert('RGBA'), src, w, h)
        out.save(OUT / f'{key}.png', optimize=True)
        if key == 'heart_full':
            derive_hearts(out)
        print(f'{key}: {w}x{h}')


if __name__ == '__main__':
    main()
