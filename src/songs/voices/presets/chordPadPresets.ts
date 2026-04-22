/**
 * Chord Pad presets (🔴 Red voice).
 *
 * Each preset is a discriminated union on `kind`:
 *   - 'sampled': plays via SamplerPlayer using a SAMPLE_CONFIGS entry
 *   - 'synth':   plays via SynthPlayer using a SynthConfig
 *
 * Voice-specific playback params (`name`, `sustained`) are on BOTH variants —
 * they control how the voice triggers and releases notes and are independent
 * of whether the sound comes from a sample or a synth.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

// ============================================
// Types
// ============================================

interface PadPresetCommon {
  name: string;
  /** If true, voice holds notes until release; if false, notes decay. */
  sustained: boolean;
}

export type PadPreset =
  | (PadPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (PadPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

// ============================================
// Presets
// ============================================

export const PAD_PRESETS: Record<string, PadPreset> = {
  warmPad: {
    kind: 'synth',
    name: 'Warm Pad',
    sustained: true,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'synth',
      options: {
        oscillator: { type: 'sawtooth', spread: 20, count: 3 },
        envelope: { attack: 0.6, decay: 0.2, sustain: 0.9, release: 3 },
      },
      chorusDepth: 0.4,
    },
  },
  rhodesEP: {
    kind: 'synth',
    name: 'Rhodes EP',
    sustained: true,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'fm',
      // sustain is raised from the default Rhodes 0.3 — for pad use in slow
      // ballads a 30% sustain level audibly decays away over held chords.
      // 0.7 keeps the Rhodes attack character but preserves pad presence.
      options: {
        harmonicity: 3,
        modulationIndex: 10,
        envelope: { attack: 0.005, decay: 2.0, sustain: 0.7, release: 2.5 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.5, release: 0.8 },
      },
      chorusDepth: 0.5,
    },
  },
  strings: {
    kind: 'synth',
    name: 'Strings',
    sustained: true,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'synth',
      options: {
        oscillator: { type: 'sawtooth', spread: 30, count: 5 },
        envelope: { attack: 1.2, decay: 0.3, sustain: 0.8, release: 2.5 },
      },
      chorusDepth: 0.3,
    },
  },
  choir: {
    kind: 'synth',
    name: 'Choir',
    sustained: true,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'am',
      options: {
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.8, decay: 0.4, sustain: 0.9, release: 2 },
        modulation: { type: 'sine' },
      },
      chorusDepth: 0.5,
    },
  },
  glassPad: {
    kind: 'synth',
    name: 'Glass Pad',
    sustained: true,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'fm',
      options: {
        harmonicity: 8,
        modulationIndex: 4,
        envelope: { attack: 0.4, decay: 0.4, sustain: 0.7, release: 3 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1 },
      },
      chorusDepth: 0.4,
    },
  },
  organ: {
    kind: 'sampled',
    name: 'Organ',
    sustained: true,
    sampleKey: 'organ',
  },
  stab: {
    kind: 'synth',
    name: 'Stab',
    sustained: false,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'synth',
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.3 },
      },
    },
  },
};

export const PAD_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(PAD_PRESETS).map(([key, p]) => ({ key, name: p.name }));
