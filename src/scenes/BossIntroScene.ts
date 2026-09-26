import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { settings } from '../core/settings';
import { blip } from '../core/sfx';
import type { CharacterDef } from '../data/characters';
import type { EnemyDef } from '../data/enemies';

export interface BossIntroData {
  hero: CharacterDef;
  boss: EnemyDef;
  /** Director's title for this boss (falls back to `boss.name`). */
  title?: string;
  grudge?: string;
  floor: number;
  onDone: () => void;
}

const mono = 'monospace';
const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const GAP = 22;
const BAND = (H - GAP) / 2;
const STREAKS = 'vs_streaks';
const SLIDE_MS = 420;
const HOLD_MS = 1500;

/**
 * "VS" splash shown when the player steps into a boss room: two coloured
 * bands slide in from opposite sides (boss on top, hero below), clash in
 * the middle, hold, then hand over to the boss_intro dialogue.
 */
export class BossIntroScene extends Phaser.Scene {
  private top!: Phaser.GameObjects.Container;
  private bottom!: Phaser.GameObjects.Container;
  private streaks: Phaser.GameObjects.TileSprite[] = [];
  private done = false;

  constructor() {
    super('boss_vs');
  }

  create(data: BossIntroData): void {
    this.done = false;
    this.streaks = [];
    this.makeStreaks();
    this.cameras.main.setBackgroundColor('#07060a');

    const title = (data.title ?? data.boss.name).toUpperCase();
    this.top = this.band(0, data.boss.color, 'right', [
      this.sprite(`enemy_${data.boss.id}`, W - 190, BAND / 2 + 10, 150),
      this.label(40, BAND / 2 - 36, title, 30, COLORS.uiIvory, 0),
      this.label(40, BAND / 2 + 10, `BOSS  ·  FLOOR ${data.floor}`, 14, COLORS.textDim, 0),
      this.label(40, BAND / 2 + 40, data.grudge ? `“${data.grudge}”` : '', 13, '#e08080', 0, W - 400),
    ]);
    this.bottom = this.band(BAND + GAP, data.hero.color, 'left', [
      this.sprite(this.textures.exists(`portrait_${data.hero.id}`) ? `portrait_${data.hero.id}` : `player_${data.hero.id}`, 190, BAND / 2 - 10, 150),
      this.label(W - 40, BAND / 2 - 36, data.hero.name.toUpperCase(), 30, COLORS.uiIvory, 1),
      this.label(W - 40, BAND / 2 + 10, data.hero.title.toUpperCase(), 14, COLORS.textDim, 1),
    ]);
    this.top.x = W;
    this.bottom.x = -W;

    const vs = this.add
      .text(W / 2, H / 2, 'VS', { fontFamily: mono, fontSize: '64px', color: '#ffe08a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 10)
      .setDepth(10)
      .setScale(0)
      .setAlpha(0);

    this.tweens.add({ targets: this.top, x: 0, duration: SLIDE_MS, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: this.bottom,
      x: 0,
      duration: SLIDE_MS,
      ease: 'Cubic.Out',
      onComplete: () => {
        blip('confirm');
        settings.shake(this.cameras.main, 160, 0.01);
        this.cameras.main.flash(120, 255, 255, 255);
        this.tweens.add({ targets: vs, scale: { from: 3, to: 1 }, alpha: 1, duration: 220, ease: 'Back.Out' });
      },
    });

    const skip = this.add
      .text(W / 2, H - 14, 'ENTER  ·  SKIP', { fontFamily: mono, fontSize: '12px', color: COLORS.textDim })
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: skip, alpha: 0.8, delay: SLIDE_MS + 300, duration: 300 });

    const finish = (): void => this.finish(data.onDone);
    this.input.keyboard!.once('keydown-ENTER', finish);
    this.input.keyboard!.once('keydown-SPACE', finish);
    this.input.once('pointerdown', finish);
    this.time.delayedCall(SLIDE_MS + HOLD_MS, finish);
  }

  update(_time: number, delta: number): void {
    const dx = delta * 0.18;
    for (const [i, s] of this.streaks.entries()) s.tilePositionX += i === 0 ? -dx : dx;
  }

  private finish(onDone: () => void): void {
    if (this.done) return;
    this.done = true;
    this.input.keyboard!.removeAllListeners();
    this.tweens.add({ targets: this.top, x: -W, duration: 260, ease: 'Cubic.In' });
    this.tweens.add({ targets: this.bottom, x: W, duration: 260, ease: 'Cubic.In' });
    this.cameras.main.fadeOut(260, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop();
      onDone();
    });
  }

  /** One coloured half-screen band with drifting streaks and its content. */
  private band(y: number, color: number, drift: 'left' | 'right', content: Phaser.GameObjects.GameObject[]): Phaser.GameObjects.Container {
    const c = Phaser.Display.Color.IntegerToColor(color);
    const dark = Phaser.Display.Color.GetColor(c.red * 0.45, c.green * 0.45, c.blue * 0.45);
    const bg = this.add.rectangle(0, 0, W, BAND, dark).setOrigin(0);
    const streaks = this.add.tileSprite(0, 0, W, BAND, STREAKS).setOrigin(0).setTint(color).setAlpha(0.45);
    streaks.tilePositionX = drift === 'left' ? 0 : 128;
    this.streaks.push(streaks);
    const edge = this.add.rectangle(0, drift === 'right' ? BAND - 3 : 0, W, 3, 0xffffff, 0.35).setOrigin(0);
    return this.add.container(0, y, [bg, streaks, edge, ...content]);
  }

  private sprite(key: string, x: number, y: number, size: number): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, key);
    img.setScale(size / Math.max(img.width, img.height));
    this.tweens.add({ targets: img, y: y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    return img;
  }

  private label(x: number, y: number, text: string, size: number, color: string, originX: number, wrap?: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: mono, fontSize: `${size}px`, color, fontStyle: size >= 30 ? 'bold' : 'normal', wordWrap: wrap ? { width: wrap } : undefined })
      .setOrigin(originX, 0.5)
      .setShadow(0, 2, '#000000', 6);
  }

  /** Horizontal speed-line texture, tiled and tinted per band. */
  private makeStreaks(): void {
    if (this.textures.exists(STREAKS)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    let seed = 7;
    const rnd = (): number => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 26; i++) {
      const len = 24 + Math.floor(rnd() * 70);
      g.fillRect(Math.floor(rnd() * 256), 6 + Math.floor(rnd() * 116), len, 3);
    }
    g.generateTexture(STREAKS, 256, 128);
    g.destroy();
  }
}
