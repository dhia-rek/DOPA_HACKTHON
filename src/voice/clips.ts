import { lineKey } from './lineKey';
import { voiceSettings } from './provider';

/** Speakers with a recorded signature voice in public/voices/<id>.mp3. */
const RECORDED = new Set([
  'achilles', 'atalanta', 'heracles', 'orpheus', 'kratos',
  'minotaur', 'hydra',
  'villager', 'priestess', 'child', 'wounded_soldier',
  'altar',
  'trial_hermes', 'trial_ares', 'trial_artemis', 'trial_athena', 'trial_charon', 'trial_nemesis',
]);

let current: HTMLAudioElement | null = null;
/** Keys (see lineKey) of dialogue lines pre-recorded in public/voices/lines/; loaded once at startup. */
let recordedLines = new Set<string>();

if (typeof fetch !== 'undefined') {
  fetch(`${import.meta.env.BASE_URL}voices/lines/index.json`)
    .then((res) => (res.ok ? res.json() : []))
    .then((keys: string[]) => {
      recordedLines = new Set(keys);
    })
    .catch(() => undefined);
}

function play(src: string, onEnd?: () => void): boolean {
  stopRecordedVoice();
  if (!voiceSettings.enabled || typeof Audio === 'undefined') return false;
  const clip = new Audio(src);
  current = clip;
  const finish = () => {
    if (current !== clip) return;
    current = null;
    onEnd?.();
  };
  clip.addEventListener('ended', finish, { once: true });
  clip.addEventListener('error', finish, { once: true });
  clip.play().catch((err) => {
    console.warn('[voice] clip failed:', err);
    finish();
  });
  return true;
}

/** Play a speaker's recorded voice (cutting off any previous clip). Returns whether playback was started. */
export function playRecordedVoice(id: string, onEnd?: () => void): boolean {
  if (!RECORDED.has(id)) {
    stopRecordedVoice();
    return false;
  }
  return play(`${import.meta.env.BASE_URL}voices/${id}.mp3`, onEnd);
}

export function hasRecordedLine(speakerId: string, text: string): boolean {
  return recordedLines.has(lineKey(speakerId, text));
}

/** Play this exact line in the speaker's own recorded voice, if it was pre-recorded. */
export function playRecordedLine(speakerId: string, text: string): boolean {
  if (!hasRecordedLine(speakerId, text)) return false;
  return play(`${import.meta.env.BASE_URL}voices/lines/${lineKey(speakerId, text)}.mp3`);
}

export function stopRecordedVoice(): void {
  current?.pause();
  current = null;
}
