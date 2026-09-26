import Phaser from 'phaser';
import type { Rng } from '../core/rng';
import type { BehaviourName } from '../data/enemies';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { ProjectilePool } from '../entities/Projectile';

export interface BehaviourContext {
  enemy: Enemy;
  player: Player;
  enemyShots: ProjectilePool;
  rng: Rng;
  now: number;
  delta: number;
  /** Multiplier from the run's difficulty (endless loops). */
  difficulty: number;
}

export type Behaviour = (ctx: BehaviourContext) => void;

const toPlayer = (e: Enemy, p: Player): Phaser.Math.Vector2 => new Phaser.Math.Vector2(p.x - e.x, p.y - e.y);

/**
 * Move toward a target, sliding sideways for a moment when a rock/pit blocks
 * the way. Cheap obstacle avoidance; swap for A* over the room grid later if
 * rooms get maze-like.
 */
function seek(enemy: Enemy, toTarget: Phaser.Math.Vector2, speed: number, now: number): void {
  const m = enemy.memory;
  const dir = toTarget.clone().normalize();
  const b = enemy.body.blocked;
  const t = enemy.body.touching;
  const blockedAhead =
    (dir.x > 0.3 && (b.right || t.right)) ||
    (dir.x < -0.3 && (b.left || t.left)) ||
    (dir.y > 0.3 && (b.down || t.down)) ||
    (dir.y < -0.3 && (b.up || t.up));

  if (blockedAhead && now >= (m.detourUntil ?? 0)) {
    m.detourUntil = now + 450;
    m.detourFlip = m.detourFlip === 1 ? -1 : 1;
    if (Math.abs(dir.x) > Math.abs(dir.y)) {
      m.dx = 0;
      m.dy = Math.sign(dir.y) || m.detourFlip;
    } else {
      m.dx = Math.sign(dir.x) || m.detourFlip;
      m.dy = 0;
    }
  }
  if (now < (m.detourUntil ?? 0)) enemy.moveTowards(m.dx * speed, m.dy * speed);
  else enemy.moveTowards(dir.x * speed, dir.y * speed);
}

function shootAt(ctx: BehaviourContext, dx: number, dy: number, speed?: number): void {
  const { enemy } = ctx;
  ctx.enemyShots.shoot({
    x: enemy.x,
    y: enemy.y,
    dx,
    dy,
    speed: (speed ?? enemy.def.shotSpeed ?? 240) * (1 + (ctx.difficulty - 1) * 0.3),
    damage: 1,
    range: 900,
    owner: 'enemy',
  });
}

function ring(ctx: BehaviourContext, count: number, offset = 0, speed?: number): void {
  for (let i = 0; i < count; i++) {
    const a = offset + (Math.PI * 2 * i) / count;
    shootAt(ctx, Math.cos(a), Math.sin(a), speed);
  }
}

/** Mark an innocent as threatened: `flee` sprints away and wobbles until `now + ms`. */
export function threaten(enemy: Enemy, now: number, ms = 2500): void {
  if (!enemy.def.innocent) return;
  enemy.memory.panicUntil = Math.max(enemy.memory.panicUntil ?? 0, now + ms);
}

/**
 * Innocent NPCs: keep a polite distance from the player and wander nervously.
 * When threatened (shot at, hit, or another innocent killed) they panic: sprint
 * away with a zig-zag and a frightened wobble, regardless of distance.
 */
const flee: Behaviour = ({ enemy, player, rng, now }) => {
  const m = enemy.memory;
  const away = toPlayer(enemy, player).negate();

  if (enemy.isPanicking) {
    m.wasPanicking = 1;
    if (now >= (m.zigUntil ?? 0)) {
      m.zigUntil = now + rng.int(180, 320);
      m.zig = rng.float(-0.9, 0.9);
    }
    const dir = away.normalize().rotate(m.zig ?? 0);
    seek(enemy, dir, enemy.speed * 1.6, now);
    enemy.setAngle(Math.sin(now / 35) * 14);
    enemy.setScale(1 + Math.sin(now / 60) * 0.08, 1 - Math.sin(now / 60) * 0.08);
    return;
  }
  if (m.wasPanicking) {
    m.wasPanicking = 0;
    enemy.setAngle(0);
    enemy.setScale(1);
  }

  if (away.length() < 200) {
    seek(enemy, away, enemy.speed * 0.8, now);
    return;
  }
  if (now >= (m.nextTurn ?? 0) || enemy.body.blocked.none === false) {
    m.nextTurn = now + rng.int(600, 1400);
    const angle = rng.float(0, Math.PI * 2);
    const s = enemy.speed * 0.4;
    m.vx = Math.cos(angle) * s;
    m.vy = Math.sin(angle) * s;
  }
  enemy.moveTowards(m.vx ?? 0, m.vy ?? 0);
};

/** Walks straight at the player. */
const chaser: Behaviour = ({ enemy, player, now }) => {
  seek(enemy, toPlayer(enemy, player), enemy.speed, now);
};

/** Picks a random direction every so often, occasionally drifting toward the player. */
const wanderer: Behaviour = ({ enemy, player, rng, now }) => {
  const m = enemy.memory;
  if (now >= (m.nextTurn ?? 0) || enemy.body.blocked.none === false) {
    m.nextTurn = now + rng.int(500, 1200);
    const towards = toPlayer(enemy, player).normalize();
    const angle = rng.chance(0.4) ? Math.atan2(towards.y, towards.x) + rng.float(-0.6, 0.6) : rng.float(0, Math.PI * 2);
    m.vx = Math.cos(angle) * enemy.speed;
    m.vy = Math.sin(angle) * enemy.speed;
  }
  enemy.moveTowards(m.vx ?? 0, m.vy ?? 0);
};

/** Keeps mid distance and fires aimed shots. */
const shooter: Behaviour = (ctx) => {
  const { enemy, player, now } = ctx;
  const m = enemy.memory;
  const d = toPlayer(enemy, player);
  const dist = d.length();
  const dir = d.clone().normalize();
  const ideal = 260;
  const v = dir.scale(dist > ideal + 40 ? enemy.speed : dist < ideal - 40 ? -enemy.speed : 0);
  enemy.moveTowards(v.x, v.y);

  if (now >= (m.nextFire ?? now + 600)) {
    m.nextFire = now + (enemy.def.fireInterval ?? 1500);
    const aim = d.normalize();
    shootAt(ctx, aim.x, aim.y);
  } else if (m.nextFire === undefined) {
    m.nextFire = now + 600;
  }
};

/** Idles until the player lines up, then charges until it hits a wall. */
const charger: Behaviour = ({ enemy, player, now }) => {
  const m = enemy.memory;
  const state = m.state ?? 0; // 0 idle, 1 windup, 2 charging, 3 stunned
  const d = toPlayer(enemy, player);

  if (state === 0) {
    seek(enemy, d, enemy.speed * 0.6, now);
    const aligned = Math.abs(d.x) < 36 || Math.abs(d.y) < 36;
    if (aligned && now >= (m.cooldownUntil ?? 0)) {
      m.state = 1;
      m.until = now + 350;
      const horizontal = Math.abs(d.y) < 36;
      m.cx = horizontal ? Math.sign(d.x) : 0;
      m.cy = horizontal ? 0 : Math.sign(d.y);
    }
  } else if (state === 1) {
    enemy.moveTowards(0, 0);
    enemy.setScale(0.9, 1.1);
    if (now >= m.until) {
      m.state = 2;
      m.until = now + 1500;
      enemy.setScale(1);
    }
  } else if (state === 2) {
    const s = enemy.def.chargeSpeed ?? 400;
    enemy.moveTowards(m.cx * s, m.cy * s);
    const hitWall = !enemy.body.blocked.none || !enemy.body.touching.none;
    if (hitWall || now >= m.until) {
      m.state = 3;
      m.until = now + 600;
    }
  } else {
    enemy.moveTowards(0, 0);
    if (now >= m.until) {
      m.state = 0;
      m.cooldownUntil = now + 800;
    }
  }
};

/** Circles the player at a fixed radius while firing slow shots. */
const orbiter: Behaviour = (ctx) => {
  const { enemy, player, now } = ctx;
  const m = enemy.memory;
  const d = toPlayer(enemy, player);
  const dist = d.length();
  const tangent = new Phaser.Math.Vector2(-d.y, d.x).normalize().scale(enemy.speed);
  const radial = d.clone().normalize().scale(dist > 220 ? enemy.speed * 0.8 : dist < 160 ? -enemy.speed * 0.8 : 0);
  enemy.moveTowards(tangent.x + radial.x, tangent.y + radial.y);

  if (m.nextFire === undefined) m.nextFire = now + 900;
  if (now >= m.nextFire) {
    m.nextFire = now + (enemy.def.fireInterval ?? 2000);
    const aim = d.normalize();
    shootAt(ctx, aim.x, aim.y);
  }
};

/** Boss: a charger with phases. Below half health it charges faster and recovers quicker. */
const bossMinotaur: Behaviour = (ctx) => {
  const { enemy, player, now } = ctx;
  const m = enemy.memory;
  const enraged = enemy.hpRatio < 0.5;
  const state = m.state ?? 0;
  const d = toPlayer(enemy, player);

  if (state === 0) {
    seek(enemy, d, enemy.speed * (enraged ? 1.4 : 1), now);
    if (now >= (m.cooldownUntil ?? 0)) {
      m.state = 1;
      m.until = now + (enraged ? 300 : 500);
      const dir = d.clone().normalize();
      m.cx = dir.x;
      m.cy = dir.y;
    }
  } else if (state === 1) {
    enemy.moveTowards(0, 0);
    enemy.setTint(0xff8060);
    if (now >= m.until) {
      m.state = 2;
      m.until = now + 1200;
      enemy.clearTint();
    }
  } else if (state === 2) {
    const s = (enemy.def.chargeSpeed ?? 500) * (enraged ? 1.25 : 1);
    enemy.moveTowards(m.cx * s, m.cy * s);
    if (!enemy.body.blocked.none || now >= m.until) {
      m.state = 3;
      m.until = now + (enraged ? 500 : 900);
      ctx.player.scene.cameras.main.shake(150, 0.01);
      if (enraged) ring(ctx, 8, ctx.rng.float(0, Math.PI), 220);
    }
  } else {
    enemy.moveTowards(0, 0);
    if (now >= m.until) {
      m.state = 0;
      m.cooldownUntil = now + (enraged ? 600 : 1200);
    }
  }
};

/** Boss: slow chaser that spits rings of shots; grows more heads (denser rings) as it takes damage. */
const bossHydra: Behaviour = (ctx) => {
  const { enemy, player, now, rng } = ctx;
  const m = enemy.memory;
  const d = toPlayer(enemy, player);
  seek(enemy, d, enemy.speed, now);

  if (m.nextFire === undefined) m.nextFire = now + 1000;
  if (now >= m.nextFire) {
    const heads = enemy.hpRatio > 0.66 ? 6 : enemy.hpRatio > 0.33 ? 9 : 12;
    m.nextFire = now + (enemy.def.fireInterval ?? 900) * (enemy.hpRatio > 0.33 ? 1 : 0.8);
    m.phase = (m.phase ?? 0) + 1;
    if (m.phase % 3 === 0) {
      const aim = d.normalize();
      for (const off of [-0.25, 0, 0.25]) {
        const a = Math.atan2(aim.y, aim.x) + off;
        shootAt(ctx, Math.cos(a), Math.sin(a), 340);
      }
    } else {
      ring(ctx, heads, rng.float(0, Math.PI * 2));
    }
  }
};

export const BEHAVIOURS: Record<BehaviourName, Behaviour> = {
  chaser,
  wanderer,
  flee,
  shooter,
  charger,
  orbiter,
  boss_minotaur: bossMinotaur,
  boss_hydra: bossHydra,
};
