/**
 * Accompaniment System Types
 *
 * Type definitions for the Collaborative Accompaniment Mode.
 * Supports three performance modes: free, constrained, and accompaniment.
 */

import type { NoteName, ScaleType } from '../sound/MusicTheory';
import type { ChordInfo } from '../sound/ChordProgressions';

// ============================================
// Performance Mode
// ============================================

/** Performance mode controlling harmonic behaviour */
export type PerformanceMode = 'free' | 'constrained' | 'accompaniment';

// ============================================
// Accompaniment
// ============================================

/** Available accompaniment pattern types */
export type AccompanimentPattern = 'pad' | 'drone' | 'arpeggio' | 'bassline';

/** User-controllable accompaniment settings */
export interface AccompanimentSettings {
  /** Which pattern the accompaniment engine uses */
  pattern: AccompanimentPattern;
  /** Harmonic tension: 0 = pure chord tones, 1 = extensions/passing tones */
  tension: number;
  /** Note density: 0 = sparse, 1 = full */
  density: number;
  /** Accompaniment volume: 0-1 */
  volume: number;
  /** Whether accompaniment is actively generating */
  enabled: boolean;
}

/** Default accompaniment settings */
export const DEFAULT_ACCOMPANIMENT_SETTINGS: AccompanimentSettings = {
  pattern: 'pad',
  tension: 0.3,
  density: 0.4,
  volume: 0.5,
  enabled: false,
};

// ============================================
// Harmony Context
// ============================================

/** Current harmonic context for UI display and engine state */
export interface HarmonyContext {
  rootNote: NoteName;
  scaleType: ScaleType;
  currentChordIndex: number;
  progressionId: string;
  currentChord: ChordInfo | null;
}

/** Callback for harmony context changes */
export type HarmonyContextChangeCallback = (context: HarmonyContext) => void;

// ============================================
// Scheduled Notes (for predictive buffering)
// ============================================

/** A note scheduled for future playback by the AccompanimentEngine */
export interface ScheduledNote {
  /** MIDI note number */
  midiNote: number;
  /** Velocity 0-1 */
  velocity: number;
  /** Scheduled time relative to buffer start (ms) */
  offsetMs: number;
  /** Note duration (ms) */
  durationMs: number;
  /** Which voice to use */
  voiceType: 'melody' | 'bass' | 'chord';
}
