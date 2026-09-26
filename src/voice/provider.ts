import { aiEndpoint } from '../core/ai';
import type { VoiceProfile } from './types';

export interface VoiceProvider {
  /** Speak a line; any previous line is cut off. Never throws. */
  speak(text: string, profile: VoiceProfile): void;
  stop(): void;
}

const STORAGE_KEY = 'nekyia.voice';

/** Voice on/off, persisted. Toggle with M in dialogue. */
export const voiceSettings = {
  get enabled(): boolean {
    return typeof localStorage === 'undefined' || localStorage.getItem(STORAGE_KEY) !== 'off';
  },
  set enabled(on: boolean) {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  },
};

/** Offline voice: the browser's speechSynthesis with a pitch/rate per speaker and mood. */
export class BrowserVoiceProvider implements VoiceProvider {
  speak(text: string, profile: VoiceProfile): void {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
}

/**
 * AI voice: POST {text, voice, mood} to the server's /voice, play the returned
 * audio. Falls back to the browser voice on any error or if the audio takes
 * too long to arrive.
 */
export class HttpVoiceProvider implements VoiceProvider {
  private audio: HTMLAudioElement | null = null;
  private token = 0;
  private readonly cache = new Map<string, string>();
  private static readonly CACHE_MAX = 64;

  constructor(
    private readonly url: string,
    private readonly fallback: VoiceProvider,
    private readonly timeoutMs = 6000,
  ) {}

  speak(text: string, profile: VoiceProfile): void {
    this.stop();
    const token = ++this.token;
    void this.fetchAudio(text, profile)
      .then((src) => {
        if (token !== this.token) return;
        this.audio = new Audio(src);
        return this.audio.play();
      })
      .catch((err) => {
        if (token !== this.token) return;
        console.warn('[voice] falling back to speechSynthesis:', err);
        this.fallback.speak(text, profile);
      });
  }

  stop(): void {
    this.token++;
    this.audio?.pause();
    this.audio = null;
    this.fallback.stop();
  }

  private async fetchAudio(text: string, profile: VoiceProfile): Promise<string> {
    const key = `${profile.speakerId ?? ''}:${profile.voice}:${profile.mood}:${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, speakerId: profile.speakerId, voice: profile.voice, mood: profile.mood }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const src = URL.createObjectURL(await res.blob());
      this.cache.set(key, src);
      while (this.cache.size > HttpVoiceProvider.CACHE_MAX) {
        const [oldKey, oldSrc] = this.cache.entries().next().value as [string, string];
        this.cache.delete(oldKey);
        if (this.audio?.src !== oldSrc) URL.revokeObjectURL(oldSrc);
      }
      return src;
    } finally {
      clearTimeout(timer);
    }
  }
}

class ToggleableVoice implements VoiceProvider {
  constructor(private readonly inner: VoiceProvider) {}

  speak(text: string, profile: VoiceProfile): void {
    if (voiceSettings.enabled) this.inner.speak(text, profile);
  }

  stop(): void {
    this.inner.stop();
  }
}

function createVoiceProvider(): VoiceProvider {
  const browser = new BrowserVoiceProvider();
  const url = aiEndpoint('/voice');
  return new ToggleableVoice(url ? new HttpVoiceProvider(url, browser) : browser);
}

export const voice = createVoiceProvider();
