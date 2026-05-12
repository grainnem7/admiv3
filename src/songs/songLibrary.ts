/**
 * Song Library — configuration for Song Preset mode.
 *
 * Each song defines its stems, stem-mixer mapping, and (optionally) a chord
 * progression for the generated accompaniment voices (pad, melody, arpeggio, bass).
 *
 * Adding a new song: separate into stems, drop WAVs into public/songs/<id>/,
 * and add a config entry here. No other code changes needed.
 */

import type { ChordEntry } from './voices/chordLookup';

// ============================================
// Types
// ============================================

/** Volume levels for stems controlled by a single object in a given zone */
export interface ZoneStemLevels {
  [stemId: string]: number; // 0-1 gain
}

/** How the Blue (Stem Mixer) object maps zones to stem levels */
export interface StemMixerMapping {
  label: string;
  leftZone: ZoneStemLevels;
  centerZone: ZoneStemLevels;
  rightZone: ZoneStemLevels;
  /** Optional human-readable zone names. Defaults are derived per song-type when absent. */
  zoneLabels?: {
    left: string;
    center: string;
    right: string;
  };
}

/** Full song configuration */
export interface SongConfig {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  timeSignature: string;
  stems: Record<string, string>; // stemId → path relative to public/
  stemMixer: StemMixerMapping;
  /** Chord progression for generated voices. Optional — without it only stem mixing works. */
  chordProgression?: ChordEntry[];
  /** URL to analysis.json with AI-detected beat timestamps and chord data. */
  analysisUrl?: string;
  /** Real beat timestamps from audio analysis (populated at runtime from analysisUrl). */
  beats?: number[];
  /** Downbeat (bar boundary) timestamps from audio analysis. */
  downbeats?: number[];
}

// ============================================
// Color Roles
// ============================================

export type ColorRole = 'blue' | 'red' | 'green' | 'yellow' | 'orange';

export interface ColorRoleConfig {
  id: ColorRole;
  label: string;
  cssColor: string;
  description: string;
  keyNumber: number; // keyboard shortcut 1-5
}

export const COLOR_ROLES: ColorRoleConfig[] = [
  { id: 'blue',   label: 'Stem Mixer',   cssColor: '#3b82f6', description: 'Mix the original recording stems',       keyNumber: 1 },
  { id: 'red',    label: 'Chord Pad',    cssColor: '#ef4444', description: 'Warm synth pad following the chords',     keyNumber: 2 },
  { id: 'green',  label: 'Melody Notes',  cssColor: '#22c55e', description: 'Pentatonic melody (quantized)',          keyNumber: 3 },
  { id: 'yellow', label: 'Arpeggio',      cssColor: '#eab308', description: 'Cascading arpeggio pattern',             keyNumber: 4 },
  { id: 'orange', label: 'Bass Synth',    cssColor: '#f97316', description: 'Deep synth bass on chord root',          keyNumber: 5 },
];

// ============================================
// Song Library
// ============================================

import { CANT_HELP_CHORDS } from './voices/chordLookup';

// For mix-only songs (no stem separation), all four stem slots point at the
// same mix file. The stem mixer becomes a global volume control instead of
// a per-stem blender.
const mixOnlyStems = (id: string, ext: string = 'mp3'): Record<string, string> => ({
  vocals: `songs/${id}/mix.${ext}`,
  drums:  `songs/${id}/mix.${ext}`,
  bass:   `songs/${id}/mix.${ext}`,
  other:  `songs/${id}/mix.${ext}`,
});

const mixOnlyMixer: StemMixerMapping = {
  label: 'Volume',
  leftZone:   { vocals: 0.0, drums: 0.0, bass: 0.0, other: 0.0 },
  centerZone: { vocals: 0.5, drums: 0.5, bass: 0.5, other: 0.5 },
  rightZone:  { vocals: 1.0, drums: 1.0, bass: 1.0, other: 1.0 },
  zoneLabels: { left: 'Silent', center: 'Half volume', right: 'Full volume' },
};

export const SONG_LIBRARY: SongConfig[] = [
  {
    id: 'cant-help-falling-in-love',
    title: "Can't Help Falling in Love",
    artist: 'Elvis Presley',
    key: 'D Major',
    bpm: 67,
    timeSignature: '12/8',
    stems: {
      vocals: 'songs/cant-help-falling-in-love/vocals.wav',
      drums: 'songs/cant-help-falling-in-love/drums.wav',
      bass: 'songs/cant-help-falling-in-love/bass.wav',
      other: 'songs/cant-help-falling-in-love/other.wav',
    },
    stemMixer: {
      label: 'Stem Mixer',
      leftZone:   { vocals: 1.0, drums: 0.0, bass: 0.0, other: 0.0 },
      centerZone: { vocals: 1.0, drums: 0.3, bass: 0.3, other: 0.6 },
      rightZone:  { vocals: 1.0, drums: 1.0, bass: 1.0, other: 1.0 },
      zoneLabels: { left: 'Vocals only', center: 'Vocals + light band', right: 'Full mix' },
    },
    chordProgression: CANT_HELP_CHORDS,
    analysisUrl: 'songs/cant-help-falling-in-love/analysis.json',
  },
  {
    id: 'everybody-needs-somebody-to-love',
    title: 'Everybody Needs Somebody to Love',
    artist: 'The Blues Brothers',
    key: 'F Major',
    bpm: 96,
    timeSignature: '4/4',
    stems: mixOnlyStems('everybody-needs-somebody-to-love'),
    stemMixer: mixOnlyMixer,
    analysisUrl: 'songs/everybody-needs-somebody-to-love/analysis.json',
  },
  {
    id: 'shake-a-tail-feather',
    title: 'Shake a Tail Feather',
    artist: 'The Blues Brothers & Ray Charles',
    key: 'D Major',
    bpm: 158,
    timeSignature: '4/4',
    stems: mixOnlyStems('shake-a-tail-feather'),
    stemMixer: mixOnlyMixer,
    analysisUrl: 'songs/shake-a-tail-feather/analysis.json',
  },
  {
    id: 'she-caught-the-katy',
    title: 'She Caught the Katy',
    artist: 'The Blues Brothers',
    key: 'Bb Major',
    bpm: 96,
    timeSignature: '4/4',
    stems: mixOnlyStems('she-caught-the-katy'),
    stemMixer: mixOnlyMixer,
    analysisUrl: 'songs/she-caught-the-katy/analysis.json',
  },
];
