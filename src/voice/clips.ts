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

/** Play a speaker's recorded voice (cutting off any previous clip). Returns whether playback was started. */
export function playRecordedVoice(id: string, onEnd?: () => void): boolean {
  stopRecordedVoice();
  if (!voiceSettings.enabled || !RECORDED.has(id) || typeof Audio === 'undefined') return false;
  const clip = new Audio(`${import.meta.env.BASE_URL}voices/${id}.mp3`);
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

export function stopRecordedVoice(): void {
  current?.pause();
  current = null;
}
