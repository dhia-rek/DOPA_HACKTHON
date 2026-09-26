import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { events, GameEvents } from '../core/events';
import type { RunState } from '../core/run';
import type { RoomNode } from '../gen/floorGen';
import { questTracker } from '../systems/quests';
import { trials } from '../systems/trials';

const CELL = 14;
const GAP = 3;
const KARMA_WIDTH = 210;
/** Bottom-right corner: the top-centre slot would sit on the north door. */
const KARMA_X = GAME_WIDTH - 12 - KARMA_WIDTH;
const KARMA_Y = GAME_HEIGHT - 60;

function karmaStyle(karma: number): { label: string; color: number } {
  if (karma <= -60) return { label: 'CURSED', color: COLORS.karmaCursed };
  if (karma <= -25) return { label: 'FALLEN', color: COLORS.karmaFallen };
  if (karma < 25) return { label: 'NEUTRAL', color: COLORS.karmaNeutral };
  if (karma < 60) return { label: 'JUST', color: COLORS.karmaJust };
  return { label: 'BLESSED', color: COLORS.karmaBlessed };
}

/** Overlay scene: hearts, coins, floor name, item icons, minimap, achievement toasts. */
export class HudScene extends Phaser.Scene {
  private hearts!: Phaser.GameObjects.Group;
  private info!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private trialText!: Phaser.GameObjects.Text;
  private omenBanner: Phaser.GameObjects.Text[] = [];
  private items!: Phaser.GameObjects.Container;
  private minimap!: Phaser.GameObjects.Graphics;
  private karmaLabel!: Phaser.GameObjects.Text;
  private karmaNeedle!: Phaser.GameObjects.Rectangle;
  private karma = NaN;
  private toastY = 0;

  constructor() {
    super('hud');
  }

  private get run(): RunState {
    return this.registry.get('run') as RunState;
  }

  create(): void {
    this.hearts = this.add.group();
    this.info = this.add.text(12, 42, '', { fontFamily: 'monospace', fontSize: '16px', color: COLORS.text });
    this.stageText = this.add.text(12, GAME_HEIGHT - 28, '', { fontFamily: 'monospace', fontSize: '14px', color: COLORS.textDim });
    this.questText = this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 50, '', { fontFamily: 'monospace', fontSize: '13px', color: '#8fd0ff', backgroundColor: '#0b0a0fbb', padding: { x: 6, y: 3 } }).setOrigin(1, 0);
    this.trialText = this.add.text(12, GAME_HEIGHT - 50, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe08a' });
    this.time.addEvent({ delay: 250, loop: true, callback: this.refreshTrial, callbackScope: this });
    this.items = this.add.container(12, 68);
    this.minimap = this.add.graphics();
    const meter = this.add.graphics();
    meter.fillStyle(COLORS.uiPanel, 0.9).fillRoundedRect(KARMA_X - 9, KARMA_Y, KARMA_WIDTH + 18, 39, 4);
    meter.lineStyle(1, COLORS.uiBorder, 0.7).strokeRoundedRect(KARMA_X - 9, KARMA_Y, KARMA_WIDTH + 18, 39, 4);
    meter.fillStyle(COLORS.karmaCursed, 0.65).fillRect(KARMA_X, KARMA_Y + 25, KARMA_WIDTH / 2, 5);
    meter.fillStyle(COLORS.karmaBlessed, 0.65).fillRect(KARMA_X + KARMA_WIDTH / 2, KARMA_Y + 25, KARMA_WIDTH / 2, 5);
    this.karmaLabel = this.add.text(KARMA_X + KARMA_WIDTH / 2, KARMA_Y + 5, '', { fontFamily: 'monospace', fontSize: '13px' }).setOrigin(0.5, 0);
    this.karmaNeedle = this.add.rectangle(KARMA_X + KARMA_WIDTH / 2, KARMA_Y + 27, 3, 15, COLORS.karmaNeutral);
    this.karma = NaN;

    events.on('hud_update', this.refresh, this);
    events.on('room_entered', this.refresh, this);
    events.on('story_changed', this.onStoryChanged, this);
    events.on('achievement_unlocked', this.onAchievement, this);
    events.on('trial_changed', this.refreshTrial, this);
    events.on('trial_resolved', this.onTrialResolved, this);
    events.on('omen_revealed', this.onOmen, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      events.off('hud_update', this.refresh, this);
      events.off('room_entered', this.refresh, this);
      events.off('story_changed', this.onStoryChanged, this);
      events.off('achievement_unlocked', this.onAchievement, this);
      events.off('trial_changed', this.refreshTrial, this);
      events.off('trial_resolved', this.onTrialResolved, this);
      events.off('omen_revealed', this.onOmen, this);
    });
    this.refresh();
    this.updateKarma(false);
  }

  private onStoryChanged(): void {
    this.updateKarma(true);
  }

  private updateKarma(animate: boolean): void {
    const run = this.run;
    if (!run) return;
    const karma = run.storySnapshot().karma;
    if (karma === this.karma) return;
    this.karma = karma;
    const { label, color } = karmaStyle(karma);
    const x = KARMA_X + (karma + 100) / 200 * KARMA_WIDTH;
    this.karmaLabel.setText(`${label}  ${karma > 0 ? '+' : ''}${karma}`).setColor(`#${color.toString(16).padStart(6, '0')}`);
    this.karmaNeedle.setFillStyle(color);
    this.tweens.killTweensOf(this.karmaNeedle);
    this.tweens.killTweensOf(this.karmaLabel);
    if (animate) {
      this.tweens.add({ targets: this.karmaNeedle, x, duration: 300, ease: 'Sine.Out' });
      this.karmaLabel.setScale(1.16);
      this.tweens.add({ targets: this.karmaLabel, scale: 1, duration: 350, ease: 'Sine.Out' });
    } else {
      this.karmaNeedle.x = x;
    }
  }

  private refresh(): void {
    const run = this.run;
    if (!run) return;

    this.hearts.clear(true, true);
    const maxHearts = Math.ceil(run.stats.maxHp / 2);
    for (let i = 0; i < maxHearts; i++) {
      const filled = run.hp - i * 2;
      const key = filled >= 2 ? 'heart_full' : filled === 1 ? 'heart_half' : 'heart_empty';
      this.hearts.add(this.add.image(12 + i * 28, 10, key).setOrigin(0, 0));
    }

    this.info.setText(`◈ ${run.coins}   dmg ${run.stats.damage.toFixed(1)}  spd ${Math.round(run.stats.speed)}  rof ${run.stats.fireRate.toFixed(1)}`);
    const loopTag = run.loop > 0 ? `  ·  loop ${run.loop + 1}` : '';
    const title = run.directive ? `  ·  ${run.directive.floorTitle}` : '';
    this.stageText.setText(`Floor ${run.floor} — ${run.stage.name}${loopTag}${title}   ·   seed ${run.seed}`);
    this.questText.setText(questTracker.label() ?? '');

    this.items.removeAll(true);
    run.items.forEach((item, i) => {
      this.items.add(this.add.image(i * 30, 0, `item_${item.id}`).setOrigin(0, 0).setScale(0.8));
    });

    this.drawMinimap();
  }

  private drawMinimap(): void {
    const run = this.run;
    const g = this.minimap;
    g.clear();
    const map = run.floorMap;
    if (!map) return;

    const ox = GAME_WIDTH - 12 - map.width * (CELL + GAP);
    const oy = 10;
    g.fillStyle(0x000000, 0.35).fillRect(ox - 6, oy - 6, map.width * (CELL + GAP) + 9, map.height * (CELL + GAP) + 9);

    for (const room of map.rooms.values()) {
      const isCurrent = room === run.room;
      const known = room.visited || this.adjacentToVisited(room, map.rooms);
      if (!known) continue;
      const x = ox + room.gx * (CELL + GAP);
      const y = oy + room.gy * (CELL + GAP);
      const color = isCurrent ? 0xffffff : room.visited ? 0xc9a45c : 0x5a5060;
      g.fillStyle(color, room.visited ? 1 : 0.6).fillRect(x, y, CELL, CELL);
      if (room.type === 'boss') g.fillStyle(0xe04848, 1).fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
      if (room.type === 'treasure' && !room.itemTaken) g.fillStyle(0xf0c040, 1).fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
    }
  }

  private adjacentToVisited(room: RoomNode, rooms: Map<string, RoomNode>): boolean {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const n = rooms.get(`${room.gx + dx},${room.gy + dy}`);
      if (n?.visited) return true;
    }
    return false;
  }

  private refreshTrial(): void {
    trials.tick();
    this.trialText.setText(trials.label ? `⚖ ${trials.label}` : '');
  }

  private onOmen(p: GameEvents['omen_revealed']): void {
    this.omenBanner.forEach((t) => t.destroy());
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, p.name.toUpperCase(), { fontFamily: 'serif', fontSize: '34px', color: '#f0e6c8', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(900);
    const line = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, p.line, { fontFamily: 'monospace', fontSize: '15px', color: '#e8d9b0', align: 'center', stroke: '#000', strokeThickness: 4, wordWrap: { width: 720 } })
      .setOrigin(0.5, 0)
      .setDepth(900);
    this.omenBanner = [title, line];
    this.tweens.add({ targets: this.omenBanner, alpha: 0, delay: 3800, duration: 700, onComplete: () => [title, line].forEach((t) => t.destroy()) });
  }

  private onTrialResolved(p: GameEvents['trial_resolved']): void {
    this.showToast(`${p.success ? '✦ Trial passed' : '✗ Trial failed'}: ${p.title} (${p.giverName})  —  ${p.summary}`, p.success ? '#ffe08a' : '#ff8a8a');
  }

  private onAchievement(p: GameEvents['achievement_unlocked']): void {
    const label = p.rewardLabel ? `${p.title}  —  ${p.rewardLabel}` : p.title;
    this.showToast(`★ ${label}`, '#ffe08a');
  }

  private showToast(label: string, color: string): void {
    const t = this.add
      .text(GAME_WIDTH - 12, 140 + this.toastY, label, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color,
        backgroundColor: '#0b0a0fdd',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setAlpha(0);
    this.toastY += 34;
    this.tweens.add({ targets: t, alpha: 1, duration: 200 });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 3200,
      duration: 400,
      onComplete: () => {
        t.destroy();
        this.toastY = Math.max(0, this.toastY - 34);
      },
    });
  }
}
