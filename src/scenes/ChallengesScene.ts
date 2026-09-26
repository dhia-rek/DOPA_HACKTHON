import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { TOUCH } from '../core/input';
import { save } from '../core/save';
import { blip } from '../core/sfx';
import { ACHIEVEMENTS, KRATOS_STEPS } from '../data/achievements';
import { backButton, drawTitle, hintText, mono } from './ui';

const TOP = 128;
const ROW_H = 27;

/** Full list of achievements with earned / locked state and their rewards. */
export class ChallengesScene extends Phaser.Scene {
  constructor() {
    super('challenges');
  }

  create(): void {
    drawTitle(this, '✦  CHALLENGES  ✦');
    const cx = GAME_WIDTH / 2;
    const earned = ACHIEVEMENTS.filter((a) => save.hasAchievement(a.id)).length;
    const kratos = KRATOS_STEPS.filter((id) => save.hasAchievement(id)).length;

    const panelH = ACHIEVEMENTS.length * ROW_H + 52;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.uiPanel, 0.85).fillRoundedRect(60, TOP - 10, GAME_WIDTH - 120, panelH, 8);
    panel.lineStyle(1, COLORS.uiBorder, 0.8).strokeRoundedRect(60, TOP - 10, GAME_WIDTH - 120, panelH, 8);
    panel.lineStyle(1, COLORS.uiBorder, 0.5).lineBetween(80, TOP + 22, GAME_WIDTH - 80, TOP + 22);

    this.add.text(80, TOP, `${earned} / ${ACHIEVEMENTS.length} EARNED`, { fontFamily: mono, fontSize: '13px', color: COLORS.text });
    this.add.text(GAME_WIDTH - 80, TOP, `GHOST OF SPARTA  ${kratos} / ${KRATOS_STEPS.length}`, {
      fontFamily: mono, fontSize: '13px', color: kratos === KRATOS_STEPS.length ? COLORS.uiIvory : COLORS.textDim,
    }).setOrigin(1, 0);

    ACHIEVEMENTS.forEach((a, i) => {
      const y = TOP + 36 + i * ROW_H;
      const done = save.hasAchievement(a.id);
      const hidden = !!a.secret && !done;
      const color = done ? COLORS.uiIvory : COLORS.textDim;
      this.add.text(80, y, done ? '■' : '□', { fontFamily: mono, fontSize: '15px', color: done ? COLORS.text : COLORS.textDim });
      this.add.text(104, y, hidden ? '???' : a.title.toUpperCase(), { fontFamily: mono, fontSize: '14px', color });
      this.add.text(265, y + 2, hidden ? 'A hidden challenge. Its nature is revealed once earned.' : a.description, {
        fontFamily: mono, fontSize: '11px', color: done ? COLORS.text : COLORS.textDim, wordWrap: { width: a.rewardLabel ? 420 : 600 },
      });
      if (a.rewardLabel && !hidden) {
        this.add.text(GAME_WIDTH - 80, y + 2, `→ ${a.rewardLabel}`, { fontFamily: mono, fontSize: '11px', color: done ? COLORS.uiIvory : COLORS.textDim }).setOrigin(1, 0);
      }
    });

    this.add.text(cx, TOP + panelH + 2, `RUNS ${save.data.runs}   WINS ${save.data.wins}   BEST FLOOR ${save.data.bestFloor}   KILLS ${save.counter('kills')}   INNOCENTS SPARED ${save.counter('npc_spares')}   SLAIN ${save.counter('npc_kills')}`, {
      fontFamily: mono, fontSize: '12px', color: COLORS.textDim,
    }).setOrigin(0.5, 0);

    const back = () => {
      blip('advance');
      this.input.keyboard!.removeAllListeners();
      this.scene.start('menu');
    };
    backButton(this, back);
    this.input.keyboard!.on('keydown-ENTER', back);
    hintText(this, TOUCH ? ['■ EARNED    □ LOCKED'] : ['■ EARNED    □ LOCKED', 'ESC / ENTER  BACK']);
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }
}
