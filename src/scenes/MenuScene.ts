import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { events } from '../core/events';
import { music } from '../core/music';
import { Rng } from '../core/rng';
import { RunState } from '../core/run';
import { save } from '../core/save';
import { settings } from '../core/settings';
import { blip } from '../core/sfx';
import { ACHIEVEMENTS } from '../data/achievements';
import { CHARACTERS, CharacterDef } from '../data/characters';
import { getItem } from '../data/items';
import { achievements } from '../systems/achievements';
import { drawTitle, hintText, mono } from './ui';

type View = 'main' | 'select';

interface MenuEntry {
  label: () => string;
  run: () => void;
}

/**
 * Title screen: Descend / Challenges / Options. Descend opens the character
 * select (locked characters show their unlock hint; R re-rolls the seed so
 * runs are shareable).
 */
export class MenuScene extends Phaser.Scene {
  private view: View = 'main';
  private menuIndex = 0;
  private charIndex = 0;
  private seed = new URLSearchParams(location.search).get('seed') ?? Rng.randomSeed();
  private root!: Phaser.GameObjects.Container;

  private readonly entries: MenuEntry[] = [
    { label: () => 'DESCEND', run: () => this.setView('select') },
    { label: () => `CHALLENGES  ${ACHIEVEMENTS.filter((a) => save.hasAchievement(a.id)).length} / ${ACHIEVEMENTS.length}`, run: () => this.go('challenges') },
    { label: () => 'OPTIONS', run: () => this.go('options') },
  ];

  constructor() {
    super('menu');
  }

  create(data?: { view?: View }): void {
    music.play('menu', 'menu');
    achievements.start();
    this.view = data?.view ?? 'main';
    this.menuIndex = 0;
    this.charIndex = Math.max(0, CHARACTERS.findIndex((c) => !this.locked(c)));
    drawTitle(this);
    this.root = this.add.container(0, 0);
    this.render();

    const kb = this.input.keyboard!;
    const horizontal = (dir: number) => (this.view === 'select' ? this.moveChar(dir) : undefined);
    const vertical = (dir: number) => (this.view === 'main' ? this.moveMenu(dir) : undefined);
    kb.on('keydown-LEFT', () => horizontal(-1));
    kb.on('keydown-RIGHT', () => horizontal(1));
    kb.on('keydown-A', () => horizontal(-1));
    kb.on('keydown-D', () => horizontal(1));
    kb.on('keydown-UP', () => vertical(-1));
    kb.on('keydown-DOWN', () => vertical(1));
    kb.on('keydown-W', () => vertical(-1));
    kb.on('keydown-S', () => vertical(1));
    kb.on('keydown-R', () => {
      if (this.view !== 'select') return;
      this.seed = Rng.randomSeed();
      blip('move');
      this.render();
    });
    kb.on('keydown-ESC', () => {
      if (this.view === 'select') this.setView('main');
    });
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-SPACE', () => this.confirm());
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private locked(c: CharacterDef): boolean {
    return !!c.unlock && !save.isUnlocked(c.unlock);
  }

  private setView(view: View): void {
    this.view = view;
    blip(view === 'main' ? 'advance' : 'confirm');
    this.render();
  }

  private go(scene: 'challenges' | 'options'): void {
    blip('confirm');
    this.input.keyboard!.removeAllListeners();
    this.scene.start(scene);
  }

  private moveMenu(dir: number): void {
    this.menuIndex = (this.menuIndex + dir + this.entries.length) % this.entries.length;
    blip('move');
    this.render();
  }

  private moveChar(dir: number): void {
    this.charIndex = (this.charIndex + dir + CHARACTERS.length) % CHARACTERS.length;
    blip('move');
    this.render();
  }

  private confirm(): void {
    if (this.view === 'main') this.entries[this.menuIndex].run();
    else this.start();
  }

  private start(): void {
    const c = CHARACTERS[this.charIndex];
    if (this.locked(c)) {
      settings.shake(this.cameras.main, 120, 0.004);
      blip('deny');
      return;
    }
    blip('confirm');
    const run = new RunState(this.seed, c.id);
    this.registry.set('run', run);
    if (import.meta.env.DEV) (window as unknown as { nekyia: unknown }).nekyia = { run, game: this.game };
    achievements.attachRun(run);
    events.emit('run_started', { seed: run.seed, characterId: c.id });
    this.input.keyboard!.removeAllListeners();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('floor_intro'));
  }

  private render(): void {
    this.root.removeAll(true);
    if (this.view === 'main') this.renderMain();
    else this.renderSelect();
  }

  private renderMain(): void {
    const add = (o: Phaser.GameObjects.GameObject) => this.root.add(o);
    const cx = GAME_WIDTH / 2;

    this.entries.forEach((entry, i) => {
      const y = 215 + i * 58;
      const selected = i === this.menuIndex;
      const label = selected ? `▶   ${entry.label()}   ◀` : entry.label();
      const text = this.add.text(cx, y, label, {
        fontFamily: mono, fontSize: selected ? '26px' : '22px', color: selected ? COLORS.uiIvory : COLORS.textDim,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      if (selected) text.setShadow(0, 2, '#000000', 6);
      text.on('pointerover', () => {
        if (this.menuIndex !== i) {
          this.menuIndex = i;
          blip('move');
          this.render();
        }
      });
      text.on('pointerdown', () => entry.run());
      add(text);
    });

    const divider = this.add.graphics();
    divider.lineStyle(1, COLORS.uiBorder, 0.7).lineBetween(40, 450, GAME_WIDTH - 40, 450);
    add(divider);
    const stats = `RUNS ${save.data.runs}   WINS ${save.data.wins}   BEST FLOOR ${save.data.bestFloor}   KILLS ${save.counter('kills')}`;
    add(this.add.text(cx, 470, stats, { fontFamily: mono, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5, 0));
    const unlocked = CHARACTERS.filter((c) => !this.locked(c)).length;
    add(this.add.text(cx, 492, `HEROES ${unlocked} / ${CHARACTERS.length}`, { fontFamily: mono, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5, 0));
    add(hintText(this, ['↑ ↓  CHOOSE', 'ENTER  SELECT']));
  }

  private renderSelect(): void {
    const add = (o: Phaser.GameObjects.GameObject) => this.root.add(o);

    const c = CHARACTERS[this.charIndex];
    const locked = this.locked(c);
    const cx = GAME_WIDTH / 2;
    const cy = 205;
    const card = this.add.graphics();
    card.fillStyle(COLORS.uiPanel, 0.85).fillRoundedRect(cx - 248, 134, 496, 310, 8);
    card.lineStyle(1, COLORS.uiBorder, 0.8).strokeRoundedRect(cx - 248, 134, 496, 310, 8);
    card.lineStyle(2, c.color, locked ? 0.2 : 0.55).strokeCircle(cx, cy, 55);
    add(card);
    for (const [dir, x, symbol] of [[-1, cx - 290, '◀'], [1, cx + 290, '▶']] as const) {
      const arrow = this.add.text(x, cy, symbol, { fontFamily: mono, fontSize: '36px', color: COLORS.textDim })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      arrow.on('pointerover', () => arrow.setColor(COLORS.uiIvory).setScale(1.15));
      arrow.on('pointerout', () => arrow.setColor(COLORS.textDim).setScale(1));
      arrow.on('pointerdown', () => this.moveChar(dir));
      add(arrow);
    }
    const portrait = this.add.image(cx, cy, `player_${c.id}`).setScale(2);
    if (locked) portrait.setTint(0x333333);
    add(portrait);
    this.tweens.add({ targets: portrait, scale: { from: 2.18, to: 2 }, duration: 260, ease: 'Sine.Out' });
    add(this.add.text(cx, cy + 70, locked ? '???' : c.name.toUpperCase(), { fontFamily: mono, fontSize: '28px', color: locked ? COLORS.textDim : COLORS.uiIvory }).setOrigin(0.5));
    add(this.add.text(cx, cy + 100, locked ? `Locked — ${c.unlockHint ?? ''}` : c.title, { fontFamily: mono, fontSize: '15px', color: COLORS.textDim, wordWrap: { width: 450 }, align: 'center' }).setOrigin(0.5));
    if (!locked) {
      add(this.add.text(cx, cy + 128, c.description, { fontFamily: mono, fontSize: '14px', color: COLORS.uiIvory, wordWrap: { width: 450 }, align: 'center' }).setOrigin(0.5, 0));
      const s = c.stats;
      const line = `♥ ${s.maxHp / 2}   dmg ${s.damage}   spd ${s.speed}   rof ${s.fireRate}   range ${s.range}`;
      add(this.add.text(cx, cy + 172, line, { fontFamily: mono, fontSize: '14px', color: COLORS.text }).setOrigin(0.5, 0));
      if (c.startingItems.length) {
        const names = c.startingItems.map((id) => getItem(id).name).join(', ');
        add(this.add.text(cx, cy + 194, `starts with: ${names}`, { fontFamily: mono, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5, 0));
      }
    }
    add(this.add.text(cx, cy + 220, `${this.charIndex + 1} / ${CHARACTERS.length}`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(0.5, 0));

    const divider = this.add.graphics();
    divider.lineStyle(1, COLORS.uiBorder, 0.7).lineBetween(40, 450, GAME_WIDTH - 40, 450);
    add(divider);
    const descend = this.add.text(cx, 478, locked ? 'LOCKED' : 'ENTER  ·  DESCEND', { fontFamily: mono, fontSize: '18px', color: locked ? COLORS.textDim : COLORS.text })
      .setOrigin(0.5).setInteractive({ useHandCursor: !locked });
    descend.on('pointerover', () => !locked && descend.setColor(COLORS.uiIvory));
    descend.on('pointerout', () => !locked && descend.setColor(COLORS.text));
    descend.on('pointerdown', () => this.start());
    add(descend);
    add(this.add.text(cx, 504, `SEED ${this.seed}`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(0.5));

    add(hintText(this, ['← →  CHOOSE     R  RE-ROLL SEED', 'ESC  BACK', 'WASD  MOVE     ARROWS  SHOOT']));
  }
}
