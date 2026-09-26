import Phaser from 'phaser';
import { ART_SCALE } from '../art/manifest';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { RunState } from '../core/run';
import { judge } from '../data/war';

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
    const verdict = judge(run.story.tide, run.story.karma, run.story.shades.length, run.character.name, run.won);

    const frame = this.add.graphics();
    frame.fillStyle(COLORS.uiPanel, 0.9).fillRoundedRect(185, 100, 590, 395, 8);
    frame.lineStyle(2, COLORS.uiBorder).strokeRoundedRect(185, 100, 590, 395, 8);
    frame.lineStyle(1, COLORS.uiBorder, 0.7).lineBetween(260, 202, 700, 202);
    this.add.text(cx, 76, '✦  CHRONICLE OF THE DESCENT  ✦', { fontFamily: mono, fontSize: '15px', color: COLORS.textDim }).setOrigin(0.5);
    const heading = this.add.text(cx, 140, 'YOU DIED', {
      fontFamily: mono, fontSize: '44px', color: `#${(run.won ? COLORS.karmaBlessed : COLORS.karmaCursed).toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5).setShadow(0, 3, '#000000', 8);
    this.tweens.add({ targets: heading, alpha: { from: 0.8, to: 1 }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(cx, 182, verdict.title, { fontFamily: mono, fontSize: '20px', color: run.currentFront.def.faction === 'olympian' ? '#c9a45c' : '#e07a3a' }).setOrigin(0.5);
    const body = this.add
      .text(cx, 212, verdict.body, { fontFamily: mono, fontSize: '14px', color: COLORS.textDim, align: 'center', wordWrap: { width: 540 }, lineSpacing: 3 })
      .setOrigin(0.5, 0);
    const stats = this.add
      .text(
        cx,
        body.y + body.height + 14,
        [
          `${run.character.name} fell on floor ${run.floor} · ${run.currentFront.stageName}${run.won ? ' · Nostos achieved' : ''}`,
          `${run.killsThisRun} ${run.killsThisRun === 1 ? 'kill' : 'kills'}  ·  ${run.items.length} ${run.items.length === 1 ? 'item' : 'items'}  ·  ${mins}m ${secs.toString().padStart(2, '0')}s`,
          `seed ${run.seed}`,
          ...run.story.shades.slice(-2).map((s) => `\u2020 ${s.epitaph}`),
        ].join('\n'),
        { fontFamily: mono, fontSize: '16px', color: COLORS.uiIvory, align: 'center', lineSpacing: 6, wordWrap: { width: 560 } },
      )
      .setOrigin(0.5, 0);

    const relicsY = stats.y + stats.height + 16;
    this.add.text(cx, relicsY, `RELICS  ${run.items.length}`, { fontFamily: mono, fontSize: '13px', color: COLORS.text }).setOrigin(0.5);
    const shown = run.items.slice(0, 12);
    shown.forEach((item, i) => {
      this.add.image(cx - (shown.length - 1) * 17 + i * 34, relicsY + 34, `item_${item.id}`).setScale(1 / ART_SCALE);
    });
    if (run.items.length > shown.length) {
      this.add.text(cx, relicsY + 64, `+ ${run.items.length - shown.length} more`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(0.5);
    }

    const back = this.add.text(cx, GAME_HEIGHT - 40, 'ENTER  ·  RETURN TO THE SURFACE', {
      fontFamily: mono, fontSize: '16px', color: COLORS.text,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(COLORS.uiIvory));
    back.on('pointerout', () => back.setColor(COLORS.text));
    back.on('pointerdown', () => this.scene.start('menu'));
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('menu'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('menu'));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }
}
