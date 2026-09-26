import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { TOUCH } from './core/input';
import { BootScene } from './scenes/BootScene';
import { DialogueScene } from './scenes/DialogueScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { RunScene } from './scenes/RunScene';
import { TouchScene } from './scenes/TouchScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0a0f',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    // mouse + two thumbs (move and shoot sticks) at once
    activePointers: 3,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, MenuScene, RunScene, HudScene, TouchScene, DialogueScene, GameOverScene],
});

if (TOUCH) {
  const orient = () => document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
  window.addEventListener('resize', orient);
  orient();
}
