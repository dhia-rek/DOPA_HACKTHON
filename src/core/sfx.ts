import { settings } from './settings';

export type Blip = 'move' | 'confirm' | 'advance' | 'deny';

let audioCtx: AudioContext | undefined;

/** Tiny synthesised UI blip; silent when SFX are disabled or audio is unavailable. */
export function blip(kind: Blip): void {
  if (!settings.data.sfx) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
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
