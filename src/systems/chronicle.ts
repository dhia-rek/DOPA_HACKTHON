import type { StoryState, WarSnapshot } from '../core/story';
import { getEnemy } from '../data/enemies';
import { LORE, loreContext, WAR_FACTIONS } from '../data/lore';
import type { StageDef } from '../data/stages';
import { FACTION_NAME, frontDef, FrontDef, frontOf } from '../data/war';

/**
 * Turns the war (StoryState.tide) into what a floor looks like and what the
 * LLM is told about it. Pure functions over data; RunState calls them when a
 * floor is generated and when a dialogue is requested.
 */

export interface ResolvedFront {
  def: FrontDef;
  /** Stage name with the holder's label: "Ruined Polis, sinking into the earth". */
  stageName: string;
  bossPool: string[];
  enemyPool: string[];
  npcPool: string[];
  palette: StageDef['palette'];
  /** One sentence for prompts and the chapter card: why this faction holds the floor. */
  reason: string;
}

export function resolveFront(stage: StageDef, story: StoryState): ResolvedFront {
  const faction = frontOf(story.tide, stage.holder);
  const def = frontDef(stage.id, faction);
  const enemyPool = def.enemies ? [...stage.enemyPool, ...def.enemies, ...def.enemies] : stage.enemyPool;
  const npcPool = [...(stage.npcPool ?? [])];
  if (story.shades.length) npcPool.push('shade', 'shade');
  return {
    def,
    stageName: def.label ? `${stage.name}, ${def.label}` : stage.name,
    bossPool: def.bossPool.length ? def.bossPool : stage.bossPool,
    enemyPool,
    npcPool,
    palette: { ...stage.palette, ...(def.palette ?? {}) },
    reason: reasonFor(stage, def, story),
  };
}

function reasonFor(stage: StageDef, def: FrontDef, story: StoryState): string {
  const f = def.faction;
  const who = FACTION_NAME[f];
  if (f === stage.holder) {
    return story.deeds.length === 0
      ? `${who} hold ${stage.name} as they always have; the war has not yet chosen a side.`
      : `${who} still hold ${stage.name}: nothing the hero did has tipped the war against them.`;
  }
  const causes: string[] = [];
  const dead = story.shades.length;
  if (f === 'giant' && dead) causes.push(`Gaia drank the blood of ${dead} innocent${dead > 1 ? 's' : ''} the hero killed`);
  const slain = story.deeds.filter((d) => d.kind === 'boss_killed');
  for (const other of WAR_FACTIONS) {
    if (other === f) continue;
    const n = slain.filter((d) => LORE[d.lore ?? '']?.faction === other).length;
    if (n) causes.push(`the hero slew ${n} champion${n > 1 ? 's' : ''} of ${FACTION_NAME[other]}`);
  }
  const oaths = story.deeds.filter((d) => d.kind === 'dialogue_choice' && d.subject.includes(f)).length;
  if (oaths) causes.push(`the hero bargained with ${who} ${oaths} time${oaths > 1 ? 's' : ''}`);
  const because = causes.length ? causes.join(' and ') : `the tide of war (${story.tide[f]}) favours them`;
  return `${who} have taken ${stage.name} because ${because}.`;
}

/** Chapter card for arriving on a floor. */
export function chapterFor(front: ResolvedFront, story: StoryState, heroName: string): { title: string; body: string } {
  const dead = story.shades.length;
  const sub = (s: string): string =>
    s
      .replace('{hero}', heroName)
      .replace('{stage}', front.stageName)
      .replace('{dead}', dead === 0 ? 'no one' : dead === 1 ? story.shades[0].name : `${dead} innocents`);
  return { title: sub(front.def.chapter.title), body: sub(front.def.chapter.body) };
}

export function warSnapshot(front: ResolvedFront, story: StoryState): WarSnapshot {
  return { tide: { ...story.tide }, front: front.def.faction, frontLabel: front.stageName, frontReason: front.reason };
}

/** Lore lines for a dialogue: the speaker (enemy id), the hero, their real link, and the front. */
export function loreFor(speakerEnemyId: string | undefined, heroLoreId: string | undefined, front: ResolvedFront): string[] {
  let speakerLore: string | undefined;
  if (speakerEnemyId) {
    try {
      speakerLore = getEnemy(speakerEnemyId).lore;
    } catch {
      speakerLore = undefined;
    }
  }
  const lines = loreContext(speakerLore, heroLoreId);
  lines.push(`The war: ${front.reason}`);
  return lines;
}
