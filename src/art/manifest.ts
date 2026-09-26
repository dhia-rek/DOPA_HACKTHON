import { CHARACTERS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { GODS } from '../data/gods';
import { ITEMS } from '../data/items';

/**
 * Sprites (players, enemies, pickups, hearts, items, portraits) are authored at
 * ART_SCALE x their on-screen size and drawn with setScale(1 / ART_SCALE) so they
 * stay crisp when the canvas is scaled up. Room tiles are 1:1.
 */
export const ART_SCALE = 2;

const EXT: Record<string, string> = { menu_bg: 'jpg' };

/** Room, pickup and HUD textures that have (or may have) a file in public/art/. */
export const STATIC_ART_KEYS = [
  'floor',
  'floor_1',
  'floor_2',
  'floor_3',
  'wall',
  'door_open',
  'door_closed',
  'rock',
  'pit',
  'pedestal',
  'trapdoor',
  'heart_full',
  'heart_half',
  'heart_empty',
  'pickup_heart',
  'pickup_coin',
  'menu_bg',
] as const;

/**
 * Every texture key the game may draw. Content-derived keys follow the data
 * ids, so adding `public/art/enemy_<id>.png` is all it takes to give a new
 * enemy real art; until then BootScene draws a placeholder shape for it.
 *
 *   player_<character.id>    56x56    in-room sprite, facing the camera
 *   player_<id>_back/_side   56x56    facing away / facing right (flipped for left)
 *   portrait_<character.id>  96x96    menu portrait (falls back to player_* at 2x)
 *   enemy_<enemy.id>         radius*2+16 square; _attack/_hurt/_dead pose variants
 *   god_<god.id>             160x160  blessing overlay portrait
 *   item_<item.id>           28x28
 */
export function artKeys(): string[] {
  return [
    ...STATIC_ART_KEYS,
    ...CHARACTERS.flatMap((c) => [`player_${c.id}`, `player_${c.id}_back`, `player_${c.id}_side`, `portrait_${c.id}`]),
    ...ENEMIES.flatMap((e) => [`enemy_${e.id}`, `enemy_${e.id}_hurt`, ...(e.innocent ? [] : [`enemy_${e.id}_attack`]), ...(e.isBoss ? [`enemy_${e.id}_dead`] : [])]),
    ...ITEMS.map((i) => `item_${i.id}`),
    ...GODS.map((g) => `god_${g.id}`),
  ];
}

export function artUrl(key: string): string {
  return `${import.meta.env.BASE_URL}art/${key}.${EXT[key] ?? 'png'}`;
}
