import { events } from '../core/events';
import type { RunState } from '../core/run';
import type { QuestRecord } from '../core/story';
import type { FloorDirective, QuestOffer } from '../director/types';

/**
 * Tracks the Director's floor quest over the event bus. The LLM only picks a
 * template + params; progress and success are decided here, never by text.
 */
export interface ActiveQuest {
  offer: QuestOffer;
  record: QuestRecord;
  progress: number;
  goal: number;
  /** Time the floor started (for reach_boss_under). */
  startedAt: number;
}

class QuestTracker {
  active: ActiveQuest | null = null;
  private run: RunState | null = null;
  private listening = false;

  offer(run: RunState, d: FloorDirective): void {
    this.run = run;
    this.listen();
    this.active = null;
    if (!d.quest) return;
    const q = d.quest;
    const n = Number(q.params.n ?? q.params.floors ?? q.params.hearts ?? q.params.seconds ?? 1);
    const goal = q.templateId === 'reach_boss_under' ? Math.max(30, n) : q.templateId === 'spare_all' || q.templateId === 'deliver' || q.templateId === 'betray' ? 1 : Math.max(1, n);
    const record: QuestRecord = { templateId: q.templateId, hook: q.hook, floor: run.floor, outcome: 'active' };
    run.story.quests.push(record);
    this.active = { offer: q, record, progress: 0, goal, startedAt: run.elapsedMs };
    events.emit('hud_update', {});
  }

  /** One-line HUD label, or null when no quest is running. */
  label(): string | null {
    const a = this.active;
    if (!a) return null;
    const t = a.offer.templateId;
    const status = a.record.outcome !== 'active' ? a.record.outcome.toUpperCase() : t === 'reach_boss_under' ? `${Math.max(0, a.goal - Math.floor((this.elapsed() - a.startedAt) / 1000))}s` : `${a.progress}/${a.goal}`;
    return `${a.offer.hook}  [${status}]`;
  }

  private elapsed(): number {
    return this.run?.elapsedMs ?? 0;
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    events.on('enemy_killed', ({ enemyId }) => {
      const a = this.live();
      if (a?.offer.templateId === 'slay' && (a.offer.params.enemyId === enemyId || !a.offer.params.enemyId)) this.advance(1);
    });
    events.on('npc_killed', ({ npcId }) => {
      const a = this.live();
      if (!a) return;
      if (a.offer.templateId === 'spare_all') this.finish('failed');
      if (a.offer.templateId === 'betray' && a.offer.params.npcId === npcId) this.advance(1);
    });
    events.on('room_cleared', ({ roomType }) => {
      const a = this.live();
      if (!a) return;
      if (a.offer.templateId === 'no_damage_rooms' && roomType === 'normal' && !this.hurtThisRoom) this.advance(1);
      this.hurtThisRoom = false;
    });
    events.on('room_entered', ({ roomType }) => {
      this.hurtThisRoom = false;
      const a = this.live();
      if (a?.offer.templateId === 'reach_boss_under' && roomType === 'boss') {
        this.finish((this.elapsed() - a.startedAt) / 1000 <= a.goal ? 'done' : 'failed');
      }
    });
    events.on('damage_taken', () => {
      this.hurtThisRoom = true;
    });
    events.on('dialogue_choice', ({ kind, optionId }) => {
      const a = this.live();
      if (!a) return;
      if (a.offer.templateId === 'sacrifice' && kind === 'shrine' && optionId === 'blood') this.advance(1);
      if (a.offer.templateId === 'deliver' && kind === 'npc') this.advance(1);
    });
    events.on('floor_cleared', () => {
      const a = this.live();
      if (!a) return;
      if (a.offer.templateId === 'spare_all') this.finish('done');
      else if (a.record.outcome === 'active') this.finish('failed');
    });
  }

  private hurtThisRoom = false;

  private live(): ActiveQuest | null {
    return this.active && this.active.record.outcome === 'active' ? this.active : null;
  }

  private advance(n: number): void {
    const a = this.live();
    if (!a) return;
    a.progress += n;
    events.emit('hud_update', {});
    if (a.progress >= a.goal) this.finish('done');
  }

  private finish(outcome: 'done' | 'failed'): void {
    const a = this.live();
    const run = this.run;
    if (!a || !run) return;
    a.record.outcome = outcome;
    const karma = outcome === 'done' ? (a.offer.templateId === 'betray' ? -10 : 5) : 0;
    run.story.record({
      kind: 'custom',
      subject: `quest_${a.offer.templateId}_${outcome}`,
      floor: run.floor,
      karmaDelta: karma,
      summary: outcome === 'done' ? `Fulfilled the quest "${a.offer.hook}" on floor ${run.floor}` : `Failed the quest "${a.offer.hook}" on floor ${run.floor}`,
    });
    if (outcome === 'done') this.reward(run, a.offer.reward);
    events.emit('quest_settled', { templateId: a.offer.templateId, outcome, reward: outcome === 'done' ? a.offer.reward : '' });
    events.emit('hud_update', {});
  }

  private reward(run: RunState, reward: string): void {
    if (reward === 'heart') run.heal(2);
    else if (reward.startsWith('coins:')) run.addCoins(Number(reward.slice(6)) || 5);
    else {
      try {
        run.addItem(reward);
      } catch {
        run.addCoins(5);
      }
    }
  }
}

export const questTracker = new QuestTracker();
