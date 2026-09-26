import Phaser from 'phaser';
import { ART_SCALE } from '../art/manifest';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { events } from '../core/events';
import { Rng } from '../core/rng';
import { RunState } from '../core/run';
import { save } from '../core/save';
import { ACHIEVEMENTS } from '../data/achievements';
import { CHARACTERS, CharacterDef } from '../data/characters';
import { getItem } from '../data/items';
import { achievements } from '../systems/achievements';

/**
 * Title + character select + challenge list. Locked characters show their
 * unlock hint; the seed can be re-rolled with R so runs are shareable.
 */
export class MenuScene extends Phaser.Scene {
  private index = 0;
  private seed = new URLSearchParams(location.search).get('seed') ?? Rng.randomSeed();
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super('menu');
  }

  create(): void {
    achievements.start();
    this.index = Math.max(0, CHARACTERS.findIndex((c) => !this.locked(c)));
    if (this.textures.exists('menu_bg')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'menu_bg').setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
      // Darken so the text reads; heaviest at the bottom where the lists are.
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0a0f, 0.45);
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 90, GAME_WIDTH, 180, 0x0b0a0f, 0.5);
    }
    this.root = this.add.container(0, 0);
    this.render();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-A', () => this.move(-1));
    kb.on('keydown-D', () => this.move(1));
    kb.on('keydown-R', () => {
      this.seed = Rng.randomSeed();
      this.render();
    });
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-SPACE', () => this.start());
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private locked(c: CharacterDef): boolean {
    return !!c.unlock && !save.isUnlocked(c.unlock);
  }

  private move(dir: number): void {
    this.index = (this.index + dir + CHARACTERS.length) % CHARACTERS.length;
    this.render();
  }

  private start(): void {
    const c = CHARACTERS[this.index];
    if (this.locked(c)) {
      this.cameras.main.shake(120, 0.004);
      return;
    }
    const run = new RunState(this.seed, c.id);
    this.registry.set('run', run);
    if (import.meta.env.DEV) (window as unknown as { nekyia: unknown }).nekyia = { run, game: this.game };
    achievements.attachRun(run);
    events.emit('run_started', { seed: run.seed, characterId: c.id });
    this.input.keyboard!.removeAllListeners();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('run', {}));
  }

  private render(): void {
    this.root.removeAll(true);
    const mono = 'monospace';
    const add = (o: Phaser.GameObjects.GameObject) => this.root.add(o);

    add(this.add.text(GAME_WIDTH / 2, 48, 'N E K Y I A', { fontFamily: mono, fontSize: '52px', color: '#e8dcc0', stroke: '#1a1410', strokeThickness: 8 }).setOrigin(0.5));
    add(this.add.text(GAME_WIDTH / 2, 100, 'a descent through the Greek underworld', { fontFamily: mono, fontSize: '16px', color: COLORS.text, stroke: '#1a1410', strokeThickness: 4 }).setOrigin(0.5));

    // Character carousel.
    const c = CHARACTERS[this.index];
    const locked = this.locked(c);
    const cx = GAME_WIDTH / 2;
    const cy = 205;
    add(this.add.text(cx - 200, cy, '◀', { fontFamily: mono, fontSize: '40px', color: COLORS.textDim }).setOrigin(0.5));
    add(this.add.text(cx + 200, cy, '▶', { fontFamily: mono, fontSize: '40px', color: COLORS.textDim }).setOrigin(0.5));
    add(this.add.rectangle(cx, cy + 68, 600, 262, 0x0b0a0f, 0.55).setStrokeStyle(2, 0xc9a45c, 0.35));
    add(this.add.image(cx, cy + 44, 'shadow').setScale(1.6, 1.1).setAlpha(0.8));
    const portrait = this.textures.exists(`portrait_${c.id}`)
      ? this.add.image(cx, cy, `portrait_${c.id}`).setScale(1 / ART_SCALE)
      : this.add.image(cx, cy, `player_${c.id}`).setScale(2);
    if (locked) portrait.setTint(0x333333);
    add(portrait);
    add(this.add.text(cx, cy + 70, locked ? '???' : c.name, { fontFamily: mono, fontSize: '30px', color: locked ? '#666' : '#fff', stroke: '#1a1410', strokeThickness: 6 }).setOrigin(0.5));
    add(this.add.text(cx, cy + 100, locked ? `Locked — ${c.unlockHint ?? ''}` : c.title, { fontFamily: mono, fontSize: '15px', color: COLORS.textDim }).setOrigin(0.5));
    if (!locked) {
      add(this.add.text(cx, cy + 128, c.description, { fontFamily: mono, fontSize: '14px', color: '#bbb', wordWrap: { width: 520 }, align: 'center' }).setOrigin(0.5, 0));
      const s = c.stats;
      const line = `♥ ${s.maxHp / 2}   dmg ${s.damage}   spd ${s.speed}   rof ${s.fireRate}   range ${s.range}`;
      add(this.add.text(cx, cy + 172, line, { fontFamily: mono, fontSize: '14px', color: COLORS.text }).setOrigin(0.5, 0));
      if (c.startingItems.length) {
        const names = c.startingItems.map((id) => getItem(id).name).join(', ');
        add(this.add.text(cx, cy + 194, `starts with: ${names}`, { fontFamily: mono, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5, 0));
      }
    }
    add(this.add.text(cx, cy + 226, `${this.index + 1} / ${CHARACTERS.length}`, { fontFamily: mono, fontSize: '12px', color: '#555' }).setOrigin(0.5, 0));

    // Challenges panel.
    const px = 40;
    let py = GAME_HEIGHT - 160;
    add(this.add.text(px, py, 'CHALLENGES', { fontFamily: mono, fontSize: '14px', color: COLORS.text }));
    py += 22;
    for (const a of ACHIEVEMENTS) {
      const done = save.hasAchievement(a.id);
      if (a.secret && !done) continue;
      const mark = done ? '■' : '□';
      const reward = a.rewardLabel ? `  → ${a.rewardLabel}` : '';
      add(this.add.text(px, py, `${mark} ${a.title}: ${a.description}${reward}`, { fontFamily: mono, fontSize: '12px', color: done ? '#ffe08a' : '#777' }));
      py += 16;
    }

    const stats = `runs ${save.data.runs}   wins ${save.data.wins}   best floor ${save.data.bestFloor}   kills ${save.counter('kills')}`;
    add(this.add.text(GAME_WIDTH - 40, GAME_HEIGHT - 160, stats, { fontFamily: mono, fontSize: '12px', color: '#777' }).setOrigin(1, 0));
    add(this.add.text(GAME_WIDTH - 40, GAME_HEIGHT - 138, `seed ${this.seed}   (R to re-roll)`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(1, 0));

    add(
      this.add
        .text(GAME_WIDTH - 40, GAME_HEIGHT - 100, ['← →  choose', 'ENTER  start', 'WASD  move', 'ARROWS  shoot'], {
          fontFamily: mono,
          fontSize: '13px',
          color: COLORS.textDim,
          align: 'right',
          lineSpacing: 4,
        })
        .setOrigin(1, 0),
    );
  }
}
