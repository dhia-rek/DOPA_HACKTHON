import Phaser from 'phaser';
import { PROJECTILE } from '../config';
import type { ShotFlags } from '../core/stats';
import type { ShotLook } from '../data/weapons';

export type Owner = 'player' | 'enemy';

export interface ShotParams {
  x: number;
  y: number;
  /** Direction (will be normalised). */
  dx: number;
  dy: number;
  speed: number;
  damage: number;
  range: number;
  owner: Owner;
  flags?: ShotFlags;
  /** Weapon projectile texture (player shots only); defaults to the round tear. */
  look?: ShotLook;
  /** Inherit a bit of the shooter's velocity, like Isaac's tears. */
  inheritVx?: number;
  inheritVy?: number;
}

export class Projectile extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  owner: Owner = 'player';
  damage = 1;
  flags: ShotFlags = {};
  private startX = 0;
  private startY = 0;
  private range = 0;
  /** Enemies already hit by a piercing shot. */
  hitSet = new Set<Phaser.GameObjects.GameObject>();
  homingTarget: Phaser.Physics.Arcade.Sprite | null = null;
  private look: ShotLook | null = null;

  fire(p: ShotParams): void {
    const radius = p.owner === 'player' ? PROJECTILE.playerRadius : PROJECTILE.enemyRadius;
    this.look = p.owner === 'player' ? (p.look ?? null) : null;
    if (this.look) {
      this.setTexture(`shot_${this.look}`);
      if (p.flags?.poison) this.setTint(0x7fe040);
      else this.clearTint();
    } else {
      this.setTexture(p.owner === 'player' ? (p.flags?.poison ? 'tear_poison' : 'tear_player') : 'tear_enemy');
      this.clearTint();
    }
    this.enableBody(true, p.x, p.y, true, true);
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setRotation(0);
    this.owner = p.owner;
    this.damage = p.damage;
    this.flags = p.flags ?? {};
    this.range = p.range;
    this.startX = p.x;
    this.startY = p.y;
    this.hitSet.clear();
    this.homingTarget = null;
    this.setDepth(p.owner === 'player' ? 12 : 11);
    this.setScale(1);
    this.setAlpha(1);

    const dir = new Phaser.Math.Vector2(p.dx, p.dy).normalize();
    const vx = dir.x * p.speed + (p.inheritVx ?? 0) * 0.35;
    const vy = dir.y * p.speed + (p.inheritVy ?? 0) * 0.35;
    this.body.setVelocity(vx, vy);
    this.orient();
  }

  /** Darts and arrows point along their flight, boulders and blades spin, notes wobble. */
  private orient(): void {
    if (!this.look) return;
    if (this.look === 'blade') this.rotation += 0.35;
    else if (this.look === 'boulder') this.rotation += 0.12;
    else if (this.look === 'note') this.setRotation(Math.sin(this.scene.time.now / 90) * 0.3);
    else this.setRotation(this.body.velocity.angle());
  }

  /** Called every frame by the pool; returns false when the shot expires. */
  step(): boolean {
    const travelled = Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y);
    if (travelled > this.range) return false;

    if (this.flags.homing && this.homingTarget && this.homingTarget.active) {
      const want = new Phaser.Math.Vector2(this.homingTarget.x - this.x, this.homingTarget.y - this.y).normalize();
      const speed = this.body.velocity.length();
      const cur = this.body.velocity.clone().normalize();
      cur.lerp(want, PROJECTILE.homingTurnRate).normalize().scale(speed);
      this.body.setVelocity(cur.x, cur.y);
    }

    this.orient();
    // Shrink slightly near the end of the range, like a tear falling.
    const t = travelled / this.range;
    if (t > 0.75) this.setScale(1 - (t - 0.75) * 1.2);
    return true;
  }

  kill(): void {
    this.disableBody(true, true);
  }
}

export class ProjectilePool extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: Projectile,
      maxSize: 300,
      runChildUpdate: false,
    });
  }

  shoot(p: ShotParams): Projectile | null {
    const shot = this.get(p.x, p.y) as Projectile | null;
    if (!shot) return null;
    shot.fire(p);
    return shot;
  }

  /** Fire 1 + extraShots projectiles in a fan around the aim direction. */
  volley(p: ShotParams): void {
    const extra = p.flags?.extraShots ?? 0;
    if (extra <= 0) {
      this.shoot(p);
      return;
    }
    const total = extra + 1;
    const spread = Phaser.Math.DegToRad(12 * extra);
    const base = Math.atan2(p.dy, p.dx);
    for (let i = 0; i < total; i++) {
      const a = base - spread / 2 + (spread / (total - 1)) * i;
      this.shoot({ ...p, dx: Math.cos(a), dy: Math.sin(a) });
    }
  }

  step(): void {
    for (const child of this.getChildren()) {
      const shot = child as Projectile;
      if (!shot.active) continue;
      if (!shot.step()) shot.kill();
    }
  }

  killAll(): void {
    for (const child of this.getChildren()) {
      const shot = child as Projectile;
      if (shot.active) shot.kill();
    }
  }
}
