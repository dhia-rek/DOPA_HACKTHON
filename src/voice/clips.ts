import { voiceSettings } from './provider';

/** Speakers with a recorded signature voice in public/voices/<id>.mp3. */
const RECORDED = new Set([
  'achilles', 'atalanta', 'heracles', 'orpheus', 'kratos',
  'minotaur', 'hydra',
  'villager', 'priestess', 'child', 'wounded_soldier',
  'altar',
]);

let current: HTMLAudioElement | null = null;

export function hasRecordedVoice(id: string): boolean {
  return RECORDED.has(id);
}

/** Play a speaker's recorded voice (cutting off any previous clip). Silent when voice is muted or the id has no clip. */
export function playRecordedVoice(id: string): void {
  stopRecordedVoice();
  if (!voiceSettings.enabled || !RECORDED.has(id) || typeof Audio === 'undefined') return;
  current = new Audio(`${import.meta.env.BASE_URL}voices/${id}.mp3`);
  current.play().catch((err) => console.warn('[voice] clip failed:', err));
}

export function stopRecordedVoice(): void {
  current?.pause();
  current = null;
}
