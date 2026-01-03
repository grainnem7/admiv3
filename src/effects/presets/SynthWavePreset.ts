/**
 * SynthWave Preset
 *
 * 80s-inspired electronic sound with chorus, delay and pumping.
 * Good for: Synthwave, retrowave, electronic, dance
 */

import type { EffectChainPreset } from '../types';

export const SynthWavePreset: EffectChainPreset = {
  id: 'synthwave',
  name: 'SynthWave',
  description: '80s-inspired with chorus, delay and punch',
  category: 'electronic',
  effects: [
    {
      type: 'filter',
      config: {
        type: 'lowpass',
        frequency: 7000,
        Q: 1.2,
        rolloff: -24,
      },
    },
    {
      type: 'compressor',
      config: {
        threshold: -18,
        ratio: 4,
        attack: 0.01,
        release: 0.15,
      },
    },
    {
      type: 'chorus',
      config: {
        frequency: 2,
        delayTime: 3,
        depth: 0.6,
        wet: 0.5,
      },
    },
    {
      type: 'delay',
      config: {
        delayTime: '8n',
        feedback: 0.35,
        wet: 0.3,
      },
    },
    {
      type: 'reverb',
      config: {
        decay: 3,
        wet: 0.35,
        preDelay: 0.02,
      },
    },
  ],
  masterGain: -2,
  voiceSettings: {
    melody: { volume: -4, attack: 0.01, release: 0.8 },
    bass: { volume: -6, attack: 0.02, release: 0.5 },
    chord: { volume: -10, attack: 0.1, release: 1.5 },
  },
};
