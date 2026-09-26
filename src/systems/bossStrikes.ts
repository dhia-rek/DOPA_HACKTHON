import Phaser from 'phaser';
import type { BehaviourContext } from './behaviours';
import { settings } from '../core/settings';

/**
 * Boss melee and impact effects, shared by `boss_directed` and the authored
 * `boss_*` behaviours: a claw/horn swipe at arm's reach, a slam shockwave,
 * and shard bursts on impact. Damage goes through `ctx.hurtPlayer` so the
 * scene keeps the hero's i-frames and passives.
 */

/** How far past its own radius a boss can reach with a swipe. */
export const MELEE_REACH = 72;

export function inReach(ctx: BehaviourContext, d: Phaser.Math.Vector2): boolean {
  return d.length() <= ctx.enemy.body.halfWidth + MELEE_REACH;
}

/** Shards flying out of a point; visual only. */
export function impact(ctx: BehaviourContext, x: number, y: number, color: number, count = 8): void {
  const scene = ctx.player.scene;
  for (let i = 0; i < count; i++) {
    const p = scene.add.circle(x, y, ctx.rng.float(2, 6), color).setDepth(20);
    const a = ctx.rng.float(0, Math.PI * 2);
    const dist = ctx.rng.float(24, 80);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, scale: 0.2, duration: 320, onComplete: () => p.destroy() });
  }
}

/** A wedge in front of the boss; the hero is hit if inside it. */
export function swipe(ctx: BehaviourContext, dir: Phaser.Math.Vector2): void {
  const { enemy, player } = ctx;
  const scene = player.scene;
  const reach = enemy.body.halfWidth + MELEE_REACH + 16;
  const facing = Math.atan2(dir.y, dir.x);
  const half = 0.9;

  const g = scene.add.graphics({ x: enemy.x, y: enemy.y }).setDepth(19);
  g.fillStyle(0xfff0d0, 0.5).slice(0, 0, reach, facing - half, facing + half, false).fillPath();
  g.lineStyle(5, 0xffffff, 0.95).beginPath().arc(0, 0, reach - 6, facing - half, facing + half, false).strokePath();
  scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.1, scaleY: 1.1, duration: 240, ease: 'Quad.Out', onComplete: () => g.destroy() });

  const to = new Phaser.Math.Vector2(player.x - enemy.x, player.y - enemy.y);
  const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(to.y, to.x) - facing));
  if (to.length() <= reach + 20 && off <= half + 0.15) {
    ctx.hurtPlayer?.(enemy.contactDamage, enemy.def.id, enemy.x, enemy.y);
    impact(ctx, player.x, player.y, 0xffe0c0, 10);
    settings.shake(scene.cameras.main, 140, 0.01);
  }
}

/** Expanding ring from a slam; the hero is hit if standing inside it when it lands. */
export function shockwave(ctx: BehaviourContext, radius = 190): void {
  const { enemy, player } = ctx;
  const scene = player.scene;
  const ring = scene.add.circle(enemy.x, enemy.y, enemy.body.halfWidth * 0.6).setStrokeStyle(10, 0xf0d8a0, 0.95).setDepth(19);
  scene.tweens.add({ targets: ring, radius, alpha: 0, duration: 400, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  impact(ctx, enemy.x, enemy.y, 0xc0b090, 12);
  settings.shake(scene.cameras.main, 200, 0.014);

  const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);
  if (dist <= radius) {
    ctx.hurtPlayer?.(enemy.contactDamage, enemy.def.id, enemy.x, enemy.y);
    impact(ctx, player.x, player.y, 0xffe0c0, 8);
  }
}
