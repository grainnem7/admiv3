// src/audio/worlds/soundWorlds.ts
//
// A sound world is one curated choice that sets every part's sound, the drums' colour and
// the space at once, so the parts are chosen to sit together instead of one instrument at
// a time from a long list. See docs/superpowers/specs/2026-10-06-board-sequencer-sound-
// and-generative-design.md (part A).

import type { SampleConfigKey } from '../../songs/voices/SamplerPlayer';

export type SoundWorldId = 'warm' | 'lofi' | 'ambient' | 'electronic';
/** 'none' = the player's own instrument picks, as before worlds existed. */
export type SoundWorldChoice = SoundWorldId | 'none';

export type SynthLayerId = 'sub' | 'pad' | 'pluck' | 'sawBass' | 'bell' | 'supersaw' | 'keys';

/** One part's sound: a sampled instrument, a synth layer, or both blended. */
export interface LayeredVoiceSpec {
  sample?: SampleConfigKey;
  synth?: SynthLayerId;
  /** Linear level of each layer (0–1). */
  sampleLevel?: number;
  synthLevel?: number;
}

export interface SoundWorld {
  id: SoundWorldId;
  name: string;
  /** One plain sentence for the picker. */
  description: string;
  voices: Record<'melody' | 'chord' | 'bass', LayeredVoiceSpec>;
  drums: {
    /** Low-pass on the kit: lower is softer and duller ("dusty"). */
    toneHz: number;
    /** Kit level relative to the rest. */
    level: number;
  };
  /** Low-pass over the whole board mix; 20000 = open. Lo-fi's character lives here. */
  mixToneHz: number;
  /** The room: how long the shared reverb rings, and the gap before it starts. */
  reverbDecay: number;
  reverbPreDelay: number;
  /** Reverb and delay send for a part that has no send of its own. */
  reverbSend: number;
  delaySend: number;
  /** How far bass, chords and pads dip on each kick (overrides the default mix). */
  duck: number;
  /** Extra swing on phrase off-beats, on top of the player's own. The funk. */
  phraseSwing: number;
}

export const SOUND_WORLDS: Record<SoundWorldId, SoundWorld> = {
  warm: {
    id: 'warm',
    name: 'Warm',
    description: 'Piano, soft strings and an upright bass, in a room.',
    voices: {
      melody: { sample: 'piano' },
      chord: { sample: 'piano', synth: 'pad', sampleLevel: 0.8, synthLevel: 0.35 },
      bass: { sample: 'contrabass', synth: 'sub', sampleLevel: 0.7, synthLevel: 0.55 },
    },
    drums: { toneHz: 9000, level: 0.85 },
    mixToneHz: 20000,
    reverbDecay: 2.2,
    reverbPreDelay: 0.015,
    reverbSend: 0.22,
    delaySend: 0,
    duck: 0.2,
    phraseSwing: 0.08,
  },
  lofi: {
    id: 'lofi',
    name: 'Lo-fi',
    description: 'Dusty electric piano, deep round bass and a lazy, swung beat.',
    voices: {
      melody: { sample: 'electricPiano', synth: 'keys', sampleLevel: 0.85, synthLevel: 0.25 },
      chord: { sample: 'electricPiano', synth: 'pad', sampleLevel: 0.8, synthLevel: 0.25 },
      bass: { sample: 'bassElectric', synth: 'sub', sampleLevel: 0.35, synthLevel: 0.8 },
    },
    drums: { toneHz: 5200, level: 0.95 },
    mixToneHz: 6500,
    reverbDecay: 1.4,
    reverbPreDelay: 0.008,
    reverbSend: 0.14,
    delaySend: 0.1,
    duck: 0.35,
    phraseSwing: 0.3,
  },
  ambient: {
    id: 'ambient',
    name: 'Ambient',
    description: 'Bells and harp over long pads, with a soft pulse and a lot of space.',
    voices: {
      melody: { sample: 'harp', synth: 'bell', sampleLevel: 0.7, synthLevel: 0.45 },
      chord: { sample: 'padChoir', synth: 'pad', sampleLevel: 0.6, synthLevel: 0.6 },
      bass: { synth: 'sub', synthLevel: 0.75 },
    },
    drums: { toneHz: 3800, level: 0.6 },
    mixToneHz: 20000,
    reverbDecay: 6.5,
    reverbPreDelay: 0.03,
    reverbSend: 0.45,
    delaySend: 0.25,
    duck: 0.15,
    phraseSwing: 0,
  },
  electronic: {
    id: 'electronic',
    name: 'Electronic',
    description: 'Synth plucks, wide saw chords, a punchy bass and a pumping beat.',
    voices: {
      melody: { synth: 'pluck', synthLevel: 0.9 },
      chord: { synth: 'supersaw', synthLevel: 0.75 },
      bass: { synth: 'sawBass', synthLevel: 0.85 },
    },
    drums: { toneHz: 16000, level: 1 },
    mixToneHz: 20000,
    reverbDecay: 1.3,
    reverbPreDelay: 0.005,
    reverbSend: 0.12,
    delaySend: 0.14,
    duck: 0.5,
    phraseSwing: 0,
  },
};

export const SOUND_WORLD_IDS: SoundWorldId[] = ['warm', 'lofi', 'ambient', 'electronic'];

export function isSoundWorldChoice(v: unknown): v is SoundWorldChoice {
  return v === 'none' || (typeof v === 'string' && (SOUND_WORLD_IDS as string[]).includes(v));
}

export function worldOf(choice: SoundWorldChoice): SoundWorld | null {
  return choice === 'none' ? null : SOUND_WORLDS[choice];
}

/**
 * What a part plays: the player's own instrument when they picked one, otherwise the
 * world's sound for that part, otherwise the old defaults. A choice the player made is
 * never overridden by picking a world.
 */
export function voiceSpecFor(
  ch: { role: string; instrument?: string },
  choice: SoundWorldChoice,
): LayeredVoiceSpec | string {
  if (ch.instrument && ch.instrument.length > 0) return ch.instrument;
  const world = worldOf(choice);
  if (world && (ch.role === 'melody' || ch.role === 'chord' || ch.role === 'bass')) return world.voices[ch.role];
  return ch.role === 'bass' ? 'bassElectric' : 'electricPiano';
}
