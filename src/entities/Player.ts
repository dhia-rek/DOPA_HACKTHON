import Phaser from 'phaser';
import { PLAYER } from '../config';
import { events } from '../core/events';
import { input } from '../core/input';
import type { RunState } from '../core/run';
import type { Projectile, ProjectilePool } from './Projectile';

/**
 * Isaac controls: WASD moves, arrow keys (or IJKL) shoot in 8 directions
 * (bindings live in core/input.ts). All numbers come from run.stats so items
 * apply automatically.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private run: RunState;
  private shots: ProjectilePool;
  private nextShotAt = 0;
  private invulnerableUntil = 0;
  private rageUntil = 0;
  private regenAccumulator = 0;
  /** Set by the scene each frame so homing shots have something to chase. */
  nearestEnemy: Phaser.Physics.Arcade.Sprite | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, run: RunState, shots: ProjectilePool) {
    super(scene, x, y, `player_${run.character.id}`);
    this.run = run;
    this.shots = shots;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setCircle(PLAYER.radius, 4, 4);
    this.body.setDrag(PLAYER.drag);
    this.body.setCollideWorldBounds(true);
    this.setDepth(10);
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  get isRaging(): boolean {
    return this.scene.time.now < this.rageUntil;
  }

  /** Current damage including temporary buffs. */
  get damage(): number {
    return this.run.stats.damage * (this.isRaging ? 2.5 : 1);
  }

  update(_time: number, delta: number): void {
    this.handleMovement();
    this.handleShooting();
    this.handlePassives(delta);

    this.setAlpha(this.isInvulnerable ? 0.55 + 0.45 * Math.abs(Math.sin(this.scene.time.now / 40)) : 1);
    if (this.isRaging) this.setTint(0xff6040);
    else this.clearTint();
  }

  private handleMovement(): void {
    const { x, y } = input.moveAxes();

    this.body.setMaxVelocity(this.run.stats.speed);
    if (x === 0 && y === 0) {
      this.body.setAcceleration(0, 0);
    } else {
      const v = new Phaser.Math.Vector2(x, y).normalize().scale(PLAYER.acceleration);
      this.body.setAcceleration(v.x, v.y);
    }
    if (x !== 0) this.setFlipX(x < 0);

    const t = this.body.velocity.length() / this.run.stats.speed;
    this.setScale(1 + t * 0.05, 1 - t * 0.05);
  }

  private handleShooting(): void {
    const { x, y } = input.shootAxes();
    if (x === 0 && y === 0) return;

    const now = this.scene.time.now;
    if (now < this.nextShotAt) return;
    this.nextShotAt = now + 1000 / this.run.stats.fireRate;

    this.shots.volley({
      x: this.x,
      y: this.y,
      dx: x,
      dy: y,
      speed: this.run.stats.shotSpeed,
      damage: this.damage,
      range: this.run.stats.range,
      owner: 'player',
      flags: this.run.flags,
      inheritVx: this.body.velocity.x,
      inheritVy: this.body.velocity.y,
    });
    for (const child of this.shots.getChildren()) {
      const shot = child as Projectile;
      if (shot.active && shot.flags.homing && !shot.homingTarget) shot.homingTarget = this.nearestEnemy;
    }
    events.emit('player_shot', {});
  }

  private handlePassives(delta: number): void {
    if (this.run.character.passive === 'regen') {
      this.regenAccumulator += delta;
      if (this.regenAccumulator > 20000) {
        this.regenAccumulator = 0;
        this.run.heal(1);
      }
    }
  }

  /** Returns true if the hit killed the player. */
  hurt(amount: number, source: string, fromX?: number, fromY?: number): boolean {
    if (this.isInvulnerable) return false;
    this.invulnerableUntil = this.scene.time.now + PLAYER.iFramesMs;

    if (fromX !== undefined && fromY !== undefined) {
      const kb = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize().scale(PLAYER.knockback);
      this.body.setVelocity(kb.x, kb.y);
    }
    if (this.run.character.passive === 'rage') this.rageUntil = this.scene.time.now + 3000;

    this.scene.cameras.main.shake(120, 0.006);
    return this.run.takeDamage(amount, source);
  }
}
