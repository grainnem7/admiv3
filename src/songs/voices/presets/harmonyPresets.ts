/**
 * Harmony presets (🟢 Green voice, harmonizer mode).
 *
 * Sustains a single voice underneath the singer. Bright enough to be
 * audible against vocals + band, but soft-attack so it doesn't compete
 * with the lead vocal's consonants.
 */

import type { SynthConfig } from '../SynthPlayer';

export interface HarmonyPreset {
  name: string;
  /** Min note duration in seconds (used by triggerAttackRelease). */
  duration: number;
  synthConfig: SynthConfig;
}

export const HARMONY_PRESETS: Record<string, HarmonyPreset> = {
  vocalPad: {
    name: 'Vocal Pad',
    duration: 0.6,
    synthConfig: {
      kind: 'poly',
      polyVoice: 'synth',
      polyphony: 4,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.08, decay: 0.3, sustain: 0.7, release: 0.4 },
      },
    },
  },
  softSaw: {
    name: 'Soft Saw',
    duration: 0.6,
    synthConfig: {
      kind: 'poly',
      polyVoice: 'synth',
      polyphony: 4,
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.5 },
      },
    },
  },
};

export const HARMONY_PRESET_LIST = Object.entries(HARMONY_PRESETS).map(
  ([key, preset]) => ({ key, name: preset.name }),
);

export const DEFAULT_HARMONY_PRESET = 'vocalPad';
