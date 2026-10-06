// src/audio/worlds/synthLayers.ts
//
// The synth layers sound worlds blend with (or use instead of) samples. Bass, pads and
// plucks are where synthesis beats a handful of samples, and they cost no download, so a
// world sounds right the moment it is chosen while any samples are still loading.

import * as Tone from 'tone';
import type { SynthLayerId } from './soundWorlds';

/** The one thing a layer has to do: play a note at a scheduled time. */
export interface SynthLayer {
  play(midi: number, durationSec: number, time: number, velocity: number): void;
  connect(destination: AudioNode): void;
  dispose(): void;
}

type Options = ConstructorParameters<typeof Tone.Synth>[0];

/** Synth settings per layer. Volumes are set so layers blend under the samples. */
const SYNTH_OPTIONS: Record<Exclude<SynthLayerId, 'bell'>, { options: Options; volume: number }> = {
  // A clean sine an octave's worth of weight under the bass: felt more than heard.
  sub: {
    options: { oscillator: { type: 'sine' }, envelope: { attack: 0.008, decay: 0.25, sustain: 0.85, release: 0.25 } },
    volume: -6,
  },
  pad: {
    options: {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
      envelope: { attack: 0.5, decay: 0.6, sustain: 0.75, release: 1.6 },
    },
    volume: -20,
  },
  pluck: {
    options: { oscillator: { type: 'fattriangle', count: 2, spread: 12 }, envelope: { attack: 0.002, decay: 0.32, sustain: 0.08, release: 0.45 } },
    volume: -9,
  },
  sawBass: {
    options: { oscillator: { type: 'fatsawtooth', count: 2, spread: 8 }, envelope: { attack: 0.004, decay: 0.2, sustain: 0.55, release: 0.12 } },
    volume: -14,
  },
  supersaw: {
    options: {
      oscillator: { type: 'fatsawtooth', count: 5, spread: 36 },
      envelope: { attack: 0.015, decay: 0.3, sustain: 0.5, release: 0.6 },
    },
    volume: -22,
  },
  // Soft electric-piano body under the sampled EP: rounds off its thin top end.
  keys: {
    options: { oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.9, sustain: 0.2, release: 0.6 } },
    volume: -14,
  },
};

const toNote = (midi: number): string => Tone.Frequency(midi, 'midi').toNote();

export function createSynthLayer(id: SynthLayerId, level = 1): SynthLayer {
  const out = new Tone.Gain(level);
  const synth = id === 'bell'
    ? new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 9,
      envelope: { attack: 0.001, decay: 1.4, sustain: 0, release: 1.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 },
    })
    : new Tone.PolySynth(Tone.Synth, SYNTH_OPTIONS[id].options);
  synth.volume.value = id === 'bell' ? -16 : SYNTH_OPTIONS[id].volume;
  synth.connect(out);
  return {
    play(midi, durationSec, time, velocity) {
      synth.triggerAttackRelease(toNote(midi), Math.max(0.02, durationSec), time, Math.max(0, Math.min(1, velocity)));
    },
    connect(destination) {
      out.connect(destination);
    },
    dispose() {
      synth.dispose();
      out.dispose();
    },
  };
}
