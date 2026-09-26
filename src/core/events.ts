import Phaser from 'phaser';

/**
 * Every gameplay event the game emits. Items, achievements, HUD and audio all
 * subscribe here instead of reaching into each other.
 */
export interface GameEvents {
  run_started: { seed: string; characterId: string };
  floor_started: { floor: number; stageId: string };
  room_entered: { roomType: string; floor: number };
  room_cleared: { roomType: string; floor: number };
  enemy_killed: { enemyId: string; isBoss: boolean };
  boss_killed: { enemyId: string; floor: number };
  damage_taken: { amount: number; hp: number; source: string };
  item_picked: { itemId: string };
  pickup_collected: { kind: 'heart' | 'coin' };
  player_shot: Record<string, never>;
  floor_cleared: { floor: number };
  run_won: { seed: string; characterId: string; timeMs: number };
  run_lost: { seed: string; characterId: string; floor: number; timeMs: number };
  achievement_unlocked: { achievementId: string; title: string; rewardLabel: string };
  /** An innocent (non-hostile NPC) was killed or left alive when the room was cleared. */
  npc_killed: { npcId: string; floor: number };
  npc_spared: { npcId: string; floor: number };
  /** The player picked an option in a dialogue. */
  dialogue_choice: { dialogueId: string; kind: string; optionId: string; karmaDelta: number };
  story_changed: { karma: number };
  /** The active trial started, progressed or ended (HUD refresh). */
  trial_changed: Record<string, never>;
  trial_resolved: { success: boolean; title: string; giverName: string; summary: string };
  hud_update: Record<string, never>;
}

export type GameEventName = keyof GameEvents;

class TypedEventBus {
  private emitter = new Phaser.Events.EventEmitter();

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    this.emitter.emit(name, payload);
    this.emitter.emit('*', name, payload);
  }

  on<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void, ctx?: unknown): void {
    this.emitter.on(name, fn, ctx);
  }

  off<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void, ctx?: unknown): void {
    this.emitter.off(name, fn, ctx);
  }

  /** Subscribe to every event (achievements use this). */
  onAny(fn: <K extends GameEventName>(name: K, payload: GameEvents[K]) => void, ctx?: unknown): void {
    this.emitter.on('*', fn, ctx);
  }

  offAny(fn: <K extends GameEventName>(name: K, payload: GameEvents[K]) => void, ctx?: unknown): void {
    this.emitter.off('*', fn, ctx);
  }
}

export const events = new TypedEventBus();
