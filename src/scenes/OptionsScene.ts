import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { music } from '../core/music';
import { save } from '../core/save';
import { settings, TextSpeed } from '../core/settings';
import { blip } from '../core/sfx';
import { backButton, drawTitle, hintText, mono } from './ui';

interface OptionRow {
  label: string;
  /** Current value shown on the right; undefined for action rows. */
  value?: () => string;
  /** Cycle the value (dir = ±1) or trigger the action. */
  change: (dir: number) => void;
  hint: string;
}

const TEXT_SPEEDS: TextSpeed[] = ['slow', 'normal', 'fast'];
const TOP = 170;
const ROW_H = 46;

/** Settings (persisted in localStorage) plus a guarded progress reset. */
export class OptionsScene extends Phaser.Scene {
  private index = 0;
  private confirmReset = false;
  private root!: Phaser.GameObjects.Container;

  private readonly rows: OptionRow[] = [
    {
      label: 'SCREEN SHAKE',
      value: () => (settings.data.screenShake ? 'ON' : 'OFF'),
      change: () => settings.set('screenShake', !settings.data.screenShake),
      hint: 'Camera shake when you are hit, a boss charges or dies.',
    },
    {
      label: 'SOUND EFFECTS',
      value: () => (settings.data.sfx ? 'ON' : 'OFF'),
      change: () => settings.set('sfx', !settings.data.sfx),
      hint: 'Menu and dialogue blips.',
    },
    {
      label: 'MUSIC',
      value: () => (settings.data.music ? 'ON' : 'OFF'),
      change: () => {
        settings.set('music', !settings.data.music);
        music.refresh();
      },
      hint: 'Room music: lyre, aulos and drums in the ancient modes.',
    },
    {
      label: 'TEXT SPEED',
      value: () => settings.data.textSpeed.toUpperCase(),
      change: (dir) => {
        const i = TEXT_SPEEDS.indexOf(settings.data.textSpeed);
        settings.set('textSpeed', TEXT_SPEEDS[(i + dir + TEXT_SPEEDS.length) % TEXT_SPEEDS.length]);
      },
      hint: 'How fast dialogue lines are typed out.',
    },
    {
      label: 'RESET PROGRESS',
      change: () => {
        if (!this.confirmReset) {
          this.confirmReset = true;
          this.time.delayedCall(3000, () => {
            this.confirmReset = false;
            if (this.scene.isActive()) this.render();
          });
          return;
        }
        save.reset();
        this.confirmReset = false;
      },
      hint: 'Erase achievements, unlocked heroes and lifetime stats. Cannot be undone.',
    },
  ];

  constructor() {
    super('options');
  }

  create(): void {
    this.index = 0;
    this.confirmReset = false;
    drawTitle(this, '✦  OPTIONS  ✦');
    this.root = this.add.container(0, 0);
    this.render();

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-LEFT', () => this.change(-1));
    kb.on('keydown-RIGHT', () => this.change(1));
    kb.on('keydown-A', () => this.change(-1));
    kb.on('keydown-D', () => this.change(1));
    kb.on('keydown-ENTER', () => this.change(1));
    kb.on('keydown-SPACE', () => this.change(1));
    backButton(this, () => {
      blip('advance');
      kb.removeAllListeners();
      this.scene.start('menu');
    });
    hintText(this, ['↑ ↓  CHOOSE     ← →  CHANGE', 'ESC  BACK']);
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private move(dir: number): void {
    this.index = (this.index + dir + this.rows.length) % this.rows.length;
    this.confirmReset = false;
    blip('move');
    this.render();
  }

  private change(dir: number): void {
    const row = this.rows[this.index];
    const wasConfirming = this.confirmReset;
    row.change(dir);
    blip(row.value ? 'move' : wasConfirming ? 'deny' : 'confirm');
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const add = (o: Phaser.GameObjects.GameObject) => this.root.add(o);
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.uiPanel, 0.85).fillRoundedRect(180, TOP - 24, GAME_WIDTH - 360, this.rows.length * ROW_H + 74, 8);
    panel.lineStyle(1, COLORS.uiBorder, 0.8).strokeRoundedRect(180, TOP - 24, GAME_WIDTH - 360, this.rows.length * ROW_H + 74, 8);
    add(panel);

    this.rows.forEach((row, i) => {
      const y = TOP + i * ROW_H;
      const selected = i === this.index;
      const color = selected ? COLORS.uiIvory : COLORS.textDim;
      const isReset = !row.value;
      const label = isReset && this.confirmReset ? 'PRESS AGAIN TO CONFIRM' : row.label;
      const labelColor = isReset && this.confirmReset ? `#${COLORS.karmaCursed.toString(16)}` : color;
      const text = this.add.text(220, y, `${selected ? '▶ ' : '  '}${label}`, { fontFamily: mono, fontSize: '18px', color: labelColor })
        .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      text.on('pointerover', () => {
        if (this.index !== i) {
          this.index = i;
          blip('move');
          this.render();
        }
      });
      text.on('pointerdown', () => this.change(1));
      add(text);
      if (row.value) {
        const value = this.add.text(GAME_WIDTH - 250, y, row.value(), { fontFamily: mono, fontSize: '18px', color: selected ? COLORS.text : COLORS.textDim })
          .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
        value.on('pointerdown', () => { this.index = i; this.change(1); });
        add(value);
        for (const [dir, x, symbol] of [[-1, GAME_WIDTH - 310, '◀'], [1, GAME_WIDTH - 190, '▶']] as const) {
          const arrow = this.add.text(x, y, symbol, { fontFamily: mono, fontSize: '18px', color: selected ? COLORS.text : COLORS.textDim })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
          arrow.on('pointerdown', () => { this.index = i; this.change(dir); });
          add(arrow);
        }
      }
    });

    add(this.add.text(GAME_WIDTH / 2, TOP + this.rows.length * ROW_H + 8, this.rows[this.index].hint, {
      fontFamily: mono, fontSize: '13px', color: COLORS.textDim, wordWrap: { width: GAME_WIDTH - 420 }, align: 'center',
    }).setOrigin(0.5, 0));
  }
}
