import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { RunState } from '../core/run';
import type { FloorDirective } from '../director/types';
import { getMutator } from '../data/mutators';
import { getGod } from '../data/gods';
import { questTracker } from '../systems/quests';
import { director, DIRECTOR_DEBUG } from '../systems/director';

const mono = 'monospace';

/**
 * Between floors: waits for the Director's verdict on the player so far, applies
 * it to the run (before the floor is generated) and shows the floor title, the
 * verdict and the omens, then hands over to RunScene.
 */
export class FloorIntroScene extends Phaser.Scene {
  constructor() {
    super('floor_intro');
  }

  create(): void {
    const run = this.registry.get('run') as RunState;
    this.cameras.main.setBackgroundColor('#07060a');
    this.cameras.main.fadeIn(200, 0, 0, 0);
    const cx = GAME_WIDTH / 2;
    const waiting = this.add.text(cx, GAME_HEIGHT / 2, `The Fates weigh your deeds…`, { fontFamily: mono, fontSize: '18px', color: COLORS.textDim }).setOrigin(0.5);
    this.tweens.add({ targets: waiting, alpha: { from: 0.4, to: 1 }, duration: 700, yoyo: true, repeat: -1 });

    void director.forFloor(run, run.floor).then(async (directive) => {
      if (!this.scene.isActive('floor_intro')) return;
      run.directive = directive;
      run.story.settleProphecies(run.floor, directive);
      questTracker.offer(run, directive);
      await run.omens.load(run.omenRequest(run.floor));
      if (!this.scene.isActive('floor_intro')) return;
      waiting.destroy();
      this.show(run, directive);
    });
  }

  private show(run: RunState, d: FloorDirective): void {
    const cx = GAME_WIDTH / 2;
    const stageName = run.stage.name;
    const omens = d.mutators.map((m) => getMutator(m)).filter((m) => m && m.id !== 'palette_shift');
    const god = run.story.patron;

    const lines: Phaser.GameObjects.GameObject[] = [];
    lines.push(this.add.text(cx, 96, `FLOOR ${run.floor}  ·  ${stageName.toUpperCase()}`, { fontFamily: mono, fontSize: '14px', color: COLORS.textDim }).setOrigin(0.5));
    lines.push(
      this.add.text(cx, 150, d.floorTitle, { fontFamily: mono, fontSize: '40px', color: COLORS.text, align: 'center', wordWrap: { width: 820 } }).setOrigin(0.5).setShadow(0, 3, '#000000', 8),
    );
    lines.push(
      this.add.text(cx, 236, `“${d.verdict}”`, { fontFamily: mono, fontSize: '19px', color: COLORS.uiIvory, align: 'center', wordWrap: { width: 760 }, lineSpacing: 6 }).setOrigin(0.5, 0),
    );
    let y = 340;
    if (d.epithet) {
      lines.push(this.add.text(cx, y, `They call you ${run.character.name} ${d.epithet}.`, { fontFamily: mono, fontSize: '16px', color: '#ffe08a' }).setOrigin(0.5));
      y += 30;
    }
    if (omens.length) {
      const text = omens.map((m) => `${m!.name}${m!.god ? ` (${getGod(m!.god).name})` : ''}`).join('   ·   ');
      lines.push(this.add.text(cx, y, `Omens:  ${text}`, { fontFamily: mono, fontSize: '15px', color: COLORS.textDim, align: 'center', wordWrap: { width: 800 } }).setOrigin(0.5));
      y += 30;
    }
    if (d.modifier) {
      lines.push(this.add.text(cx, y, d.modifier.label, { fontFamily: mono, fontSize: '15px', color: '#9fd8a0' }).setOrigin(0.5));
      y += 30;
    }
    if (d.quest) {
      lines.push(this.add.text(cx, y, `Quest — ${d.quest.hook}`, { fontFamily: mono, fontSize: '15px', color: '#8fd0ff', align: 'center', wordWrap: { width: 800 } }).setOrigin(0.5));
      y += 30;
    }
    if (god) {
      lines.push(this.add.text(cx, y, `${getGod(god).name} is watching.`, { fontFamily: mono, fontSize: '14px', color: COLORS.textDim }).setOrigin(0.5));
      y += 26;
    }
    lines.push(
      this.add.text(cx, y + 12, `Below waits ${d.boss.title}${d.boss.grudge ? ` — “${d.boss.grudge}”` : ''}`, { fontFamily: mono, fontSize: '14px', color: '#e08080', align: 'center', wordWrap: { width: 800 } }).setOrigin(0.5, 0),
    );
    if (DIRECTOR_DEBUG) {
      this.add.text(16, GAME_HEIGHT - 120, `[director] ${d.reason}\nabilities ${d.boss.abilities.join(', ')} · weakness ${d.boss.weakness} · spent ${d.spent}`, {
        fontFamily: mono, fontSize: '12px', color: '#6a8a6a', wordWrap: { width: GAME_WIDTH - 32 },
      });
    }
    for (const [i, o] of lines.entries()) {
      const t = o as Phaser.GameObjects.Text;
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 120 * i, duration: 350 });
    }

    const go = (): void => {
      if (!this.scene.isActive('floor_intro')) return;
      this.input.keyboard!.removeAllListeners();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('run', {}));
    };
    const hint = this.add.text(cx, GAME_HEIGHT - 40, 'ENTER  ·  DESCEND', { fontFamily: mono, fontSize: '15px', color: COLORS.text }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: hint, alpha: 1, delay: 900, duration: 300 });
    this.input.keyboard!.once('keydown-ENTER', go);
    this.input.keyboard!.once('keydown-SPACE', go);
    this.input.once('pointerdown', go);
    this.time.delayedCall(9000, go);
  }
}
