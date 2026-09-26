/**
 * Game-wide key state that survives scene restarts (Phaser Key objects are
 * per-scene and only learn a key is down on the next keydown, so holding a
 * key while walking through a door would otherwise stop you dead in the next
 * room). Also the single place to change bindings or add gamepad support.
 *
 * Touch devices drive the same axes through `input.setStick()` (see
 * `TouchScene`), so gameplay code never needs to know which one is in use.
 */
export type Action = 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'shootUp' | 'shootDown' | 'shootLeft' | 'shootRight';
export type Stick = 'move' | 'shoot';

export const BINDINGS: Record<Action, string[]> = {
  moveUp: ['KeyW'],
  moveDown: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  shootUp: ['ArrowUp', 'KeyI'],
  shootDown: ['ArrowDown', 'KeyK'],
  shootLeft: ['ArrowLeft', 'KeyJ'],
  shootRight: ['ArrowRight', 'KeyL'],
};

const down = new Set<string>();
const sticks: Record<Stick, { x: number; y: number }> = { move: { x: 0, y: 0 }, shoot: { x: 0, y: 0 } };

/** `?touch=1` / `?touch=0` force the touch UI on or off (handy for desktop testing). */
function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/** True when the game should show touch controls and touch-worded hints. */
export const TOUCH = detectTouch();

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => down.add(e.code));
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => {
    down.clear();
    input.clearSticks();
  });
}

export const input = {
  isDown(action: Action): boolean {
    return BINDINGS[action].some((code) => down.has(code));
  },
  axis(neg: Action, pos: Action): number {
    return (input.isDown(neg) ? -1 : 0) + (input.isDown(pos) ? 1 : 0);
  },
  /** Virtual stick vector in [-1, 1]²; (0, 0) releases it. Keyboard wins while a key is held. */
  setStick(stick: Stick, x: number, y: number): void {
    sticks[stick].x = x;
    sticks[stick].y = y;
  },
  clearSticks(): void {
    input.setStick('move', 0, 0);
    input.setStick('shoot', 0, 0);
  },
  moveAxes(): { x: number; y: number } {
    const kx = input.axis('moveLeft', 'moveRight');
    const ky = input.axis('moveUp', 'moveDown');
    return kx || ky ? { x: kx, y: ky } : { ...sticks.move };
  },
  shootAxes(): { x: number; y: number } {
    const kx = input.axis('shootLeft', 'shootRight');
    const ky = input.axis('shootUp', 'shootDown');
    return kx || ky ? { x: kx, y: ky } : { ...sticks.shoot };
  },
};
