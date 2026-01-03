/**
 * Lo-Fi Preset
 *
 * Vintage, degraded sound with bitcrushing and filtering.
 * Good for: Lo-fi hip hop, chillwave, nostalgic vibes
 */

import type { EffectChainPreset } from '../types';

export const LoFiPreset: EffectChainPreset = {
  id: 'lofi',
  name: 'Lo-Fi',
  description: 'Vintage character with bit reduction and warmth',
  category: 'lofi',
  effects: [
    {
      type: 'filter',
      config: {
        type: 'bandpass',
        frequency: 2000,
        Q: 0.8,
        rolloff: -24,
      },
    },
    {
      type: 'bitcrusher',
      config: {
        bits: 8,
        wet: 0.4,
      },
    },
    {
      type: 'distortion',
      config: {
        distortion: 0.2,
        wet: 0.25,
      },
    },
    {
      type: 'tremolo',
      config: {
        frequency: 3,
        depth: 0.15,
        wet: 0.3,
      },
    },
    {
      type: 'chorus',
      config: {
        frequency: 0.3,
        delayTime: 6,
        depth: 0.4,
        wet: 0.25,
      },
    },
    {
      type: 'reverb',
      config: {
        decay: 2,
        wet: 0.3,
        preDelay: 0.02,
      },
    },
  ],
  masterGain: -4,
  voiceSettings: {
    melody: { volume: -6, attack: 0.02, release: 1.2 },
    bass: { volume: -10, attack: 0.05 },
    chord: { volume: -12, attack: 0.15, release: 1.5 },
  },
};
