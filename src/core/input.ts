/**
 * Game-wide key state that survives scene restarts (Phaser Key objects are
 * per-scene and only learn a key is down on the next keydown, so holding a
 * key while walking through a door would otherwise stop you dead in the next
 * room). Also the single place to change bindings or add gamepad support.
 */

export type Action = 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'shootUp' | 'shootDown' | 'shootLeft' | 'shootRight';

/** KeyboardEvent.code values bound to each action. Edit to rebind. */
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

if (typeof window !== 'undefined') {
  // No preventDefault here: Phaser drops events that were already prevented,
  // which would break its own keydown-* listeners. Scroll capture is done via
  // keyboard.addCapture in BootScene instead.
  window.addEventListener('keydown', (e) => down.add(e.code));
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
}

export const input = {
  isDown(action: Action): boolean {
    return BINDINGS[action].some((code) => down.has(code));
  },
  /** -1..1 on each axis for the given pair of actions. */
  axis(neg: Action, pos: Action): number {
    return (input.isDown(neg) ? -1 : 0) + (input.isDown(pos) ? 1 : 0);
  },
  moveAxes(): { x: number; y: number } {
    return { x: input.axis('moveLeft', 'moveRight'), y: input.axis('moveUp', 'moveDown') };
  },
  shootAxes(): { x: number; y: number } {
    return { x: input.axis('shootLeft', 'shootRight'), y: input.axis('shootUp', 'shootDown') };
  },
};
