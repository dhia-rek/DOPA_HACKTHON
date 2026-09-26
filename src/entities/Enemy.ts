import Phaser from 'phaser';
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
  /** "!" bubble shown above innocent NPCs when the player can talk to them. */
  private bubble: Phaser.GameObjects.Image | null = null;

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
    this.body.setCircle(def.radius, 4, 4);
    this.body.setCollideWorldBounds(true);
    this.setDepth(def.isBoss ? 9 : 8);
    this.setAlpha(0);
    this.setScale(0.3);
    scene.tweens.add({ targets: this, alpha: 1, scale: 1, duration: ENEMY.spawnDelayMs, ease: 'Back.Out' });

    if (def.innocent) {
      this.bubble = scene.add.image(x, y, 'bubble_talk').setDepth(15).setVisible(false);
      this.once(Phaser.GameObjects.Events.DESTROY, () => this.bubble?.destroy());
    }
  }

  /** Toggle the talk bubble (innocents only); hidden automatically while panicking. */
  showBubble(visible: boolean): void {
    if (!this.bubble) return;
    this.bubble.setVisible(visible && !this.isPanicking && this.active);
  }

  /** Set by behaviours/scene when the NPC is threatened; `flee` sprints and wobbles while this is in the future. */
  get isPanicking(): boolean {
    return this.scene.time.now < (this.memory.panicUntil ?? 0);
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
    if (this.bubble) {
      this.bubble.setPosition(this.x, this.y - this.def.radius - 22 + Math.sin(this.scene.time.now / 160) * 4);
      if (this.isPanicking) this.bubble.setVisible(false);
    }

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
    if (this.def.innocent) this.memory.panicUntil = this.scene.time.now + 3000;
    this.flashUntil = this.scene.time.now + ENEMY.hitFlashMs;
    if (poison) this.poisonUntil = this.scene.time.now + PROJECTILE.poisonMs;
    const mass = this.def.isBoss ? 0.15 : 1;
    const push = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize().scale(160 * knockback * mass);
    this.knock.add(push);
  }
}
