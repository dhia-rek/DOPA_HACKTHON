import { directorRequest } from '../core/profile';
import type { RunState } from '../core/run';
import { directorProvider } from '../director/provider';
import type { FloorDirective } from '../director/types';

/**
 * Asks the Director for a floor's directive at most once per run+floor and
 * keeps the promise so the boss room can prefetch the next floor while the
 * player fights; FloorIntroScene then awaits the same promise.
 */
class DirectorRuntime {
  private readonly pending = new Map<string, Promise<FloorDirective>>();

  /** Fire-and-forget warm-up for `floor` (call when the player reaches the boss room). */
  prefetch(run: RunState, floor: number): void {
    void this.forFloor(run, floor);
  }

  forFloor(run: RunState, floor: number): Promise<FloorDirective> {
    const req = directorRequest(run, floor);
    const key = req.seed;
    let p = this.pending.get(key);
    if (!p) {
      p = directorProvider.direct(req);
      this.pending.set(key, p);
      p.catch(() => this.pending.delete(key));
    }
    return p;
  }
}

export const director = new DirectorRuntime();

/** `?director=1` shows the Director's reasoning on the floor intro (debug / demo). */
export const DIRECTOR_DEBUG = new URLSearchParams(location.search).get('director') === '1';
