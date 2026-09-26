import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TILE } from '../config';
import type { ShotFlags } from '../core/stats';
import type { AbilityId, WeaknessId } from '../data/abilities';
import type { Enemy } from '../entities/Enemy';
import { type Behaviour, type BehaviourContext, ring, seek, shootAt, toPlayer } from './behaviours';

/**
 * `boss_directed`: a boss composed at runtime from the Director's BossBlueprint.
 * The boss roams like a chaser and, every cooldown, performs the next active
 * ability in round-robin order (blueprint abilities + those unlocked by phases).
 * Passive abilities (shields, poison trail, enrage, split, heart theft) run
 * alongside. Every ability has a tell; the weakness the player earned makes
 * one of the counters much stronger (see `weaknessDamageMul`).
 */

/** Abilities executed as timed actions; the rest are passive. */
const ACTIVE: readonly AbilityId[] = ['charge', 'ground_slam', 'projectile_ring', 'summon_minions', 'teleport_behind', 'call_shades', 'mirror_build'];

const State = { Roam: 0, Windup: 1, Charging: 2, Stagger: 3, Blink: 4 } as const;
type State = (typeof State)[keyof typeof State];

const clampToRoom = (x: number, y: number): { x: number; y: number } => ({
  x: Phaser.Math.Clamp(x, TILE * 1.5, GAME_WIDTH - TILE * 1.5),
  y: Phaser.Math.Clamp(y, TILE * 1.5, GAME_HEIGHT - TILE * 1.5),
});

/** Abilities currently unlocked: the base set plus every phase whose hp threshold has been crossed. */
export function activeAbilities(enemy: Enemy): AbilityId[] {
  const bp = enemy.blueprint;
  if (!bp) return [];
  const out = [...bp.abilities];
  for (const phase of bp.phases) {
    if (enemy.hpRatio * 100 <= phase.atHpPct) for (const a of phase.add) if (!out.includes(a)) out.push(a);
  }
  return out;
}

export const bossDirected: Behaviour = (ctx) => {
  const { enemy, player, now, rng } = ctx;
  const bp = enemy.blueprint;
  const m = enemy.memory;
  const d = toPlayer(enemy, player);
  if (!bp) {
    seek(enemy, d, enemy.speed, now);
    return;
  }

  const abilities = activeAbilities(enemy);
  const enraged = abilities.includes('enrage_below') && enemy.hpRatio < 0.3;
  const tempo = enraged ? 0.7 : 1;

  // Phase call-outs, once each.
  bp.phases.forEach((phase, i) => {
    if (!m[`phase${i}`] && enemy.hpRatio * 100 <= phase.atHpPct) {
      m[`phase${i}`] = 1;
      ctx.announce?.(bp.title, phase.line);
      ctx.player.scene.cameras.main.flash(200, 120, 40, 60);
    }
  });

  // Passives.
  if (abilities.includes('orbit_shields')) {
    if (m.nextShield === undefined) m.nextShield = now + 4000;
    if (now >= m.nextShield) {
      m.nextShield = now + 7000 * tempo;
      enemy.shieldedUntil = now + 2200;
    }
  }
  if (abilities.includes('poison_trail') && now >= (m.nextTrail ?? 0) && enemy.body.velocity.lengthSq() > 100) {
    m.nextTrail = now + 320;
    const back = enemy.body.velocity.clone().normalize().negate();
    ctx.enemyShots.shoot({ x: enemy.x, y: enemy.y, dx: back.x, dy: back.y, speed: 40, damage: 1, range: 70, owner: 'enemy', flags: { poison: true } });
  }
  if (abilities.includes('split_on_hp') && !m.split && enemy.hpRatio <= 0.5) {
    m.split = 1;
    summon(ctx, 2, ctx.summonPool ?? [], 'divides itself');
    enemy.setScale(0.85);
  }
  enemy.vulnerability = m.state === State.Stagger && bp.weakness === 'stagger_after_charge' ? 2 : 1;

  const state = (m.state ?? State.Roam) as State;

  if (state === State.Roam) {
    seek(enemy, d, enemy.speed * (enraged ? 1.35 : 1), now);
    if (enraged) enemy.setTint(0xff6050);
    if (m.cooldownUntil === undefined) m.cooldownUntil = now + 1200;
    if (now >= m.cooldownUntil) {
      const pool = abilities.filter((a) => ACTIVE.includes(a));
      if (!pool.length) {
        m.cooldownUntil = now + 1000;
        return;
      }
      m.abilityIdx = ((m.abilityIdx ?? -1) + 1) % pool.length;
      const ability = pool[m.abilityIdx];
      m.cooldownUntil = now + (1600 + rng.int(0, 600)) * tempo;
      perform(ctx, ability, d, tempo);
    }
    return;
  }

  if (state === State.Windup) {
    enemy.moveTowards(0, 0);
    enemy.setScale(0.92 + Math.sin(now / 40) * 0.04, 1.08);
    if (now >= m.until) {
      enemy.setScale(1);
      if (m.pending === 1) {
        // charge
        m.state = State.Charging;
        m.until = now + 1100;
      } else if (m.pending === 2) {
        // ground slam
        ctx.player.scene.cameras.main.shake(180, 0.012);
        ring(ctx, 8, rng.float(0, Math.PI), 190);
        m.state = State.Roam;
      } else {
        // projectile ring
        ring(ctx, enraged ? 14 : 10, rng.float(0, Math.PI), 260);
        m.state = State.Roam;
      }
    }
    return;
  }

  if (state === State.Charging) {
    const s = (enemy.def.chargeSpeed ?? 480) * (enraged ? 1.2 : 1);
    enemy.moveTowards(m.cx * s, m.cy * s);
    if (!enemy.body.blocked.none || now >= m.until) {
      m.state = State.Stagger;
      m.until = now + (bp.weakness === 'stagger_after_charge' ? 1500 : 700);
      ctx.player.scene.cameras.main.shake(120, 0.008);
    }
    return;
  }

  if (state === State.Stagger) {
    enemy.moveTowards(0, 0);
    enemy.setAngle(Math.sin(now / 50) * 6);
    if (now >= m.until) {
      enemy.setAngle(0);
      m.state = State.Roam;
    }
    return;
  }

  if (state === State.Blink) {
    enemy.moveTowards(0, 0);
    enemy.setAlpha(0.3 + 0.7 * Math.abs(Math.sin(now / 30)));
    if (now >= m.until) {
      const dir = player.body.velocity.lengthSq() > 100 ? player.body.velocity.clone().normalize() : d.clone().normalize();
      const p = clampToRoom(player.x - dir.x * 110, player.y - dir.y * 110);
      enemy.setPosition(p.x, p.y);
      enemy.setAlpha(1);
      m.state = State.Roam;
      m.cooldownUntil = now + 900 * tempo;
    }
  }
};

function perform(ctx: BehaviourContext, ability: AbilityId, d: Phaser.Math.Vector2, tempo: number): void {
  const { enemy, now } = ctx;
  const m = enemy.memory;
  switch (ability) {
    case 'charge': {
      const dir = d.clone().normalize();
      m.cx = dir.x;
      m.cy = dir.y;
      m.pending = 1;
      m.state = State.Windup;
      m.until = now + 600 * tempo;
      enemy.setTint(0xff8060);
      break;
    }
    case 'ground_slam':
      m.pending = 2;
      m.state = State.Windup;
      m.until = now + 700 * tempo;
      break;
    case 'projectile_ring':
      m.pending = 3;
      m.state = State.Windup;
      m.until = now + 450 * tempo;
      break;
    case 'teleport_behind':
      m.state = State.Blink;
      m.until = now + 400;
      break;
    case 'summon_minions':
      summon(ctx, 2, ctx.summonPool ?? [], 'calls for aid');
      break;
    case 'call_shades':
      summon(ctx, 3, ['shade'], 'names the dead, and they rise');
      break;
    case 'mirror_build': {
      const flags = mirroredFlags(ctx.player.run.flags);
      const aim = d.clone().normalize();
      for (const off of [-0.2, 0, 0.2]) {
        const a = Math.atan2(aim.y, aim.x) + off;
        const shot = ctx.enemyShots.shoot({ x: enemy.x, y: enemy.y, dx: Math.cos(a), dy: Math.sin(a), speed: 240, damage: 1, range: 900, owner: 'enemy', flags });
        if (shot && flags.homing) shot.homingTarget = ctx.player;
      }
      break;
    }
    default:
      shootAt(ctx, d.x, d.y);
  }
}

/** The boss copies the most defining flag of the player's build; the copy shares its weakness. */
function mirroredFlags(player: ShotFlags): ShotFlags {
  if (player.homing) return { homing: true };
  if (player.piercing) return { piercing: true };
  if (player.poison) return { poison: true };
  if (player.spectral) return { spectral: true };
  return {};
}

function summon(ctx: BehaviourContext, count: number, pool: string[], verb: string): void {
  const { enemy, rng } = ctx;
  if (!ctx.spawn || !pool.length) return;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + rng.float(0, 1);
    const p = clampToRoom(enemy.x + Math.cos(a) * 90, enemy.y + Math.sin(a) * 90);
    ctx.spawn(rng.pick(pool), p.x, p.y);
  }
  ctx.announce?.(enemy.blueprint?.title ?? enemy.def.name, `${enemy.def.name} ${verb}.`);
}

/**
 * Damage multiplier a player shot gets against a directed boss, from the
 * weakness the player earned. Orb weaknesses apply to every shot (the orb is
 * carried, not fired); `known_secret` is applied to max hp at spawn instead.
 */
export function weaknessDamageMul(weakness: WeaknessId | undefined, flags: ShotFlags): number {
  switch (weakness) {
    case 'piercing_shots':
      return flags.piercing ? 1.6 : 1;
    case 'homing_shots':
      return flags.homing ? 1.6 : 1;
    case 'poison':
      return flags.poison ? 1.6 : 1;
    case 'knockback':
      return (flags.knockback ?? 1) > 1 ? 1.6 : 1;
    case 'fire_orb':
    case 'holy_orb':
      return 1.25;
    default:
      return 1;
  }
}
