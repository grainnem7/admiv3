/**
 * Counters past their part's loop length. With Melody looping over 6 steps on an 8-step
 * board, a melody counter in step 7 or 8 never plays — while the playhead still sweeps
 * over it. Which squares those are, and the words that say why, so the board can show it.
 * (A colour playing a tune owns a whole stretch of the loop, and this doesn't apply to it.)
 */
import { loopLen } from './boardSequencerScale';
import type { ColourChannel, ColourRole } from '../tracking/boardColours';

/**
 * Whether a colour plays a whole tune (a phrase) or one note per counter. Its own choice
 * when it has made one; otherwise by part — the melody plays the notes placed, while
 * drums, bass and chords play a groove, a bassline and the chords. With phrases off,
 * every colour plays one note. (The engine plays by this rule; the board shows by it.)
 */
export function playsTune(ch: Pick<ColourChannel, 'role' | 'plays'> | undefined, phrases: boolean): boolean {
  if (!phrases || !ch) return false;
  if (ch.plays === 'note') return false;
  if (ch.plays === 'tune') return true;
  return ch.role !== 'melody';
}

export interface LoopLengths {
  /** Melody and chord. */
  melodic: number;
  drums: number;
  bass: number;
}

type Part = keyof LoopLengths;
const PART_NAME: Record<Part, string> = { melodic: 'Melody', drums: 'Drums', bass: 'Bass' };

function partOf(role: ColourRole | undefined): Part | null {
  if (role === 'melody' || role === 'chord') return 'melodic';
  if (role === 'drums') return 'drums';
  if (role === 'bass') return 'bass';
  return null;
}

/** The squares ("row,col") whose counter can never sound: past its part's loop. */
export function beyondLoopSquares(
  counters: Iterable<[string, string]>, channelOf: (colour: string) => Pick<ColourChannel, 'role' | 'plays'> | undefined,
  loops: LoopLengths, cols: number, phrases: boolean,
): Set<string> {
  const out = new Set<string>();
  for (const [key, colour] of counters) {
    const ch = channelOf(colour);
    if (playsTune(ch, phrases)) continue;
    const part = partOf(ch?.role);
    if (!part) continue;
    const col = Number(key.split(',')[1]);
    if (col >= loopLen(loops[part], cols)) out.add(key);
  }
  return out;
}

/** "Steps 7–8 are past Melody's 6-step loop: counters there don't play." — or null. */
export function beyondLoopNote(
  channels: Iterable<Pick<ColourChannel, 'role' | 'plays'>>, loops: LoopLengths, cols: number, phrases: boolean,
): string | null {
  const used = new Set<Part>();
  for (const ch of channels) {
    if (playsTune(ch, phrases)) continue;
    const p = partOf(ch.role);
    if (p) used.add(p);
  }
  const parts = [...used].filter((p) => loopLen(loops[p], cols) < cols);
  if (parts.length === 0) return null;
  return parts.map((p) => {
    const len = loopLen(loops[p], cols);
    const steps = len + 1 === cols ? `Step ${cols} is` : `Steps ${len + 1}–${cols} are`;
    return `${steps} past ${PART_NAME[p]}’s ${len}-step loop: ${PART_NAME[p].toLowerCase()} counters there don’t play.`;
  }).join(' ');
}
