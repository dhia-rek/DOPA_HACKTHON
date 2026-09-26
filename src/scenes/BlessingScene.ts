import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { GodDef } from '../data/gods';

export interface BlessingSceneData {
  god: GodDef;
  onDone: () => void;
}

const mono = 'monospace';
const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const HOLD_MS = 3000;

/**
 * Divine blessing overlay: rotating light rays, the god's portrait drops in
 * from Olympus with a flash, then the blessing text. The launching scene
 * pauses itself and resumes in onDone (ENTER skips).
 */
export class BlessingScene extends Phaser.Scene {
  private data_!: BlessingSceneData;
  private done = false;

  constructor() {
    super('blessing');
  }

  create(data: BlessingSceneData): void {
    this.data_ = data;
    this.done = false;
    const god = data.god;
    const hex = `#${god.color.toString(16).padStart(6, '0')}`;
    const cx = W / 2;
    const cy = H / 2 - 50;

    const dim = this.add.rectangle(cx, H / 2, W, H, 0x05030a, 0).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 0.62, duration: 260 });

    const rays = this.add.graphics({ x: cx, y: cy }).setBlendMode(Phaser.BlendModes.ADD).setScale(0);
    for (let i = 0; i < 14; i++) {
      const a0 = (Math.PI * 2 * i) / 14;
      const a1 = a0 + Math.PI / 14;
      rays.fillStyle(god.color, i % 2 ? 0.16 : 0.09);
      rays.slice(0, 0, 700, a0, a1, false).fillPath();
    }
    this.tweens.add({ targets: rays, scale: 1, duration: 500, ease: 'Back.Out' });
    this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });

    const halo = this.add.circle(cx, cy, 118, god.color, 0.22).setBlendMode(Phaser.BlendModes.ADD).setScale(0);
    this.tweens.add({ targets: halo, scale: 1, duration: 500, delay: 100, ease: 'Back.Out' });
    this.tweens.add({ targets: halo, scale: 1.08, alpha: 0.7, duration: 900, delay: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const key = `god_${god.id}`;
    const portrait = this.add.image(cx, -220, key);
    portrait.setScale(240 / Math.max(portrait.width, portrait.height));
    const s = portrait.scale;
    this.tweens.add({
      targets: portrait,
      y: cy,
      duration: 560,
      delay: 120,
      ease: 'Back.Out',
      onComplete: () => {
        this.cameras.main.flash(220, 255, 250, 220);
        this.cameras.main.shake(160, 0.008);
        this.sparkleBurst(cx, cy, god.color, 22);
        this.tweens.add({ targets: portrait, scaleY: s * 1.03, scaleX: s * 0.98, y: cy - 6, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      },
    });

    // Slow drift of sparks up the beam while the god is present.
    this.time.addEvent({ delay: 110, repeat: Math.floor(HOLD_MS / 110), callback: () => this.spark(cx, cy, god.color) });

    const texts = [
      this.add.text(cx, cy + 128, 'A  B L E S S I N G  F R O M', { fontFamily: mono, fontSize: '13px', color: '#d8ccb4', stroke: '#000', strokeThickness: 3 }),
      this.add.text(cx, cy + 158, god.name.toUpperCase(), { fontFamily: mono, fontSize: '36px', fontStyle: 'bold', color: hex, stroke: '#0b0a0f', strokeThickness: 8 }),
      this.add.text(cx, cy + 190, god.epithet, { fontFamily: mono, fontSize: '14px', color: '#c9bfa8', stroke: '#000', strokeThickness: 3 }),
      this.add.text(cx, cy + 222, `${god.blessing.name}  —  ${god.blessing.description}`, { fontFamily: mono, fontSize: '18px', color: '#ffe08a', stroke: '#0b0a0f', strokeThickness: 5 }),
      this.add.text(cx, cy + 248, `“${god.line}”`, { fontFamily: mono, fontSize: '14px', fontStyle: 'italic', color: '#eee', stroke: '#000', strokeThickness: 3 }),
    ];
    texts.forEach((t, i) => {
      t.setOrigin(0.5).setAlpha(0).setY(t.y + 14);
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 14, duration: 260, delay: 500 + i * 110, ease: 'Cubic.Out' });
    });

    this.add.text(W - 24, H - 30, 'ENTER ▸', { fontFamily: mono, fontSize: '12px', color: '#a89a80' }).setOrigin(1, 0.5);

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', this.finish, this);
    kb.on('keydown-SPACE', this.finish, this);
    this.time.delayedCall(HOLD_MS, this.finish, [], this);
  }

  private spark(cx: number, cy: number, color: number): void {
    const x = cx + Phaser.Math.Between(-140, 140);
    const y = cy + Phaser.Math.Between(40, 130);
    const p = this.add.circle(x, y, Phaser.Math.Between(2, 4), color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: p, y: y - Phaser.Math.Between(120, 220), alpha: 0, duration: Phaser.Math.Between(900, 1400), ease: 'Sine.Out', onComplete: () => p.destroy() });
  }

  private sparkleBurst(cx: number, cy: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const d = 120 + Math.random() * 120;
      const p = this.add.circle(cx, cy, 3 + Math.random() * 4, i % 3 ? color : 0xffffff).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: p, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, alpha: 0, scale: 0.2, duration: 520, ease: 'Cubic.Out', onComplete: () => p.destroy() });
    }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop();
      this.data_.onDone();
    });
  }
}
