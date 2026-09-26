import { settings } from './settings';

export type Blip = 'move' | 'confirm' | 'advance' | 'deny';

let audioCtx: AudioContext | undefined;

/** Shared WebAudio context (blips + music), created lazily. */
export function audioContext(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) audioCtx ??= new Ctx();
  return audioCtx;
}

/** Tiny synthesised UI blip; silent when SFX are disabled or audio is unavailable. */
export function blip(kind: Blip): void {
  if (!settings.data.sfx) return;
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const [freq, dur, type]: [number, number, OscillatorType] =
      kind === 'move' ? [660, 0.04, 'square']
        : kind === 'confirm' ? [880, 0.09, 'triangle']
          : kind === 'deny' ? [180, 0.12, 'sawtooth']
            : [440, 0.05, 'square'];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (kind === 'confirm') osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch {
    /* audio is optional */
  }
}

export type CombatSfx = 'spear' | 'bow' | 'club' | 'lyre' | 'blades' | 'hit' | 'hurt' | 'kill' | 'boss_kill';

let noiseBuffer: AudioBuffer | undefined;

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Filtered noise burst: whooshes, thuds and impacts. */
function burst(ctx: AudioContext, t: number, dur: number, filter: BiquadFilterType, from: number, to: number, vol: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur);
}

function tone(ctx: AudioContext, t: number, dur: number, type: OscillatorType, from: number, to: number, vol: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

const lastPlayed = new Map<CombatSfx, number>();

/** Synthesised attack/impact sounds, one per weapon plus hits and deaths. */
export function combatSfx(kind: CombatSfx): void {
  if (!settings.data.sfx) return;
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    if (t - (lastPlayed.get(kind) ?? -1) < 0.04) return;
    lastPlayed.set(kind, t);
    const detune = 0.92 + Math.random() * 0.16;
    switch (kind) {
      case 'spear':
        burst(ctx, t, 0.12, 'bandpass', 2400 * detune, 700, 0.18);
        break;
      case 'bow':
        tone(ctx, t, 0.08, 'triangle', 320 * detune, 140, 0.12);
        burst(ctx, t + 0.02, 0.1, 'highpass', 3000, 1500, 0.1);
        break;
      case 'club':
        burst(ctx, t, 0.2, 'lowpass', 900 * detune, 120, 0.3);
        tone(ctx, t, 0.15, 'sine', 110 * detune, 45, 0.2);
        break;
      case 'lyre': {
        const notes = [392, 440, 494, 523, 587, 659];
        const f = notes[Math.floor(Math.random() * notes.length)];
        tone(ctx, t, 0.35, 'triangle', f, f * 0.995, 0.08);
        tone(ctx, t, 0.25, 'sine', f * 2, f * 2, 0.03);
        break;
      }
      case 'blades':
        burst(ctx, t, 0.14, 'bandpass', 3500 * detune, 900, 0.16);
        tone(ctx, t, 0.12, 'sawtooth', 1800 * detune, 600, 0.02);
        break;
      case 'hit':
        burst(ctx, t, 0.07, 'lowpass', 1800 * detune, 300, 0.16);
        break;
      case 'hurt':
        tone(ctx, t, 0.22, 'square', 220, 90, 0.06);
        burst(ctx, t, 0.15, 'lowpass', 1200, 200, 0.2);
        break;
      case 'kill':
        burst(ctx, t, 0.25, 'lowpass', 1400 * detune, 90, 0.22);
        tone(ctx, t, 0.2, 'sine', 160 * detune, 50, 0.12);
        break;
      case 'boss_kill':
        burst(ctx, t, 0.9, 'lowpass', 2000, 60, 0.35);
        tone(ctx, t, 0.9, 'sine', 90, 30, 0.25);
        break;
    }
  } catch {
    /* audio is optional */
  }
}
