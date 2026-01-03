/**
 * Warm Preset
 *
 * Analog-style warmth with subtle saturation and compression.
 * Good for: Jazz, soul, R&B, intimate performances
 */

import type { EffectChainPreset } from '../types';

export const WarmPreset: EffectChainPreset = {
  id: 'warm',
  name: 'Warm',
  description: 'Analog warmth with subtle saturation',
  category: 'warm',
  effects: [
    {
      type: 'filter',
      config: {
        type: 'lowpass',
        frequency: 5000,
        Q: 0.7,
        rolloff: -24,
      },
    },
    {
      type: 'distortion',
      config: {
        distortion: 0.15,
        wet: 0.3,
      },
    },
    {
      type: 'compressor',
      config: {
        threshold: -20,
        ratio: 3,
        attack: 0.05,
        release: 0.2,
      },
    },
    {
      type: 'chorus',
      config: {
        frequency: 0.8,
        delayTime: 4,
        depth: 0.3,
        wet: 0.2,
      },
    },
    {
      type: 'reverb',
      config: {
        decay: 2.5,
        wet: 0.25,
        preDelay: 0.03,
      },
    },
  ],
  masterGain: -2,
  voiceSettings: {
    melody: { volume: -6, attack: 0.03, release: 1.5 },
    bass: { volume: -8, attack: 0.08 },
    chord: { volume: -12, attack: 0.2, release: 2.0 },
  },
};
