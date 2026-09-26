import type Phaser from 'phaser';

const KEY = 'nekyia.settings';

export type TextSpeed = 'slow' | 'normal' | 'fast';

export interface Settings {
  /** Camera shake on hits, charges and boss deaths. */
  screenShake: boolean;
  /** Menu / dialogue blips. */
  sfx: boolean;
  /** Dialogue typewriter speed. */
  textSpeed: TextSpeed;
}

/** Typewriter speed in characters per second. */
export const CHARS_PER_SEC: Record<TextSpeed, number> = { slow: 25, normal: 40, fast: 90 };

function defaults(): Settings {
  return { screenShake: true, sfx: true, textSpeed: 'normal' };
}

class SettingsStore {
  data: Settings = defaults();

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      this.data = defaults();
    }
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data[key] = value;
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  reset(): void {
    this.data = defaults();
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  /** Camera shake that respects the screen-shake setting. */
  shake(camera: Phaser.Cameras.Scene2D.Camera, durationMs: number, intensity: number): void {
    if (this.data.screenShake) camera.shake(durationMs, intensity);
  }
}

export const settings = new SettingsStore();
