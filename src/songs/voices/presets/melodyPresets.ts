/**
 * Melody presets (🟢 Green voice).
 *
 * Triggered on pentatonic band-crossing. Single-voice line, so synth presets
 * use monophonic FM (celesta, musicBox) — the voice triggers notes with a
 * fixed duration via triggerAttackRelease, so overlapping tails between
 * crossings are handled by each player's release envelope, not polyphony.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

interface MelodyPresetCommon {
  name: string;
  /** Nominal note duration in seconds (used for triggerAttackRelease). */
  duration: number;
}

export type MelodyPreset =
  | (MelodyPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (MelodyPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

export const MELODY_PRESETS: Record<string, MelodyPreset> = {
  celesta: {
    kind: 'synth',
    name: 'Celesta',
    duration: 1.8,
    synthConfig: {
      kind: 'poly', polyVoice: 'fm', polyphony: 8,
      options: {
        harmonicity: 5,
        modulationIndex: 6,
        envelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 0.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
      },
      chorusDepth: 0.25,
    },
  },
  violin:     { kind: 'sampled', name: 'Violin',      duration: 2.5, sampleKey: 'violin' },
  cello:      { kind: 'sampled', name: 'Cello',       duration: 2.5, sampleKey: 'cello' },
  clarinet:   { kind: 'sampled', name: 'Clarinet',    duration: 2.0, sampleKey: 'clarinet' },
  frenchHorn: { kind: 'sampled', name: 'French Horn', duration: 2.2, sampleKey: 'frenchHorn' },
  nylonPluck: { kind: 'sampled', name: 'Nylon Pluck', duration: 1.5, sampleKey: 'guitarNylon' },
  electricPiano: { kind: 'sampled', name: 'Electric Piano', duration: 1.8, sampleKey: 'electricPiano' },
  musicBox: {
    kind: 'synth',
    name: 'Music Box',
    duration: 1.6,
    synthConfig: {
      kind: 'poly', polyVoice: 'fm', polyphony: 8,
      options: {
        harmonicity: 7,
        modulationIndex: 3,
        envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 0.4 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.2 },
      },
      chorusDepth: 0.2,
    },
  },
};

export const MELODY_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(MELODY_PRESETS).map(([key, p]) => ({ key, name: p.name }));
