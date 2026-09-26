import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { DialogueOption, DialogueScript } from '../dialogue/types';

export interface DialogueSceneData {
  script: DialogueScript;
  /** Called once with the chosen option (null for option-less flavour dialogues). */
  onDone: (option: DialogueOption | null) => void;
}

const mono = 'monospace';
const BOX_H = 200;

/**
 * Overlay that shows a DialogueScript: speaker lines (ENTER to advance), then
 * numbered options (1-4 or ↑↓ + ENTER). The scene that launched it is expected
 * to pause itself and resume in onDone.
 */
export class DialogueScene extends Phaser.Scene {
  private data_!: DialogueSceneData;
  private lineIndex = 0;
  private selected = 0;
  private phase: 'lines' | 'options' | 'reply' = 'lines';
  private body!: Phaser.GameObjects.Text;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('dialogue');
  }

  create(data: DialogueSceneData): void {
    this.data_ = data;
    this.lineIndex = 0;
    this.selected = 0;
    this.phase = 'lines';
    this.optionTexts = [];

    const top = GAME_HEIGHT - BOX_H - 16;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.35);
    this.add.rectangle(GAME_WIDTH / 2, top + BOX_H / 2, GAME_WIDTH - 64, BOX_H, 0x0d0b12, 0.96).setStrokeStyle(2, 0xc9a45c);
    this.add.text(56, top + 12, data.script.speakerName.toUpperCase(), { fontFamily: mono, fontSize: '14px', color: COLORS.text });
    this.body = this.add.text(56, top + 40, '', { fontFamily: mono, fontSize: '17px', color: '#eee', wordWrap: { width: GAME_WIDTH - 140 }, lineSpacing: 4 });
    this.hint = this.add.text(GAME_WIDTH - 56, top + BOX_H - 24, '', { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(1, 0);

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', this.advance, this);
    kb.on('keydown-SPACE', this.advance, this);
    kb.on('keydown-UP', () => this.moveSel(-1));
    kb.on('keydown-DOWN', () => this.moveSel(1));
    for (let i = 1; i <= 4; i++) {
      kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR'][i - 1]}`, () => {
        if (this.phase === 'options' && i - 1 < this.data_.script.options.length) {
          this.selected = i - 1;
          this.advance();
        }
      });
    }

    this.showLine();
  }

  private showLine(): void {
    this.body.setText(this.data_.script.lines[this.lineIndex]);
    this.hint.setText('ENTER ▸');
  }

  private showOptions(): void {
    this.phase = 'options';
    this.body.setText('');
    const top = GAME_HEIGHT - BOX_H - 16 + 44;
    this.data_.script.options.forEach((o, i) => {
      const t = this.add.text(72, top + i * 30, `${i + 1}. ${o.text}`, { fontFamily: mono, fontSize: '16px', color: '#ccc' });
      this.optionTexts.push(t);
    });
    this.hint.setText('↑↓ / 1-4 choose · ENTER confirm');
    this.paintSelection();
  }

  private paintSelection(): void {
    this.optionTexts.forEach((t, i) => t.setColor(i === this.selected ? COLORS.text : '#999').setText(`${i === this.selected ? '▸' : ' '} ${i + 1}. ${this.data_.script.options[i].text}`));
  }

  private moveSel(d: number): void {
    if (this.phase !== 'options') return;
    const n = this.data_.script.options.length;
    this.selected = (this.selected + d + n) % n;
    this.paintSelection();
  }

  private advance(): void {
    const { script } = this.data_;
    if (this.phase === 'lines') {
      this.lineIndex++;
      if (this.lineIndex < script.lines.length) return this.showLine();
      if (script.options.length === 0) return this.finish(null);
      return this.showOptions();
    }
    if (this.phase === 'options') {
      const opt = script.options[this.selected];
      this.optionTexts.forEach((t) => t.destroy());
      this.optionTexts = [];
      if (!opt.reply) return this.finish(opt);
      this.phase = 'reply';
      this.body.setText(opt.reply);
      this.hint.setText('ENTER ▸');
      return;
    }
    this.finish(script.options[this.selected]);
  }

  private finish(option: DialogueOption | null): void {
    const cb = this.data_.onDone;
    this.scene.stop();
    cb(option);
  }
}
