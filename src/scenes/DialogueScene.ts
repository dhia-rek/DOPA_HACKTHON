import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHARS_PER_SEC, settings } from '../core/settings';
import { blip } from '../core/sfx';
import type { DialogueOption, DialogueScript } from '../dialogue/types';
import { hasRecordedVoice, playRecordedVoice, stopRecordedVoice } from '../voice/clips';
import { voice, voiceSettings } from '../voice/provider';
import type { VoiceProfile } from '../voice/types';
import { mono, display } from './ui';

export interface DialogueSceneData {
  script: DialogueScript;
  /** Called once with the chosen option (null for option-less flavour dialogues). */
  onDone: (option: DialogueOption | null) => void;
  /** Speaks every line and reply with this voice (src/voice); silent if absent. */
  voice?: VoiceProfile;
}

const BOX_H = 200;
const BOX_X = 32;
const PORTRAIT = 120;
const TEXT_X = BOX_X + PORTRAIT + 48;
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
  private voiceTag!: Phaser.GameObjects.Text;
  private fullText = '';
  private shown = 0;
  private typer?: Phaser.Time.TimerEvent;
  /** Speaker has a recorded clip: it plays once on open and replaces per-line TTS. */
  private recorded = false;

  constructor() {
    super('dialogue');
  }

  create(data: DialogueSceneData): void {
    this.data_ = data;
    this.lineIndex = 0;
    this.selected = 0;
    this.phase = 'lines';
    this.optionTexts = [];
    this.typer = undefined;
    this.recorded = hasRecordedVoice(data.script.speakerId);

    const top = GAME_HEIGHT - BOX_H - 16;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.35);
    this.add.rectangle(GAME_WIDTH / 2, top + BOX_H / 2, GAME_WIDTH - 64, BOX_H, 0x0d0b12, 0.96).setStrokeStyle(2, 0xc9a45c);

    this.drawPortrait(BOX_X + 24 + PORTRAIT / 2, top + BOX_H / 2 - 10, data.script);
    this.add.text(BOX_X + 24 + PORTRAIT / 2, top + BOX_H - 30, data.script.speakerName.toUpperCase(), {
      fontFamily: mono, fontSize: '13px', color: COLORS.text, align: 'center', wordWrap: { width: PORTRAIT + 8 },
    }).setOrigin(0.5, 0);

    this.body = this.add.text(TEXT_X, top + 24, '', { fontFamily: mono, fontSize: '17px', color: '#eee', wordWrap: { width: GAME_WIDTH - TEXT_X - 64 }, lineSpacing: 4 });
    this.voiceTag = this.add.text(GAME_WIDTH - 56, top + 10, this.voiceLabel(), { fontFamily: mono, fontSize: '11px', color: COLORS.textDim }).setOrigin(1, 0);
    this.hint = this.add.text(GAME_WIDTH - 56, top + BOX_H - 24, '', { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(1, 0);

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', this.advance, this);
    kb.on('keydown-SPACE', this.advance, this);
    kb.on('keydown-M', () => {
      voiceSettings.enabled = !voiceSettings.enabled;
      if (!voiceSettings.enabled) {
        voice.stop();
        stopRecordedVoice();
      }
      this.voiceTag.setText(this.voiceLabel());
    });
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

    stopRecordedVoice();
    if (this.recorded) playRecordedVoice(data.script.speakerId);
    this.showLine();
  }

  // ---- portrait -----------------------------------------------------------

  private drawPortrait(cx: number, cy: number, script: DialogueScript): void {
    this.add.rectangle(cx, cy, PORTRAIT + 8, PORTRAIT + 8, 0x1a1522).setStrokeStyle(2, 0xc9a45c);
    const key = [`enemy_${script.speakerId}`, `player_${script.speakerId}`].find((k) => this.textures.exists(k))
      ?? this.makePlaceholderPortrait(script);
    const img = this.add.image(cx, cy, key);
    const scale = Math.min((PORTRAIT - 16) / img.width, (PORTRAIT - 16) / img.height);
    img.setScale(scale);
  }

  private makePlaceholderPortrait(script: DialogueScript): string {
    const key = `portrait_${script.speakerId}`;
    if (!this.textures.exists(key)) {
      const hue = [...script.speakerId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
      const color = Phaser.Display.Color.HSLToColor(hue / 360, 0.35, 0.35).color;
      const rt = this.add.renderTexture(0, 0, PORTRAIT, PORTRAIT).setVisible(false);
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color, 1).fillRoundedRect(4, 4, PORTRAIT - 8, PORTRAIT - 8, 10);
      g.lineStyle(3, 0xc9a45c, 1).strokeRoundedRect(4, 4, PORTRAIT - 8, PORTRAIT - 8, 10);
      const letter = this.make.text({
        x: PORTRAIT / 2, y: PORTRAIT / 2,
        text: (script.speakerName[0] ?? '?').toUpperCase(),
        style: { fontFamily: display, fontSize: '64px', color: '#f0e6c8', fontStyle: 'bold' },
      }, false).setOrigin(0.5);
      rt.draw(g).draw(letter).saveTexture(key);
      g.destroy();
      letter.destroy();
      rt.destroy();
    }
    return key;
  }

  // ---- typewriter ---------------------------------------------------------

  private voiceLabel(): string {
    if (!this.data_.voice) return '';
    return voiceSettings.enabled ? `♪ ${this.data_.voice.mood} · M mute` : '♪ muted · M';
  }

  private typeOut(text: string): void {
    if (this.data_.voice && !this.recorded) voice.speak(text, this.data_.voice);
    this.typer?.remove(false);
    this.fullText = text;
    this.shown = 0;
    this.body.setText('');
    this.typer = this.time.addEvent({
      delay: 1000 / CHARS_PER_SEC[settings.data.textSpeed],
      loop: true,
      callback: () => {
        this.shown++;
        this.body.setText(this.fullText.slice(0, this.shown));
        if (this.shown >= this.fullText.length) this.completeLine();
      },
    });
  }

  private get typing(): boolean {
    return this.typer !== undefined && this.shown < this.fullText.length;
  }

  private completeLine(): void {
    this.typer?.remove(false);
    this.typer = undefined;
    this.shown = this.fullText.length;
    this.body.setText(this.fullText);
    this.hint.setText('ENTER ▸');
  }

  // ---- flow ---------------------------------------------------------------

  private showLine(): void {
    this.hint.setText('ENTER ▸▸');
    this.typeOut(this.data_.script.lines[this.lineIndex]);
  }

  private showOptions(): void {
    this.phase = 'options';
    this.body.setText('');
    const top = GAME_HEIGHT - BOX_H - 16 + 28;
    this.data_.script.options.forEach((o, i) => {
      const t = this.add.text(TEXT_X + 8, top + i * 30, `${i + 1}. ${o.text}`, { fontFamily: mono, fontSize: '16px', color: '#ccc' });
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
    blip('move');
    this.paintSelection();
  }

  private advance(): void {
    const { script } = this.data_;
    if (this.typing) {
      this.completeLine();
      return;
    }
    if (this.phase === 'lines') {
      blip('advance');
      this.lineIndex++;
      if (this.lineIndex < script.lines.length) return this.showLine();
      if (script.options.length === 0) return this.finish(null);
      return this.showOptions();
    }
    if (this.phase === 'options') {
      blip('confirm');
      const opt = script.options[this.selected];
      this.optionTexts.forEach((t) => t.destroy());
      this.optionTexts = [];
      if (!opt.reply) return this.finish(opt);
      this.phase = 'reply';
      this.hint.setText('ENTER ▸▸');
      this.typeOut(opt.reply);
      return;
    }
    blip('advance');
    this.finish(script.options[this.selected]);
  }

  private finish(option: DialogueOption | null): void {
    this.typer?.remove(false);
    voice.stop();
    stopRecordedVoice();
    const cb = this.data_.onDone;
    this.scene.stop();
    cb(option);
  }
}
