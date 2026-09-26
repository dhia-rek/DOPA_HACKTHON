import Phaser from 'phaser';
import { PLAYER } from '../config';

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private keys: Keys;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setCircle(PLAYER.radius, 4, 4);
    this.body.setMaxVelocity(PLAYER.maxSpeed);
    this.body.setDrag(PLAYER.drag);
    this.setDepth(10);

    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('up,down,left,right,w,a,s,d') as Keys;
  }

  update(): void {
    const k = this.keys;
    const x = (k.left.isDown || k.a.isDown ? -1 : 0) + (k.right.isDown || k.d.isDown ? 1 : 0);
    const y = (k.up.isDown || k.w.isDown ? -1 : 0) + (k.down.isDown || k.s.isDown ? 1 : 0);

    if (x === 0 && y === 0) {
      this.body.setAcceleration(0, 0);
    } else {
      const v = new Phaser.Math.Vector2(x, y).normalize().scale(PLAYER.acceleration);
      this.body.setAcceleration(v.x, v.y);
    }

    if (x !== 0) this.setFlipX(x < 0);

    const speed = this.body.velocity.length();
    const t = speed / PLAYER.maxSpeed;
    this.setScale(1 + t * 0.05, 1 - t * 0.05);
  }
}
