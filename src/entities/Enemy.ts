import Phaser from 'phaser';
import { ENEMY, PROJECTILE } from '../config';
import type { BossMods } from '../core/story';
import type { EnemyDef } from '../data/enemies';
import type { BossBlueprint } from '../director/types';

export type EnemyPose = 'windup' | 'charge' | 'stagger' | 'blink';

/** Bosses ease into their target velocity instead of snapping; higher = snappier. */
const BOSS_ACCEL = 0.22;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  /** Free-form memory for the behaviour function driving this enemy. */
  memory: Record<string, number> = {};
  /** Director-composed boss: abilities, phases, weakness. Drives `boss_directed`. */
  blueprint: BossBlueprint | null = null;
  /** While in the future, shots are deflected (orbit_shields). */
  shieldedUntil = 0;
  /** Damage multiplier while staggered / exposed by an earned weakness. */
  vulnerability = 1;
  private spawnedAt: number;
  private flashUntil = 0;
  private poisonUntil = 0;
  private poisonTick = 0;
  /** External push (knockback) blended into the behaviour's velocity. */
  knock = new Phaser.Math.Vector2();
  /** Resting scale the boss animation breathes around (split halves shrink it). */
  baseScale = 1;
  /** Pose declared by the behaviour this frame; consumed by `animate()`. */
  private poseKind: EnemyPose | null = null;
  private lastDelta = 16;
  /** "!" bubble shown above innocent NPCs when the player can talk to them. */
  private bubble: Phaser.GameObjects.Image | null = null;
  /** Verdict glow behind a judged boss (colour = how it regards the hero). */
  private aura: Phaser.GameObjects.Arc | null = null;

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

  setAura(color: number): void {
    this.aura?.destroy();
    this.aura = this.scene.add.circle(this.x, this.y, this.def.radius * 1.55, color, 0.22).setDepth(this.depth - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.aura?.destroy());
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

  /**
   * Behaviours call this instead of setting body velocity directly so knockback
   * composes. Bosses have mass: they accelerate and brake over ~150 ms.
   */
  moveTowards(vx: number, vy: number): void {
    const tx = vx + this.knock.x;
    const ty = vy + this.knock.y;
    if (!this.def.isBoss) {
      this.body.setVelocity(tx, ty);
      return;
    }
    const k = 1 - Math.pow(1 - BOSS_ACCEL, this.lastDelta / 16);
    const v = this.body.velocity;
    this.body.setVelocity(v.x + (tx - v.x) * k, v.y + (ty - v.y) * k);
  }

  /** Declare this frame's pose (bosses only); the sprite squashes, leans or flickers to match. */
  pose(kind: EnemyPose): void {
    this.poseKind = kind;
  }

  step(delta: number): void {
    this.lastDelta = delta;
    this.knock.scale(Math.pow(ENEMY.knockbackDamping, delta / 16));
    if (this.knock.lengthSq() < 4) this.knock.set(0, 0);
    if (this.def.isBoss) this.animate();
    if (this.aura) {
      const t = this.scene.time.now;
      const enraged = this.hpRatio < 0.3;
      this.aura.setPosition(this.x, this.y);
      this.aura.setScale(this.baseScale * (1 + Math.sin(t / (enraged ? 120 : 300)) * 0.08));
      this.aura.setAlpha(enraged ? 0.3 + Math.abs(Math.sin(t / 120)) * 0.15 : 0.22);
    }
    if (this.bubble) {
      this.bubble.setPosition(this.x, this.y - this.def.radius - 22 + Math.sin(this.scene.time.now / 160) * 4);
      if (this.isPanicking) this.bubble.setVisible(false);
    }

    if (this.isShielded) {
      this.setTint(0x80c0ff);
    } else if (this.scene.time.now < this.poisonUntil) {
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

  /**
   * Boss body language, all procedural: breathing at rest, facing and leaning
   * into movement, stretching along a charge, squashing on a windup, wobbling
   * when staggered, flickering before a blink. Eases so poses never snap.
   */
  private animate(): void {
    if (this.isSpawning) return;
    const kind = this.poseKind;
    this.poseKind = null;
    const t = this.scene.time.now;
    const v = this.body.velocity;
    const b = this.baseScale;
    let sx = b;
    let sy = b;
    let angle = 0;
    let alpha = 1;
    let ease = 0.25;

    switch (kind) {
      case 'windup':
        sx = b * (0.9 + Math.sin(t / 40) * 0.03);
        sy = b * 1.12;
        break;
      case 'charge': {
        const sp = Math.max(1, v.length());
        const nx = Math.abs(v.x) / sp;
        const ny = Math.abs(v.y) / sp;
        sx = b * (1 + 0.2 * nx - 0.1 * ny);
        sy = b * (1 + 0.2 * ny - 0.1 * nx);
        angle = Phaser.Math.Clamp(v.x * 0.025, -14, 14);
        ease = 0.35;
        break;
      }
      case 'stagger':
        angle = Math.sin(t / 50) * 7;
        sx = b * 1.04;
        sy = b * 0.94;
        break;
      case 'blink':
        alpha = 0.3 + 0.7 * Math.abs(Math.sin(t / 30));
        ease = 1;
        break;
      default: {
        const breath = Math.sin(t / 260) * 0.035;
        sx = b * (1 + breath);
        sy = b * (1 - breath);
        angle = Phaser.Math.Clamp(v.x * 0.02, -8, 8);
        ease = 0.12;
      }
    }

    if (Math.abs(v.x) > 20) this.setFlipX(v.x < 0);
    this.setScale(this.scaleX + (sx - this.scaleX) * ease, this.scaleY + (sy - this.scaleY) * ease);
    this.setAngle(this.angle + (angle - this.angle) * ease);
    this.setAlpha(this.alpha + (alpha - this.alpha) * ease);
  }

  get isShielded(): boolean {
    return this.scene.time.now < this.shieldedUntil;
  }

  takeHit(damage: number, fromX: number, fromY: number, knockback = 1, poison = false): void {
    if (this.isSpawning) return;
    if (this.isShielded) {
      this.flashUntil = this.scene.time.now + ENEMY.hitFlashMs;
      return;
    }
    this.hp -= damage * this.vulnerability;
    if (this.def.innocent) this.memory.panicUntil = this.scene.time.now + 3000;
    this.flashUntil = this.scene.time.now + ENEMY.hitFlashMs;
    if (poison) this.poisonUntil = this.scene.time.now + PROJECTILE.poisonMs;
    const mass = this.def.isBoss ? 0.15 : 1;
    const push = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize().scale(160 * knockback * mass);
    this.knock.add(push);
  }
}
