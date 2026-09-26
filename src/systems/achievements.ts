import { events, GameEventName, GameEvents } from '../core/events';
import type { RunState } from '../core/run';
import { save } from '../core/save';
import { ACHIEVEMENTS } from '../data/achievements';

/**
 * Listens to every game event, keeps lifetime counters in the save and grants
 * achievements whose `on` event fired and whose `check` passes. Unlock rewards
 * (e.g. "character:kratos") are written to the save so menus can read them.
 */
class AchievementSystem {
  private run: RunState | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    events.onAny(this.handle, this);
  }

  attachRun(run: RunState): void {
    this.run = run;
  }

  private handle<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    this.bumpCounters(name, payload);
    if (!this.run) return;
    const ctx = { save: save.data, run: this.run.snapshot(), story: this.run.storySnapshot() };

    for (const a of ACHIEVEMENTS) {
      if (a.on !== name || save.hasAchievement(a.id)) continue;
      if (!a.check(payload, ctx)) continue;
      save.grantAchievement(a.id);
      if (a.reward) save.unlock(a.reward);
      events.emit('achievement_unlocked', { achievementId: a.id, title: a.title, rewardLabel: a.rewardLabel ?? '' });
    }
  }

  private bumpCounters<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    switch (name) {
      case 'enemy_killed':
        save.bump('kills');
        break;
      case 'boss_killed':
        save.bump('boss_kills');
        break;
      case 'item_picked':
        save.bump('items');
        break;
      case 'npc_killed':
        save.bump('npc_kills');
        break;
      case 'npc_spared':
        save.bump('npc_spares');
        break;
      case 'run_lost': {
        const p = payload as GameEvents['run_lost'];
        save.data.runs++;
        save.data.bestFloor = Math.max(save.data.bestFloor, p.floor);
        save.persist();
        break;
      }
      case 'run_won':
        save.data.wins++;
        save.persist();
        break;
    }
  }
}

export const achievements = new AchievementSystem();
