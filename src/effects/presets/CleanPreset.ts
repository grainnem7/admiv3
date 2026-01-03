/**
 * Clean Preset
 *
 * Minimal processing for a pure, uncolored sound.
 * Good for: Classical, acoustic instruments, clear melodies
 */

import type { EffectChainPreset } from '../types';

export const CleanPreset: EffectChainPreset = {
  id: 'clean',
  name: 'Clean',
  description: 'Pure, unprocessed sound with minimal effects',
  category: 'clean',
  effects: [
    {
      type: 'filter',
      config: {
        type: 'lowpass',
        frequency: 8000,
        Q: 0.5,
        rolloff: -12,
      },
    },
    {
      type: 'reverb',
      config: {
        decay: 1.5,
        wet: 0.15,
        preDelay: 0.01,
      },
    },
  ],
  masterGain: 0,
  voiceSettings: {
    melody: { volume: -6 },
    bass: { volume: -8 },
    chord: { volume: -10 },
  },
};
