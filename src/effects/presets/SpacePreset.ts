/**
 * Space Preset
 *
 * Expansive, atmospheric sound with lush reverb and modulation.
 * Good for: Ambient, cinematic, meditation, atmospheric performances
 */

import type { EffectChainPreset } from '../types';

export const SpacePreset: EffectChainPreset = {
  id: 'space',
  name: 'Space',
  description: 'Lush reverb and delay for atmospheric soundscapes',
  category: 'space',
  effects: [
    {
      type: 'filter',
      config: {
        type: 'lowpass',
        frequency: 6000,
        Q: 0.5,
        rolloff: -12,
      },
    },
    {
      type: 'chorus',
      config: {
        frequency: 0.5,
        delayTime: 5,
        depth: 0.8,
        wet: 0.4,
      },
    },
    {
      type: 'delay',
      config: {
        delayTime: '4n.',
        feedback: 0.4,
        wet: 0.35,
      },
    },
    {
      type: 'phaser',
      config: {
        frequency: 0.3,
        octaves: 3,
        baseFrequency: 350,
        wet: 0.2,
      },
    },
    {
      type: 'reverb',
      config: {
        decay: 8,
        wet: 0.5,
        preDelay: 0.1,
      },
    },
  ],
  masterGain: -3,
  voiceSettings: {
    melody: { volume: -8, attack: 0.05, release: 3.0 },
    bass: { volume: -10, attack: 0.1, release: 2.0 },
    chord: { volume: -14, attack: 0.4, release: 4.0 },
  },
};
