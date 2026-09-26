import Phaser from 'phaser';
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
    this.add.text(cx, 110, run.won ? 'THE DESCENT ENDS' : 'YOU DIED', { fontFamily: mono, fontSize: '48px', color: '#e04848' }).setOrigin(0.5);
    this.add.text(cx, 160, verdict.title, { fontFamily: mono, fontSize: '22px', color: run.currentFront.def.faction === 'olympian' ? '#c9a45c' : '#e07a3a' }).setOrigin(0.5);
    this.add
      .text(cx, 190, verdict.body, { fontFamily: mono, fontSize: '15px', color: COLORS.textDim, align: 'center', wordWrap: { width: 720 }, lineSpacing: 4 })
      .setOrigin(0.5, 0);
    this.add
      .text(
        cx,
        250,
        [
          `${run.character.name} fell on floor ${run.floor} (${run.currentFront.stageName})`,
          `${run.killsThisRun} kills  ·  ${run.items.length} items  ·  ${mins}m ${secs.toString().padStart(2, '0')}s`,
          `seed ${run.seed}`,
          ...run.story.shades.slice(-4).map((s) => `\u2020 ${s.epitaph}`),
        ].join('\n'),
        { fontFamily: mono, fontSize: '18px', color: COLORS.text, align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5, 0);

    run.items.forEach((item, i) => {
      this.add.image(cx - (run.items.length - 1) * 18 + i * 36, 380 + Math.min(4, run.story.shades.length) * 26, `item_${item.id}`);
    });

    this.add.text(cx, GAME_HEIGHT - 60, 'ENTER — back to the menu', { fontFamily: mono, fontSize: '16px', color: COLORS.textDim }).setOrigin(0.5);
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('menu'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('menu'));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }
}
