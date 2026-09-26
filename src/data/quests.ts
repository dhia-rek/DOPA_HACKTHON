/**
 * Quest templates. The Director picks a template id + parameters and writes
 * the hook text; tracking is pure TS over the event bus (stream B), so the
 * LLM can never invent an untrackable goal.
 */
export type QuestTemplateId = 'slay' | 'spare_all' | 'deliver' | 'no_damage_rooms' | 'reach_boss_under' | 'betray' | 'sacrifice';

export interface QuestParamSpec {
  name: string;
  kind: 'int' | 'enemyId' | 'npcId' | 'itemId';
  min?: number;
  max?: number;
}

export interface QuestTemplateDef {
  id: QuestTemplateId;
  name: string;
  params: QuestParamSpec[];
  /** Events that advance / fail it (documentation for the tracker). */
  trackedBy: string;
  /** Budget refunded when offered (quests give the player agency, so they are cheap). */
  cost: number;
}

export const QUEST_TEMPLATES: QuestTemplateDef[] = [
  { id: 'slay', name: 'Slay', params: [{ name: 'enemyId', kind: 'enemyId' }, { name: 'n', kind: 'int', min: 2, max: 8 }], trackedBy: 'enemy_killed', cost: 0 },
  { id: 'spare_all', name: 'Spare the Innocent', params: [{ name: 'floors', kind: 'int', min: 1, max: 2 }], trackedBy: 'npc_killed (fail), floor_cleared', cost: 0 },
  { id: 'deliver', name: 'Deliver', params: [{ name: 'itemId', kind: 'itemId' }, { name: 'npcId', kind: 'npcId' }], trackedBy: 'item_picked, dialogue_choice', cost: 1 },
  { id: 'no_damage_rooms', name: 'Untouched', params: [{ name: 'n', kind: 'int', min: 1, max: 4 }], trackedBy: 'damage_taken, room_cleared', cost: 1 },
  { id: 'reach_boss_under', name: 'Haste', params: [{ name: 'seconds', kind: 'int', min: 60, max: 240 }], trackedBy: 'room_entered (boss)', cost: 1 },
  { id: 'betray', name: 'Betrayal', params: [{ name: 'npcId', kind: 'npcId' }], trackedBy: 'npc_killed', cost: 0 },
  { id: 'sacrifice', name: 'Offering', params: [{ name: 'hearts', kind: 'int', min: 1, max: 2 }], trackedBy: 'dialogue_choice (shrine)', cost: 0 },
];

export const QUEST_TEMPLATE_IDS: readonly QuestTemplateId[] = QUEST_TEMPLATES.map((q) => q.id);

export function getQuestTemplate(id: QuestTemplateId): QuestTemplateDef {
  const q = QUEST_TEMPLATES.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown quest template: ${id}`);
  return q;
}
