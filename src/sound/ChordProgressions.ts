/**
 * ChordProgressions - Musical chord progressions with emotional arcs
 *
 * Ported from v1's sophisticated chord progression system.
 * Each progression has chords with associated moods that inform
 * melodic pattern selection.
 */

// ============================================
// Types
// ============================================

export type Mood =
  | 'contemplative'
  | 'deeper'
  | 'brightening'
  | 'bright'
  | 'returning'
  | 'peaceful'
  | 'hopeful'
  | 'resolved'
  | 'mysterious'
  | 'floating'
  | 'ethereal';

export interface ChordInfo {
  /** Chord name (e.g., "Dm7", "CMaj7") */
  name: string;
  /** Root note (e.g., "D", "C") */
  root: string;
  /** Chord tones as note names */
  chordTones: string[];
  /** Associated mood for melodic pattern selection */
  mood: Mood;
  /** Scale degrees that sound good over this chord (1-indexed) */
  scaleDegreesForMelody: number[];
}

export interface ChordProgression {
  id: string;
  name: string;
  description: string;
  /** Tempo suggestion in BPM */
  suggestedTempo: number;
  /** Chords in the progression */
  chords: ChordInfo[];
}

// ============================================
// Chord Progressions (from v1)
// ============================================

export const PROGRESSIONS: Record<string, ChordProgression> = {
  contemplative: {
    id: 'contemplative',
    name: 'Contemplative Journey',
    description: 'A gentle emotional arc from introspection to peace',
    suggestedTempo: 72,
    chords: [
      {
        name: 'Dm7',
        root: 'D',
        chordTones: ['D', 'F', 'A', 'C'],
        mood: 'contemplative',
        scaleDegreesForMelody: [1, 2, 3, 5, 6],
      },
      {
        name: 'Gm7',
        root: 'G',
        chordTones: ['G', 'Bb', 'D', 'F'],
        mood: 'deeper',
        scaleDegreesForMelody: [1, 3, 4, 5, 7],
      },
      {
        name: 'BbMaj7',
        root: 'Bb',
        chordTones: ['Bb', 'D', 'F', 'A'],
        mood: 'brightening',
        scaleDegreesForMelody: [1, 2, 3, 5, 6],
      },
      {
        name: 'FMaj7',
        root: 'F',
        chordTones: ['F', 'A', 'C', 'E'],
        mood: 'bright',
        scaleDegreesForMelody: [1, 3, 5, 6, 7],
      },
      {
        name: 'Am7',
        root: 'A',
        chordTones: ['A', 'C', 'E', 'G'],
        mood: 'returning',
        scaleDegreesForMelody: [1, 2, 3, 5, 6],
      },
      {
        name: 'CMaj7',
        root: 'C',
        chordTones: ['C', 'E', 'G', 'B'],
        mood: 'peaceful',
        scaleDegreesForMelody: [1, 2, 3, 5],
      },
    ],
  },

  hopeful: {
    id: 'hopeful',
    name: 'Rising Hope',
    description: 'Uplifting progression building toward resolution',
    suggestedTempo: 84,
    chords: [
      {
        name: 'CMaj7',
        root: 'C',
        chordTones: ['C', 'E', 'G', 'B'],
        mood: 'hopeful',
        scaleDegreesForMelody: [1, 3, 5, 6],
      },
      {
        name: 'Am7',
        root: 'A',
        chordTones: ['A', 'C', 'E', 'G'],
        mood: 'contemplative',
        scaleDegreesForMelody: [1, 2, 3, 5],
      },
      {
        name: 'FMaj7',
        root: 'F',
        chordTones: ['F', 'A', 'C', 'E'],
        mood: 'brightening',
        scaleDegreesForMelody: [1, 3, 5, 6],
      },
      {
        name: 'G7',
        root: 'G',
        chordTones: ['G', 'B', 'D', 'F'],
        mood: 'bright',
        scaleDegreesForMelody: [1, 2, 5, 7],
      },
    ],
  },

  ambient: {
    id: 'ambient',
    name: 'Floating Ambient',
    description: 'Ethereal, spacious progression for meditation',
    suggestedTempo: 60,
    chords: [
      {
        name: 'EmAdd9',
        root: 'E',
        chordTones: ['E', 'G', 'B', 'F#'],
        mood: 'ethereal',
        scaleDegreesForMelody: [1, 2, 3, 5],
      },
      {
        name: 'CMaj7',
        root: 'C',
        chordTones: ['C', 'E', 'G', 'B'],
        mood: 'floating',
        scaleDegreesForMelody: [1, 3, 5, 7],
      },
      {
        name: 'GMaj7',
        root: 'G',
        chordTones: ['G', 'B', 'D', 'F#'],
        mood: 'peaceful',
        scaleDegreesForMelody: [1, 2, 5, 6],
      },
      {
        name: 'Dadd9',
        root: 'D',
        chordTones: ['D', 'F#', 'A', 'E'],
        mood: 'hopeful',
        scaleDegreesForMelody: [1, 2, 3, 5],
      },
    ],
  },

  modal: {
    id: 'modal',
    name: 'Modal Exploration',
    description: 'Jazz-influenced modal progression',
    suggestedTempo: 90,
    chords: [
      {
        name: 'Dm9',
        root: 'D',
        chordTones: ['D', 'F', 'A', 'C', 'E'],
        mood: 'mysterious',
        scaleDegreesForMelody: [1, 2, 4, 5, 7],
      },
      {
        name: 'Eb Maj7',
        root: 'Eb',
        chordTones: ['Eb', 'G', 'Bb', 'D'],
        mood: 'brightening',
        scaleDegreesForMelody: [1, 3, 5, 6],
      },
      {
        name: 'Am11',
        root: 'A',
        chordTones: ['A', 'C', 'E', 'G', 'D'],
        mood: 'floating',
        scaleDegreesForMelody: [1, 2, 3, 4, 5],
      },
      {
        name: 'Gm7',
        root: 'G',
        chordTones: ['G', 'Bb', 'D', 'F'],
        mood: 'returning',
        scaleDegreesForMelody: [1, 3, 5, 7],
      },
    ],
  },

  simple: {
    id: 'simple',
    name: 'Simple & Accessible',
    description: 'Easy-to-follow progression with clear resolution',
    suggestedTempo: 80,
    chords: [
      {
        name: 'C',
        root: 'C',
        chordTones: ['C', 'E', 'G'],
        mood: 'peaceful',
        scaleDegreesForMelody: [1, 3, 5],
      },
      {
        name: 'Am',
        root: 'A',
        chordTones: ['A', 'C', 'E'],
        mood: 'contemplative',
        scaleDegreesForMelody: [1, 3, 5],
      },
      {
        name: 'F',
        root: 'F',
        chordTones: ['F', 'A', 'C'],
        mood: 'brightening',
        scaleDegreesForMelody: [1, 3, 5],
      },
      {
        name: 'G',
        root: 'G',
        chordTones: ['G', 'B', 'D'],
        mood: 'resolved',
        scaleDegreesForMelody: [1, 3, 5],
      },
    ],
  },
};

// ============================================
// Melodic Patterns (by mood)
// ============================================

/**
 * Melodic patterns as scale degree offsets from root.
 * Positive = up, negative = down, 0 = root.
 */
export const MELODIC_PATTERNS: Record<Mood, number[][]> = {
  contemplative: [
    [0, 2, 3, 2, 0, -2, 0],
    [0, 1, 2, 1, 0],
    [0, -1, 0, 2, 0],
  ],
  deeper: [
    [0, -2, -3, -2, 0, 1, 0],
    [-2, 0, -1, -2],
    [0, -1, -2, -1, 0],
  ],
  brightening: [
    [0, 2, 4, 2, 4, 5, 4],
    [0, 2, 3, 4, 3, 2],
    [2, 3, 4, 5, 4, 3, 2],
  ],
  bright: [
    [0, 2, 4, 5, 7, 5, 4, 2],
    [4, 5, 7, 5, 4, 2, 0],
    [0, 4, 5, 4, 2, 0],
  ],
  returning: [
    [0, 1, 3, 1, 0, -1, 0],
    [2, 1, 0, -1, 0, 1, 2],
    [0, -1, 0, 1, 0],
  ],
  peaceful: [
    [0, 2, 3, 5, 3, 2, 0],
    [0, 2, 0, -1, 0],
    [0, 1, 2, 1, 0],
  ],
  hopeful: [
    [0, 2, 4, 5, 4, 2, 4],
    [0, 2, 3, 5, 7, 5],
    [2, 4, 5, 7, 5, 4],
  ],
  resolved: [
    [4, 2, 0],
    [2, 1, 0],
    [5, 4, 2, 0],
  ],
  mysterious: [
    [0, 1, 3, 1, 0, -2, -1],
    [0, 3, 2, 0, -1],
    [-1, 0, 2, 0, -1],
  ],
  floating: [
    [0, 4, 7, 4, 0, 4],
    [0, 2, 4, 7, 4, 2, 0],
    [7, 5, 4, 2, 0],
  ],
  ethereal: [
    [0, 2, 7, 9, 7, 2],
    [0, 4, 5, 7, 5, 4],
    [7, 9, 7, 4, 2, 0],
  ],
};

// ============================================
// Progression Player Helper
// ============================================

export interface ProgressionState {
  progressionId: string;
  currentChordIndex: number;
  chordChangeAccumulator: number;
  phrasePosition: number;
}

/**
 * Create initial progression state.
 */
export function createProgressionState(progressionId: string): ProgressionState {
  return {
    progressionId,
    currentChordIndex: 0,
    chordChangeAccumulator: 0,
    phrasePosition: 0,
  };
}

/**
 * Get the current chord from a progression state.
 */
export function getCurrentChord(state: ProgressionState): ChordInfo | null {
  const progression = PROGRESSIONS[state.progressionId];
  if (!progression) return null;
  return progression.chords[state.currentChordIndex];
}

/**
 * Advance to the next chord in the progression.
 */
export function nextChord(state: ProgressionState): ProgressionState {
  const progression = PROGRESSIONS[state.progressionId];
  if (!progression) return state;

  return {
    ...state,
    currentChordIndex: (state.currentChordIndex + 1) % progression.chords.length,
    phrasePosition: 0,
  };
}

/**
 * Get a melodic pattern for the current mood.
 */
export function getMelodicPattern(mood: Mood): number[] {
  const patterns = MELODIC_PATTERNS[mood];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

/**
 * Get available progression IDs.
 */
export function getProgressionIds(): string[] {
  return Object.keys(PROGRESSIONS);
}

/**
 * Get progression by ID.
 */
export function getProgression(id: string): ChordProgression | null {
  return PROGRESSIONS[id] ?? null;
}
