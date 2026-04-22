/**
 * Arpeggio presets (🟡 Yellow voice).
 *
 * Triggered step-by-step on the 8th-note grid (density adjusted by X position).
 * Short notes — decay, not sustain. Sampled presets cover plucked/keyed timbres;
 * synth presets (FM, AM) cover mallet and modern-pluck sounds.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

interface ArpPresetCommon {
  name: string;
  /** Nominal step note duration in seconds. */
  duration: number;
}

export type ArpPreset =
  | (ArpPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (ArpPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

export const ARP_PRESETS: Record<string, ArpPreset> = {
  piano:       { kind: 'sampled', name: 'Piano',         duration: 0.6, sampleKey: 'piano' },
  harp:        { kind: 'sampled', name: 'Harp',          duration: 0.8, sampleKey: 'harp' },
  nylonGuitar: { kind: 'sampled', name: 'Nylon Guitar',  duration: 0.5, sampleKey: 'guitarNylon' },
  vibes: {
    kind: 'synth',
    name: 'Vibes',
    duration: 1.2,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 4,
        modulationIndex: 2,
        envelope: { attack: 0.003, decay: 1.5, sustain: 0, release: 0.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.003, decay: 0.8, sustain: 0, release: 0.3 },
      },
      chorusDepth: 0.35,
    },
  },
  marimba: {
    kind: 'synth',
    name: 'Marimba',
    duration: 0.4,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 3,
        modulationIndex: 8,
        envelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0.2 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.003, decay: 0.15, sustain: 0, release: 0.1 },
      },
    },
  },
  musicBox: {
    kind: 'synth',
    name: 'Music Box',
    duration: 1.0,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 7,
        modulationIndex: 3,
        envelope: { attack: 0.005, decay: 0.9, sustain: 0, release: 0.3 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.2 },
      },
      chorusDepth: 0.2,
    },
  },
  pluckedSynth: {
    kind: 'synth',
    name: 'Plucked Synth',
    duration: 0.5,
    synthConfig: {
      kind: 'am',
      options: {
        harmonicity: 2,
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.003, decay: 0.4, sustain: 0, release: 0.2 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0.1 },
      },
    },
  },
};

export const ARP_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(ARP_PRESETS).map(([key, p]) => ({ key, name: p.name }));
