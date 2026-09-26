import Phaser from 'phaser';
import { ACTOR_SCALE, ART_SCALE } from '../art/manifest';
import { ENEMY, PROJECTILE } from '../config';
import type { BossMods } from '../core/story';
import type { EnemyDef } from '../data/enemies';
import type { BossBlueprint } from '../director/types';
import { dust, shockwave, speedLine, warnMark } from '../systems/fx';

export type EnemyPose = 'idle' | 'attack' | 'hurt' | 'dead';

const HURT_POSE_MS = 260;

/** Boss body language a behaviour can declare for the frame (see `bossPose`). */
export type BossPose = 'windup' | 'charge' | 'stagger' | 'blink';

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
  /** Set by the scene each frame: horizontal offset to the player, so a standing enemy still faces them. */
  faceX = 0;
  private lastTrailAt = 0;
  /** True once killed: the death pose plays out, behaviours and collisions stop, then the sprite destroys itself. */
  dying = false;
  /** Director-composed boss: abilities, phases, weakness. Drives `boss_directed`. */
  blueprint: BossBlueprint | null = null;
  /** While in the future, shots are deflected (orbit_shields). */
  shieldedUntil = 0;
  /** Damage multiplier while staggered / exposed by an earned weakness. */
  vulnerability = 1;
  private spawnedAt: number;
  private flashUntil = 0;
  private hurtUntil = 0;
  private attackUntil = 0;
  private poisonUntil = 0;
  private poisonTick = 0;
  /** External push (knockback) blended into the behaviour's velocity. */
  knock = new Phaser.Math.Vector2();
  /** Resting scale the boss animation breathes around (split halves shrink it). */
  baseScale = 1;
  /** Body-language pose declared by the boss behaviour this frame; consumed by `animate()`. */
  private bossPoseKind: BossPose | null = null;
  private lastDelta = 16;
  /** Eased boss body language (squash/stretch, lean, flicker) composed into `stretch`/angle/alpha. */
  private bossAngle = 0;
  private bossAlpha = 1;
  private shadow: Phaser.GameObjects.Image;
  private bobPhase = Math.random() * Math.PI * 2;
  /** Extra squash/stretch a behaviour can request (1,1 = none); composed with the idle bob. */
  stretch = new Phaser.Math.Vector2(1, 1);
  private readonly baseKey: string;
  /** Pose textures that exist for this enemy (enemy_<id>_attack / _hurt / _dead); missing ones fall back to the base. */
  private readonly poses: Partial<Record<EnemyPose, string>> = {};
  /** "!" bubble shown above innocent NPCs when the player can talk to them. */
  private bubble: Phaser.GameObjects.Image | null = null;
  /** Verdict glow behind a judged boss (colour = how it regards the hero). */
  private aura: Phaser.GameObjects.Arc | null = null;

  /** `group` must be passed here: adding to an arcade group afterwards would reset body settings. */
  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number, def: EnemyDef, difficulty: number) {
    super(scene, x, y, `enemy_${def.id}`);
    this.def = def;
    this.baseKey = `enemy_${def.id}`;
    for (const pose of ['attack', 'hurt', 'dead'] as const) {
      const key = `${this.baseKey}_${pose}`;
      if (scene.textures.exists(key)) this.poses[pose] = key;
    }
    this.maxHp = Math.round(def.hp * difficulty);
    this.hp = this.maxHp;
    this.speed = def.speed * (1 + (difficulty - 1) * 0.4);
    this.contactDamage = def.damage;
    this.spawnedAt = scene.time.now;

    scene.add.existing(this);
    group.add(this);
    this.shadow = scene.add.image(x, y, 'shadow').setDepth(7).setAlpha(0).setScale((def.radius / 16) * 0.9 * ACTOR_SCALE, (def.radius / 16) * 0.7 * ACTOR_SCALE);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.shadow.destroy());
    const r = def.radius * ART_SCALE * 1.1;
    this.body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.body.setCollideWorldBounds(true);
    this.setDepth(def.isBoss ? 9 : 8);
    this.setAlpha(0);
    this.setScale((0.3 * ACTOR_SCALE) / ART_SCALE);
    scene.tweens.add({ targets: this, alpha: 1, scale: ACTOR_SCALE / ART_SCALE, duration: ENEMY.spawnDelayMs, ease: 'Back.Out' });
    scene.tweens.add({ targets: this.shadow, alpha: 0.6, duration: ENEMY.spawnDelayMs });

    if (def.innocent) {
      this.bubble = scene.add.image(x, y, 'bubble_talk').setDepth(15).setVisible(false);
      this.once(Phaser.GameObjects.Events.DESTROY, () => this.bubble?.destroy());
    }
  }

  setAura(color: number): void {
    this.aura?.destroy();
    this.aura = this.scene.add.circle(this.x, this.y, this.def.radius * ACTOR_SCALE * 1.1 * 1.5, color, 0.22).setDepth(this.depth - 1).setBlendMode(Phaser.BlendModes.ADD);
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

  get pose(): EnemyPose {
    const now = this.scene.time.now;
    if (this.dying) return 'dead';
    if (now < this.hurtUntil) return 'hurt';
    if (now < this.attackUntil) return 'attack';
    return 'idle';
  }

  /** Behaviours call this when striking or firing so the attack pose shows for `ms`. */
  attack(ms = 350): void {
    this.attackUntil = Math.max(this.attackUntil, this.scene.time.now + ms);
  }

  /**
   * Charge telegraphs for chargers and slamming bosses: a warning mark and dust
   * while winding up, speed streaks while charging, a shockwave on the stop.
   */
  chargeFx(kind: 'windup' | 'charge' | 'slam'): void {
    const r = this.def.radius;
    if (kind === 'windup') {
      warnMark(this.scene, this.x, this.y - r * ACTOR_SCALE - 6);
      dust(this.scene, this.x, this.y + r, 3);
    } else if (kind === 'charge') {
      const now = this.scene.time.now;
      if (now - this.lastTrailAt < 45) return;
      this.lastTrailAt = now;
      speedLine(this.scene, this.x, this.y, this.body.velocity.x, this.body.velocity.y, 0xfff0d0);
      dust(this.scene, this.x, this.y + r, 1);
    } else {
      shockwave(this.scene, this.x, this.y + r * 0.5, 0xe8d8b8, this.def.isBoss ? 1.4 : 0.9);
    }
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

  /** Declare this frame's body language (bosses only); the sprite squashes, leans or flickers to match. */
  bossPose(kind: BossPose): void {
    this.bossPoseKind = kind;
  }

  step(delta: number): void {
    this.lastDelta = delta;
    if (this.dying) return;
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

    if (!this.isSpawning) {
      const speed = this.body.velocity.length();
      const bob = Math.sin(this.scene.time.now / (speed > 20 ? 90 : 260) + this.bobPhase) * (speed > 20 ? 0.05 : 0.025);
      const hit = this.scene.time.now < this.flashUntil ? 0.12 : 0;
      const lunge = this.pose === 'attack' ? 0.06 : 0;
      const base = ACTOR_SCALE / ART_SCALE;
      this.setScale(this.stretch.x * base * (1 - bob * 0.6 + hit + lunge), this.stretch.y * base * (1 + bob - hit - lunge * 0.5));
      const vx = this.body.velocity.x;
      const face = Math.abs(vx) > 8 ? vx : this.faceX;
      if (Math.abs(face) > 4) this.setFlipX(face < 0);
      const key = this.poses[this.pose] ?? this.baseKey;
      if (this.texture.key !== key) this.setTexture(key);
    }
    this.shadow.setPosition(this.x, this.y + this.def.radius + 2);

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
    const kind = this.bossPoseKind;
    this.bossPoseKind = null;
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

    this.stretch.set(this.stretch.x + (sx - this.stretch.x) * ease, this.stretch.y + (sy - this.stretch.y) * ease);
    this.bossAngle += (angle - this.bossAngle) * ease;
    this.bossAlpha += (alpha - this.bossAlpha) * ease;
    this.setAngle(this.bossAngle);
    this.setAlpha(this.bossAlpha);
  }

  get isShielded(): boolean {
    return this.scene.time.now < this.shieldedUntil;
  }

  takeHit(damage: number, fromX: number, fromY: number, knockback = 1, poison = false): void {
    if (this.isSpawning || this.dying) return;
    if (this.isShielded) {
      this.flashUntil = this.scene.time.now + ENEMY.hitFlashMs;
      return;
    }
    this.hp -= damage * this.vulnerability;
    if (this.def.innocent) this.memory.panicUntil = this.scene.time.now + 3000;
    this.flashUntil = this.scene.time.now + ENEMY.hitFlashMs;
    this.hurtUntil = this.scene.time.now + HURT_POSE_MS;
    if (poison) this.poisonUntil = this.scene.time.now + PROJECTILE.poisonMs;
    const mass = this.def.isBoss ? 0.15 : 1;
    const push = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize().scale(160 * knockback * mass);
    this.knock.add(push);
  }

  /**
   * Death presentation, then destroy. Bosses with an enemy_<id>_dead texture
   * collapse into it and fade; everything else pops flat. Collisions stop immediately.
   */
  die(): void {
    if (this.dying) return;
    this.dying = true;
    this.disableBody();
    this.clearTint();
    const s = ACTOR_SCALE / ART_SCALE;
    const dead = this.poses.dead;
    if (!dead) {
      this.scene.tweens.add({ targets: this, scaleX: s * 1.35, scaleY: s * 0.55, alpha: 0, duration: 170, ease: 'Quad.In', onComplete: () => this.destroy() });
      this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 170 });
      return;
    }
    this.setTexture(dead);
    this.setScale(s * 1.15, s * 0.85);
    this.scene.tweens.add({ targets: this, scaleX: s, scaleY: s, y: this.y + 6, duration: 260, ease: 'Back.Out' });
    this.scene.time.addEvent({
      delay: 90,
      repeat: 8,
      callback: () => {
        if (!this.active) return;
        if (this.isTinted) this.clearTint();
        else this.setTintFill(0xffffff);
      },
    });
    this.scene.tweens.add({ targets: this, alpha: 0, delay: 1300, duration: 500, onComplete: () => this.destroy() });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, delay: 1300, duration: 500 });
  }
}
