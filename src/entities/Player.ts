import Phaser from 'phaser';
import { ACTOR_SCALE, ART_SCALE } from '../art/manifest';
import { PLAYER } from '../config';
import { events } from '../core/events';
import { input } from '../core/input';
import type { RunState } from '../core/run';
import { settings } from '../core/settings';
import { combatSfx } from '../core/sfx';
import { getWeapon, type WeaponDef } from '../data/weapons';
import { dust } from '../systems/fx';
import type { Projectile, ProjectilePool } from './Projectile';

type Facing = 'front' | 'back' | 'side';

/**
 * Isaac controls: WASD moves, arrow keys (or IJKL) shoot in 8 directions
 * (bindings live in core/input.ts). All numbers come from run.stats so items
 * apply automatically.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly run: RunState;
  private shots: ProjectilePool;
  private nextShotAt = 0;
  private invulnerableUntil = 0;
  private rageUntil = 0;
  private regenAccumulator = 0;
  /** Set by the scene each frame so homing shots have something to chase. */
  nearestEnemy: Phaser.Physics.Arcade.Sprite | null = null;
  private shadow: Phaser.GameObjects.Image;
  private squash = 0;
  private recoil = 0;
  private facing: Facing = 'front';
  /** Texture per facing; sides without their own art fall back to the front view. */
  private readonly faceKeys: Record<Facing, string>;
  private readonly weaponDef: WeaponDef;
  private readonly weapon: Phaser.GameObjects.Image;
  /** Last aim (or movement) direction, radians. */
  private aim = Math.PI / 2;
  /** 1 right after a shot, decays to 0 while the weapon swings back. */
  private swing = 0;
  private lastDustAt = 0;
  private wasMoving = false;

  constructor(scene: Phaser.Scene, x: number, y: number, run: RunState, shots: ProjectilePool) {
    const base = `player_${run.character.id}`;
    super(scene, x, y, base);
    this.faceKeys = {
      front: base,
      back: scene.textures.exists(`${base}_back`) ? `${base}_back` : base,
      side: scene.textures.exists(`${base}_side`) ? `${base}_side` : base,
    };
    this.run = run;
    this.shots = shots;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(ACTOR_SCALE / ART_SCALE);
    this.shadow = scene.add.image(x, y, 'shadow').setDepth(7).setAlpha(0.7);
    this.weaponDef = getWeapon(run.character.weapon);
    this.weapon = scene.add.image(x, y, `weapon_${this.weaponDef.id}`).setDepth(11);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
      this.weapon.destroy();
    });
    const r = PLAYER.radius * ART_SCALE * 1.1;
    this.body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
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
    this.updateWeapon();

    this.setAlpha(this.isInvulnerable ? 0.55 + 0.45 * Math.abs(Math.sin(this.scene.time.now / 40)) : 1);
    if (this.isRaging) this.setTint(0xff6040);
    else this.clearTint();
  }

  private handleMovement(): void {
    const { x, y } = input.moveAxes();
    const moving = x !== 0 || y !== 0;

    this.body.setMaxVelocity(this.run.stats.speed);
    if (!moving) {
      this.body.setAcceleration(0, 0);
    } else {
      const v = new Phaser.Math.Vector2(x, y).normalize().scale(PLAYER.acceleration);
      this.body.setAcceleration(v.x, v.y);
    }
    this.face(x, y);

    const now = this.scene.time.now;
    const vel = this.body.velocity;
    const t = vel.length() / this.run.stats.speed;
    // Footstep dust: a kick when setting off, then a trickle while running.
    if (moving && !this.wasMoving) dust(this.scene, this.x, this.y + PLAYER.radius, 3);
    if (t > 0.5 && now - this.lastDustAt > 130) {
      this.lastDustAt = now;
      dust(this.scene, this.x - vel.x * 0.04, this.y + PLAYER.radius, 1);
    }
    this.wasMoving = moving;

    // Lean into the run, bounce with speed, squash briefly when hurt, kick back on each shot.
    this.setRotation((vel.x / this.run.stats.speed) * PLAYER.lean);
    const bob = Math.sin(now / 70) * 0.06 * t;
    this.squash = Math.max(0, this.squash - 0.08);
    this.recoil = Math.max(0, this.recoil - 0.15);
    const s = ACTOR_SCALE / ART_SCALE;
    this.setScale(
      s * (1 + t * 0.04 + this.squash * 0.3 - bob * 0.5 + this.recoil * 0.08),
      s * (1 - t * 0.04 - this.squash * 0.3 + bob - this.recoil * 0.05),
    );
    this.shadow.setPosition(this.x, this.y + PLAYER.radius + 4).setScale((0.9 + t * 0.05) * ACTOR_SCALE, 0.8 * ACTOR_SCALE);
  }

  /** Turn toward the aim direction while shooting, otherwise toward the movement direction. */
  private face(moveX: number, moveY: number): void {
    const aim = input.shootAxes();
    const dx = aim.x || aim.y ? aim.x : moveX;
    const dy = aim.x || aim.y ? aim.y : moveY;
    if (dx !== 0 || dy !== 0) {
      this.aim = Math.atan2(dy, dx);
      this.facing = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'back' : 'front') : 'side';
      if (dx !== 0) this.setFlipX(dx < 0);
    }
    const key = this.faceKeys[this.facing];
    if (this.texture.key !== key) this.setTexture(key);
  }

  private handleShooting(): void {
    const { x, y } = input.shootAxes();
    if (x === 0 && y === 0) return;

    const now = this.scene.time.now;
    if (now < this.nextShotAt) return;
    this.nextShotAt = now + 1000 / this.run.stats.fireRate;

    // Shots leave from the weapon's reach rather than the body centre.
    const reach = 22 * ACTOR_SCALE;
    this.shots.volley({
      x: this.x + Math.cos(this.aim) * reach,
      y: this.y + Math.sin(this.aim) * reach - 4,
      dx: x,
      dy: y,
      speed: this.run.stats.shotSpeed,
      damage: this.damage,
      range: this.run.stats.range,
      owner: 'player',
      flags: this.run.flags,
      look: this.weaponDef.shot,
      inheritVx: this.body.velocity.x,
      inheritVy: this.body.velocity.y,
    });
    for (const child of this.shots.getChildren()) {
      const shot = child as Projectile;
      if (shot.active && shot.flags.homing && !shot.homingTarget) shot.homingTarget = this.nearestEnemy;
    }
    this.recoil = 1;
    this.swing = 1;
    combatSfx(this.weaponDef.id);
    events.emit('player_shot', {});
  }

  /** Hold the weapon by the hand of the current facing and play the per-weapon swing after each shot. */
  private updateWeapon(): void {
    const w = this.weapon;
    const def = this.weaponDef;
    this.swing = Math.max(0, this.swing - 0.09);
    const k = this.swing;
    const cos = Math.cos(this.aim);
    const sin = Math.sin(this.aim);
    const left = cos < -0.01;
    const mirror = left ? -1 : 1;

    let hx = this.facing === 'side' ? (this.flipX ? -12 : 12) : this.facing === 'back' ? -10 : 12;
    let hy = this.facing === 'back' ? -2 : 8;
    let rot = def.swing === 'strum' ? 0 : this.aim;
    let sx = 1;
    let sy = 1;
    switch (def.swing) {
      case 'thrust': {
        const push = Math.sin(k * Math.PI) * 20;
        hx += cos * push;
        hy += sin * push;
        break;
      }
      case 'slash':
        if (k > 0) rot += mirror * (-1.1 + (1 - k) * 2.2);
        break;
      case 'smash':
        if (k > 0) rot += mirror * (-1.5 + (1 - k) * 1.8);
        break;
      case 'draw':
        sx = 1 - Math.sin(k * Math.PI) * 0.22;
        hx -= cos * k * 6;
        hy -= sin * k * 6;
        break;
      case 'strum':
        rot = Math.sin(k * Math.PI * 3) * 0.3;
        sy = 1 + Math.sin(k * Math.PI) * 0.1;
        break;
    }
    const base = (ACTOR_SCALE * def.size) / ART_SCALE;
    w.setPosition(this.x + hx * ACTOR_SCALE, this.y + hy * ACTOR_SCALE)
      .setRotation(rot)
      .setFlipY(def.swing !== 'strum' && left)
      .setScale(base * sx, base * sy)
      .setDepth(this.facing === 'back' ? 9 : 11)
      .setAlpha(this.alpha);
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

    this.squash = 1;
    settings.shake(this.scene.cameras.main, 120, 0.006);
    return this.run.takeDamage(amount, source);
  }
}
