import Phaser from 'phaser';
import { ART_SCALE } from '../art/manifest';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { events, GameEvents } from '../core/events';
import type { RunState } from '../core/run';
import type { RoomNode } from '../gen/floorGen';

const CELL = 14;
const GAP = 3;

/** Overlay scene: hearts, coins, floor name, item icons, minimap, achievement toasts. */
export class HudScene extends Phaser.Scene {
  private hearts!: Phaser.GameObjects.Group;
  private info!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private items!: Phaser.GameObjects.Container;
  private minimap!: Phaser.GameObjects.Graphics;
  private toastY = 0;

  constructor() {
    super('hud');
  }

  private get run(): RunState {
    return this.registry.get('run') as RunState;
  }

  create(): void {
    this.hearts = this.add.group();
    this.info = this.add.text(12, 42, '', { fontFamily: 'monospace', fontSize: '16px', color: COLORS.text, stroke: '#0b0a0f', strokeThickness: 4 });
    this.stageText = this.add.text(12, GAME_HEIGHT - 28, '', { fontFamily: 'monospace', fontSize: '14px', color: COLORS.textDim, stroke: '#0b0a0f', strokeThickness: 4 });
    this.items = this.add.container(12, 68);
    this.minimap = this.add.graphics();

    events.on('hud_update', this.refresh, this);
    events.on('room_entered', this.refresh, this);
    events.on('achievement_unlocked', this.onAchievement, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      events.off('hud_update', this.refresh, this);
      events.off('room_entered', this.refresh, this);
      events.off('achievement_unlocked', this.onAchievement, this);
    });
    this.refresh();
  }

  private refresh(): void {
    const run = this.run;
    if (!run) return;

    this.hearts.clear(true, true);
    const maxHearts = Math.ceil(run.stats.maxHp / 2);
    for (let i = 0; i < maxHearts; i++) {
      const filled = run.hp - i * 2;
      const key = filled >= 2 ? 'heart_full' : filled === 1 ? 'heart_half' : 'heart_empty';
      this.hearts.add(this.add.image(12 + i * 28, 10, key).setOrigin(0, 0).setScale(1 / ART_SCALE));
    }

    this.info.setText(`◈ ${run.coins}   dmg ${run.stats.damage.toFixed(1)}  spd ${Math.round(run.stats.speed)}  rof ${run.stats.fireRate.toFixed(1)}`);
    const loopTag = run.loop > 0 ? `  ·  loop ${run.loop + 1}` : '';
    this.stageText.setText(`Floor ${run.floor} — ${run.stage.name}${loopTag}   ·   seed ${run.seed}`);

    this.items.removeAll(true);
    run.items.forEach((item, i) => {
      this.items.add(this.add.image(i * 30, 0, `item_${item.id}`).setOrigin(0, 0).setScale(0.8 / ART_SCALE));
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

  private onAchievement(p: GameEvents['achievement_unlocked']): void {
    const label = p.rewardLabel ? `${p.title}  —  ${p.rewardLabel}` : p.title;
    const t = this.add
      .text(GAME_WIDTH - 12, 140 + this.toastY, `★ ${label}`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe08a',
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
