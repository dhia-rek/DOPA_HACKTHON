import { events, GameEventName, GameEvents } from '../core/events';
import type { RunState } from '../core/run';
import { describeObjective, TrialOffer, TrialOutcome } from '../trials/types';

export interface ActiveTrial {
  offer: TrialOffer;
  floor: number;
  progress: number;
  target: number;
  /** run.elapsedMs when accepted (haste timer). */
  acceptedAtMs: number;
}

/**
 * Tracks the one accepted trial per floor from game events and applies its
 * reward or penalty. Trials resolve at the latest when the player enters the floor's boss room,
 * so boss rewards/penalties land on that boss.
 */
class TrialSystem {
  private run: RunState | null = null;
  private started = false;
  /** Floor whose trial has already been offered (one offer per floor). */
  offeredFloor = 0;
  active: ActiveTrial | null = null;
  /** Set when the player takes damage inside the current room. */
  private hitThisRoom = false;

  attachRun(run: RunState): void {
    if (!this.started) {
      this.started = true;
      events.onAny(this.handle, this);
    }
    if (this.run !== run) {
      this.run = run;
      this.active = null;
      this.offeredFloor = 0;
    }
  }

  accept(offer: TrialOffer): void {
    if (!this.run) return;
    const o = offer.objective;
    const target = o.type === 'slay' || o.type === 'untouched_rooms' || o.type === 'collect_coins' ? o.n : 1;
    this.active = { offer, floor: this.run.floor, progress: 0, target, acceptedAtMs: this.run.elapsedMs };
    this.run.story.addFlag(`trial_accepted_${offer.objective.type}`);
    events.emit('trial_changed', {});
  }

  /** Seconds left on a haste trial, else null. */
  get secondsLeft(): number | null {
    const t = this.active;
    if (!t || t.offer.objective.type !== 'haste' || !this.run) return null;
    return Math.max(0, Math.ceil(t.offer.objective.seconds - (this.run.elapsedMs - t.acceptedAtMs) / 1000));
  }

  /** HUD line, e.g. "Atonement — Slay 3 harpys (1/3)". */
  get label(): string | null {
    const t = this.active;
    if (!t) return null;
    const left = this.secondsLeft;
    const progress = left !== null ? `${left}s` : t.target > 1 ? `${t.progress}/${t.target}` : '';
    return `${t.offer.title} — ${describeObjective(t.offer.objective)}${progress ? `  (${progress})` : ''}`;
  }

  /** Charon's fare: cleared rooms drop a coin while a coin trial runs. */
  get wantsCoins(): boolean {
    return this.active?.offer.objective.type === 'collect_coins';
  }

  /** Called by the HUD every frame-ish; fails an expired haste trial. */
  tick(): void {
    if (this.secondsLeft === 0) this.resolve(false);
  }

  private handle<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const t = this.active;
    if (!t || !this.run) return;
    const o = t.offer.objective;
    switch (name) {
      case 'enemy_killed': {
        const p = payload as GameEvents['enemy_killed'];
        if (o.type === 'slay' && !p.isBoss && (!o.enemyId || o.enemyId === p.enemyId)) this.bump();
        break;
      }
      case 'room_entered':
        this.hitThisRoom = false;
        if ((payload as GameEvents['room_entered']).roomType === 'boss') this.resolve(o.type === 'haste' || o.type === 'spare_all');
        break;
      case 'damage_taken':
        this.hitThisRoom = true;
        break;
      case 'room_cleared':
        if (o.type === 'untouched_rooms' && !this.hitThisRoom && (payload as GameEvents['room_cleared']).roomType === 'normal') this.bump();
        break;
      case 'pickup_collected':
        if (o.type === 'collect_coins' && (payload as GameEvents['pickup_collected']).kind === 'coin') this.bump();
        break;
      case 'npc_killed':
        if (o.type === 'spare_all') this.resolve(false);
        break;
      case 'floor_cleared':
        this.resolve(o.type === 'spare_all');
        break;
      case 'floor_started':
        if ((payload as GameEvents['floor_started']).floor !== t.floor) this.resolve(o.type === 'spare_all');
        break;
    }
  }

  private bump(): void {
    const t = this.active!;
    t.progress++;
    if (t.progress >= t.target) this.resolve(true);
    else events.emit('trial_changed', {});
  }

  private resolve(success: boolean): void {
    const t = this.active;
    const run = this.run;
    if (!t || !run) return;
    this.active = null;
    const out = success ? t.offer.reward : t.offer.penalty;
    this.apply(out, t, success);
    events.emit('trial_resolved', {
      success,
      title: t.offer.title,
      giverName: t.offer.giverName,
      summary: describeOutcome(out),
    });
    events.emit('trial_changed', {});
    events.emit('hud_update', {});
  }

  private apply(out: TrialOutcome, t: ActiveTrial, success: boolean): void {
    const run = this.run!;
    run.story.record({
      kind: 'custom',
      subject: `trial_${t.offer.objective.type}`,
      floor: run.floor,
      karmaDelta: out.karma ?? 0,
      summary: `${success ? 'Completed' : 'Failed'} ${t.offer.giverName}'s trial "${t.offer.title}" on floor ${run.floor}`,
    });
    run.story.addFlag(`trial_${success ? 'passed' : 'failed'}_${t.offer.objective.type}`);
    out.flags?.forEach((f) => run.story.addFlag(f));
    if (out.hp && out.hp > 0) run.heal(out.hp);
    if (out.hp && out.hp < 0) {
      const dmg = Math.min(-out.hp, run.hp - 1);
      if (dmg > 0) run.takeDamage(dmg, 'trial');
    }
    if (out.coins) run.addCoins(Math.max(out.coins, -run.coins));
    if (out.itemId) {
      try {
        run.addItem(out.itemId);
      } catch {
        /* unknown item id from the LLM: ignore */
      }
    }
    if (out.bossHpMul) run.story.applyBossMods({ hpMul: out.bossHpMul });
  }
}

function describeOutcome(o: TrialOutcome): string {
  const parts: string[] = [];
  if (o.hp) parts.push(`${o.hp > 0 ? '+' : ''}${o.hp / 2} ♥`);
  if (o.coins) parts.push(`${o.coins > 0 ? '+' : ''}${o.coins} coins`);
  if (o.karma) parts.push(`${o.karma > 0 ? '+' : ''}${o.karma} karma`);
  if (o.bossHpMul && o.bossHpMul < 1) parts.push('the boss is weakened');
  if (o.bossHpMul && o.bossHpMul > 1) parts.push('the boss grows stronger');
  if (o.itemId) parts.push('a gift');
  return parts.join(' · ') || 'The gods take note.';
}

export const trials = new TrialSystem();
