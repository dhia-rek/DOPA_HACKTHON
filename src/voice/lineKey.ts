/** Stable file key for a pre-recorded dialogue line: `<speakerId>/<fnv1a(text)>`. Shared by the game and scripts/voice-lines. */
export function lineKey(speakerId: string, text: string): string {
  const norm = text.trim().replace(/\s+/g, ' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${speakerId}/${h.toString(16).padStart(8, '0')}`;
}
