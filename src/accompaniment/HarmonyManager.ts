/**
 * HarmonyManager - Harmonic context management
 *
 * Pure-logic class (no Tone.js dependency) that owns all harmonic state:
 * - Current key (root + scale)
 * - Key-relative diatonic chords (generated from scale, not hardcoded)
 * - Note quantization to scale
 * - Context change notifications
 *
 * When the user selects a key (e.g. C major), chords are generated
 * diatonically from that scale (I, ii, iii, IV, V, vi, vii°).
 * Chord progressions are defined as scale-degree patterns, not fixed note names.
 */

import {
  quantizeToScale,
  generateScale,
  noteToMidi,
  type ScaleType,
  type NoteName,
  NOTE_NAMES,
  SCALES,
} from '../sound/MusicTheory';
import type { ChordInfo } from '../sound/ChordProgressions';
import type { Mood } from '../sound/ChordProgressions';
import type { HarmonyContext, HarmonyContextChangeCallback } from './types';

// ============================================
// Key-Relative Chord Generation
// ============================================

/** A chord defined by scale degree rather than fixed note names */
interface DegreeChord {
  /** Scale degree (0-indexed: 0=I, 1=ii, 2=iii, etc.) */
  degree: number;
  /** Chord quality suffix for display (e.g. "", "m", "m7", "maj7", "dim") */
  suffix: string;
  /** Intervals from chord root in semitones */
  intervals: number[];
  /** Mood tag for visual feedback */
  mood: Mood;
  /** Which scale degrees sound good for melody (1-indexed) */
  scaleDegreesForMelody: number[];
}

/** A progression template using scale degrees */
interface DegreeProgression {
  id: string;
  name: string;
  chords: DegreeChord[];
}

/**
 * Degree-based progression templates.
 * These work in any key - degrees are resolved against the current scale.
 */
const DEGREE_PROGRESSIONS: Record<string, DegreeProgression> = {
  simple: {
    id: 'simple',
    name: 'Simple & Accessible',
    chords: [
      { degree: 0, suffix: '', intervals: [0, 4, 7], mood: 'peaceful', scaleDegreesForMelody: [1, 3, 5] },
      { degree: 5, suffix: 'm', intervals: [0, 3, 7], mood: 'contemplative', scaleDegreesForMelody: [1, 3, 5] },
      { degree: 3, suffix: '', intervals: [0, 4, 7], mood: 'brightening', scaleDegreesForMelody: [1, 3, 5] },
      { degree: 4, suffix: '', intervals: [0, 4, 7], mood: 'resolved', scaleDegreesForMelody: [1, 3, 5] },
    ],
  },
  contemplative: {
    id: 'contemplative',
    name: 'Contemplative Journey',
    chords: [
      { degree: 0, suffix: 'maj7', intervals: [0, 4, 7, 11], mood: 'peaceful', scaleDegreesForMelody: [1, 3, 5] },
      { degree: 5, suffix: 'm7', intervals: [0, 3, 7, 10], mood: 'contemplative', scaleDegreesForMelody: [1, 2, 3, 5, 6] },
      { degree: 3, suffix: 'maj7', intervals: [0, 4, 7, 11], mood: 'brightening', scaleDegreesForMelody: [1, 3, 5, 6] },
      { degree: 4, suffix: '7', intervals: [0, 4, 7, 10], mood: 'bright', scaleDegreesForMelody: [1, 2, 5, 7] },
      { degree: 1, suffix: 'm7', intervals: [0, 3, 7, 10], mood: 'returning', scaleDegreesForMelody: [1, 2, 3, 5] },
      { degree: 0, suffix: 'maj7', intervals: [0, 4, 7, 11], mood: 'resolved', scaleDegreesForMelody: [1, 3, 5] },
    ],
  },
  hopeful: {
    id: 'hopeful',
    name: 'Rising Hope',
    chords: [
      { degree: 0, suffix: 'maj7', intervals: [0, 4, 7, 11], mood: 'hopeful', scaleDegreesForMelody: [1, 3, 5, 6] },
      { degree: 5, suffix: 'm7', intervals: [0, 3, 7, 10], mood: 'contemplative', scaleDegreesForMelody: [1, 2, 3, 5] },
      { degree: 3, suffix: 'maj7', intervals: [0, 4, 7, 11], mood: 'brightening', scaleDegreesForMelody: [1, 3, 5, 6] },
      { degree: 4, suffix: '7', intervals: [0, 4, 7, 10], mood: 'bright', scaleDegreesForMelody: [1, 2, 5, 7] },
    ],
  },
  ambient: {
    id: 'ambient',
    name: 'Floating Ambient',
    chords: [
      { degree: 2, suffix: 'm', intervals: [0, 3, 7], mood: 'ethereal', scaleDegreesForMelody: [1, 2, 3, 5] },
      { degree: 0, suffix: 'maj7', intervals: [0, 4, 7, 11], mood: 'floating', scaleDegreesForMelody: [1, 3, 5, 7] },
      { degree: 4, suffix: '', intervals: [0, 4, 7], mood: 'peaceful', scaleDegreesForMelody: [1, 2, 5, 6] },
      { degree: 1, suffix: 'm', intervals: [0, 3, 7], mood: 'hopeful', scaleDegreesForMelody: [1, 2, 3, 5] },
    ],
  },
  modal: {
    id: 'modal',
    name: 'Modal Exploration',
    chords: [
      { degree: 1, suffix: 'm7', intervals: [0, 3, 7, 10], mood: 'mysterious', scaleDegreesForMelody: [1, 2, 4, 5, 7] },
      { degree: 2, suffix: 'm7', intervals: [0, 3, 7, 10], mood: 'brightening', scaleDegreesForMelody: [1, 3, 5, 6] },
      { degree: 5, suffix: 'm7', intervals: [0, 3, 7, 10], mood: 'floating', scaleDegreesForMelody: [1, 2, 3, 4, 5] },
      { degree: 4, suffix: '7', intervals: [0, 4, 7, 10], mood: 'returning', scaleDegreesForMelody: [1, 3, 5, 7] },
    ],
  },
};

/**
 * Resolve a degree-based chord into a ChordInfo for the given key/scale.
 */
function resolveDegreeChord(
  degreeChord: DegreeChord,
  rootNote: NoteName,
  scaleType: ScaleType
): ChordInfo {
  const scale = SCALES[scaleType];
  const rootMidi = NOTE_NAMES.indexOf(rootNote);

  // Get the scale degree's note
  const degreeIndex = degreeChord.degree % scale.intervals.length;
  const degreeSemitones = scale.intervals[degreeIndex];
  const chordRootMidi = (rootMidi + degreeSemitones) % 12;
  const chordRootName = NOTE_NAMES[chordRootMidi];

  // Build chord tones from intervals
  const chordTones = degreeChord.intervals.map((interval) => {
    const toneIndex = (chordRootMidi + interval) % 12;
    return NOTE_NAMES[toneIndex];
  });

  // Build display name
  const name = `${chordRootName}${degreeChord.suffix}`;

  return {
    name,
    root: chordRootName,
    chordTones,
    mood: degreeChord.mood,
    scaleDegreesForMelody: degreeChord.scaleDegreesForMelody,
  };
}

// ============================================
// HarmonyManager Class
// ============================================

export class HarmonyManager {
  private rootNote: NoteName;
  private scaleType: ScaleType;
  private progressionId: string;
  private currentChordIndex: number = 0;
  private contextChangeCallbacks: HarmonyContextChangeCallback[] = [];

  /** Cached resolved chords for current key + progression */
  private resolvedChords: ChordInfo[] = [];

  constructor(
    rootNote: NoteName = 'C',
    scaleType: ScaleType = 'pentatonic',
    progressionId: string = 'simple'
  ) {
    this.rootNote = rootNote;
    this.scaleType = scaleType;
    this.progressionId = progressionId;
    this.rebuildChords();
  }

  // ============================================
  // Key / Scale Management
  // ============================================

  /** Set the root note and optionally the scale type */
  setKey(rootNote: NoteName, scaleType?: ScaleType): void {
    const changed = this.rootNote !== rootNote || (scaleType && this.scaleType !== scaleType);
    this.rootNote = rootNote;
    if (scaleType) {
      this.scaleType = scaleType;
    }
    if (changed) {
      this.currentChordIndex = 0; // Reset to tonic on key change
      this.rebuildChords();
      this.notifyContextChange();
    }
  }

  /** Set only the scale type */
  setScale(scaleType: ScaleType): void {
    if (this.scaleType !== scaleType) {
      this.scaleType = scaleType;
      this.currentChordIndex = 0;
      this.rebuildChords();
      this.notifyContextChange();
    }
  }

  /** Get the current root note */
  getRootNote(): NoteName {
    return this.rootNote;
  }

  /** Get the current scale type */
  getScaleType(): ScaleType {
    return this.scaleType;
  }

  // ============================================
  // Scale Note Access
  // ============================================

  /** Generate scale notes across an octave range */
  getScaleNotes(startOctave: number = 3, endOctave: number = 6): string[] {
    return generateScale(this.rootNote, this.scaleType, startOctave, endOctave);
  }

  /** Get scale notes as MIDI numbers across an octave range */
  getScaleMidiNotes(startOctave: number = 3, endOctave: number = 6): number[] {
    return this.getScaleNotes(startOctave, endOctave).map(noteToMidi);
  }

  /** Get the scale intervals (semitones from root) */
  getScaleIntervals(): number[] {
    return SCALES[this.scaleType].intervals;
  }

  // ============================================
  // Note Quantization
  // ============================================

  /** Quantize a MIDI note to the nearest note in the current scale */
  quantizeNote(midiNote: number): number {
    return quantizeToScale(midiNote, this.rootNote, this.scaleType);
  }

  // ============================================
  // Chord Progression (Key-Relative)
  // ============================================

  /** Rebuild resolved chords when key/scale/progression changes */
  private rebuildChords(): void {
    const progression = DEGREE_PROGRESSIONS[this.progressionId];
    if (progression) {
      this.resolvedChords = progression.chords.map((dc) =>
        resolveDegreeChord(dc, this.rootNote, this.scaleType)
      );
    } else {
      // Fallback: generate diatonic triads on scale degrees I, IV, V, vi
      const fallbackDegrees: DegreeChord[] = [
        { degree: 0, suffix: '', intervals: [0, 4, 7], mood: 'peaceful', scaleDegreesForMelody: [1, 3, 5] },
        { degree: 3, suffix: '', intervals: [0, 4, 7], mood: 'brightening', scaleDegreesForMelody: [1, 3, 5] },
        { degree: 4, suffix: '', intervals: [0, 4, 7], mood: 'bright', scaleDegreesForMelody: [1, 3, 5] },
        { degree: 5, suffix: 'm', intervals: [0, 3, 7], mood: 'contemplative', scaleDegreesForMelody: [1, 3, 5] },
      ];
      this.resolvedChords = fallbackDegrees.map((dc) =>
        resolveDegreeChord(dc, this.rootNote, this.scaleType)
      );
    }
  }

  /** Set the chord progression by ID */
  setProgression(progressionId: string): void {
    if (DEGREE_PROGRESSIONS[progressionId] || progressionId === this.progressionId) {
      this.progressionId = progressionId;
      this.currentChordIndex = 0;
      this.rebuildChords();
      this.notifyContextChange();
    }
  }

  /** Get the current chord (key-relative) */
  getCurrentChord(): ChordInfo | null {
    if (this.resolvedChords.length === 0) return null;
    return this.resolvedChords[this.currentChordIndex % this.resolvedChords.length];
  }

  /** Get the current chord index */
  getCurrentChordIndex(): number {
    return this.currentChordIndex;
  }

  /** Get the progression ID */
  getProgressionId(): string {
    return this.progressionId;
  }

  /** Get all resolved chords in the current progression */
  getAllChords(): ChordInfo[] {
    return [...this.resolvedChords];
  }

  /** Advance to the next chord in the progression */
  advanceChord(): void {
    if (this.resolvedChords.length === 0) return;
    this.currentChordIndex = (this.currentChordIndex + 1) % this.resolvedChords.length;
    this.notifyContextChange();
  }

  /** Go to the previous chord in the progression */
  previousChord(): void {
    if (this.resolvedChords.length === 0) return;
    this.currentChordIndex =
      (this.currentChordIndex - 1 + this.resolvedChords.length) % this.resolvedChords.length;
    this.notifyContextChange();
  }

  /** Set the chord by index */
  setChord(index: number): void {
    if (this.resolvedChords.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(index, this.resolvedChords.length - 1));
    if (clampedIndex !== this.currentChordIndex) {
      this.currentChordIndex = clampedIndex;
      this.notifyContextChange();
    }
  }

  /** Get the current chord's tones as MIDI notes in a given octave */
  getCurrentChordTonesMidi(octave: number = 3): number[] {
    const chord = this.getCurrentChord();
    if (!chord) return [];

    return chord.chordTones.map((toneName) => {
      const noteIndex = NOTE_NAMES.indexOf(toneName as NoteName);
      if (noteIndex === -1) return 60;
      return (octave + 1) * 12 + noteIndex;
    });
  }

  /** Get the underlying progression state (for compatibility) */
  getProgressionState() {
    return {
      progressionId: this.progressionId,
      currentChordIndex: this.currentChordIndex,
      chordChangeAccumulator: 0,
      phrasePosition: 0,
    };
  }

  // ============================================
  // Context
  // ============================================

  /** Get the full current harmony context */
  getContext(): HarmonyContext {
    return {
      rootNote: this.rootNote,
      scaleType: this.scaleType,
      currentChordIndex: this.currentChordIndex,
      progressionId: this.progressionId,
      currentChord: this.getCurrentChord(),
    };
  }

  // ============================================
  // Context Change Notifications
  // ============================================

  /** Subscribe to context changes. Returns unsubscribe function. */
  onContextChange(callback: HarmonyContextChangeCallback): () => void {
    this.contextChangeCallbacks.push(callback);
    return () => {
      this.contextChangeCallbacks = this.contextChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyContextChange(): void {
    const context = this.getContext();
    for (const callback of this.contextChangeCallbacks) {
      callback(context);
    }
  }
}

// ============================================
// Singleton
// ============================================

let harmonyManagerInstance: HarmonyManager | null = null;

export function getHarmonyManager(): HarmonyManager {
  if (!harmonyManagerInstance) {
    harmonyManagerInstance = new HarmonyManager();
  }
  return harmonyManagerInstance;
}
