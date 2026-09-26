import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { events } from '../core/events';
import { TOUCH } from '../core/input';
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
  private starting = false;

  constructor() {
    super('menu');
  }

  create(): void {
    this.starting = false;
    achievements.start();
    this.index = Math.max(0, CHARACTERS.findIndex((c) => !this.locked(c)));
    const frame = this.add.graphics();
    frame.lineStyle(2, COLORS.uiBorder, 0.65);
    frame.lineBetween(170, 84, 790, 84);
    frame.lineBetween(170, 116, 790, 116);
    for (const x of [70, 890]) {
      frame.fillStyle(COLORS.uiBorder, 0.16).fillRect(x, 205, 2, 185);
      frame.fillRect(x - 12, 200, 26, 5).fillRect(x - 12, 390, 26, 5);
    }
    const title = this.add.text(GAME_WIDTH / 2, 48, 'N E K Y I A', {
      fontFamily: 'monospace', fontSize: '52px', color: COLORS.text,
    }).setOrigin(0.5).setShadow(0, 3, '#000000', 8);
    this.tweens.add({ targets: title, alpha: { from: 0.82, to: 1 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(GAME_WIDTH / 2, 100, '✦  A DESCENT THROUGH THE GREEK UNDERWORLD  ✦', {
      fontFamily: 'monospace', fontSize: '14px', color: COLORS.textDim,
    }).setOrigin(0.5);
    this.root = this.add.container(0, 0);
    this.render();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-A', () => this.move(-1));
    kb.on('keydown-D', () => this.move(1));
    kb.on('keydown-R', () => this.reroll());
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

  private reroll(): void {
    this.seed = Rng.randomSeed();
    this.render();
  }

  private start(): void {
    if (this.starting) return;
    const c = CHARACTERS[this.index];
    if (this.locked(c)) {
      this.cameras.main.shake(120, 0.004);
      return;
    }
    if (TOUCH && this.scale.fullscreen.available && !this.scale.isFullscreen) this.scale.startFullscreen();
    this.starting = true;
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

    const c = CHARACTERS[this.index];
    const locked = this.locked(c);
    const cx = GAME_WIDTH / 2;
    const cy = 205;
    const card = this.add.graphics();
    card.fillStyle(COLORS.uiPanel, 0.85).fillRoundedRect(cx - 248, 134, 496, 310, 8);
    card.lineStyle(1, COLORS.uiBorder, 0.8).strokeRoundedRect(cx - 248, 134, 496, 310, 8);
    card.lineStyle(2, c.color, locked ? 0.2 : 0.55).strokeCircle(cx, cy, 55);
    add(card);
    const hit = this.add.rectangle(cx, 134 + 155, 496, 310, 0, 0).setInteractive({ useHandCursor: !locked });
    hit.on('pointerdown', () => this.start());
    add(hit);
    for (const [dir, x, symbol] of [[-1, cx - 290, '◀'], [1, cx + 290, '▶']] as const) {
      const arrow = this.add.text(x, cy, symbol, { fontFamily: mono, fontSize: '36px', color: COLORS.textDim })
        .setOrigin(0.5).setPadding(18, 30, 18, 30).setInteractive({ useHandCursor: true });
      arrow.on('pointerover', () => arrow.setColor(COLORS.uiIvory).setScale(1.15));
      arrow.on('pointerout', () => arrow.setColor(COLORS.textDim).setScale(1));
      arrow.on('pointerdown', () => this.move(dir));
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
    add(this.add.text(cx, cy + 220, `${this.index + 1} / ${CHARACTERS.length}`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim }).setOrigin(0.5, 0));

    const divider = this.add.graphics();
    divider.lineStyle(1, COLORS.uiBorder, 0.7).lineBetween(40, 450, GAME_WIDTH - 40, 450);
    add(divider);
    this.renderChallenges(add);

    const stats = [`RUNS ${save.data.runs}   WINS ${save.data.wins}   BEST ${save.data.bestFloor}`, `KILLS ${save.counter('kills')}`];
    add(this.add.text(40, 124, stats, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim, lineSpacing: 4 }));
    const seedText = this.add.text(40, 158, `SEED ${this.seed}  ↻`, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim })
      .setPadding(0, 4, 8, 4)
      .setInteractive({ useHandCursor: true });
    seedText.on('pointerover', () => seedText.setColor(COLORS.uiIvory));
    seedText.on('pointerout', () => seedText.setColor(COLORS.textDim));
    seedText.on('pointerdown', () => this.reroll());
    add(seedText);

    const controls = TOUCH
      ? ['◀ ▶  CHOOSE', 'TAP CARD  DESCEND', 'TAP SEED  RE-ROLL', 'THUMBS  L MOVE · R SHOOT']
      : ['← →  CHOOSE', 'ENTER  DESCEND', 'R  RE-ROLL', 'WASD MOVE · ARROWS SHOOT'];
    add(this.add.text(GAME_WIDTH - 40, 124, controls, { fontFamily: mono, fontSize: '12px', color: COLORS.textDim, align: 'right', lineSpacing: 4 }).setOrigin(1, 0));
  }

  /** Challenge list under the divider; flows into two columns so it never runs off the bottom. */
  private renderChallenges(add: (o: Phaser.GameObjects.GameObject) => void): void {
    const mono = 'monospace';
    const px = 52;
    const top = 457;
    add(this.add.text(px, top, 'CHALLENGES', { fontFamily: mono, fontSize: '13px', color: COLORS.text }));
    const challenges = ACHIEVEMENTS.filter((a) => !a.secret || save.hasAchievement(a.id));
    const listTop = top + 18;
    const maxY = GAME_HEIGHT - 6;
    const colW = (GAME_WIDTH - 2 * px - 24) / 2;
    let col = 0;
    let py = listTop;
    for (const a of challenges) {
      const done = save.hasAchievement(a.id);
      const reward = a.rewardLabel ? `  → ${a.rewardLabel}` : '';
      const t = this.add.text(px + col * (colW + 24), py, `${done ? '■' : '□'} ${a.title}: ${a.description}${reward}`, {
        fontFamily: mono, fontSize: '11px', color: done ? COLORS.text : COLORS.textDim, wordWrap: { width: colW },
      });
      if (py + t.height > maxY && col === 0) {
        col = 1;
        py = listTop;
        t.setPosition(px + colW + 24, py);
      }
      add(t);
      py += t.height + 1;
    }
  }
}
