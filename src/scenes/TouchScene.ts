import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { input, Stick } from '../core/input';

const BASE_R = 58;
const KNOB_R = 26;
const DEAD_ZONE = 0.18;
/** HUD bands the stick ring must not cover (hearts/stats on top, stage/quest/karma below). */
const HUD_TOP = 64;
const HUD_BOTTOM = GAME_HEIGHT - 60;
/** Where each stick sits while nobody is touching it (also its hint ring). */
const REST: Record<Stick, { x: number; y: number; label: string }> = {
  move: { x: 130, y: GAME_HEIGHT - 130, label: 'MOVE' },
  shoot: { x: GAME_WIDTH - 130, y: GAME_HEIGHT - 130, label: 'SHOOT' },
};

interface StickView {
  base: Phaser.GameObjects.Arc;
  knob: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  pointerId: number | null;
  /** Centre of the stick while held: where the finger first landed. */
  ox: number;
  oy: number;
}

/**
 * Floating twin-stick overlay for touch devices. The left half of the screen
 * is the move stick, the right half the shoot stick: the stick appears where
 * the thumb lands, so nothing has to be aimed at. Feeds `input.setStick()`,
 * which the Player already reads, so gameplay code is unaware of touch.
 * Launched with the HUD by RunScene; ignores touches while the run is paused
 * (dialogue open) so taps on the dialogue box never move the hero.
 */
export class TouchScene extends Phaser.Scene {
  private views!: Record<Stick, StickView>;

  constructor() {
    super('touch');
  }

  create(): void {
    this.views = { move: this.makeStick('move'), shoot: this.makeStick('shoot') };

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.releaseAll, this);
  }

  update(): void {
    if (!this.runActive()) this.releaseAll();
  }

  private runActive(): boolean {
    return this.scene.isActive('run') && !this.scene.isPaused('run');
  }

  private makeStick(stick: Stick): StickView {
    const r = REST[stick];
    const base = this.add.circle(r.x, r.y, BASE_R).setStrokeStyle(2, COLORS.uiBorder, 1).setFillStyle(COLORS.uiPanel, 0.35).setAlpha(0.4);
    const knob = this.add.circle(r.x, r.y, KNOB_R, COLORS.uiBorder, 0.8).setAlpha(0.4);
    const label = this.add.text(r.x, r.y - BASE_R - 18, r.label, { fontFamily: 'monospace', fontSize: '12px', color: COLORS.textDim }).setOrigin(0.5, 0).setAlpha(0.6);
    return { base, knob, label, pointerId: null, ox: r.x, oy: r.y };
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.runActive()) return;
    const stick: Stick = p.x < GAME_WIDTH / 2 ? 'move' : 'shoot';
    const v = this.views[stick];
    if (v.pointerId !== null) return;
    v.pointerId = p.id;
    v.ox = Phaser.Math.Clamp(p.x, BASE_R, GAME_WIDTH - BASE_R);
    v.oy = Phaser.Math.Clamp(p.y, HUD_TOP + BASE_R, HUD_BOTTOM - BASE_R);
    v.base.setPosition(v.ox, v.oy).setAlpha(0.85);
    v.knob.setPosition(v.ox, v.oy).setAlpha(0.95);
    v.label.setAlpha(0);
    this.track(stick, p);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.isDown) return;
    const stick = this.stickOf(p);
    if (stick) this.track(stick, p);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const stick = this.stickOf(p);
    if (stick) this.release(stick);
  }

  private stickOf(p: Phaser.Input.Pointer): Stick | null {
    if (this.views.move.pointerId === p.id) return 'move';
    if (this.views.shoot.pointerId === p.id) return 'shoot';
    return null;
  }

  private track(stick: Stick, p: Phaser.Input.Pointer): void {
    const v = this.views[stick];
    let dx = p.x - v.ox;
    let dy = p.y - v.oy;
    const dist = Math.hypot(dx, dy);
    if (dist > BASE_R) {
      // Drag the base along so a thumb that wanders keeps full control.
      const over = dist - BASE_R;
      v.ox += (dx / dist) * over;
      v.oy += (dy / dist) * over;
      v.base.setPosition(v.ox, v.oy);
      dx = p.x - v.ox;
      dy = p.y - v.oy;
    }
    v.knob.setPosition(v.ox + dx, v.oy + dy);
    const mag = Math.min(1, Math.hypot(dx, dy) / BASE_R);
    if (mag < DEAD_ZONE) {
      input.setStick(stick, 0, 0);
      return;
    }
    const scaled = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
    const len = Math.hypot(dx, dy);
    input.setStick(stick, (dx / len) * scaled, (dy / len) * scaled);
  }

  private release(stick: Stick): void {
    const v = this.views[stick];
    const r = REST[stick];
    v.pointerId = null;
    v.ox = r.x;
    v.oy = r.y;
    v.base.setPosition(r.x, r.y).setAlpha(0.4);
    v.knob.setPosition(r.x, r.y).setAlpha(0.4);
    v.label.setAlpha(0.6);
    input.setStick(stick, 0, 0);
  }

  private releaseAll(): void {
    if (!this.views) return;
    if (this.views.move.pointerId !== null) this.release('move');
    if (this.views.shoot.pointerId !== null) this.release('shoot');
  }
}
