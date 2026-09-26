import Phaser from 'phaser';
import { ART_SCALE } from '../art/manifest';

export type PickupKind = 'heart' | 'coin';

export class Pickup extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  readonly kind: PickupKind;

  /** `group` must be passed here: adding to an arcade group afterwards would reset body settings. */
  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number, kind: PickupKind) {
    super(scene, x, y, `pickup_${kind}`);
    this.kind = kind;
    scene.add.existing(this);
    group.add(this);
    this.setScale(1 / ART_SCALE);
    this.body.setCircle(11 * ART_SCALE, 2 * ART_SCALE, 1 * ART_SCALE);
    this.body.setDrag(600);
    this.body.setCollideWorldBounds(true);
    this.setDepth(5);
    scene.tweens.add({ targets: this, y: y - 4, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.InOut' });
  }
}
