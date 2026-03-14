/**
 * Built-in music settings presets.
 * Each preset provides partial overrides — merged over DEFAULT_MUSIC_SETTINGS when applied.
 */

import type { MusicSettingsPreset } from '../state/types';

export const BUILT_IN_MUSIC_PRESETS: MusicSettingsPreset[] = [
  {
    id: 'music-default',
    name: 'Default',
    description: 'Balanced settings for general use',
    isBuiltIn: true,
    settings: {},
  },
  {
    id: 'music-ambient',
    name: 'Ambient',
    description: 'Slow, atmospheric, reverb-heavy',
    isBuiltIn: true,
    settings: {
      scale: 'wholeTone',
      melodicSynthType: 'sine',
      chordSynthType: 'triangle',
      attackTime: 0.8,
      releaseTime: 0.9,
      vibratoDepth: 0.2,
      vibratoRate: 0.2,
      portamento: 0.6,
      reverbAmount: 0.7,
      delayAmount: 0.4,
      harmonicRichness: 0.5,
      tempoRange: [40, 80],
      chordProgression: 'contemplative',
      dynamicsRange: [0.2, 0.6],
      noteInterval: 400,
      filterFrequency: 0.3,
    },
  },
  {
    id: 'music-expressive',
    name: 'Expressive',
    description: 'Wide dynamics, vibrato, responsive',
    isBuiltIn: true,
    settings: {
      melodicSynthType: 'sawtooth',
      vibratoDepth: 0.5,
      vibratoRate: 0.6,
      portamento: 0.3,
      dynamicsRange: [0.1, 1.0],
      attackTime: 0.05,
      releaseTime: 0.3,
      noteInterval: 100,
      movementThreshold: 0.02,
      reverbAmount: 0.4,
      tempoRange: [80, 160],
      swingAmount: 0.2,
    },
  },
  {
    id: 'music-subtle',
    name: 'Subtle Movements',
    description: 'High sensitivity for minimal movement',
    isBuiltIn: true,
    settings: {
      movementThreshold: 0.01,
      confidenceThreshold: 0.15,
      noteInterval: 300,
      dynamicsRange: [0.4, 0.7],
      attackTime: 0.4,
      releaseTime: 0.7,
      vibratoDepth: 0.1,
      reverbAmount: 0.5,
    },
  },
  {
    id: 'music-pentatonic',
    name: 'Pentatonic',
    description: 'Always sounds good, no wrong notes',
    isBuiltIn: true,
    settings: {
      scale: 'pentatonic',
      rootNote: 'C',
      melodicSynthType: 'triangle',
      harmonicRichness: 0.2,
    },
  },
  {
    id: 'music-single-hand',
    name: 'Single Hand',
    description: 'Optimized for one-handed control',
    isBuiltIn: true,
    settings: {
      movementThreshold: 0.02,
      noteInterval: 200,
      dynamicsRange: [0.4, 0.8],
      vibratoDepth: 0,
      portamento: 0.1,
    },
  },
  {
    id: 'music-blues',
    name: 'Blues',
    description: 'Blues scale with swing and expression',
    isBuiltIn: true,
    settings: {
      scale: 'blues',
      rootNote: 'A',
      melodicSynthType: 'sawtooth',
      bassSynthType: 'triangle',
      swingAmount: 0.4,
      vibratoDepth: 0.3,
      vibratoRate: 0.5,
      attackTime: 0.05,
      releaseTime: 0.4,
      dynamicsRange: [0.2, 0.9],
      reverbAmount: 0.3,
      delayAmount: 0.2,
      harmonicRichness: 0.4,
    },
  },
];

/**
 * Get a built-in preset by ID.
 */
export function getBuiltInMusicPreset(id: string): MusicSettingsPreset | undefined {
  return BUILT_IN_MUSIC_PRESETS.find((p) => p.id === id);
}
