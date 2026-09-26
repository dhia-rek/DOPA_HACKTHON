import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Trajan-style Roman capitals for everything UI; `display` is the ornate variant for titles. */
export const mono = "'Cinzel', 'Georgia', serif";
export const display = "'Cinzel Decorative', 'Cinzel', serif";

/** Shared chrome for the menu screens: pillars, rules and the pulsing title. */
export function drawTitle(scene: Phaser.Scene, subtitle = '✦  A DESCENT THROUGH THE GREEK UNDERWORLD  ✦'): void {
  const frame = scene.add.graphics();
  frame.lineStyle(2, COLORS.uiBorder, 0.65);
  frame.lineBetween(170, 84, 790, 84);
  frame.lineBetween(170, 116, 790, 116);
  for (const x of [70, 890]) {
    frame.fillStyle(COLORS.uiBorder, 0.16).fillRect(x, 165, 2, 225);
    frame.fillRect(x - 12, 160, 26, 5).fillRect(x - 12, 390, 26, 5);
  }
  const title = scene.add.text(GAME_WIDTH / 2, 48, 'NEKYIA', {
    fontFamily: display, fontSize: '54px', color: COLORS.text, letterSpacing: 10,
  }).setOrigin(0.5).setShadow(0, 3, '#000000', 8);
  scene.tweens.add({ targets: title, alpha: { from: 0.82, to: 1 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  scene.add.text(GAME_WIDTH / 2, 100, subtitle, { fontFamily: mono, fontSize: '14px', color: COLORS.textDim }).setOrigin(0.5);
}

/** Bottom-right control hints. */
export function hintText(scene: Phaser.Scene, lines: string[]): Phaser.GameObjects.Text {
  return scene.add
    .text(GAME_WIDTH - 40, GAME_HEIGHT - 72, lines, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim, align: 'right', lineSpacing: 4 })
    .setOrigin(1, 0);
}

/** Clickable "ESC · BACK" label; also binds ESC on the keyboard. */
export function backButton(scene: Phaser.Scene, onBack: () => void): Phaser.GameObjects.Text {
  const back = scene.add.text(40, GAME_HEIGHT - 72, 'ESC  ·  BACK', { fontFamily: mono, fontSize: '14px', color: COLORS.text })
    .setOrigin(0, 0).setInteractive({ useHandCursor: true });
  back.on('pointerover', () => back.setColor(COLORS.uiIvory));
  back.on('pointerout', () => back.setColor(COLORS.text));
  back.on('pointerdown', onBack);
  scene.input.keyboard!.on('keydown-ESC', onBack);
  return back;
}
