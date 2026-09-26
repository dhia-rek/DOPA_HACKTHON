import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TOUCH } from '../core/input';
import type { RunState } from '../core/run';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover');
  }

  create(): void {
    const run = this.registry.get('run') as RunState;
    const mono = 'monospace';
    const cx = GAME_WIDTH / 2;
    const mins = Math.floor(run.elapsedMs / 60000);
    const secs = Math.floor((run.elapsedMs % 60000) / 1000);

    const frame = this.add.graphics();
    frame.fillStyle(COLORS.uiPanel, 0.9).fillRoundedRect(185, 120, 590, 350, 8);
    frame.lineStyle(2, COLORS.uiBorder).strokeRoundedRect(185, 120, 590, 350, 8);
    frame.lineStyle(1, COLORS.uiBorder, 0.7).lineBetween(260, 217, 700, 217);
    this.add.text(cx, 91, '✦  CHRONICLE OF THE DESCENT  ✦', { fontFamily: mono, fontSize: '15px', color: COLORS.textDim }).setOrigin(0.5);
    const heading = this.add.text(cx, 174, run.won ? 'THE DESCENT ENDS' : 'YOU DIED', {
      fontFamily: mono, fontSize: '44px', color: `#${(run.won ? COLORS.karmaBlessed : COLORS.karmaCursed).toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5).setShadow(0, 3, '#000000', 8);
    this.tweens.add({ targets: heading, alpha: { from: 0.8, to: 1 }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add
      .text(
        cx,
        243,
        [
          `${run.character.name} ${run.won ? 'survived' : 'fell'} on floor ${run.floor} · ${run.stage.name}`,
          `${run.killsThisRun} ${run.killsThisRun === 1 ? 'kill' : 'kills'}  ·  ${run.items.length} ${run.items.length === 1 ? 'item' : 'items'}  ·  ${mins}m ${secs.toString().padStart(2, '0')}s`,
          `seed ${run.seed}`,
        ].join('\n'),
        { fontFamily: mono, fontSize: '17px', color: COLORS.uiIvory, align: 'center', lineSpacing: 12 },
      )
      .setOrigin(0.5, 0);

    this.add.text(cx, 356, `RELICS  ${run.items.length}`, { fontFamily: mono, fontSize: '13px', color: COLORS.text }).setOrigin(0.5);
    const shown = run.items.slice(0, 12);
    shown.forEach((item, i) => {
      this.add.image(cx - (shown.length - 1) * 17 + i * 34, 395, `item_${item.id}`);
    });
    if (run.items.length > shown.length) {
      this.add.text(cx, 432, `+ ${run.items.length - shown.length} more`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(0.5);
    }

    const back = this.add.text(cx, GAME_HEIGHT - 53, `${TOUCH ? 'TAP' : 'ENTER'}  ·  RETURN TO THE SURFACE`, {
      fontFamily: mono, fontSize: '16px', color: COLORS.text,
    }).setOrigin(0.5).setPadding(16, 10, 16, 10).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(COLORS.uiIvory));
    back.on('pointerout', () => back.setColor(COLORS.text));
    back.on('pointerdown', () => this.scene.start('menu'));
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('menu'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('menu'));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }
}
