import Phaser from 'phaser';
import { COLORS, PLAYER, PROJECTILE, TILE } from '../config';
import { save } from '../core/save';
import { settings } from '../core/settings';
import { CHARACTERS } from '../data/characters';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { GODS } from '../data/gods';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
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
    settings.load();
    // Stop the page from scrolling on game keys (game-wide, all scenes).
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);

    this.makeFloor();
    this.makeWall();
    this.makeDoors();
    this.makeRock();
    this.makePit();
    this.makeTears();
    this.makeShots();
    this.makeFx();
    this.makeHearts();
    this.makeCoin();
    this.makePedestal();
    this.makeTrapdoor();
    this.makeShadow();
    this.makeVignette();
    this.makeAltar();
    this.makeTalkBubble();
    for (const c of CHARACTERS) this.makePlayer(`player_${c.id}`, c.color, c.shadeColor);
    for (const e of ENEMIES) this.makeEnemy(e);
    for (const i of ITEMS) this.makeItemIcon(`item_${i.id}`, i.color);
    for (const g of GODS) this.makeGod(`god_${g.id}`, g.color);
    for (const w of WEAPONS) this.makeWeapon(`weapon_${w.id}`);

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

  /** Weapon projectiles, drawn pointing right (+x); Projectile rotates them along their flight. */
  private makeShots(): void {
    const dart = this.gfx();
    dart.fillStyle(0x6a4a2a).fillRect(2, 3, 18, 3);
    dart.fillStyle(0xe8d0a0).fillTriangle(0, 1, 5, 4.5, 0, 8);
    dart.fillStyle(0xe0c070).fillTriangle(17, 0, 28, 4.5, 17, 9);
    dart.fillStyle(0xfff4d0).fillTriangle(20, 2.5, 26, 4.5, 20, 4.5);
    dart.generateTexture('shot_dart', 28, 9);
    dart.destroy();

    const arrow = this.gfx();
    arrow.fillStyle(0x8a6a3a).fillRect(3, 3, 19, 2);
    arrow.fillStyle(0xf0e6d0).fillTriangle(0, 0, 7, 4, 0, 8);
    arrow.fillStyle(0xd8b060).fillTriangle(20, 0, 28, 4, 20, 8);
    arrow.generateTexture('shot_arrow', 28, 8);
    arrow.destroy();

    const boulder = this.gfx();
    boulder.fillStyle(0x6b6470).fillCircle(10, 10, 9);
    boulder.fillStyle(0x8a8090).fillCircle(8, 8, 6);
    boulder.fillStyle(0x4b4550).fillCircle(13, 12, 2.5).fillCircle(7, 13, 1.8);
    boulder.generateTexture('shot_boulder', 20, 20);
    boulder.destroy();

    const note = this.gfx();
    note.fillStyle(0x8fb0ff, 0.35).fillCircle(9, 12, 9);
    note.fillStyle(0xdfe8ff).fillEllipse(7, 14, 9, 7);
    note.fillRect(10, 2, 2.5, 12);
    note.fillStyle(0xbfd0ff).fillTriangle(12, 2, 18, 5, 12, 8);
    note.generateTexture('shot_note', 20, 20);
    note.destroy();

    const blade = this.gfx();
    blade.lineStyle(3, 0xff8040, 0.8).beginPath().arc(11, 11, 9.5, -2.4, 0.9, false).strokePath();
    blade.lineStyle(4, 0xd8d8e8).beginPath().arc(11, 11, 8, -2.4, 0.9, false).strokePath();
    blade.lineStyle(1.5, 0x404050).beginPath().arc(11, 11, 6, -2.4, 0.9, false).strokePath();
    blade.generateTexture('shot_blade', 22, 22);
    blade.destroy();
  }

  /** White shapes tinted at runtime by systems/fx.ts. */
  private makeFx(): void {
    const ring = this.gfx();
    ring.lineStyle(4, 0xffffff).strokeCircle(24, 24, 21);
    ring.generateTexture('fx_ring', 48, 48);
    ring.destroy();

    const spark = this.gfx();
    spark.fillStyle(0xffffff).fillRoundedRect(0, 0, 20, 4, 2);
    spark.generateTexture('fx_spark', 20, 4);
    spark.destroy();
  }

  /** Placeholder weapon: a shaft with a bronze head, pointing right. */
  private makeWeapon(key: string): void {
    if (!this.missing(key)) return;
    const g = this.gfx();
    g.fillStyle(0x6a4a2a).fillRect(6, 29, 42, 6);
    g.fillStyle(0xc9a45c).fillTriangle(46, 22, 64, 32, 46, 42);
    g.fillStyle(0x8a6a3a).fillRect(22, 27, 12, 10);
    this.bake(g, key, 64, 64);
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

  /** Stone altar with a brazier flame on top; the shrine room's interactable. */
  private makeAltar(): void {
    const g = this.gfx();
    const cx = TILE / 2;
    g.fillStyle(0x3a3240).fillRect(8, 46, TILE - 16, 12);
    g.fillStyle(0x6a6070).fillRect(14, 40, TILE - 28, 8);
    g.fillStyle(0x8a8090).fillRect(18, 28, TILE - 36, 14);
    g.fillStyle(0xa8a0b0).fillRect(12, 24, TILE - 24, 6);
    g.fillStyle(COLORS.doorFrame).fillRect(20, 30, TILE - 40, 2);
    g.fillStyle(0xff7a2a, 0.9).fillCircle(cx, 17, 8);
    g.fillStyle(0xffc860).fillCircle(cx, 15, 5);
    g.fillStyle(0xfff4c0).fillCircle(cx - 1, 13, 2);
    g.generateTexture('altar', TILE, TILE);
    g.destroy();
  }

  /** White speech bubble with a "!" — shown above NPCs the player can talk to. */
  private makeTalkBubble(): void {
    const w = 26;
    const h = 30;
    const g = this.gfx();
    g.fillStyle(0x1a1620).fillRoundedRect(0, 0, w, h - 6, 7);
    g.fillStyle(0xfff8e8).fillRoundedRect(2, 2, w - 4, h - 10, 6);
    g.fillStyle(0xfff8e8).fillTriangle(w / 2 - 5, h - 9, w / 2 + 5, h - 9, w / 2, h);
    g.fillStyle(COLORS.doorFrame);
    g.fillRect(w / 2 - 2, 6, 4, 10);
    g.fillCircle(w / 2, 20, 2.4);
    g.generateTexture('bubble_talk', w, h);
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
    if (def.innocent) {
      this.drawInnocent(g, def, c, r);
      g.generateTexture(`enemy_${def.id}`, size, size);
      g.destroy();
      return;
    }
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

  private makeGod(key: string, color: number): void {
    if (!this.missing(key)) return;
    const g = this.gfx();
    g.fillStyle(color, 0.35).fillCircle(80, 80, 78);
    g.fillStyle(color).fillCircle(80, 80, 52);
    g.fillStyle(0xfff4d6).fillCircle(80, 72, 26);
    this.bake(g, key, 160, 160);
  }

  /** Innocents: soft pastel body, pale halo, round friendly eyes and a small mouth — no hard shade, no menace. */
  private drawInnocent(g: Phaser.GameObjects.Graphics, def: EnemyDef, c: number, r: number): void {
    const soft = Phaser.Display.Color.IntegerToColor(def.color).lighten(18).color;
    const shade = Phaser.Display.Color.IntegerToColor(def.color).darken(12).color;
    g.fillStyle(0xfff4c0, 0.25).fillCircle(c, c, r + 4);
    g.fillStyle(shade).fillCircle(c, c + 3, r);
    g.fillStyle(soft).fillCircle(c, c, r);
    g.fillStyle(0xffffff, 0.35).fillCircle(c - r * 0.3, c - r * 0.35, r * 0.3);
    g.fillStyle(0x2a2430);
    g.fillCircle(c - r * 0.32, c - r * 0.1, Math.max(2, r * 0.16));
    g.fillCircle(c + r * 0.32, c - r * 0.1, Math.max(2, r * 0.16));
    g.fillStyle(0xffffff);
    g.fillCircle(c - r * 0.28, c - r * 0.16, Math.max(1, r * 0.06));
    g.fillCircle(c + r * 0.36, c - r * 0.16, Math.max(1, r * 0.06));
    g.lineStyle(2, 0x2a2430, 0.8);
    g.beginPath();
    g.arc(c, c + r * 0.25, r * 0.28, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.strokePath();
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
