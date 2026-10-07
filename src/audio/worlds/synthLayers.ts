// src/audio/worlds/synthLayers.ts
//
// The synth layers sound worlds blend with (or use instead of) samples. Bass, pads and
// plucks are where synthesis beats a handful of samples, and they cost no download, so a
// world sounds right the moment it is chosen while any samples are still loading.
//
// Each layer is a small instrument in its own right: the plucks and basses have a filter
// that opens with the note and closes as it decays (what makes a pluck sound plucked), the
// pads and the supersaw run through a slow chorus for width, and the sub has a soft
// click so it can be placed in a mix without being turned up.

import * as Tone from 'tone';
import type { SynthLayerId } from './soundWorlds';

/** The one thing a layer has to do: play a note at a scheduled time. */
export interface SynthLayer {
  play(midi: number, durationSec: number, time: number, velocity: number): void;
  connect(destination: AudioNode): void;
  dispose(): void;
}

type SynthOptions = ConstructorParameters<typeof Tone.Synth>[0];
type MonoOptions = ConstructorParameters<typeof Tone.MonoSynth>[0];

const toNote = (midi: number): string => Tone.Frequency(midi, 'midi').toNote();

/** Plain synths: pad, keys and the supersaw (the fat oscillators do the work). */
const SIMPLE: Partial<Record<SynthLayerId, { options: SynthOptions; volume: number; chorus?: boolean }>> = {
  pad: {
    options: {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
      envelope: { attack: 0.6, decay: 0.8, sustain: 0.75, release: 1.8 },
    },
    volume: -21,
    chorus: true,
  },
  supersaw: {
    options: {
      oscillator: { type: 'fatsawtooth', count: 7, spread: 40 },
      envelope: { attack: 0.015, decay: 0.35, sustain: 0.5, release: 0.7 },
    },
    volume: -23,
    chorus: true,
  },
  // Soft electric-piano body under the sampled EP: rounds off its thin top end.
  keys: {
    options: { oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.9, sustain: 0.2, release: 0.6 } },
    volume: -14,
  },
};

/** Synths with a filter envelope: the pluck opens and closes, the basses bite then settle. */
const FILTERED: Partial<Record<SynthLayerId, { options: MonoOptions; volume: number }>> = {
  pluck: {
    options: {
      oscillator: { type: 'fattriangle', count: 2, spread: 10 },
      envelope: { attack: 0.002, decay: 0.35, sustain: 0.05, release: 0.4 },
      filter: { type: 'lowpass', Q: 1.2, rolloff: -24 },
      filterEnvelope: { attack: 0.003, decay: 0.25, sustain: 0.15, release: 0.3, baseFrequency: 300, octaves: 3.5 },
    },
    volume: -10,
  },
  sawBass: {
    options: {
      oscillator: { type: 'fatsawtooth', count: 2, spread: 6 },
      envelope: { attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.12 },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.1, baseFrequency: 120, octaves: 3 },
    },
    volume: -13,
  },
  // A clean sine with a little edge on the attack: felt more than heard.
  sub: {
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.008, decay: 0.25, sustain: 0.85, release: 0.25 },
      filter: { type: 'lowpass', Q: 0.5, rolloff: -12 },
      filterEnvelope: { attack: 0.002, decay: 0.08, sustain: 0.6, release: 0.2, baseFrequency: 200, octaves: 2.5 },
    },
    volume: -6,
  },
};

export function createSynthLayer(id: SynthLayerId, level = 1): SynthLayer {
  const out = new Tone.Gain(level);
  let synth: Tone.PolySynth;
  let chorus: Tone.Chorus | null = null;
  const filtered = FILTERED[id];
  const simple = SIMPLE[id];
  if (id === 'bell') {
    synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 9,
      envelope: { attack: 0.001, decay: 1.4, sustain: 0, release: 1.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 },
    });
    synth.volume.value = -16;
  } else if (filtered) {
    synth = new Tone.PolySynth(Tone.MonoSynth, filtered.options);
    synth.volume.value = filtered.volume;
  } else if (simple) {
    synth = new Tone.PolySynth(Tone.Synth, simple.options);
    synth.volume.value = simple.volume;
    if (simple.chorus) {
      // Slow and wide: movement, not wobble.
      chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.5, spread: 160, wet: 0.35 }).start();
    }
  } else {
    synth = new Tone.PolySynth(Tone.Synth);
  }
  synth.maxPolyphony = 16;
  if (chorus) {
    synth.connect(chorus);
    chorus.connect(out);
  } else {
    synth.connect(out);
  }
  return {
    play(midi, durationSec, time, velocity) {
      synth.triggerAttackRelease(toNote(midi), Math.max(0.02, durationSec), time, Math.max(0, Math.min(1, velocity)));
    },
    connect(destination) {
      out.connect(destination);
    },
    dispose() {
      synth.dispose();
      chorus?.dispose();
      out.dispose();
    },
  };
}
