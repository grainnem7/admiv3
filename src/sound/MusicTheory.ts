/**
 * MusicTheory - Musical scales, chords, and note utilities
 *
 * Provides musical intelligence for mapping movement to sound:
 * - Scale definitions and note generation
 * - Chord building
 * - Position-to-pitch mapping
 * - MIDI/frequency conversion
 */

// ============================================
// Types
// ============================================

export type ScaleType =
  | 'major'
  | 'minor'
  | 'pentatonic'
  | 'pentatonicMinor'
  | 'blues'
  | 'dorian'
  | 'mixolydian'
  | 'wholeTone';

export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export interface ScaleInfo {
  name: string;
  intervals: number[]; // Semitone intervals from root
  description: string;
}

// ============================================
// Scale Definitions
// ============================================

export const SCALES: Record<ScaleType, ScaleInfo> = {
  major: {
    name: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: 'Bright, happy sound',
  },
  minor: {
    name: 'Natural Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    description: 'Sad, melancholic sound',
  },
  pentatonic: {
    name: 'Pentatonic Major',
    intervals: [0, 2, 4, 7, 9],
    description: 'Always sounds good, no dissonance',
  },
  pentatonicMinor: {
    name: 'Pentatonic Minor',
    intervals: [0, 3, 5, 7, 10],
    description: 'Bluesy, soulful sound',
  },
  blues: {
    name: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    description: 'Classic blues feel with blue note',
  },
  dorian: {
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    description: 'Jazz/funk minor with raised 6th',
  },
  mixolydian: {
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    description: 'Rock/blues major with flat 7th',
  },
  wholeTone: {
    name: 'Whole Tone',
    intervals: [0, 2, 4, 6, 8, 10],
    description: 'Dreamy, floating sound',
  },
};

export const NOTE_NAMES: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ============================================
// Scale Generation
// ============================================

/**
 * Generate all notes in a scale across multiple octaves.
 */
export function generateScale(
  root: NoteName,
  scaleType: ScaleType,
  startOctave: number = 3,
  endOctave: number = 6
): string[] {
  const scale = SCALES[scaleType];
  const rootIndex = NOTE_NAMES.indexOf(root);
  const notes: string[] = [];

  for (let octave = startOctave; octave <= endOctave; octave++) {
    for (const interval of scale.intervals) {
      const noteIndex = (rootIndex + interval) % 12;
      const noteOctave = octave + Math.floor((rootIndex + interval) / 12);

      if (noteOctave <= endOctave) {
        notes.push(`${NOTE_NAMES[noteIndex]}${noteOctave}`);
      }
    }
  }

  return notes;
}

/**
 * Map a normalized position (0-1) to a note in the scale.
 * Position 0 = lowest note, Position 1 = highest note.
 */
export function positionToNote(
  position: number,
  scale: string[],
  invert: boolean = true
): string {
  // Invert by default so higher position = higher pitch (natural mapping)
  const normalizedPos = invert ? 1 - position : position;
  const clampedPos = Math.max(0, Math.min(1, normalizedPos));
  const index = Math.floor(clampedPos * scale.length);
  return scale[Math.min(index, scale.length - 1)];
}

/**
 * Map a normalized position (0-1) to a MIDI note number.
 */
export function positionToMidi(
  position: number,
  minMidi: number = 48, // C3
  maxMidi: number = 84, // C6
  invert: boolean = true
): number {
  const normalizedPos = invert ? 1 - position : position;
  const clampedPos = Math.max(0, Math.min(1, normalizedPos));
  return Math.round(minMidi + clampedPos * (maxMidi - minMidi));
}

/**
 * Quantize a MIDI note to the nearest note in a scale.
 */
export function quantizeToScale(
  midiNote: number,
  root: NoteName,
  scaleType: ScaleType
): number {
  const scale = SCALES[scaleType];
  const rootMidi = NOTE_NAMES.indexOf(root);
  const noteInOctave = midiNote % 12;
  const octave = Math.floor(midiNote / 12);

  // Find the nearest scale degree
  let minDistance = 12;
  let closestInterval = 0;

  for (const interval of scale.intervals) {
    const scaleNote = (rootMidi + interval) % 12;
    const distance = Math.min(
      Math.abs(noteInOctave - scaleNote),
      12 - Math.abs(noteInOctave - scaleNote)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestInterval = interval;
    }
  }

  // Reconstruct the quantized MIDI note
  const quantizedNote = (rootMidi + closestInterval) % 12;
  let quantizedMidi = octave * 12 + quantizedNote;

  // Handle octave wrapping
  if (quantizedNote < rootMidi && noteInOctave >= rootMidi) {
    quantizedMidi += 12;
  } else if (quantizedNote >= rootMidi && noteInOctave < rootMidi) {
    quantizedMidi -= 12;
  }

  return quantizedMidi;
}

// ============================================
// MIDI / Frequency Conversion
// ============================================

/**
 * Convert MIDI note number to frequency in Hz.
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert frequency in Hz to MIDI note number.
 */
export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

/**
 * Convert note name (e.g., "C4") to MIDI note number.
 */
export function noteToMidi(note: string): number {
  const match = note.match(/^([A-G]#?)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid note name: ${note}`);
  }

  const [, noteName, octaveStr] = match;
  const noteIndex = NOTE_NAMES.indexOf(noteName as NoteName);
  const octave = parseInt(octaveStr, 10);

  return (octave + 1) * 12 + noteIndex;
}

/**
 * Convert MIDI note number to note name.
 */
export function midiToNote(midi: number): string {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

// ============================================
// Chord Building
// ============================================

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'major7' | 'minor7' | 'dominant7';

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
};

/**
 * Build a chord from a root note.
 */
export function buildChord(root: string, quality: ChordQuality): string[] {
  const rootMidi = noteToMidi(root);
  const intervals = CHORD_INTERVALS[quality];

  return intervals.map((interval) => midiToNote(rootMidi + interval));
}

/**
 * Build a chord from a MIDI note number.
 */
export function buildChordFromMidi(rootMidi: number, quality: ChordQuality): number[] {
  const intervals = CHORD_INTERVALS[quality];
  return intervals.map((interval) => rootMidi + interval);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Transpose a note by semitones.
 */
export function transposeNote(note: string, semitones: number): string {
  const midi = noteToMidi(note);
  return midiToNote(midi + semitones);
}

/**
 * Get a random note from a scale.
 */
export function randomScaleNote(scale: string[]): string {
  return scale[Math.floor(Math.random() * scale.length)];
}

/**
 * Get weighted random note (biased toward root and fifth).
 */
export function weightedRandomNote(scale: string[]): string {
  if (scale.length <= 1) return scale[0];

  // 40% chance of root or fifth, 60% random
  if (Math.random() < 0.4) {
    const fifthIndex = Math.floor(scale.length * 0.6);
    return Math.random() < 0.5 ? scale[0] : scale[fifthIndex];
  }

  return randomScaleNote(scale);
}
