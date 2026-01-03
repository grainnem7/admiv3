/**
 * Dream Preset
 *
 * Ethereal, floaty sound perfect for meditation and relaxation.
 * Good for: Meditation, sleep, ambient therapy, accessibility relaxation
 */

import type { EffectChainPreset } from '../types';

export const DreamPreset: EffectChainPreset = {
  id: 'dream',
  name: 'Dream',
  description: 'Ethereal and floaty for meditation and relaxation',
  category: 'space',
  effects: [
    {
      type: 'filter',
      config: {
        type: 'lowpass',
        frequency: 3500,
        Q: 0.3,
        rolloff: -24,
      },
    },
    {
      type: 'phaser',
      config: {
        frequency: 0.15,
        octaves: 2,
        baseFrequency: 500,
        wet: 0.3,
      },
    },
    {
      type: 'chorus',
      config: {
        frequency: 0.2,
        delayTime: 8,
        depth: 0.9,
        wet: 0.5,
      },
    },
    {
      type: 'delay',
      config: {
        delayTime: '2n',
        feedback: 0.5,
        wet: 0.4,
      },
    },
    {
      type: 'reverb',
      config: {
        decay: 12,
        wet: 0.6,
        preDelay: 0.15,
      },
    },
  ],
  masterGain: -5,
  voiceSettings: {
    melody: { volume: -10, attack: 0.15, release: 5.0 },
    bass: { volume: -14, attack: 0.3, release: 4.0 },
    chord: { volume: -16, attack: 0.6, release: 6.0 },
  },
};
