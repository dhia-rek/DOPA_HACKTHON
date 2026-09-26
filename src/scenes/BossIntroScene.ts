import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export interface BossIntroSceneData {
  heroKey: string;
  heroName: string;
  heroTitle: string;
  bossKey: string;
  bossName: string;
  bossTitle: string;
  bossColor: number;
  onDone: () => void;
}

const mono = 'monospace';
const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const SKEW = 70;
const HOLD_MS = 2600;

/**
 * VS splash before a boss fight: a marble band with the hero slams in from the
 * left, a dark band with the boss from the right, "VS" punches in between.
 * The launching scene pauses itself and resumes in onDone (ENTER skips).
 */
export class BossIntroScene extends Phaser.Scene {
  private data_!: BossIntroSceneData;
  private done = false;

  constructor() {
    super('bossintro');
  }

  create(data: BossIntroSceneData): void {
    this.data_ = data;
    this.done = false;
    const edge = Phaser.Display.Color.IntegerToColor(data.bossColor).lighten(20).color;
    const bossHex = `#${data.bossColor.toString(16).padStart(6, '0')}`;

    this.add.rectangle(W / 2, H / 2, W, H, 0x07050a, 0.94);

    const hero = this.add.container(-W, 0);
    const boss = this.add.container(W, 0);

    hero.add(this.band(0xe8dcc2, 0xc9a45c, true));
    boss.add(this.band(0x22101c, edge, false));

    const heroImg = this.add.image(W * 0.27, H / 2 - 16, data.heroKey);
    heroImg.setScale(230 / Math.max(heroImg.width, heroImg.height));
    const bossImg = this.add.image(W * 0.73, H / 2 - 16, data.bossKey).setFlipX(true);
    bossImg.setScale(260 / Math.max(bossImg.width, bossImg.height));
    hero.add(heroImg);
    boss.add(bossImg);
    for (const img of [heroImg, bossImg]) {
      const sy = img.scaleY;
      this.tweens.add({ targets: img, scaleY: sy * 1.04, y: img.y - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    hero.add(this.label(W * 0.27, H / 2 + 128, data.heroName.toUpperCase(), 30, '#2a1a10', '#f7efe0'));
    hero.add(this.label(W * 0.27, H / 2 + 162, data.heroTitle, 15, '#6b4d2a', '#f7efe0'));
    boss.add(this.label(W * 0.73, H / 2 + 128, data.bossName.toUpperCase(), 30, '#f3e6c8', '#000000'));
    boss.add(this.label(W * 0.73, H / 2 + 162, data.bossTitle, 15, bossHex, '#000000'));

    this.tweens.add({ targets: hero, x: 0, duration: 420, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: boss,
      x: 0,
      duration: 420,
      delay: 140,
      ease: 'Cubic.Out',
      onComplete: () => this.cameras.main.shake(140, 0.01),
    });

    const vs = this.add
      .text(W / 2, H / 2 - 10, 'VS', { fontFamily: mono, fontSize: '104px', fontStyle: 'bold', color: '#ffe066', stroke: '#3a1414', strokeThickness: 12 })
      .setOrigin(0.5)
      .setScale(4)
      .setAlpha(0)
      .setAngle(-8);
    this.tweens.add({
      targets: vs,
      scale: 1,
      alpha: 1,
      delay: 560,
      duration: 260,
      ease: 'Back.Out',
      onComplete: () => {
        this.cameras.main.flash(180, 255, 240, 200);
        this.tweens.add({ targets: vs, scale: 1.08, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      },
    });

    for (const y of [10, H - 10]) this.add.rectangle(W / 2, y, W, 4, 0xc9a45c).setAlpha(0.8);
    this.add.text(W - 24, H - 30, 'ENTER ▸', { fontFamily: mono, fontSize: '12px', color: '#a89a80' }).setOrigin(1, 0.5);

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', this.finish, this);
    kb.on('keydown-SPACE', this.finish, this);
    this.time.delayedCall(HOLD_MS, this.finish, [], this);
  }

  private band(fill: number, edge: number, left: boolean): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const pts = left
      ? [{ x: 0, y: 0 }, { x: W / 2 + SKEW, y: 0 }, { x: W / 2 - SKEW, y: H }, { x: 0, y: H }]
      : [{ x: W / 2 + SKEW + 8, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: W / 2 - SKEW + 8, y: H }];
    g.fillStyle(fill, 1).fillPoints(pts, true);
    g.lineStyle(6, edge, 1);
    if (left) g.lineBetween(W / 2 + SKEW, 0, W / 2 - SKEW, H);
    else g.lineBetween(W / 2 + SKEW + 8, 0, W / 2 - SKEW + 8, H);
    return g;
  }

  private label(x: number, y: number, text: string, size: number, color: string, stroke: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: mono, fontSize: `${size}px`, fontStyle: size > 20 ? 'bold' : 'normal', color, stroke, strokeThickness: size > 20 ? 6 : 3 })
      .setOrigin(0.5);
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop();
      this.data_.onDone();
    });
  }
}
