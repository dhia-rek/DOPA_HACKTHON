import { settings } from './settings';
import { audioContext } from './sfx';

/**
 * Procedural score in ancient Greek modes: lyre (kithara) plucks, aulos reed
 * melody, drones, choir pads and frame drums, all synthesised with WebAudio.
 * One theme per stage × room kind; switching crossfades.
 */
export type MusicKind = 'menu' | 'explore' | 'combat' | 'treasure' | 'shrine' | 'boss' | 'lament';

type Voice = 'lyre' | 'aulos' | 'bell';

interface Theme {
  /** Semitone offsets of the mode from the root. */
  mode: number[];
  /** MIDI note of the root. */
  root: number;
  bpm: number;
  lead: Voice;
  /** 0..1 chance a melody step sounds. */
  density: number;
  /** 0 none, 1 light frame drum, 2 war drums. */
  drums: 0 | 1 | 2;
  drone: boolean;
  pad: boolean;
  /** Echo feedback (0..0.6) for cavernous stages. */
  echo: number;
  seed: number;
}

const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  /** Phrygian dominant: the "underworld" colour. */
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** Stage flavour: Ruined Polis is sunlit Dorian, Knossos an echoing Phrygian maze, Tartarus a slow hijaz dirge. */
const STAGE_FLAVOUR: Record<string, { mode: number[]; root: number; bpm: number; echo: number }> = {
  polis: { mode: MODES.dorian, root: 50, bpm: 92, echo: 0.15 },
  labyrinth: { mode: MODES.phrygian, root: 52, bpm: 80, echo: 0.45 },
  tartarus: { mode: MODES.hijaz, root: 48, bpm: 68, echo: 0.35 },
};

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function themeFor(stageId: string, kind: MusicKind): Theme {
  const seed = hash(`${stageId}:${kind}`);
  if (kind === 'menu') return { mode: MODES.aeolian, root: 45, bpm: 70, lead: 'lyre', density: 0.55, drums: 0, drone: true, pad: true, echo: 0.3, seed };
  if (kind === 'lament') return { mode: MODES.phrygian, root: 45, bpm: 54, lead: 'aulos', density: 0.4, drums: 0, drone: true, pad: true, echo: 0.4, seed };
  const s = STAGE_FLAVOUR[stageId] ?? STAGE_FLAVOUR.polis;
  const base = { mode: s.mode, root: s.root, echo: s.echo, seed };
  switch (kind) {
    case 'combat':
      return { ...base, bpm: s.bpm * 1.2, lead: 'lyre', density: 0.8, drums: 1, drone: true, pad: false };
    case 'boss':
      return { ...base, root: s.root - 2, bpm: s.bpm * 1.4, lead: 'aulos', density: 0.85, drums: 2, drone: true, pad: false };
    case 'treasure':
      return { ...base, mode: MODES.lydian, bpm: s.bpm, lead: 'bell', density: 0.6, drums: 0, drone: false, pad: true };
    case 'shrine':
      return { ...base, mode: MODES.mixolydian, bpm: s.bpm * 0.7, lead: 'lyre', density: 0.35, drums: 0, drone: true, pad: true, echo: 0.5 };
    default:
      return { ...base, bpm: s.bpm * 0.85, lead: 'lyre', density: 0.45, drums: 0, drone: true, pad: false };
  }
}

const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** mulberry32: stable phrases per theme. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEPS = 32; // 4 bars of eighth notes

/** Two phrases (scale degree or null for rest), played A A B A; a stepwise walk sounds like a melody. */
function composePhrases(theme: Theme): (number | null)[][] {
  const r = rng(theme.seed);
  const phrase = (): (number | null)[] => {
    let deg = Math.floor(r() * 5);
    const out: (number | null)[] = [];
    for (let i = 0; i < STEPS; i++) {
      const strong = i % 4 === 0;
      if (!strong && r() > theme.density) {
        out.push(null);
        continue;
      }
      deg += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(r() * 8)];
      deg = Math.max(-2, Math.min(9, deg));
      out.push(i === STEPS - 1 || i === STEPS - 8 ? 0 : deg);
    }
    return out;
  };
  return [phrase(), phrase()];
}

/** Chord roots (scale degrees) per bar. */
const PROGRESSION = [0, 5, 3, 4];

class Track {
  readonly bus: GainNode;
  private readonly phrases: (number | null)[][];
  private readonly sustained: AudioScheduledSourceNode[] = [];
  private readonly out: AudioNode;
  private step = 0;
  private nextTime: number;
  private noise: AudioBuffer | null = null;

  constructor(
    private readonly ctx: AudioContext,
    master: AudioNode,
    readonly theme: Theme,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(master);
    if (theme.echo > 0) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = (60 / theme.bpm) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = theme.echo;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const input = ctx.createGain();
      input.connect(this.bus);
      input.connect(delay);
      delay.connect(lp).connect(fb).connect(delay);
      lp.connect(this.bus);
      this.out = input;
    } else {
      this.out = this.bus;
    }
    this.phrases = composePhrases(theme);
    this.nextTime = ctx.currentTime + 0.1;
    if (theme.drone) this.startDrone();
  }

  private note(deg: number, octave = 0): number {
    const m = this.theme.mode;
    const o = Math.floor(deg / m.length);
    const i = ((deg % m.length) + m.length) % m.length;
    return midiHz(this.theme.root + 12 * (o + octave) + m[i]);
  }

  private startDrone(): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    lp.connect(g).connect(this.bus);
    for (const [deg, detune] of [[0, -6], [0, 6], [4, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = this.note(deg, -1);
      o.detune.value = detune;
      o.connect(lp);
      o.start();
      this.sustained.push(o);
    }
  }

  /** Schedule everything due in the next `ahead` seconds. */
  pump(ahead: number): void {
    const stepDur = 60 / this.theme.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + ahead) {
      this.schedule(this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private schedule(step: number, t: number, stepDur: number): void {
    const s = step % STEPS;
    const bar = Math.floor(s / 8);
    const cycle = Math.floor(step / STEPS) % 4;
    const phrase = this.phrases[cycle === 2 ? 1 : 0];
    const deg = phrase[s];
    if (deg !== null) {
      const len = this.theme.lead === 'aulos' ? stepDur * 1.8 : stepDur * 3;
      this.play(this.theme.lead, this.note(deg, 1), t, len, 0.09);
    }
    const chord = PROGRESSION[bar];
    // Kithara accompaniment: low arpeggio on the chord.
    if (s % 2 === 0 && this.theme.lead !== 'bell') this.play('lyre', this.note(chord + [0, 2, 4, 2][(s / 2) % 4]), t, stepDur * 2, 0.045);
    if (this.theme.pad && s % 8 === 0) for (const d of [0, 2, 4]) this.pad(this.note(chord + d), t, stepDur * 8);
    if (this.theme.drums === 1) {
      if (s % 8 === 0 || s % 8 === 5) this.drum(t, 'low', 0.25);
      if (s % 4 === 2) this.drum(t, 'high', 0.06);
    } else if (this.theme.drums === 2) {
      if (s % 4 === 0 || s % 8 === 3) this.drum(t, 'low', 0.4);
      if (s % 2 === 1) this.drum(t, 'high', 0.08);
      if (s % 16 === 14) this.drum(t, 'low', 0.3);
    }
  }

  private env(t: number, peak: number, attack: number, dur: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    return g;
  }

  private play(voice: Voice, hz: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    if (voice === 'aulos') {
      // Double-reed: two slightly detuned saws through a nasal band-pass, with vibrato.
      const g = this.env(t, vol * 0.8, 0.06, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = hz * 3;
      bp.Q.value = 1.2;
      bp.connect(g);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5.5;
      lfoGain.gain.value = hz * 0.012;
      lfo.connect(lfoGain);
      for (const detune of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz;
        o.detune.value = detune;
        lfoGain.connect(o.frequency);
        o.connect(bp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      return;
    }
    // Lyre / bell: plucked partials with fast decay.
    const partials = voice === 'bell' ? [[1, 1], [2.76, 0.4], [5.4, 0.2]] : [[1, 1], [2, 0.35], [3, 0.12]];
    const g = this.env(t, vol, 0.004, voice === 'bell' ? dur * 1.5 : dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(hz * 6, t);
    lp.frequency.exponentialRampToValueAtTime(hz * 1.5, t + dur);
    lp.connect(g);
    for (const [mul, amp] of partials) {
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.type = voice === 'bell' ? 'sine' : 'triangle';
      o.frequency.value = hz * mul;
      a.gain.value = amp;
      o.connect(a).connect(lp);
      o.start(t);
      o.stop(t + dur * 1.5 + 0.05);
    }
  }

  private pad(hz: number, t: number, dur: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.018, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    for (const detune of [-5, 5]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * 2;
      o.detune.value = detune;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private drum(t: number, kind: 'low' | 'high', vol: number): void {
    const ctx = this.ctx;
    if (kind === 'low') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      o.connect(this.env(t, vol, 0.003, 0.35));
      o.start(t);
      o.stop(t + 0.4);
      return;
    }
    this.noise ??= (() => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    })();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    src.connect(hp).connect(this.env(t, vol, 0.002, 0.08));
    src.start(t);
    src.stop(t + 0.1);
  }

  fade(to: number, seconds: number): void {
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(to, now + seconds);
  }

  dispose(afterSeconds: number): void {
    setTimeout(() => {
      for (const o of this.sustained) o.stop();
      this.bus.disconnect();
    }, afterSeconds * 1000 + 100);
  }
}

const VOLUME = 0.7;
const DUCKED = 0.3;

class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private track: Track | null = null;
  private wanted: { stageId: string; kind: MusicKind } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ducked = false;
  private unlocked = false;

  constructor() {
    if (typeof window === 'undefined') return;
    // Browsers only allow audio after a gesture: start the requested theme on the first one.
    const unlock = (): void => {
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
      this.unlocked = true;
      if (this.wanted) this.play(this.wanted.stageId, this.wanted.kind);
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  /** Crossfade to the theme for this stage + room kind; no-op if it is already playing. */
  play(stageId: string, kind: MusicKind): void {
    this.wanted = { stageId, kind };
    if (!settings.data.music || !this.unlocked) return;
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.master || this.ctx !== ctx) {
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = VOLUME;
      this.master.connect(ctx.destination);
    }
    const theme = themeFor(stageId, kind);
    if (this.track && this.track.theme.seed === theme.seed) return;
    const old = this.track;
    old?.fade(0, 1.2);
    old?.dispose(1.2);
    this.track = new Track(ctx, this.master, theme);
    this.track.fade(1, old ? 1.2 : 2);
    this.timer ??= setInterval(() => this.track?.pump(0.25), 60);
    this.track.pump(0.25);
  }

  stop(): void {
    this.track?.fade(0, 0.8);
    this.track?.dispose(0.8);
    this.track = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Quieter under dialogue so voices stay clear. */
  duck(on: boolean): void {
    this.ducked = on;
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.ducked ? DUCKED : VOLUME, now + 0.4);
  }

  /** Apply the music setting (Options menu). */
  refresh(): void {
    if (!settings.data.music) this.stop();
    else if (this.wanted) this.play(this.wanted.stageId, this.wanted.kind);
  }
}

export const music = new MusicPlayer();
