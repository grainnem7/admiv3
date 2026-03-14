/**
 * Default values for MusicSettings.
 * Matches current SoundEngine defaults so behavior is unchanged until user modifies settings.
 */

import type { MusicSettings } from './types';

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  // Sensitivity controls
  movementThreshold: 0.03,
  confidenceThreshold: 0.3,
  noteInterval: 200,

  // Musical options
  scale: 'pentatonic',
  rootNote: 'C',
  chordProgression: 'contemplative',
  tempoRange: [60, 120],

  // Per-voice synth types (matching current SoundEngine VOICE_CONFIGS)
  melodicSynthType: 'triangle',
  bassSynthType: 'sine',
  chordSynthType: 'sine',

  // Envelope (normalized 0-1)
  attackTime: 0.1,
  releaseTime: 0.5,

  // Expression
  vibratoDepth: 0,
  vibratoRate: 0.5,
  portamento: 0,

  // Dynamics
  dynamicsRange: [0.3, 0.8],

  // Rhythm
  swingAmount: 0,

  // Harmony
  harmonicRichness: 0.3,

  // Body part musical role assignments (matching movement-to-music-ai defaults)
  bodyPartConfigs: {
    rightWrist:    { role: 'melodic', octaveRange: [5, 6], sensitivity: 1 },
    rightElbow:    { role: 'melodic', octaveRange: [4, 5], sensitivity: 1 },
    rightShoulder: { role: 'melodic', octaveRange: [4, 5], sensitivity: 1 },
    rightHip:      { role: 'melodic', octaveRange: [3, 4], sensitivity: 1 },
    rightKnee:     { role: 'melodic', octaveRange: [4, 5], sensitivity: 1 },
    rightAnkle:    { role: 'melodic', octaveRange: [5, 6], sensitivity: 1 },
    leftWrist:     { role: 'bass',    octaveRange: [1, 3], sensitivity: 1 },
    leftElbow:     { role: 'bass',    octaveRange: [1, 3], sensitivity: 1 },
    leftShoulder:  { role: 'chord',   octaveRange: [2, 4], sensitivity: 1 },
    leftHip:       { role: 'bass',    octaveRange: [1, 2], sensitivity: 1 },
    leftKnee:      { role: 'bass',    octaveRange: [1, 3], sensitivity: 1 },
    leftAnkle:     { role: 'bass',    octaveRange: [1, 3], sensitivity: 1 },
    head:          { role: 'disabled', octaveRange: [4, 5], sensitivity: 1 },
  },

  // Effects (matching current SoundEngine defaults)
  reverbAmount: 0.35,
  delayAmount: 0.15,
  filterFrequency: 0.5,
  filterType: 'lowpass',

  // Visual feedback
  showActiveIndicators: true,
  showMovementIntensity: true,
  showCurrentChord: false,
};
