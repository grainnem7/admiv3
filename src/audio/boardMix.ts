// src/audio/boardMix.ts
//
// Pure decisions behind the board sequencer's mix: where each channel sits in the stereo
// field, which channels make room for the kick, and how long a note may ring. The engine
// only applies what these return.

import type { ColourChannel } from '../tracking/boardColours';
import { DEFAULT_BOARD_MIX, type BoardMixConfig } from './audioConfig';

/**
 * Stereo position for a channel. Bass is always centred (low end belongs in the middle);
 * melody and chord channels take the next slot of their role's list in channel order, so
 * two melody colours never sit on top of each other.
 */
export function channelPan(
  channels: readonly ColourChannel[],
  id: string,
  mix: BoardMixConfig = DEFAULT_BOARD_MIX,
): number {
  const ch = channels.find((c) => c.id === id);
  if (!ch || (ch.role !== 'melody' && ch.role !== 'chord')) return 0;
  const list = mix.pans[ch.role];
  if (list.length === 0) return 0;
  const nth = channels.filter((c) => c.role === ch.role).findIndex((c) => c.id === id);
  return list[nth % list.length];
}

/**
 * Whether a channel dips on the kick. The sustained, low or wide parts (bass, chords and
 * a pad) do; a melody keeps its line clear, since it is usually what the player is
 * listening for.
 */
export function ducksForKick(ch: Pick<ColourChannel, 'role' | 'instrument'>): boolean {
  return ch.role === 'bass' || ch.role === 'chord' || ch.instrument === 'pad';
}

/**
 * How many beats a note at `col` may ring: up to the channel's next note, wrapping round
 * its loop, capped at `maxBeats`. A note with no other note in its channel rings the
 * whole loop (capped). `cols` are the columns this channel plays in, any order.
 */
export function legatoBeats(
  col: number,
  cols: readonly number[],
  loopLength: number,
  maxBeats: number,
): number {
  if (loopLength <= 0) return 0;
  let gap = loopLength;
  for (const c of cols) {
    if (c < 0 || c >= loopLength || c === col) continue;
    const ahead = (c - col + loopLength) % loopLength;
    if (ahead < gap) gap = ahead;
  }
  return Math.min(gap, maxBeats);
}
