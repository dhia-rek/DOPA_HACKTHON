import Phaser from 'phaser';
import { ART_SCALE } from '../art/manifest';
import { ENEMY, PROJECTILE } from '../config';
import type { BossMods } from '../core/story';
import type { EnemyDef } from '../data/enemies';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  /** Free-form memory for the behaviour function driving this enemy. */
  memory: Record<string, number> = {};
  private spawnedAt: number;
  private flashUntil = 0;
  private poisonUntil = 0;
  private poisonTick = 0;
  /** External push (knockback) blended into the behaviour's velocity. */
  knock = new Phaser.Math.Vector2();
  private shadow: Phaser.GameObjects.Image;
  private bobPhase = Math.random() * Math.PI * 2;
  /** Extra squash/stretch a behaviour can request (1,1 = none); composed with the idle bob. */
  stretch = new Phaser.Math.Vector2(1, 1);

  /** `group` must be passed here: adding to an arcade group afterwards would reset body settings. */
  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number, def: EnemyDef, difficulty: number) {
    super(scene, x, y, `enemy_${def.id}`);
    this.def = def;
    this.maxHp = Math.round(def.hp * difficulty);
    this.hp = this.maxHp;
    this.speed = def.speed * (1 + (difficulty - 1) * 0.4);
    this.contactDamage = def.damage;
    this.spawnedAt = scene.time.now;

    scene.add.existing(this);
    group.add(this);
    this.shadow = scene.add.image(x, y, 'shadow').setDepth(7).setAlpha(0).setScale((def.radius / 16) * 0.9, (def.radius / 16) * 0.7);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.shadow.destroy());
    const r = def.radius * ART_SCALE;
    this.body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.body.setCollideWorldBounds(true);
    this.setDepth(def.isBoss ? 9 : 8);
    this.setAlpha(0);
    this.setScale(0.3 / ART_SCALE);
    scene.tweens.add({ targets: this, alpha: 1, scale: 1 / ART_SCALE, duration: ENEMY.spawnDelayMs, ease: 'Back.Out' });
    scene.tweens.add({ targets: this.shadow, alpha: 0.6, duration: ENEMY.spawnDelayMs });
  }

  /** Story-driven tuning (dialogue outcomes, karma). Safe to call while at full hp. */
  applyMods(mods: BossMods): void {
    const ratio = this.hp / this.maxHp;
    this.maxHp = Math.round(this.maxHp * mods.hpMul);
    this.hp = Math.round(this.maxHp * ratio);
    this.speed *= mods.speedMul;
    this.contactDamage = Math.max(0, Math.round(this.contactDamage * mods.damageMul));
  }

  get isSpawning(): boolean {
    return this.scene.time.now - this.spawnedAt < ENEMY.spawnDelayMs;
  }

  get hpRatio(): number {
    return this.hp / this.maxHp;
  }

  /** Behaviours call this instead of setting body velocity directly so knockback composes. */
  moveTowards(vx: number, vy: number): void {
    this.body.setVelocity(vx + this.knock.x, vy + this.knock.y);
  }

  step(delta: number): void {
    this.knock.scale(Math.pow(ENEMY.knockbackDamping, delta / 16));
    if (this.knock.lengthSq() < 4) this.knock.set(0, 0);

    if (!this.isSpawning) {
      const speed = this.body.velocity.length();
      const bob = Math.sin(this.scene.time.now / (speed > 20 ? 90 : 260) + this.bobPhase) * (speed > 20 ? 0.05 : 0.025);
      const hit = this.scene.time.now < this.flashUntil ? 0.12 : 0;
      this.setScale((this.stretch.x / ART_SCALE) * (1 - bob * 0.6 + hit), (this.stretch.y / ART_SCALE) * (1 + bob - hit));
      if (this.body.velocity.x !== 0) this.setFlipX(this.body.velocity.x < 0);
    }
    this.shadow.setPosition(this.x, this.y + this.def.radius + 2);

    if (this.scene.time.now < this.poisonUntil) {
      this.poisonTick += delta;
      if (this.poisonTick >= 500) {
        this.poisonTick = 0;
        this.hp -= PROJECTILE.poisonDps / 2;
      }
      this.setTint(0x80ff60);
    } else if (this.scene.time.now < this.flashUntil) {
      this.setTintFill(0xffffff);
    } else {
      this.clearTint();
    }
  }

  takeHit(damage: number, fromX: number, fromY: number, knockback = 1, poison = false): void {
    if (this.isSpawning) return;
    this.hp -= damage;
    this.flashUntil = this.scene.time.now + ENEMY.hitFlashMs;
    if (poison) this.poisonUntil = this.scene.time.now + PROJECTILE.poisonMs;
    const mass = this.def.isBoss ? 0.15 : 1;
    const push = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize().scale(160 * knockback * mass);
    this.knock.add(push);
  }
}
