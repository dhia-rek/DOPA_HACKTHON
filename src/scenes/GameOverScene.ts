import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
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

    this.add.text(cx, 140, run.won ? 'THE DESCENT ENDS' : 'YOU DIED', { fontFamily: mono, fontSize: '48px', color: '#e04848' }).setOrigin(0.5);
    this.add
      .text(
        cx,
        220,
        [
          `${run.character.name} fell on floor ${run.floor} (${run.stage.name})`,
          `${run.killsThisRun} kills  ·  ${run.items.length} items  ·  ${mins}m ${secs.toString().padStart(2, '0')}s`,
          `seed ${run.seed}`,
        ].join('\n'),
        { fontFamily: mono, fontSize: '18px', color: COLORS.text, align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5, 0);

    run.items.forEach((item, i) => {
      this.add.image(cx - (run.items.length - 1) * 18 + i * 36, 340, `item_${item.id}`);
    });

    this.add.text(cx, GAME_HEIGHT - 60, 'ENTER — back to the menu', { fontFamily: mono, fontSize: '16px', color: COLORS.textDim }).setOrigin(0.5);
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('menu'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('menu'));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }
}
