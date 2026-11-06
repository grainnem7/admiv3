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
const SYNTH_LAYER_IDS: readonly SynthLayerId[] = ['sub', 'pad', 'pluck', 'sawBass', 'bell', 'supersaw', 'keys'];

/** A colour's own `instrument` that is a synth layer is stored as `synth:<layer>`. */
export const SYNTH_PREFIX = 'synth:';

/** The synth layer of a `synth:<layer>` instrument, or null for a sampled one. */
export function synthLayerOf(key: string): SynthLayerId | null {
  if (!key.startsWith(SYNTH_PREFIX)) return null;
  const id = key.slice(SYNTH_PREFIX.length);
  return SYNTH_LAYER_IDS.includes(id as SynthLayerId) ? (id as SynthLayerId) : null;
}

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
  /**
   * The world's level over the whole board, in dB, so that every world is about as loud as
   * the others and a world no longer decides how loud a scene is. Measured, not guessed:
   * see e2e/loudness.e2e.ts for the method and the numbers.
   */
  levelDb: number;
  /**
   * How much may sound at once in this World, as a step on the loops' density cap: Ambient
   * is sparser by one, Electronic busier by one, the others as Energy says (S2).
   */
  density: number;
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
    levelDb: 0, // measured -19.4 LUFS: the reference
    density: 0,
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
    levelDb: -9.4, // measured -10.5 LUFS; -0.4 dB after the left-hand chords and the layered pad (6 Nov)
    density: 0,
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
    levelDb: -5.4, // measured -14.7 LUFS; -0.9 dB after the held left-hand chords and the layered pad (6 Nov)
    density: -1,
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
    levelDb: 5, // measured -24.6 LUFS
    density: 1,
  },
};

export const SOUND_WORLD_IDS: SoundWorldId[] = ['warm', 'lofi', 'ambient', 'electronic'];

export function isSoundWorldChoice(v: unknown): v is SoundWorldChoice {
  return v === 'none' || (typeof v === 'string' && (SOUND_WORLD_IDS as string[]).includes(v));
}

export function worldOf(choice: SoundWorldChoice): SoundWorld | null {
  return choice === 'none' ? null : SOUND_WORLDS[choice];
}

/** The world's level as a gain over the whole board (1 for the player's own picks). */
export function worldLevelGain(choice: SoundWorldChoice): number {
  return 10 ** ((worldOf(choice)?.levelDb ?? 0) / 20);
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
  if (ch.instrument && ch.instrument.length > 0) {
    const synth = synthLayerOf(ch.instrument);
    return synth ? { synth } : ch.instrument;
  }
  const world = worldOf(choice);
  if (world && (ch.role === 'melody' || ch.role === 'chord' || ch.role === 'bass')) return world.voices[ch.role];
  return ch.role === 'bass' ? 'bassElectric' : 'electricPiano';
}
