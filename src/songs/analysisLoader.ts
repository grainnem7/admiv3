/**
 * analysisLoader.ts — Load and convert AI-analysed beat/chord data.
 *
 * Fetches an analysis.json file (produced by librosa or ChordMini) and
 * converts the chord labels + timestamps into ChordEntry[] that the
 * SongPresetEngine and voices already understand.
 */

import type { ChordEntry } from './voices/chordLookup';

// ============================================
// Raw analysis JSON shape (from the Python script)
// ============================================

export interface AnalysisChord {
  time: number;
  duration: number;
  label: string;
}

export interface SongAnalysis {
  title: string;
  artist: string;
  bpm: number;
  timeSignature: string;
  key: string;
  beats: number[];
  downbeats: number[];
  chords: AnalysisChord[];
}

// ============================================
// Chord label → MIDI voicing conversion
// ============================================

/** Semitone offsets from C for each pitch class. */
const PITCH_CLASS: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11,
};

/**
 * Parse a chord label like "D", "F#m", "C#7", "Bm" into a root pitch class
 * and quality (major, minor, dominant 7).
 */
function parseChordLabel(label: string): { rootPc: number; quality: 'major' | 'minor' | 'dom7' } | null {
  // Match: root note (with optional #/b), then quality suffix
  const match = label.match(/^([A-G][#b]?)(m|7|m7|maj7|dim|aug)?$/);
  if (!match) return null;

  const rootName = match[1];
  const suffix = match[2] ?? '';
  const rootPc = PITCH_CLASS[rootName];
  if (rootPc === undefined) return null;

  let quality: 'major' | 'minor' | 'dom7' = 'major';
  if (suffix === 'm' || suffix === 'm7') quality = 'minor';
  if (suffix === '7') quality = 'dom7';

  return { rootPc, quality };
}

/**
 * Build a MIDI voicing for a chord. Places the root in octave 3
 * and builds a close-voiced triad/tetrad in octave 3-4.
 */
function buildVoicing(rootPc: number, quality: 'major' | 'minor' | 'dom7'): { notes: number[]; root: number } {
  const rootMidi = 48 + rootPc; // C3 = 48, so root is in octave 3

  let intervals: number[];
  switch (quality) {
    case 'minor':
      intervals = [0, 3, 7];        // root, minor 3rd, perfect 5th
      break;
    case 'dom7':
      intervals = [0, 4, 7, 10];    // root, major 3rd, perfect 5th, minor 7th
      break;
    case 'major':
    default:
      intervals = [0, 4, 7];        // root, major 3rd, perfect 5th
      break;
  }

  const notes = intervals.map(i => rootMidi + i);

  // Add an octave doubling of the root for fullness
  notes.push(rootMidi + 12);

  // Bass note one octave below the chord root
  const bassRoot = rootMidi - 12; // octave 2

  return { notes, root: bassRoot };
}

// ============================================
// Public API
// ============================================

/**
 * Fetch and parse an analysis.json file.
 */
export async function loadAnalysis(url: string): Promise<SongAnalysis> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load analysis from ${url}: ${response.status}`);
  }
  return response.json() as Promise<SongAnalysis>;
}

/**
 * Convert analysis chord data into ChordEntry[] for the voice system.
 */
export function analysisToChordProgression(analysis: SongAnalysis): ChordEntry[] {
  const entries: ChordEntry[] = [];

  for (const chord of analysis.chords) {
    const parsed = parseChordLabel(chord.label);
    if (!parsed) {
      console.warn(`[analysisLoader] Unknown chord label: "${chord.label}", skipping`);
      continue;
    }

    const { notes, root } = buildVoicing(parsed.rootPc, parsed.quality);

    entries.push({
      time: chord.time,
      notes,
      root,
      name: chord.label,
    });
  }

  return entries;
}

/**
 * Load analysis.json and return everything the engine needs:
 * chord progression, beat timestamps, and metadata.
 */
export async function loadSongAnalysis(url: string): Promise<{
  chordProgression: ChordEntry[];
  beats: number[];
  downbeats: number[];
  bpm: number;
  key: string;
  timeSignature: string;
}> {
  const analysis = await loadAnalysis(url);
  const chordProgression = analysisToChordProgression(analysis);

  return {
    chordProgression,
    beats: analysis.beats,
    downbeats: analysis.downbeats,
    bpm: analysis.bpm,
    key: analysis.key,
    timeSignature: analysis.timeSignature,
  };
}
