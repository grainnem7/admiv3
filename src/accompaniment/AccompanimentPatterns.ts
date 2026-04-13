/**
 * AccompanimentPatterns - Pattern template definitions
 *
 * Each pattern defines how the AccompanimentEngine voices a chord:
 * - Which scale degrees to play
 * - Rhythm subdivisions
 * - Velocity curves
 * - Voice type assignment
 */

import type { AccompanimentPattern } from './types';

// ============================================
// Types
// ============================================

export interface PatternStep {
  /** Scale degree offset from chord root (0 = root, 2 = third, 4 = fifth, etc.) */
  degree: number;
  /** Beat offset within the pattern (0 = beat 1, 0.5 = eighth note after beat 1) */
  beatOffset: number;
  /** Duration in beats */
  durationBeats: number;
  /** Velocity multiplier (0-1) */
  velocity: number;
}

export interface PatternDefinition {
  id: AccompanimentPattern;
  name: string;
  description: string;
  /** Which voice to use for playback */
  voiceType: 'melody' | 'bass' | 'chord';
  /** Pattern length in beats */
  lengthBeats: number;
  /** Whether this pattern sustains across the full chord duration */
  sustained: boolean;
  /** Steps at minimum density */
  minSteps: PatternStep[];
  /** Steps at maximum density (interpolated with minSteps based on density) */
  maxSteps: PatternStep[];
}

// ============================================
// Pattern Definitions
// ============================================

/**
 * Pad - Sustained chord tones, re-triggered on chord change.
 * Density controls how many chord tones are voiced.
 * Tension adds upper extensions.
 */
export const PAD_PATTERN: PatternDefinition = {
  id: 'pad',
  name: 'Pad',
  description: 'Sustained chord tones',
  voiceType: 'chord',
  lengthBeats: 4,
  sustained: true,
  // Low density: root + fifth
  minSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 4, velocity: 0.65 },
    { degree: 4, beatOffset: 0, durationBeats: 4, velocity: 0.55 },
  ],
  // High density: full voicing
  maxSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 4, velocity: 0.65 },
    { degree: 2, beatOffset: 0, durationBeats: 4, velocity: 0.5 },
    { degree: 4, beatOffset: 0, durationBeats: 4, velocity: 0.55 },
    { degree: 6, beatOffset: 0, durationBeats: 4, velocity: 0.45 },
  ],
};

/**
 * Drone - Sustained root + optional fifth.
 * Minimal, ambient background.
 */
export const DRONE_PATTERN: PatternDefinition = {
  id: 'drone',
  name: 'Drone',
  description: 'Root note hum',
  voiceType: 'bass',
  lengthBeats: 4,
  sustained: true,
  // Low density: just root
  minSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 4, velocity: 0.6 },
  ],
  // High density: root + fifth + octave
  maxSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 4, velocity: 0.6 },
    { degree: 4, beatOffset: 0, durationBeats: 4, velocity: 0.5 },
    { degree: 7, beatOffset: 0, durationBeats: 4, velocity: 0.4 },
  ],
};

/**
 * Arpeggio - Chord tones played sequentially.
 * Density controls subdivision. Tension adds passing tones.
 */
export const ARPEGGIO_PATTERN: PatternDefinition = {
  id: 'arpeggio',
  name: 'Arpeggio',
  description: 'Flowing broken chord',
  voiceType: 'melody',
  lengthBeats: 4,
  sustained: false,
  // Low density: quarter-note arpeggio with longer sustain
  minSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 1.5, velocity: 0.6 },
    { degree: 2, beatOffset: 1, durationBeats: 1.5, velocity: 0.5 },
    { degree: 4, beatOffset: 2, durationBeats: 1.5, velocity: 0.55 },
    { degree: 2, beatOffset: 3, durationBeats: 1.5, velocity: 0.5 },
  ],
  // High density: eighth-note arpeggio with extensions
  maxSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 0.8, velocity: 0.6 },
    { degree: 2, beatOffset: 0.5, durationBeats: 0.8, velocity: 0.5 },
    { degree: 4, beatOffset: 1, durationBeats: 0.8, velocity: 0.55 },
    { degree: 6, beatOffset: 1.5, durationBeats: 0.8, velocity: 0.45 },
    { degree: 4, beatOffset: 2, durationBeats: 0.8, velocity: 0.55 },
    { degree: 2, beatOffset: 2.5, durationBeats: 0.8, velocity: 0.5 },
    { degree: 0, beatOffset: 3, durationBeats: 0.8, velocity: 0.6 },
    { degree: -1, beatOffset: 3.5, durationBeats: 0.8, velocity: 0.45 },
  ],
};

/**
 * Bassline - Walking bass pattern.
 * Root on 1&3, fifth on 2, approach tone on 4.
 */
export const BASSLINE_PATTERN: PatternDefinition = {
  id: 'bassline',
  name: 'Bass',
  description: 'Walking bass',
  voiceType: 'bass',
  lengthBeats: 4,
  sustained: false,
  // Low density: root + fifth
  minSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 1.8, velocity: 0.65 },
    { degree: 4, beatOffset: 2, durationBeats: 1.8, velocity: 0.55 },
  ],
  // High density: walking quarter notes
  maxSteps: [
    { degree: 0, beatOffset: 0, durationBeats: 0.9, velocity: 0.65 },
    { degree: 4, beatOffset: 1, durationBeats: 0.9, velocity: 0.55 },
    { degree: 0, beatOffset: 2, durationBeats: 0.9, velocity: 0.6 },
    { degree: -1, beatOffset: 3, durationBeats: 0.9, velocity: 0.5 },
  ],
};

// ============================================
// Pattern Registry
// ============================================

export const ACCOMPANIMENT_PATTERNS: Record<AccompanimentPattern, PatternDefinition> = {
  pad: PAD_PATTERN,
  drone: DRONE_PATTERN,
  arpeggio: ARPEGGIO_PATTERN,
  bassline: BASSLINE_PATTERN,
};

/**
 * Get interpolated steps based on density (0-1).
 * At density 0, uses minSteps. At density 1, uses maxSteps.
 * Between: uses minSteps count but interpolates from maxSteps.
 */
export function getStepsForDensity(pattern: PatternDefinition, density: number): PatternStep[] {
  const clampedDensity = Math.max(0, Math.min(1, density));

  if (clampedDensity <= 0.1) return pattern.minSteps;
  if (clampedDensity >= 0.9) return pattern.maxSteps;

  // Interpolate: pick a number of steps between min and max count
  const minCount = pattern.minSteps.length;
  const maxCount = pattern.maxSteps.length;
  const stepCount = Math.round(minCount + (maxCount - minCount) * clampedDensity);

  // Take the first stepCount steps from maxSteps (they're ordered by importance)
  return pattern.maxSteps.slice(0, stepCount);
}
