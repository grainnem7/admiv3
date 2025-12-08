/**
 * Sound Presets - Predefined sound configurations
 */

import type { SoundPreset } from '../state/types';

export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: 'default',
    name: 'Soft Pad',
    oscillatorType: 'sine',
    attack: 0.1,
    decay: 0.2,
    sustain: 0.7,
    release: 0.5,
  },
  {
    id: 'bright',
    name: 'Bright Lead',
    oscillatorType: 'sawtooth',
    attack: 0.02,
    decay: 0.1,
    sustain: 0.8,
    release: 0.3,
  },
  {
    id: 'warm',
    name: 'Warm Bass',
    oscillatorType: 'triangle',
    attack: 0.05,
    decay: 0.3,
    sustain: 0.6,
    release: 0.4,
  },
  {
    id: 'electric',
    name: 'Electric',
    oscillatorType: 'square',
    attack: 0.01,
    decay: 0.15,
    sustain: 0.5,
    release: 0.2,
  },
  {
    id: 'gentle',
    name: 'Gentle Tone',
    oscillatorType: 'sine',
    attack: 0.3,
    decay: 0.4,
    sustain: 0.5,
    release: 0.8,
  },
];

/**
 * Get a preset by ID
 */
export function getPreset(id: string): SoundPreset | undefined {
  return SOUND_PRESETS.find((p) => p.id === id);
}

/**
 * Get the default preset
 */
export function getDefaultPreset(): SoundPreset {
  return SOUND_PRESETS[0];
}

/**
 * Get all available presets
 */
export function getAllPresets(): SoundPreset[] {
  return [...SOUND_PRESETS];
}
