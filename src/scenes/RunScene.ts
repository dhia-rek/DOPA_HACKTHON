import Phaser from 'phaser';
import { COLORS, Dir, DIR_VECTORS, GAME_HEIGHT, GAME_WIDTH, GRID_COLS, GRID_ROWS, OPPOSITE, ROOM_COLS, ROOM_ROWS, TILE } from '../config';
import { DEBUG, DEBUG_HELP, debugState } from '../core/debug';
import { events } from '../core/events';
import { TOUCH } from '../core/input';
import type { RunState } from '../core/run';
import { music, type MusicKind } from '../core/music';
import { settings } from '../core/settings';
import { KARMA } from '../core/story';
import { earnedWeaknesses } from '../core/profile';
import { EnemyDef, getEnemy } from '../data/enemies';
import { getItem, ITEMS } from '../data/items';
import { factionOf, makeShade } from '../data/war';
import { dialogueProvider } from '../dialogue/provider';
import type { DialogueKind, DialogueOption, DialogueScript } from '../dialogue/types';
import type { BossIntroData } from './BossIntroScene';
import type { DialogueSceneData } from './DialogueScene';
import { doorsOf, neighbour, RoomNode } from '../gen/floorGen';
import { Enemy } from '../entities/Enemy';
import { Pickup, PickupKind } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { Projectile, ProjectilePool } from '../entities/Projectile';
import { achievements } from '../systems/achievements';
import { trials } from '../systems/trials';
import { trialProvider } from '../trials/provider';
import { describeObjective, TrialOffer } from '../trials/types';
import { voiceFor } from '../voice/types';
import { OMEN_TINTS, tintWith } from '../omens/types';
import { BEHAVIOURS, threaten } from '../systems/behaviours';
import { weaknessDamageMul } from '../systems/bossAbilities';
import { director } from '../systems/director';
import { getGod, type GodId } from '../data/gods';

/** Distance (px) at which an innocent NPC shows its "!" talk bubble. */
const TALK_RANGE = 150;
/** A player shot passing this close to an innocent scares it. */
const SCARE_RANGE = 90;
/** Spared innocents before bosses start calling you merciful (`spared_many`). */
const SPARED_MANY = 3;

/** Who a dialogue is with: an Enemy (boss/NPC) or a static prop such as the altar. */
interface DialogueSpeaker {
  id: string;
  name: string;
  persona: string;
  x: number;
  y: number;
  /** The live sprite, when the speaker is an enemy still in the room. */
  enemy?: Enemy;
}

const speakerOf = (e: Enemy): DialogueSpeaker => ({ id: e.def.id, name: e.def.name, persona: e.def.persona ?? '', x: e.x, y: e.y, enemy: e });

const ALTAR_SPEAKER: Omit<DialogueSpeaker, 'x' | 'y'> = {
  id: 'altar',
  name: 'Altar of the Gods',
  persona: 'A silent altar; the gods speak through it in turns, weighing what the hero has done and what they offer.',
};

/** Which god hears each shrine offering (mock + LLM option ids). */
const OFFERING_GOD: Record<string, GodId> = { blood: 'ares', gold: 'hermes', nothing: 'hades', honour: 'athena', pray: 'apollo', water: 'poseidon' };

const DOOR_TILES: Record<Dir, { col: number; row: number }> = {
  up: { col: Math.floor(GRID_COLS / 2), row: 0 },
  down: { col: Math.floor(GRID_COLS / 2), row: GRID_ROWS - 1 },
  left: { col: 0, row: Math.floor(GRID_ROWS / 2) },
  right: { col: GRID_COLS - 1, row: Math.floor(GRID_ROWS / 2) },
};

export interface RunSceneData {
  enterFrom?: Dir;
}

/**
 * One instance of this scene = one room. Moving through a door restarts the
 * scene with the neighbouring RoomNode as the current room. All persistent
 * state lives in RunState (registry key "run"), not on the scene.
 */
export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private room!: RoomNode;
  private player!: Player;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private rocks!: Phaser.Physics.Arcade.StaticGroup;
  private pits!: Phaser.Physics.Arcade.StaticGroup;
  private doors!: Phaser.Physics.Arcade.StaticGroup;
  private doorSprites: Partial<Record<Dir, Phaser.Physics.Arcade.Image>> = {};
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private playerShots!: ProjectilePool;
  private enemyShots!: ProjectilePool;
  private pedestal: Phaser.Physics.Arcade.Image | null = null;
  private trapdoor: Phaser.Physics.Arcade.Image | null = null;
  private altar: Phaser.Physics.Arcade.Image | null = null;
  private transitioning = false;
  private dead = false;
  private dialogueOpen = false;
  /** Delays room completion while a boss outro is pending/showing. */
  private holdClear = false;
  /** `flooded` mutator: everyone wades. */
  private speedMul = 1;
  /** `darkness` mutator: mask that follows the player. */
  private darknessLight: Phaser.GameObjects.Graphics | null = null;
  /** `plague` mutator: enemies burst into poison on death. */
  private plague = false;

  constructor() {
    super('run');
  }

  create(data: RunSceneData): void {
    this.transitioning = false;
    this.dead = false;
    this.dialogueOpen = false;
    this.doorSprites = {};
    this.pedestal = null;
    this.trapdoor = null;
    this.altar = null;
    this.holdClear = false;
    this.speedMul = 1;
    this.darknessLight = null;
    this.plague = false;

    this.run = this.registry.get('run') as RunState;
    achievements.attachRun(this.run);
    trials.attachRun(this.run);
    const map = this.run.ensureFloor();
    this.room = this.run.room ?? map.start;
    this.room.visited = true;

    this.walls = this.physics.add.staticGroup();
    this.rocks = this.physics.add.staticGroup();
    this.pits = this.physics.add.staticGroup();
    this.doors = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.pickups = this.physics.add.group({ runChildUpdate: false });
    this.playerShots = new ProjectilePool(this);
    this.enemyShots = new ProjectilePool(this);

    this.buildBorder();
    this.buildInterior();
    this.applyRoomMutators();

    const spawn = this.spawnPoint(data?.enterFrom);
    this.player = new Player(this, spawn.x, spawn.y, this.run, this.playerShots);

    this.wireCollisions();
    this.spawnRoomContents();
    if (!this.room.cleared && this.hostiles().length === 0) this.room.cleared = true;
    this.refreshDoors();

    events.emit('room_entered', { roomType: this.room.type, floor: this.run.floor });
    this.playRoomMusic();
    events.emit('hud_update', {});
    events.on('quest_settled', this.onQuestSettled, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => events.off('quest_settled', this.onQuestSettled, this));
    this.cameras.main.fadeIn(180, 0, 0, 0);

    if (DEBUG) this.bindDebugKeys();

    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.scene.bringToTop('hud');
    if (TOUCH) {
      if (!this.scene.isActive('touch')) this.scene.launch('touch');
      this.scene.bringToTop('touch');
    }

    const chapter = this.run.takeChapter();
    if (chapter) this.toast(chapter.title, chapter.body, 4200);

    // The next floor is judged once the boss intro choice is on record (see applyChoice); this covers re-entries.
    if (this.room.type === 'boss' && this.room.dialogueDone) director.prefetch(this.run, this.run.floor + 1);
    if (this.room.type === 'boss' && !this.room.cleared && !this.room.dialogueDone) {
      const boss = this.hostiles().find((e) => e.def.isBoss);
      if (boss) {
        this.room.dialogueDone = true;
        this.time.delayedCall(250, () => this.bossSplash(boss));
      }
    }

    if (this.room === map.start && trials.offeredFloor !== this.run.floor) {
      trials.offeredFloor = this.run.floor;
      const omen = this.run.omen;
      if (omen) this.time.delayedCall(100, () => events.emit('omen_revealed', { name: omen.name, line: omen.line, theme: omen.theme }));
      this.time.delayedCall(omen ? 1600 : 450, () => void this.offerTrial());
    }
  }

  /** Stage palette colour shaded by the floor omen's theme. */
  private tint(color: number): number {
    return tintWith(color, OMEN_TINTS[this.run.omen?.theme ?? 'none']);
  }

  /** At the start of each floor a god or shade offers one AI-written trial (src/trials). */
  private async offerTrial(): Promise<void> {
    if (this.dead) return;
    if (this.transitioning || this.dialogueOpen) {
      this.time.delayedCall(500, () => void this.offerTrial());
      return;
    }
    this.dialogueOpen = true;
    this.scene.pause();
    let offer: TrialOffer;
    try {
      offer = await trialProvider.offer({
        story: this.run.storySnapshot(),
        seed: `${this.run.seed}:${this.run.floor}:trial`,
        enemyPool: this.run.stage.enemyPool,
        normalRooms: [...this.run.floorMap!.rooms.values()].filter((r) => r.type === 'normal').length,
      });
    } catch (err) {
      console.warn('[trial] skipped:', err);
      this.dialogueOpen = false;
      this.scene.resume();
      return;
    }
    if (this.dead) return;
    const script: DialogueScript = {
      id: offer.id,
      kind: 'shrine',
      speakerId: `trial_${offer.giverName.toLowerCase().replace(/[^a-z]+/g, '_')}`,
      speakerName: offer.giverName,
      lines: [...offer.lines, `Trial: ${describeObjective(offer.objective)}.`],
      options: [
        { id: 'accept', text: offer.acceptText, reply: 'Then it is sworn.', effects: {} },
        { id: 'refuse', text: offer.refuseText, reply: 'As you wish. The gods will remember.', effects: {} },
      ],
    };
    const data: DialogueSceneData = {
      script,
      voice: voiceFor(script.speakerId, 'trial', this.run.storySnapshot()),
      onDone: (option) => {
        this.dialogueOpen = false;
        this.scene.resume();
        if (option?.id === 'accept') {
          trials.accept(offer);
        } else {
          this.run.story.record({ kind: 'custom', subject: 'trial_refused', floor: this.run.floor, karmaDelta: 0, summary: `Refused ${offer.giverName}'s trial on floor ${this.run.floor}` });
          this.run.story.addFlag('refused_trial');
        }
      },
    };
    this.scene.launch('dialogue', data);
    this.scene.bringToTop('dialogue');
  }

  /** Pokémon-style VS splash over the paused room, then the boss_intro dialogue. */
  private bossSplash(boss: Enemy): void {
    if (this.dead || this.transitioning || this.dialogueOpen) return;
    const room = this.room;
    this.scene.pause();
    const data: BossIntroData = {
      hero: this.run.character,
      boss: boss.def,
      title: boss.blueprint?.title,
      grudge: boss.blueprint?.grudge,
      floor: this.run.floor,
      onDone: () => {
        if (this.room !== room || this.dead) return;
        this.scene.resume();
        if (boss.active) void this.startDialogue('boss_intro', this.bossSpeaker(boss));
      },
    };
    this.scene.launch('boss_vs', data);
    this.scene.bringToTop('boss_vs');
  }

  /** Boss dialogue speaker: the Director's title, persona and grudge on top of the authored persona. */
  private bossSpeaker(boss: Enemy): DialogueSpeaker {
    const bp = boss.blueprint;
    const base = speakerOf(boss);
    if (!bp) return base;
    return {
      ...base,
      name: bp.title,
      persona: `${base.persona} ${bp.persona} Grudge against this hero: ${bp.grudge}`,
    };
  }

  /** Floor-wide mutators that change how the room looks/feels (spawns are handled by director/apply.ts). */
  private applyRoomMutators(): void {
    const d = this.run.directive;
    if (!d) return;
    const god = this.run.story.patron;
    if (d.mutators.includes('palette_shift') && god) {
      const tint = Phaser.Display.Color.IntegerToColor(getGod(god).color).lighten(35).color;
      for (const w of this.walls.getChildren()) (w as Phaser.Physics.Arcade.Image).setTint(tint);
    }
    if (d.mutators.includes('flooded')) {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2050a0, 0.18).setDepth(5);
      this.speedMul = 0.85;
    }
    if (d.mutators.includes('darkness')) {
      const veil = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.74).setDepth(50);
      const light = this.make.graphics({}, false);
      light.fillStyle(0xffffff, 1).fillCircle(0, 0, 200);
      veil.setMask(light.createGeometryMask().setInvertAlpha(true));
      this.darknessLight = light;
    }
    if (d.mutators.includes('plague')) this.plague = true;
  }

  private onQuestSettled(p: { outcome: 'done' | 'failed'; reward: string }): void {
    if (p.outcome === 'done') this.toast('Quest fulfilled', p.reward ? `Reward: ${p.reward.replace('coins:', '')}${p.reward.startsWith('coins:') ? ' coins' : ''}` : 'The gods take note.');
    else this.toast('Quest failed', 'The gods take note.');
  }

  /** Enemies that must die for the room to clear (innocents excluded). */
  private hostiles(): Enemy[] {
    return (this.enemies.getChildren() as Enemy[]).filter((e) => e.active && !e.def.innocent);
  }

  update(time: number, delta: number): void {
    if (this.dead) return;
    this.player.nearestEnemy = this.nearestEnemy();
    this.player.update(time, delta);
    if (this.speedMul !== 1) this.player.body.velocity.scale(this.speedMul);
    this.darknessLight?.setPosition(this.player.x, this.player.y);
    this.playerShots.step();
    this.enemyShots.step();

    const alive = this.enemies.getChildren().filter((e) => e.active) as Enemy[];
    for (const enemy of alive) {
      enemy.step(delta);
      if (enemy.hp <= 0) {
        this.killEnemy(enemy);
        continue;
      }
      if (enemy.isSpawning) {
        enemy.body.setVelocity(0, 0);
        continue;
      }
      if (enemy.def.innocent) this.watchInnocent(enemy, time);
      BEHAVIOURS[enemy.blueprint ? 'boss_directed' : enemy.def.behaviour]({
        enemy,
        player: this.player,
        enemyShots: this.enemyShots,
        rng: this.run.rng,
        now: time,
        delta,
        difficulty: this.run.difficulty,
        spawn: (id, x, y) => this.spawnEnemy(id, x, y),
        summonPool: this.run.stage.enemyPool,
        announce: (title, text) => this.toast(title, text),
      });
    }

    if (!this.room.cleared && !this.holdClear && !alive.some((e) => !e.def.innocent) && this.roomHadEnemies()) this.clearRoom();
  }

  /** Talk bubble when in range; panic when a player shot flies close by. */
  private watchInnocent(npc: Enemy, now: number): void {
    const near = Phaser.Math.Distance.Between(npc.x, npc.y, this.player.x, this.player.y) < TALK_RANGE;
    npc.showBubble(near && !npc.getData('talked'));
    if (npc.isPanicking) return;
    for (const child of this.playerShots.getChildren()) {
      const shot = child as Projectile;
      if (shot.active && Phaser.Math.Distance.Between(shot.x, shot.y, npc.x, npc.y) < SCARE_RANGE) {
        threaten(npc, now);
        return;
      }
    }
  }

  private scareAllInnocents(): void {
    const now = this.time.now;
    for (const e of this.enemies.getChildren() as Enemy[]) if (e.active) threaten(e, now, 4000);
  }

  // ---------------------------------------------------------------- dialogue

  /**
   * Ask the provider for a script, pause the room, show it, then apply the
   * chosen option to the story/run/speaker. Never throws: on any failure the
   * room simply resumes. Callers decide whether the room's one-shot
   * `dialogueDone` flag applies (boss outros play regardless).
   */
  private async startDialogue(kind: DialogueKind, speaker: DialogueSpeaker): Promise<void> {
    if (this.dead || this.transitioning || this.dialogueOpen) return;
    this.dialogueOpen = true;
    const room = this.room;
    this.scene.pause();
    const waiting = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, `${speaker.name} is about to speak…`, { fontFamily: 'monospace', fontSize: '14px', color: COLORS.textDim })
      .setOrigin(0.5)
      .setDepth(1000);
    let script: DialogueScript;
    try {
      script = await dialogueProvider.generate({
        kind,
        speakerId: speaker.id,
        speakerName: speaker.name,
        persona: speaker.persona,
        story: this.run.storySnapshot(speaker.id),
        seed: `${this.run.seed}:${this.run.floor}:${this.room.gx},${this.room.gy}:${kind}`,
      });
    } catch (err) {
      waiting.destroy();
      console.warn('[dialogue] skipped:', err);
      this.dialogueOpen = false;
      this.holdClear = false;
      this.scene.resume();
      return;
    }
    if (waiting.active) waiting.destroy();
    // Scene restarted (new room) or run ended while we were waiting.
    if (this.room !== room || this.dead) return;
    const data: DialogueSceneData = {
      script,
      voice: voiceFor(speaker.id, kind, this.run.storySnapshot()),
      onDone: (option) => {
        this.dialogueOpen = false;
        this.holdClear = false;
        this.scene.resume();
        this.applyChoice(script, option, speaker);
      },
    };
    this.scene.launch('dialogue', data);
    this.scene.bringToTop('dialogue');
  }

  private applyChoice(script: DialogueScript, option: DialogueOption | null, speaker: DialogueSpeaker): void {
    if (option && option.effects.coins && option.effects.coins < 0 && this.run.coins < -option.effects.coins) {
      this.toast('Not enough coins', 'The offering is refused.');
      option = null;
    }
    if (option && option.effects.hp && option.effects.hp < 0 && this.run.hp <= -option.effects.hp) {
      this.toast('Too weak', 'You have no blood left to give.');
      option = null;
    }
    if (option) {
      const fx = option.effects;
      if (fx.hp && fx.hp < 0 && this.run.takeDamage(-fx.hp, 'oath')) {
        this.die();
        return;
      }
      this.run.story.record({
        kind: 'dialogue_choice',
        subject: option.id,
        floor: this.run.floor,
        karmaDelta: fx.karma ?? 0,
        summary: `Told ${script.speakerName}: ${option.text}`,
      });
      fx.flags?.forEach((f) => this.run.story.addFlag(f));
      if (fx.hp && fx.hp > 0) this.run.heal(fx.hp);
      if (fx.coins) this.run.addCoins(fx.coins);
      if (fx.itemId) {
        try {
          this.run.addItem(fx.itemId);
        } catch {
          /* unknown item from the LLM: ignore */
        }
      }
      if (fx.boss) this.run.story.applyBossMods(fx.boss);
      if (fx.favor) this.run.story.pushTide(fx.favor);
      if (script.kind === 'shrine') this.offerTo(option.id, fx.karma ?? 0);
      events.emit('dialogue_choice', { dialogueId: script.id, kind: script.kind, optionId: option.id, karmaDelta: fx.karma ?? 0 });
    }

    const enemy = speaker.enemy;
    if (script.kind === 'boss_intro') {
      if (enemy?.active) enemy.applyMods(this.run.story.takeBossMods(factionOf(enemy.def.lore)));
      director.prefetch(this.run, this.run.floor + 1);
    } else if (script.kind === 'npc' && enemy?.active) {
      this.spareNpc(enemy, option?.effects.npcOutcome === 'wronged');
    } else if (script.kind === 'shrine') {
      this.extinguishAltar();
    }
    events.emit('hud_update', {});
  }

  /**
   * A shrine offering draws a god's attention and makes a prophecy the Director
   * must honour next floor: a boss weakness the player has earned, a boon, or
   * (Hermes, once) a lie.
   */
  private offerTo(optionId: string, karma: number): void {
    const story = this.run.story;
    const god = OFFERING_GOD[optionId] ?? (karma < 0 ? 'ares' : karma > 0 ? 'athena' : 'hades');
    story.favour(god, optionId === 'nothing' ? 0 : 1);
    if (optionId === 'nothing') return;
    const earned = earnedWeaknesses(this.run);
    const lie = god === 'hermes' && !story.hasFlag('hermes_lied') && this.run.rng.chance(0.35);
    if (lie) story.addFlag('hermes_lied');
    if (earned.length && this.run.rng.chance(0.6)) {
      story.promise({ kind: 'boss_weakness', god, payload: this.run.rng.pick(earned), madeOnFloor: this.run.floor, truthful: !lie });
      this.toast(getGod(god).name, lie ? 'The god smiles too easily. "The beast below fears what you carry."' : `"The beast below fears what you carry. Strike with it."`);
    } else {
      story.promise({ kind: 'boon_next_floor', god, payload: `boon_${god}`, madeOnFloor: this.run.floor, truthful: !lie });
      this.toast(getGod(god).name, `"Descend. A gift waits on the next floor."`);
    }
  }

  private tryShrine(): void {
    if (this.room.dialogueDone || !this.altar) return;
    this.room.dialogueDone = true;
    void this.startDialogue('shrine', { ...ALTAR_SPEAKER, x: this.altar.x, y: this.altar.y });
  }

  /** The altar's flame dies down once the offering has been made. */
  private extinguishAltar(): void {
    if (!this.altar) return;
    const glow = this.altar.getData('glow') as Phaser.GameObjects.Arc | undefined;
    glow?.destroy();
    this.altar.setTint(0x8a8090);
    this.burst(this.altar.x, this.altar.y - 16, COLORS.doorFrame, 12);
  }

  /** The NPC walks away alive; counts as spared unless the player wronged them. */
  private spareNpc(npc: Enemy, wronged: boolean): void {
    this.room.npcs = this.room.npcs.filter((id) => id !== npc.def.id);
    if (wronged) {
      this.run.story.record({ kind: 'custom', subject: `wronged_${npc.def.id}`, floor: this.run.floor, karmaDelta: 0, summary: `Wronged the ${npc.def.name} on floor ${this.run.floor}` });
    } else {
      this.run.story.record({ kind: 'npc_spared', subject: npc.def.id, floor: this.run.floor, karmaDelta: KARMA.npcSpared, summary: `Spared the ${npc.def.name} on floor ${this.run.floor}` });
      if (this.run.story.count('npc_spared') >= SPARED_MANY) this.run.story.addFlag('spared_many');
      events.emit('npc_spared', { npcId: npc.def.id, floor: this.run.floor });
    }
    this.tweens.add({ targets: npc, alpha: 0, duration: 500, onComplete: () => npc.destroy() });
    npc.body.enable = false;
  }

  // ---------------------------------------------------------------- building

  private buildBorder(): void {
    const doorDirs = doorsOf(this.run.floorMap!, this.room);
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const isBorder = row === 0 || col === 0 || row === GRID_ROWS - 1 || col === GRID_COLS - 1;
        if (!isBorder) continue;
        const { x, y } = this.tileCenter(col, row);
        const doorDir = this.doorAt(col, row);
        if (doorDir && doorDirs.includes(doorDir)) {
          const door = this.doors.create(x, y, 'door_closed') as Phaser.Physics.Arcade.Image;
          door.setData('dir', doorDir);
          if (doorDir === 'left') door.setAngle(-90);
          if (doorDir === 'right') door.setAngle(90);
          if (doorDir === 'down') door.setAngle(180);
          this.doorSprites[doorDir] = door;
        } else {
          (this.walls.create(x, y, 'wall') as Phaser.Physics.Arcade.Image).setTint(this.tint(this.run.palette.wall));
        }
      }
    }
  }

  private buildInterior(): void {
    const tint = this.tint(this.run.palette.floor);
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const { x, y } = this.tileCenter(c + 1, r + 1);
        this.add.image(x, y, 'floor').setDepth(0).setTint(tint);
        const ch = this.room.template[r][c];
        if (ch === '#') {
          const rock = this.rocks.create(x, y, 'rock') as Phaser.Physics.Arcade.Image;
          rock.setDepth(1);
          (rock.body as Phaser.Physics.Arcade.StaticBody).setCircle(TILE / 2 - 10, 10, 10);
        } else if (ch === 'P') {
          const pit = this.pits.create(x, y, 'pit') as Phaser.Physics.Arcade.Image;
          pit.setDepth(1);
          (pit.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE - 16, TILE - 16, true);
        }
      }
    }
  }

  private slots(ch: string): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        if (this.room.template[r][c] === ch) out.push(this.tileCenter(c + 1, r + 1));
      }
    }
    return out;
  }

  private spawnRoomContents(): void {
    const room = this.room;
    if (!room.cleared) {
      if (room.type === 'boss' && room.bossId) {
        const slot = this.slots('B')[0] ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 - TILE };
        this.spawnEnemy(room.bossId, slot.x, slot.y);
      } else {
        const slots = room.type === 'normal' ? this.slots('E') : [];
        // Never spawn on top of the player.
        const safe = slots.filter((s) => Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) > TILE * 1.5);
        const use = safe.length ? safe : slots;
        room.enemies.forEach((id, i) => {
          const s = use[i % Math.max(1, use.length)];
          if (s) this.spawnEnemy(id, s.x, s.y);
        });
      }
    }

    if (room.npcs.length) {
      const free = this.slots('.').filter((s) => Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) > TILE * 3);
      room.npcs.forEach((id) => {
        const s = free.length ? this.run.rng.pick(free) : { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
        this.spawnEnemy(id, s.x, s.y);
      });
    }

    if (room.type === 'treasure' && room.itemId && !room.itemTaken) {
      const slot = this.slots('I')[0] ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
      this.pedestal = this.physics.add.staticImage(slot.x, slot.y, 'pedestal').setDepth(2);
      const icon = this.add.image(slot.x, slot.y - 18, `item_${room.itemId}`).setDepth(3);
      this.tweens.add({ targets: icon, y: slot.y - 24, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.InOut' });
      this.pedestal.setData('icon', icon);
      this.physics.add.overlap(this.player, this.pedestal, () => this.takeItem());
    }

    if (room.type === 'shrine') this.spawnAltar();

    if (room.type === 'boss' && room.cleared) this.spawnTrapdoor();
  }

  private spawnAltar(): void {
    const slot = this.slots('A')[0] ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    this.altar = this.physics.add.staticImage(slot.x, slot.y, 'altar').setDepth(2);
    (this.altar.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE - 20, TILE - 24, true);
    this.physics.add.collider(this.player, this.altar);
    this.physics.add.collider(this.enemies, this.altar);
    if (this.room.dialogueDone) {
      this.altar.setTint(0x8a8090);
      return;
    }
    const glow = this.add.circle(slot.x, slot.y - 14, 26, 0xffb060, 0.18).setDepth(1);
    this.tweens.add({ targets: glow, scale: 1.35, alpha: 0.05, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
    this.altar.setData('glow', glow);
    // Slightly larger trigger zone than the solid body so touching the altar opens the shrine.
    const zone = this.add.zone(slot.x, slot.y, TILE + 16, TILE + 16);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => this.tryShrine());
  }

  private spawnEnemy(id: string, x: number, y: number): Enemy {
    const enemy = new Enemy(this, this.enemies, x, y, getEnemy(id), this.run.difficulty);
    const bp = this.run.directive?.boss;
    if (enemy.def.isBoss && bp && bp.archetype === id) {
      enemy.blueprint = bp;
      enemy.applyMods(bp.mods);
      if (bp.weakness === 'known_secret') enemy.applyMods({ hpMul: 0.85, damageMul: 1, speedMul: 1 });
    }
    return enemy;
  }

  private spawnTrapdoor(): void {
    if (this.trapdoor) return;
    this.trapdoor = this.physics.add.staticImage(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'trapdoor').setDepth(1);
    (this.trapdoor.body as Phaser.Physics.Arcade.StaticBody).setCircle(18, 14, 14);
    this.physics.add.overlap(this.player, this.trapdoor, () => this.descend());
  }

  // -------------------------------------------------------------- collisions

  private wireCollisions(): void {
    const solids = [this.walls, this.rocks, this.pits, this.doors];
    for (const s of solids) {
      if (s !== this.doors) this.physics.add.collider(this.player, s);
      this.physics.add.collider(this.enemies, s);
    }
    // Closed doors are solid for the player; open ones are walked through (see the overlap below).
    this.physics.add.collider(this.player, this.doors, undefined, () => !this.room.cleared);
    this.physics.add.collider(this.pickups, [this.walls, this.rocks, this.pits]);
    this.physics.add.collider(this.enemies, this.enemies);

    // Shots die on walls; rocks stop them unless spectral.
    for (const pool of [this.playerShots, this.enemyShots]) {
      this.physics.add.overlap(pool, [this.walls, this.doors], (shot) => this.shotHitsWall(shot as Projectile));
      this.physics.add.overlap(pool, this.rocks, (shot) => {
        const s = shot as Projectile;
        if (!s.flags.spectral) this.shotHitsWall(s);
      });
    }

    this.physics.add.overlap(this.playerShots, this.enemies, (shot, target) => this.shotHitsEnemy(shot as Projectile, target as Enemy));
    this.physics.add.overlap(this.player, this.enemyShots, (_p, shot) => {
      const s = shot as Projectile;
      if (!s.active) return;
      s.kill();
      this.hurtPlayer(s.damage, 'projectile', s.x, s.y);
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      const enemy = e as Enemy;
      if (enemy.isSpawning) return;
      if (enemy.def.innocent) {
        if (!enemy.getData('talked') && !enemy.isPanicking && !this.dialogueOpen) {
          enemy.setData('talked', true);
          void this.startDialogue('npc', speakerOf(enemy));
        }
        return;
      }
      const before = this.run.hp;
      this.hurtPlayer(enemy.contactDamage, enemy.def.id, enemy.x, enemy.y);
      if (this.run.hp < before && enemy.blueprint?.abilities.includes('steal_hearts')) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + 6);
        this.burst(enemy.x, enemy.y, COLORS.heart, 6);
      }
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, pk) => this.collect(pk as Pickup));
    this.physics.add.overlap(this.player, this.doors, (_p, door) => {
      if (!this.room.cleared) return;
      this.leaveThrough((door as Phaser.GameObjects.Image).getData('dir') as Dir);
    });
  }

  private shotHitsWall(shot: Projectile): void {
    if (!shot.active) return;
    if (shot.owner === 'player' && shot.flags.splitOnWall && !shot.flags.piercing) {
      const v = shot.body.velocity;
      const speed = v.length();
      for (const sign of [-1, 1]) {
        const a = Math.atan2(-v.y, -v.x) + sign * 0.6;
        this.playerShots.shoot({
          x: shot.x,
          y: shot.y,
          dx: Math.cos(a),
          dy: Math.sin(a),
          speed: speed * 0.8,
          damage: shot.damage * 0.5,
          range: 180,
          owner: 'player',
          flags: { ...shot.flags, splitOnWall: false },
        });
      }
    }
    shot.kill();
  }

  private shotHitsEnemy(shot: Projectile, enemy: Enemy): void {
    if (!shot.active || !enemy.active || enemy.isSpawning) return;
    if (shot.hitSet.has(enemy)) return;
    shot.hitSet.add(enemy);
    const mul = enemy.blueprint ? weaknessDamageMul(enemy.blueprint.weakness, shot.flags) : 1;
    enemy.takeHit(shot.damage * mul, shot.x, shot.y, (shot.flags.knockback ?? 1) * (mul > 1 ? 1.5 : 1), shot.flags.poison ?? false);
    if (mul > 1) this.burst(shot.x, shot.y, 0xffe08a, 3);
    if (!shot.flags.piercing) shot.kill();
  }

  private hurtPlayer(amount: number, source: string, fromX: number, fromY: number): void {
    if (this.dead || this.player.isInvulnerable || debugState.god) return;
    if (this.run.character.passive === 'glass') amount = Math.max(amount, 2);
    const died = this.player.hurt(amount, source, fromX, fromY);
    if (died) this.die();
  }

  private killEnemy(enemy: Enemy): void {
    if (enemy.def.innocent) return this.killNpc(enemy);
    this.run.killsThisRun++;
    const isBoss = !!enemy.def.isBoss;
    this.burst(enemy.x, enemy.y, enemy.def.color, isBoss ? 24 : 8);
    events.emit('enemy_killed', { enemyId: enemy.def.id, isBoss });
    if (this.plague && !isBoss) {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        this.enemyShots.shoot({ x: enemy.x, y: enemy.y, dx: Math.cos(a), dy: Math.sin(a), speed: 90, damage: 1, range: 80, owner: 'enemy', flags: { poison: true } });
      }
    }
    if (isBoss) {
      settings.shake(this.cameras.main, 300, 0.012);
      this.run.story.record({ kind: 'boss_killed', subject: enemy.def.id, lore: enemy.def.lore, floor: this.run.floor, karmaDelta: 0, summary: `Slew ${enemy.def.name} on floor ${this.run.floor}` });
      this.run.story.addFlag(`slew_${enemy.def.id}`);
      events.emit('boss_killed', { enemyId: enemy.def.id, floor: this.run.floor });
      this.bossOutro({ ...speakerOf(enemy), enemy: undefined });
    } else if (this.run.dropRng.chance(enemy.def.dropChance ?? 0)) {
      this.dropPickup(enemy.x, enemy.y, this.run.dropRng.chance(0.4) ? 'heart' : 'coin');
    }
    enemy.destroy();
  }

  /**
   * Boss last words: hold the room-clear flow, let the death burst play, then
   * show the option-less `boss_outro` script. If the provider has nothing to
   * say the hold is released and the floor completes as usual.
   */
  private bossOutro(speaker: DialogueSpeaker): void {
    this.holdClear = true;
    this.time.delayedCall(450, () => {
      if (this.dead || this.transitioning) {
        this.holdClear = false;
        return;
      }
      void this.startDialogue('boss_outro', speaker);
    });
  }

  private killNpc(npc: Enemy): void {
    const def: EnemyDef = npc.def;
    this.room.npcs = this.room.npcs.filter((id) => id !== def.id);
    this.scareAllInnocents();
    this.burst(npc.x, npc.y, def.color, 10);
    const shade = makeShade(this.run.storyRng, def.id, def.name, this.run.floor, this.run.stage.name, this.run.story.shades.length);
    this.run.story.record({ kind: 'npc_killed', subject: def.id, lore: def.lore, floor: this.run.floor, karmaDelta: KARMA.npcKilled, summary: `Killed ${shade.name}, an innocent ${def.name}, on floor ${this.run.floor}` });
    this.run.story.addFlag('blood_on_hands');
    this.run.story.addShade(shade);
    for (const flag of [...this.run.story.flags]) {
      if (flag.startsWith('swore_oath_to_')) this.run.story.addFlag(flag.replace('swore_oath_to_', 'broke_oath_to_'));
    }
    events.emit('npc_killed', { npcId: def.id, floor: this.run.floor });
    this.toast(`Shade collected: ${shade.name}`, `${shade.epitaph} The gods have seen this.`);
    npc.destroy();
  }

  private dropPickup(x: number, y: number, kind: PickupKind): void {
    const p = new Pickup(this, this.pickups, x, y, kind);
    p.body.setVelocity(this.run.dropRng.float(-120, 120), this.run.dropRng.float(-120, 120));
  }

  private collect(p: Pickup): void {
    if (!p.active) return;
    if (p.kind === 'heart') {
      if (this.run.hp >= this.run.stats.maxHp) return;
      this.run.heal(2);
    } else {
      this.run.addCoins(1);
    }
    events.emit('pickup_collected', { kind: p.kind });
    p.destroy();
  }

  private takeItem(): void {
    if (!this.pedestal || this.room.itemTaken || !this.room.itemId) return;
    this.room.itemTaken = true;
    const item = getItem(this.room.itemId);
    this.run.addItem(item.id);
    (this.pedestal.getData('icon') as Phaser.GameObjects.Image).destroy();
    this.toast(item.name, item.description);
  }

  private playRoomMusic(): void {
    const type = this.room.type;
    const kind: MusicKind =
      type === 'shrine' ? 'shrine'
        : type === 'treasure' ? 'treasure'
          : this.room.cleared ? 'explore'
            : type === 'boss' ? 'boss'
              : 'combat';
    music.play(this.run.stage.id, kind);
  }

  private clearRoom(): void {
    this.room.cleared = true;
    this.room.enemies = [];
    this.enemyShots.killAll();
    this.refreshDoors();
    events.emit('room_cleared', { roomType: this.room.type, floor: this.run.floor });
    this.playRoomMusic();
    if (this.room.type === 'normal' && trials.wantsCoins) this.dropPickup(GAME_WIDTH / 2 + TILE, GAME_HEIGHT / 2, 'coin');

    if (this.room.type === 'boss') {
      events.emit('floor_cleared', { floor: this.run.floor });
      this.run.omens.prefetch(this.run.omenRequest(this.run.floor + 1));
      if (this.run.isVictoryFloor && !this.run.won) {
        this.run.won = true;
        events.emit('run_won', { seed: this.run.seed, characterId: this.run.character.id, timeMs: this.run.elapsedMs });
        this.toast('Nostos', 'You have descended through every realm. The descent continues, ever deeper…');
      }
      this.dropPickup(GAME_WIDTH / 2 - TILE, GAME_HEIGHT / 2, 'heart');
      this.spawnTrapdoor();
    }
  }

  private roomHadEnemies(): boolean {
    return this.room.type === 'boss' || this.room.enemies.length > 0;
  }

  private refreshDoors(): void {
    const open = this.room.cleared;
    for (const dir of Object.keys(this.doorSprites) as Dir[]) {
      const door = this.doorSprites[dir]!;
      door.setTexture(open ? 'door_open' : 'door_closed');
    }
  }

  // ------------------------------------------------------------- transitions

  private leaveThrough(dir: Dir): void {
    if (this.transitioning) return;
    const next = neighbour(this.run.floorMap!, this.room, dir);
    if (!next) return;
    this.transitioning = true;
    this.player.body.stop();
    this.run.room = next;
    this.cameras.main.fadeOut(140, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const data: RunSceneData = { enterFrom: OPPOSITE[dir] };
      this.scene.restart(data);
    });
  }

  private descend(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.body.stop();
    this.run.nextFloor();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('hud');
      this.scene.stop('touch');
      this.scene.start('floor_intro');
    });
  }

  private die(): void {
    this.dead = true;
    this.player.body.stop();
    this.playerShots.killAll();
    this.enemyShots.killAll();
    this.physics.pause();
    events.emit('run_lost', { seed: this.run.seed, characterId: this.run.character.id, floor: this.run.floor, timeMs: this.run.elapsedMs });
    this.tweens.add({ targets: this.player, angle: 90, alpha: 0.3, duration: 600 });
    this.time.delayedCall(900, () => {
      this.scene.stop('hud');
      this.scene.stop('touch');
      this.scene.start('gameover');
    });
  }

  // ------------------------------------------------------------------- debug

  private bindDebugKeys(): void {
    this.add
      .text(GAME_WIDTH / 2, 48, DEBUG_HELP, { fontFamily: 'monospace', fontSize: '11px', color: '#f88', backgroundColor: '#000a' })
      .setOrigin(0.5, 0)
      .setDepth(500);
    const kb = this.input.keyboard!;
    const on = (key: string, fn: () => void): void => {
      kb.on(`keydown-${key}`, () => {
        if (!this.dialogueOpen && !this.transitioning && !this.dead) fn();
      });
    };
    on('G', () => {
      debugState.god = !debugState.god;
      this.toast('God mode', debugState.god ? 'ON' : 'OFF');
    });
    on('X', () => this.hostiles().forEach((e) => (e.hp = 0)));
    on('B', () => this.warpTo(this.run.floorMap!.boss));
    on('N', () => this.descend());
    on('T', () => {
      const owned = new Set(this.run.items.map((i) => i.id));
      const pool = ITEMS.filter((i) => !owned.has(i.id));
      if (!pool.length) return;
      const item = this.run.rng.pick(pool);
      this.run.addItem(item.id);
      this.toast(item.name, item.description);
    });
    on('H', () => this.run.heal(this.run.stats.maxHp));
    on('OPEN_BRACKET', () => this.run.story.adjustKarma(-25));
    on('CLOSED_BRACKET', () => this.run.story.adjustKarma(25));
  }

  private warpTo(room: RoomNode): void {
    if (room === this.room) return;
    this.transitioning = true;
    this.run.room = room;
    this.scene.restart({});
  }

  // ----------------------------------------------------------------- helpers

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active || e.isSpawning || e.def.innocent) continue;
      const d = Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.add.circle(x, y, this.run.rng.float(3, 7), color).setDepth(20);
      const a = this.run.rng.float(0, Math.PI * 2);
      const d = this.run.rng.float(20, 70);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.2,
        duration: 350,
        onComplete: () => p.destroy(),
      });
    }
  }

  private toast(title: string, body: string, holdMs = 2200): void {
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, `${title}\n${body}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.text,
        align: 'center',
        backgroundColor: '#0b0a0fcc',
        padding: { x: 12, y: 8 },
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setDepth(200);
    this.tweens.add({ targets: t, alpha: 0, delay: holdMs, duration: 500, onComplete: () => t.destroy() });
  }

  private doorAt(col: number, row: number): Dir | null {
    for (const dir of Object.keys(DOOR_TILES) as Dir[]) {
      const d = DOOR_TILES[dir];
      if (d.col === col && d.row === row) return dir;
    }
    return null;
  }

  private tileCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
  }

  private spawnPoint(enterFrom?: Dir): { x: number; y: number } {
    if (!enterFrom) return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    const d = DOOR_TILES[enterFrom];
    const [ix, iy] = DIR_VECTORS[OPPOSITE[enterFrom]];
    return this.tileCenter(d.col + ix * 2, d.row + iy * 2);
  }
}
