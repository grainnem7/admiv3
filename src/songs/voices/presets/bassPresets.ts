/**
 * Bass presets (🟠 Orange voice).
 *
 * Rhythmic bass hits played at tempo-derived durations (e.g. eighth or quarter
 * notes). The `duration` field below is a *nominal* reference used by the UI
 * and may be displayed in the preset dropdown; the actual hit duration is
 * determined by the voice's rhythm logic (tempo × step fraction). Synth
 * presets use monophonic synths (MonoSynth / FMSynth) — the bass line is
 * naturally one note at a time.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

interface BassPresetCommon {
  name: string;
  /** Nominal hit duration in seconds (reference only — voice uses tempo-derived duration). */
  duration: number;
}

export type BassPreset =
  | (BassPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (BassPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

export const BASS_PRESETS: Record<string, BassPreset> = {
  upright: { kind: 'sampled', name: 'Upright Bass', duration: 0.5, sampleKey: 'contrabass' },
  electric: { kind: 'sampled', name: 'Electric Bass', duration: 0.5, sampleKey: 'bassElectric' },
  electricSynth: {
    kind: 'synth',
    name: 'Electric Bass (Synth)',
    duration: 0.4,
    synthConfig: {
      kind: 'mono',
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.2 },
        filter: { Q: 1, type: 'lowpass', rolloff: -12 },
        filterEnvelope: { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.2, baseFrequency: 200, octaves: 2.5 },
      },
    },
  },
  sub: {
    kind: 'synth',
    name: 'Sub Bass',
    duration: 0.6,
    synthConfig: {
      kind: 'mono',
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.3, release: 0.3 },
        filter: { Q: 1, type: 'lowpass', rolloff: -24 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2, baseFrequency: 120, octaves: 1.5 },
      },
    },
  },
  fm: {
    kind: 'synth',
    name: 'FM Bass',
    duration: 0.4,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 2,
        modulationIndex: 12,
        envelope: { attack: 0.003, decay: 0.3, sustain: 0.1, release: 0.15 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.003, decay: 0.1, sustain: 0, release: 0.1 },
      },
    },
  },
  moog: {
    kind: 'synth',
    name: 'Moog',
    duration: 0.5,
    synthConfig: {
      kind: 'mono',
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.35, sustain: 0.2, release: 0.25 },
        filter: { Q: 6, type: 'lowpass', rolloff: -24 },
        filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 100, octaves: 3 },
      },
    },
  },
  tuba:    { kind: 'sampled', name: 'Tuba', duration: 0.8, sampleKey: 'tuba' },
};

export const BASS_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(BASS_PRESETS).map(([key, p]) => ({ key, name: p.name }));
