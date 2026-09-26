import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BlessingScene } from './scenes/BlessingScene';
import { telemetry } from './core/profile';
import { BootScene } from './scenes/BootScene';
import { BossIntroScene } from './scenes/BossIntroScene';
import { ChallengesScene } from './scenes/ChallengesScene';
import { DialogueScene } from './scenes/DialogueScene';
import { FloorIntroScene } from './scenes/FloorIntroScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { OptionsScene } from './scenes/OptionsScene';
import { RunScene } from './scenes/RunScene';

telemetry.listen();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0a0f',
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, MenuScene, ChallengesScene, OptionsScene, FloorIntroScene, RunScene, HudScene, DialogueScene, BossIntroScene, BlessingScene, GameOverScene],
};

// Phaser rasterises text on canvas, so the web fonts must be ready before the first scene draws.
const fonts = Promise.all(['16px Cinzel', "16px 'Cinzel Decorative'"].map((f) => document.fonts.load(f)));
Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(() => new Phaser.Game(config));
