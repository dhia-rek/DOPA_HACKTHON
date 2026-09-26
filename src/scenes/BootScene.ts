import Phaser from 'phaser';
import { COLORS, PLAYER, PROJECTILE, TILE } from '../config';
import { save } from '../core/save';
import { CHARACTERS } from '../data/characters';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { ITEMS } from '../data/items';

/**
 * Generates placeholder textures at runtime so the game needs no art assets.
 * Replace any of these with real sprites later (this.load.image / spritesheet)
 * — the rest of the code only refers to texture keys.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    save.load();
    // Stop the page from scrolling on game keys (game-wide, all scenes).
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);

    this.makeFloor();
    this.makeWall();
    this.makeDoors();
    this.makeRock();
    this.makePit();
    this.makeTears();
    this.makeHearts();
    this.makeCoin();
    this.makePedestal();
    this.makeTrapdoor();
    for (const c of CHARACTERS) this.makePlayer(`player_${c.id}`, c.color, c.shadeColor);
    for (const e of ENEMIES) this.makeEnemy(e);
    for (const i of ITEMS) this.makeItemIcon(`item_${i.id}`, i.color);

    this.scene.start('menu');
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  private makeFloor(): void {
    const g = this.gfx();
    g.fillStyle(COLORS.floor).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.floorAlt);
    g.fillRect(0, 0, TILE / 2, TILE / 2);
    g.fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2);
    g.generateTexture('floor', TILE, TILE);
    g.destroy();
  }

  private makeWall(): void {
    const g = this.gfx();
    g.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.wall).fillRect(4, 4, TILE - 8, TILE - 8);
    g.lineStyle(2, COLORS.wallEdge);
    g.strokeRect(4, 4, TILE / 2 - 4, TILE / 2 - 4);
    g.strokeRect(TILE / 2, TILE / 2, TILE / 2 - 4, TILE / 2 - 4);
    g.generateTexture('wall', TILE, TILE);
    g.destroy();
  }

  private makeDoors(): void {
    const open = this.gfx();
    open.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
    open.fillStyle(COLORS.doorFrame).fillRect(8, 4, TILE - 16, TILE - 8);
    open.fillStyle(COLORS.door).fillRect(14, 10, TILE - 28, TILE - 20);
    open.fillStyle(COLORS.floor).fillRect(20, 24, TILE - 40, TILE - 24);
    open.generateTexture('door_open', TILE, TILE);
    open.destroy();

    const closed = this.gfx();
    closed.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
    closed.fillStyle(COLORS.doorFrame).fillRect(8, 4, TILE - 16, TILE - 8);
    closed.fillStyle(COLORS.doorClosed).fillRect(14, 10, TILE - 28, TILE - 20);
    closed.lineStyle(3, COLORS.doorFrame);
    closed.lineBetween(14, TILE / 2, TILE - 14, TILE / 2);
    closed.generateTexture('door_closed', TILE, TILE);
    closed.destroy();
  }

  private makeRock(): void {
    const g = this.gfx();
    g.fillStyle(COLORS.rockShade).fillCircle(TILE / 2, TILE / 2 + 4, TILE / 2 - 8);
    g.fillStyle(COLORS.rock).fillCircle(TILE / 2 - 3, TILE / 2 - 2, TILE / 2 - 12);
    g.generateTexture('rock', TILE, TILE);
    g.destroy();
  }

  private makePit(): void {
    const g = this.gfx();
    g.fillStyle(COLORS.floor).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x0b0a0f).fillRect(6, 6, TILE - 12, TILE - 12);
    g.generateTexture('pit', TILE, TILE);
    g.destroy();
  }

  private makeTears(): void {
    const pr = PROJECTILE.playerRadius;
    const p = this.gfx();
    p.fillStyle(COLORS.tear).fillCircle(pr + 1, pr + 1, pr);
    p.fillStyle(0xffffff).fillCircle(pr - 2, pr - 2, pr / 3);
    p.generateTexture('tear_player', pr * 2 + 2, pr * 2 + 2);
    p.destroy();

    const er = PROJECTILE.enemyRadius;
    const e = this.gfx();
    e.fillStyle(COLORS.enemyTear).fillCircle(er + 1, er + 1, er);
    e.fillStyle(0xffd0c0).fillCircle(er - 1, er - 1, er / 3);
    e.generateTexture('tear_enemy', er * 2 + 2, er * 2 + 2);
    e.destroy();

    const poison = this.gfx();
    poison.fillStyle(0x7fe040).fillCircle(pr + 1, pr + 1, pr);
    poison.fillStyle(0xd0ff90).fillCircle(pr - 2, pr - 2, pr / 3);
    poison.generateTexture('tear_poison', pr * 2 + 2, pr * 2 + 2);
    poison.destroy();
  }

  private heartShape(g: Phaser.GameObjects.Graphics, color: number, half = false): void {
    g.fillStyle(color);
    g.fillCircle(8, 8, 6);
    if (!half) g.fillCircle(18, 8, 6);
    g.fillTriangle(2, 10, half ? 14 : 24, 10, 13, 22);
  }

  private makeHearts(): void {
    const full = this.gfx();
    this.heartShape(full, COLORS.heart);
    full.generateTexture('heart_full', 26, 24);
    full.destroy();

    const empty = this.gfx();
    this.heartShape(empty, COLORS.heartEmpty);
    empty.generateTexture('heart_empty', 26, 24);
    empty.destroy();

    const half = this.gfx();
    this.heartShape(half, COLORS.heartEmpty);
    this.heartShape(half, COLORS.heart, true);
    half.generateTexture('heart_half', 26, 24);
    half.destroy();

    const pickup = this.gfx();
    this.heartShape(pickup, COLORS.heart);
    pickup.generateTexture('pickup_heart', 26, 24);
    pickup.destroy();
  }

  private makeCoin(): void {
    const g = this.gfx();
    g.fillStyle(0xa08020).fillCircle(11, 12, 9);
    g.fillStyle(COLORS.coin).fillCircle(10, 10, 9);
    g.fillStyle(0xfff0a0).fillCircle(7, 7, 3);
    g.generateTexture('pickup_coin', 22, 22);
    g.destroy();
  }

  private makePedestal(): void {
    const g = this.gfx();
    g.fillStyle(0x5a5060).fillRect(12, 40, TILE - 24, 18);
    g.fillStyle(COLORS.pedestal).fillRect(16, 34, TILE - 32, 12);
    g.fillStyle(0xa8a0b0).fillRect(10, 30, TILE - 20, 6);
    g.generateTexture('pedestal', TILE, TILE);
    g.destroy();
  }

  private makeTrapdoor(): void {
    const g = this.gfx();
    g.fillStyle(0x5a5060).fillRect(6, 6, TILE - 12, TILE - 12);
    g.fillStyle(COLORS.trapdoor).fillRect(12, 12, TILE - 24, TILE - 24);
    g.generateTexture('trapdoor', TILE, TILE);
    g.destroy();
  }

  private makePlayer(key: string, color: number, shade: number): void {
    const size = PLAYER.radius * 2 + 8;
    const cx = size / 2;
    const g = this.gfx();
    g.fillStyle(shade).fillCircle(cx, cx + 3, PLAYER.radius);
    g.fillStyle(color).fillCircle(cx, cx, PLAYER.radius);
    g.fillStyle(COLORS.playerEye);
    g.fillCircle(cx - 7, cx - 4, 3);
    g.fillCircle(cx + 7, cx - 4, 3);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeEnemy(def: EnemyDef): void {
    const r = def.radius;
    const size = r * 2 + 8;
    const c = size / 2;
    const shade = Phaser.Display.Color.IntegerToColor(def.color).darken(35).color;
    const g = this.gfx();
    const draw = (col: number, dy: number): void => {
      g.fillStyle(col);
      switch (def.shape) {
        case 'circle':
          g.fillCircle(c, c + dy, r);
          break;
        case 'square':
          g.fillRect(c - r, c - r + dy, r * 2, r * 2);
          break;
        case 'triangle':
          g.fillTriangle(c, c - r + dy, c - r, c + r + dy, c + r, c + r + dy);
          break;
        case 'diamond':
          g.fillPoints(
            [
              { x: c, y: c - r + dy },
              { x: c + r, y: c + dy },
              { x: c, y: c + r + dy },
              { x: c - r, y: c + dy },
            ],
            true,
          );
          break;
      }
    };
    draw(shade, 4);
    draw(def.color, 0);
    g.fillStyle(0x1a1620);
    g.fillCircle(c - r * 0.35, c - r * 0.15, Math.max(2, r * 0.14));
    g.fillCircle(c + r * 0.35, c - r * 0.15, Math.max(2, r * 0.14));
    g.generateTexture(`enemy_${def.id}`, size, size);
    g.destroy();
  }

  private makeItemIcon(key: string, color: number): void {
    const g = this.gfx();
    g.fillStyle(0x1a1620).fillRoundedRect(0, 0, 28, 28, 6);
    g.fillStyle(color).fillRoundedRect(4, 4, 20, 20, 4);
    g.fillStyle(0xffffff, 0.35).fillRect(7, 7, 6, 6);
    g.generateTexture(key, 28, 28);
    g.destroy();
  }
}
