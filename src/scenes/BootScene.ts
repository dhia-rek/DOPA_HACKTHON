import Phaser from 'phaser';
import { COLORS, PLAYER, PROJECTILE, TILE } from '../config';
import { save } from '../core/save';
import { CHARACTERS } from '../data/characters';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { ITEMS } from '../data/items';
import { ART_SCALE, artKeys, artUrl } from '../art/manifest';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * Loads the real art from public/art/<key>.png (see ART.md) and generates a
 * flat-shape placeholder for every texture key that has no file yet, so new
 * content is playable before it is drawn. The rest of the code only refers to
 * texture keys.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    for (const key of artKeys()) this.load.image(key, artUrl(key));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (import.meta.env.DEV) console.info(`[art] no ${file.key}.png, using placeholder`);
    });
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
    this.makeShadow();
    this.makeVignette();
    for (const c of CHARACTERS) this.makePlayer(`player_${c.id}`, c.color, c.shadeColor);
    for (const e of ENEMIES) this.makeEnemy(e);
    for (const i of ITEMS) this.makeItemIcon(`item_${i.id}`, i.color);

    this.scene.start('menu');
  }

  /** True when no real art was loaded for this key and a placeholder is needed. */
  private missing(key: string): boolean {
    return !this.textures.exists(key);
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  /** Bake a placeholder drawn in on-screen pixels at the same resolution as the real sprites. */
  private bake(g: Phaser.GameObjects.Graphics, key: string, w: number, h: number): void {
    g.setScale(ART_SCALE);
    g.generateTexture(key, w * ART_SCALE, h * ART_SCALE);
    g.destroy();
  }

  private canvas(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
    const tex = this.textures.createCanvas(key, w, h)!;
    paint(tex.context);
    tex.refresh();
  }

  /** Soft ellipse drawn under every actor. */
  private makeShadow(): void {
    this.canvas('shadow', 64, 32, (ctx) => {
      const grad = ctx.createRadialGradient(32, 16, 2, 32, 16, 16);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.setTransform(2, 0, 0, 1, -32, 0);
      ctx.fillRect(0, 0, 64, 32);
    });
  }

  /** Room-sized darkening towards the walls (Isaac-style vignette). */
  private makeVignette(): void {
    this.canvas('vignette', GAME_WIDTH, GAME_HEIGHT, (ctx) => {
      const cx = GAME_WIDTH / 2;
      const cy = GAME_HEIGHT / 2;
      const grad = ctx.createRadialGradient(cx, cy, GAME_HEIGHT * 0.25, cx, cy, GAME_WIDTH * 0.6);
      grad.addColorStop(0, 'rgba(10,6,4,0)');
      grad.addColorStop(0.55, 'rgba(10,6,4,0.3)');
      grad.addColorStop(1, 'rgba(10,6,4,0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    });
  }

  private makeFloor(): void {
    if (!this.missing('floor')) return;
    const g = this.gfx();
    g.fillStyle(COLORS.floor).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.floorAlt);
    g.fillRect(0, 0, TILE / 2, TILE / 2);
    g.fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2);
    g.generateTexture('floor', TILE, TILE);
    g.destroy();
  }

  private makeWall(): void {
    if (!this.missing('wall')) return;
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
    if (this.missing('door_open')) {
      const open = this.gfx();
      open.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
      open.fillStyle(COLORS.doorFrame).fillRect(8, 4, TILE - 16, TILE - 8);
      open.fillStyle(COLORS.door).fillRect(14, 10, TILE - 28, TILE - 20);
      open.fillStyle(COLORS.floor).fillRect(20, 24, TILE - 40, TILE - 24);
      open.generateTexture('door_open', TILE, TILE);
      open.destroy();
    }

    if (this.missing('door_closed')) {
      const closed = this.gfx();
      closed.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
      closed.fillStyle(COLORS.doorFrame).fillRect(8, 4, TILE - 16, TILE - 8);
      closed.fillStyle(COLORS.doorClosed).fillRect(14, 10, TILE - 28, TILE - 20);
      closed.lineStyle(3, COLORS.doorFrame);
      closed.lineBetween(14, TILE / 2, TILE - 14, TILE / 2);
      closed.generateTexture('door_closed', TILE, TILE);
      closed.destroy();
    }
  }

  private makeRock(): void {
    if (!this.missing('rock')) return;
    const g = this.gfx();
    g.fillStyle(COLORS.rockShade).fillCircle(TILE / 2, TILE / 2 + 4, TILE / 2 - 8);
    g.fillStyle(COLORS.rock).fillCircle(TILE / 2 - 3, TILE / 2 - 2, TILE / 2 - 12);
    g.generateTexture('rock', TILE, TILE);
    g.destroy();
  }

  private makePit(): void {
    if (!this.missing('pit')) return;
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
    if (this.missing('heart_full')) {
      const full = this.gfx();
      this.heartShape(full, COLORS.heart);
      this.bake(full, 'heart_full', 26, 24);
    }
    if (this.missing('heart_empty')) {
      const empty = this.gfx();
      this.heartShape(empty, COLORS.heartEmpty);
      this.bake(empty, 'heart_empty', 26, 24);
    }
    if (this.missing('heart_half')) {
      const half = this.gfx();
      this.heartShape(half, COLORS.heartEmpty);
      this.heartShape(half, COLORS.heart, true);
      this.bake(half, 'heart_half', 26, 24);
    }
    if (this.missing('pickup_heart')) {
      const pickup = this.gfx();
      this.heartShape(pickup, COLORS.heart);
      this.bake(pickup, 'pickup_heart', 26, 24);
    }
  }

  private makeCoin(): void {
    if (!this.missing('pickup_coin')) return;
    const g = this.gfx();
    g.fillStyle(0xa08020).fillCircle(11, 12, 9);
    g.fillStyle(COLORS.coin).fillCircle(10, 10, 9);
    g.fillStyle(0xfff0a0).fillCircle(7, 7, 3);
    this.bake(g, 'pickup_coin', 22, 22);
  }

  private makePedestal(): void {
    if (!this.missing('pedestal')) return;
    const g = this.gfx();
    g.fillStyle(0x5a5060).fillRect(12, 40, TILE - 24, 18);
    g.fillStyle(COLORS.pedestal).fillRect(16, 34, TILE - 32, 12);
    g.fillStyle(0xa8a0b0).fillRect(10, 30, TILE - 20, 6);
    g.generateTexture('pedestal', TILE, TILE);
    g.destroy();
  }

  private makeTrapdoor(): void {
    if (!this.missing('trapdoor')) return;
    const g = this.gfx();
    g.fillStyle(0x5a5060).fillRect(6, 6, TILE - 12, TILE - 12);
    g.fillStyle(COLORS.trapdoor).fillRect(12, 12, TILE - 24, TILE - 24);
    g.generateTexture('trapdoor', TILE, TILE);
    g.destroy();
  }

  private makePlayer(key: string, color: number, shade: number): void {
    if (!this.missing(key)) return;
    const size = PLAYER.radius * 2 + 16;
    const cx = size / 2;
    const g = this.gfx();
    g.fillStyle(shade).fillCircle(cx, cx + 3, PLAYER.radius);
    g.fillStyle(color).fillCircle(cx, cx, PLAYER.radius);
    g.fillStyle(COLORS.playerEye);
    g.fillCircle(cx - 7, cx - 4, 3);
    g.fillCircle(cx + 7, cx - 4, 3);
    this.bake(g, key, size, size);
  }

  private makeEnemy(def: EnemyDef): void {
    if (!this.missing(`enemy_${def.id}`)) return;
    const r = def.radius;
    const size = r * 2 + 16;
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
    this.bake(g, `enemy_${def.id}`, size, size);
  }

  private makeItemIcon(key: string, color: number): void {
    if (!this.missing(key)) return;
    const g = this.gfx();
    g.fillStyle(0x1a1620).fillRoundedRect(0, 0, 28, 28, 6);
    g.fillStyle(color).fillRoundedRect(4, 4, 20, 20, 4);
    g.fillStyle(0xffffff, 0.35).fillRect(7, 7, 6, 6);
    this.bake(g, key, 28, 28);
  }
}
