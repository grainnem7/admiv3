/**
 * NoteSource — decides which pitch a surface-button press plays, given
 * the song's current chord.
 *
 * This is the single seam for Stage 2. Stage 1 ships only the
 * deterministic ChordToneNoteSource. A future PianoGenieNoteSource
 * implements the same one-method interface and is swapped in where
 * ChordToneNoteSource is constructed (see SongPresetEngine.setSurfacePressConfig).
 *
 * Stage 2: add `PianoGenieNoteSource implements NoteSource` here and select
 * it in the engine. DO NOT add @magenta/music or any model in Stage 1.
 */

import type { ChordEntry } from './chordLookup';

export interface NoteSource {
  /** Pick the MIDI note for a press of `buttonId` given the current chord. */
  noteForPress(buttonId: string, chord: ChordEntry): number;
}

/**
 * Build a low→high, deduplicated pitch ladder from a chord's voicing,
 * layering the same voicing one octave higher for extra range. Shares the
 * shape used by InstrumentVoice.buildPitchLadder.
 */
export function buildChordLadder(chord: ChordEntry): number[] {
  if (chord.notes.length === 0) return [];
  const all = [...chord.notes, ...chord.notes.map((n) => n + 12)];
  return Array.from(new Set(all)).sort((a, b) => a - b);
}

/**
 * Deterministic note source: each button maps to a chord tone by its
 * index in `buttonOrder`, wrapping when there are more buttons than tones.
 * Unknown button ids fall back to the lowest chord tone.
 */
export class ChordToneNoteSource implements NoteSource {
  constructor(private readonly buttonOrder: readonly string[]) {}

  noteForPress(buttonId: string, chord: ChordEntry): number {
    const ladder = buildChordLadder(chord);
    if (ladder.length === 0) return chord.root;
    const idx = this.buttonOrder.indexOf(buttonId);
    const i = idx < 0 ? 0 : idx % ladder.length;
    return ladder[i];
  }
}
