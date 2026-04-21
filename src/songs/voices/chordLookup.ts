/**
 * chordLookup.ts — Chord progression data and lookup for Song Preset mode.
 *
 * Provides the full chord progression for "Can't Help Falling in Love"
 * with binary-search lookup by playback time. Also exports the D major
 * pentatonic scale and a MIDI→Hz conversion helper.
 */

// ============================================
// Types
// ============================================

export interface ChordEntry {
  /** Seconds into the song where this chord begins */
  time: number;
  /** MIDI note numbers for the chord voicing */
  notes: number[];
  /** MIDI note number of the root (bass note) */
  root: number;
  /** Display name, e.g. "D", "F#m", "A7" */
  name: string;
}

// ============================================
// MIDI helpers
// ============================================

/** Convert a MIDI note number to frequency in Hz (A4 = 69 = 440 Hz). */
export function noteToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert a note name like "D3" or "F#4" to a MIDI note number.
 * Used at compile-time to build the progression; not called at runtime.
 */
function n(name: string): number {
  const match = name.match(/^([A-G]#?)(\d)$/);
  if (!match) throw new Error(`Invalid note name: ${name}`);
  const [, pitch, octaveStr] = match;
  const octave = Number(octaveStr);
  const semitones: Record<string, number> = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
  };
  return (octave + 1) * 12 + semitones[pitch];
}

// ============================================
// D major pentatonic scale
// ============================================

/** D major pentatonic MIDI notes in octave 4 (default octave for melody voice). */
export const D_MAJOR_PENTATONIC = [
  n('D4'),  // 62
  n('E4'),  // 64
  n('F#4'), // 66
  n('A4'),  // 69
  n('B4'),  // 71
] as const;

// ============================================
// Chord progression — Can't Help Falling in Love
// ============================================

/**
 * Full chord progression for "Can't Help Falling in Love" (Elvis Presley).
 * D major, 12/8 time, 67 BPM. Each bar ≈ 3.58 s.
 *
 * Timings are calculated from the BPM/bar structure and may need
 * fine-tuning against the actual audio stems.
 */
export const CANT_HELP_CHORDS: ChordEntry[] = [
  // Intro (2 bars)
  { time: 0.0,    notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 3.58,   notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },

  // Verse 1: "Wise men say, only fools rush in"
  { time: 7.16,   notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 10.74,  notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 14.33,  notes: [n('B3'), n('D4'), n('F#4')],            root: n('B2'),  name: 'Bm' },
  { time: 17.91,  notes: [n('G3'), n('B3'), n('D4'), n('G4')],   root: n('G2'),  name: 'G' },
  { time: 21.49,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 25.07,  notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },

  // "But I can't help falling in love with you"
  { time: 28.66,  notes: [n('G3'), n('B3'), n('D4'), n('G4')],   root: n('G2'),  name: 'G' },
  { time: 32.24,  notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },
  { time: 35.82,  notes: [n('B3'), n('D4'), n('F#4')],            root: n('B2'),  name: 'Bm' },
  { time: 39.40,  notes: [n('E3'), n('G3'), n('B3'), n('E4')],   root: n('E2'),  name: 'Em' },
  { time: 42.99,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 45.28,  notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },
  { time: 46.57,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },

  // Verse 2: "Shall I stay, would it be a sin"
  { time: 50.15,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 53.73,  notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 57.31,  notes: [n('B3'), n('D4'), n('F#4')],            root: n('B2'),  name: 'Bm' },
  { time: 60.90,  notes: [n('G3'), n('B3'), n('D4'), n('G4')],   root: n('G2'),  name: 'G' },
  { time: 64.48,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 68.06,  notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },

  // "If I can't help falling in love with you"
  { time: 71.64,  notes: [n('G3'), n('B3'), n('D4'), n('G4')],   root: n('G2'),  name: 'G' },
  { time: 75.22,  notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },
  { time: 78.81,  notes: [n('B3'), n('D4'), n('F#4')],            root: n('B2'),  name: 'Bm' },
  { time: 82.39,  notes: [n('E3'), n('G3'), n('B3'), n('E4')],   root: n('E2'),  name: 'Em' },
  { time: 85.97,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 88.26,  notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },
  { time: 89.55,  notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },

  // Bridge: "Like a river flows, surely to the sea"
  { time: 93.13,  notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 96.72,  notes: [n('C#3'), n('F3'), n('G#3'), n('C#4')], root: n('C#3'), name: 'C#7' },
  { time: 100.30, notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 103.88, notes: [n('C#3'), n('F3'), n('G#3'), n('C#4')], root: n('C#3'), name: 'C#7' },

  // "Darling so it goes, some things are meant to be"
  { time: 107.46, notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 111.04, notes: [n('C#3'), n('F3'), n('G#3'), n('C#4')], root: n('C#3'), name: 'C#7' },
  { time: 114.63, notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 118.21, notes: [n('B3'), n('D#4'), n('F#4'), n('A4')],  root: n('B2'),  name: 'B7' },
  { time: 121.79, notes: [n('E3'), n('G3'), n('B3'), n('E4')],   root: n('E2'),  name: 'Em' },
  { time: 125.37, notes: [n('A3'), n('C#4'), n('E4'), n('G4')],  root: n('A2'),  name: 'A7' },

  // Verse 3: "Take my hand, take my whole life too"
  { time: 128.96, notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 132.54, notes: [n('F#3'), n('A3'), n('C#4'), n('F#4')], root: n('F#2'), name: 'F#m' },
  { time: 136.12, notes: [n('B3'), n('D4'), n('F#4')],            root: n('B2'),  name: 'Bm' },
  { time: 139.70, notes: [n('G3'), n('B3'), n('D4'), n('G4')],   root: n('G2'),  name: 'G' },
  { time: 143.28, notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 146.87, notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },

  // "For I can't help falling in love with you"
  { time: 150.45, notes: [n('G3'), n('B3'), n('D4'), n('G4')],   root: n('G2'),  name: 'G' },
  { time: 154.03, notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },
  { time: 157.61, notes: [n('B3'), n('D4'), n('F#4')],            root: n('B2'),  name: 'Bm' },
  { time: 161.19, notes: [n('E3'), n('G3'), n('B3'), n('E4')],   root: n('E2'),  name: 'Em' },
  { time: 164.78, notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
  { time: 167.07, notes: [n('A3'), n('E4'), n('A4'), n('C#5')],  root: n('A2'),  name: 'A' },
  { time: 168.36, notes: [n('D3'), n('A3'), n('D4'), n('F#4')],  root: n('D3'),  name: 'D' },
];

// ============================================
// Binary-search chord lookup
// ============================================

/**
 * Find the active chord at a given playback time.
 * Returns the last ChordEntry whose `time <= playbackTime`.
 * O(log n) — safe to call every frame.
 */
export function getChordAtTime(
  progression: ChordEntry[],
  playbackTime: number,
): ChordEntry {
  let lo = 0;
  let hi = progression.length - 1;
  let result = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (progression[mid].time <= playbackTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return progression[result];
}
