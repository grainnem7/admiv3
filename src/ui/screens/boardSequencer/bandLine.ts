import type { BandLevel } from '../../../songs/band/band';

/** The band's levels in the owner's words, the same as the Sound tab's: "gentle" is stored, "Quiet" is said (T1-12). */
const LEVEL_WORDS: Record<BandLevel, string> = { off: 'off', gentle: 'quiet', full: 'full' };

/**
 * The line under the board saying what the band is doing while the board plays: its level
 * and the parts it still plays, or that it is about to join. Null with the band off.
 */
export function bandLine(s: { level: BandLevel; playing: boolean; parts: readonly string[] }, countersDown: boolean): string | null {
  if (s.level === 'off') return null;
  if (s.playing) return `Band (${LEVEL_WORDS[s.level]}): ${s.parts.length > 0 ? s.parts.join(' · ') : 'you have taken every part'}`;
  return countersDown ? 'Band: joining on the next pass…' : 'Band: waiting for your first counter.';
}
