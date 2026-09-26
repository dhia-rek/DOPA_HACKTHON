import { CHARACTERS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';

/** Room, pickup and HUD textures that have (or may have) a file in public/art/. */
export const STATIC_ART_KEYS = [
  'floor',
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
] as const;

/**
 * Every texture key the game may draw. Content-derived keys follow the data
 * ids, so adding `public/art/enemy_<id>.png` is all it takes to give a new
 * enemy real art; until then BootScene draws a placeholder shape for it.
 *
 *   player_<character.id>    48x48    in-room sprite
 *   portrait_<character.id>  96x96    menu portrait (falls back to player_* at 2x)
 *   enemy_<enemy.id>         radius*2+8 square
 *   item_<item.id>           28x28
 */
export function artKeys(): string[] {
  return [
    ...STATIC_ART_KEYS,
    ...CHARACTERS.flatMap((c) => [`player_${c.id}`, `portrait_${c.id}`]),
    ...ENEMIES.map((e) => `enemy_${e.id}`),
    ...ITEMS.map((i) => `item_${i.id}`),
  ];
}

export function artUrl(key: string): string {
  return `${import.meta.env.BASE_URL}art/${key}.png`;
}
