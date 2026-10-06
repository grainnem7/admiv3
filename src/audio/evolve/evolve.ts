/**
 * Evolve: the sound of each colour keeps slowly changing while it plays, the way
 * generative instruments (Bloom, Endel, Generative.fm) stay alive — the notes stay the
 * player's, the sound around them moves.
 *
 * Two time scales:
 *  - drift: every time round the loop, brightness, layer blend, reverb, echo, stereo place
 *    and note length wander a little;
 *  - scenes: every `sceneLoops` loops, a bigger change — another instrument from the sound
 *    world's palette for that part, or the melody an octave up or down.
 *
 * The state at any loop is a pure function of (seed, colour, loop): anchors are drawn per
 * scene and drift glides from one anchor to the next. So it needs no memory, "Back" (the
 * previous seed) and "Hold" (a fixed loop) are exact, and the same session replays the same
 * way. `amount` 0 is the neutral sound — exactly what plays without Evolve.
 *
 * An instrument the player picked themselves is never swapped (it still drifts).
 */

import { SOUND_WORLDS, type LayeredVoiceSpec, type SoundWorldChoice, type SoundWorldId } from '../worlds/soundWorlds';
import { seededRandom } from '../../songs/generative/rulesFill';

export type EvolveRole = 'melody' | 'chord' | 'bass' | 'drums';

export interface NamedVoice {
  name: string;
  spec: LayeredVoiceSpec;
}

/** Other instruments each part can move to, per world. The first is the world's own. */
const v = (name: string, spec: LayeredVoiceSpec): NamedVoice => ({ name, spec });
const PALETTE: Record<SoundWorldId, Record<'melody' | 'chord' | 'bass', NamedVoice[]>> = {
  warm: {
    melody: [
      v('Piano', SOUND_WORLDS.warm.voices.melody),
      v('Harp', { sample: 'harp' }),
      v('Nylon guitar', { sample: 'guitarNylon' }),
      v('Electric piano', { sample: 'electricPiano', synth: 'keys', sampleLevel: 0.85, synthLevel: 0.25 }),
    ],
    chord: [
      v('Piano and strings', SOUND_WORLDS.warm.voices.chord),
      v('Organ', { sample: 'organ', synth: 'pad', sampleLevel: 0.7, synthLevel: 0.3 }),
      v('Cello and pad', { sample: 'cello', synth: 'pad', sampleLevel: 0.6, synthLevel: 0.45 }),
    ],
    bass: [
      v('Upright bass', SOUND_WORLDS.warm.voices.bass),
      v('Electric bass', { sample: 'bassElectric', synth: 'sub', sampleLevel: 0.7, synthLevel: 0.5 }),
    ],
  },
  lofi: {
    melody: [
      v('Dusty keys', SOUND_WORLDS.lofi.voices.melody),
      v('Nylon guitar', { sample: 'guitarNylon', synth: 'keys', sampleLevel: 0.8, synthLevel: 0.2 }),
      v('Soft pluck', { synth: 'pluck', synthLevel: 0.75 }),
      v('Harp', { sample: 'harp' }),
    ],
    chord: [
      v('Electric piano', SOUND_WORLDS.lofi.voices.chord),
      v('Warm pad', { synth: 'pad', synthLevel: 0.8 }),
      v('Organ', { sample: 'organ', sampleLevel: 0.7 }),
    ],
    bass: [
      v('Round bass', SOUND_WORLDS.lofi.voices.bass),
      v('Sub bass', { synth: 'sub', synthLevel: 0.9 }),
    ],
  },
  ambient: {
    melody: [
      v('Harp and bell', SOUND_WORLDS.ambient.voices.melody),
      v('Bell', { synth: 'bell', synthLevel: 0.85 }),
      v('Piano and bell', { sample: 'piano', synth: 'bell', sampleLevel: 0.7, synthLevel: 0.35 }),
      v('Choir', { sample: 'padChoir', sampleLevel: 0.9 }),
    ],
    chord: [
      v('Choir and pad', SOUND_WORLDS.ambient.voices.chord),
      v('Synth pad', { synth: 'pad', synthLevel: 0.9 }),
      v('Strings', { sample: 'cello', synth: 'pad', sampleLevel: 0.5, synthLevel: 0.6 }),
    ],
    bass: [
      v('Soft sub', SOUND_WORLDS.ambient.voices.bass),
      v('Upright bass', { sample: 'contrabass', synth: 'sub', sampleLevel: 0.5, synthLevel: 0.6 }),
    ],
  },
  electronic: {
    melody: [
      v('Pluck', SOUND_WORLDS.electronic.voices.melody),
      v('Bell', { synth: 'bell', synthLevel: 0.85 }),
      v('Soft keys', { synth: 'keys', synthLevel: 0.9 }),
      v('Supersaw lead', { synth: 'supersaw', synthLevel: 0.7 }),
    ],
    chord: [
      v('Supersaw', SOUND_WORLDS.electronic.voices.chord),
      v('Synth pad', { synth: 'pad', synthLevel: 0.9 }),
      v('Electric piano', { sample: 'electricPiano', synth: 'keys', sampleLevel: 0.8, synthLevel: 0.3 }),
    ],
    bass: [
      v('Saw bass', SOUND_WORLDS.electronic.voices.bass),
      v('Sub bass', { synth: 'sub', synthLevel: 0.9 }),
    ],
  },
};

export interface EvolveState {
  /** Multiplies the part's own Tone (brightness). */
  brightness: number;
  /** Multiplies the part's reverb send. */
  reverb: number;
  /** Added to the part's echo (delay) send. */
  delay: number;
  /** Added to the part's stereo place (-1…1 overall). */
  pan: number;
  /** Multiplies note lengths: below 1 is shorter and more detached, above 1 rings longer. */
  length: number;
  /** Octaves up or down (melody and chord only). */
  octave: -1 | 0 | 1;
  /** The instrument for this scene; null = keep the part's own sound. */
  voice: NamedVoice | null;
  /**
   * Which variation of its pattern a part plays this scene (0 = its own): another motif,
   * the other bassline or chord rhythm, another kick and snare from the kit.
   */
  variant: number;
  /** Drums one step busier (+1) or sparser (-1) than the counter's row asks for. */
  busy: -1 | 0 | 1;
  /** Which scene this is (changes are announced on screen when it moves). */
  scene: number;
}

export const NEUTRAL: EvolveState = {
  brightness: 1, reverb: 1, delay: 0, pan: 0, length: 1, octave: 0, voice: null, scene: 0, variant: 0, busy: 0,
};

interface Anchor {
  brightness: number; reverb: number; delay: number; pan: number; length: number;
  octave: -1 | 0 | 1; voiceIndex: number; variant: number; busy: -1 | 0 | 1;
}

/** A small stable hash, so each colour gets its own random path. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The scene's anchor for one colour. Scene 0 is always the part's starting sound. */
function anchor(seed: number, colour: string, scene: number, role: EvolveRole, voices: number): Anchor {
  if (scene === 0) return { brightness: 1, reverb: 1, delay: 0, pan: 0, length: 1, octave: 0, voiceIndex: 0, variant: 0, busy: 0 };
  const r = seededRandom((seed ^ hash(colour)) + scene * 7919);
  const between = (lo: number, hi: number): number => lo + r() * (hi - lo);
  const pitched = role === 'melody' || role === 'chord';
  const octaveRoll = r();
  return {
    brightness: between(0.55, 1.3),
    reverb: between(0.5, 2.2),
    delay: r() < 0.45 ? between(0.05, 0.35) : 0,
    pan: between(-0.35, 0.35),
    length: role === 'drums' ? 1 : between(0.6, 1.7),
    // Octave moves are rarer than tone changes, and never for bass (it would leave the bass).
    octave: pitched && octaveRoll < 0.2 ? -1 : pitched && octaveRoll > 0.82 ? 1 : 0,
    voiceIndex: voices > 1 ? Math.floor(r() * voices) : 0,
    variant: 1 + Math.floor(r() * 997),
    busy: role === 'drums' ? ((Math.floor(r() * 3) - 1) as -1 | 0 | 1) : 0,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Ease in and out, so drift never jumps at a scene boundary. */
const ease = (t: number): number => t * t * (3 - 2 * t);

export interface EvolveInput {
  colour: string;
  role: EvolveRole;
  /** The loop being played (0 = first time round). */
  lap: number;
  seed: number;
  /** 0 = the sound never changes; 1 = the widest changes. */
  amount: number;
  sceneLoops: number;
  world: SoundWorldChoice;
  /** True when the player chose this part's instrument themselves: never swapped. */
  ownInstrument: boolean;
}

/** What one colour sounds like on a given loop. */
export function evolveState(input: EvolveInput): EvolveState {
  const amount = Math.max(0, Math.min(1, input.amount));
  if (amount <= 0) return NEUTRAL;
  const sceneLoops = Math.max(1, Math.round(input.sceneLoops));
  const lap = Math.max(0, input.lap);
  const scene = Math.floor(lap / sceneLoops);
  const t = ease((lap % sceneLoops) / sceneLoops);
  const voices = input.role !== 'drums' && input.world !== 'none' && !input.ownInstrument
    ? PALETTE[input.world][input.role]
    : [];
  const a = anchor(input.seed, input.colour, scene, input.role, voices.length);
  const b = anchor(input.seed, input.colour, scene + 1, input.role, voices.length);
  // Drift glides from this scene's anchor towards the next; amount scales the distance
  // from neutral.
  const mix = (key: 'brightness' | 'reverb' | 'length', neutral: number): number =>
    neutral + (lerp(a[key], b[key], t) - neutral) * amount;
  return {
    brightness: mix('brightness', 1),
    reverb: mix('reverb', 1),
    delay: lerp(a.delay, b.delay, t) * amount,
    pan: lerp(a.pan, b.pan, t) * amount,
    length: mix('length', 1),
    // Discrete changes belong to the scene, and only once Evolve is turned up a fair way.
    octave: amount >= 0.35 ? a.octave : 0,
    voice: voices.length > 0 && amount >= 0.2 ? voices[a.voiceIndex] : null,
    scene,
    variant: amount >= 0.2 ? a.variant : 0,
    busy: amount >= 0.35 ? a.busy : 0,
  };
}

/** A few plain words for what a colour sounds like now, for the screen. */
export function describeEvolve(state: EvolveState, fallbackName: string, patterns = true): string {
  const parts = [state.voice?.name ?? fallbackName];
  if (state.brightness < 0.8) parts.push('dark');
  else if (state.brightness > 1.12) parts.push('bright');
  if (state.reverb > 1.5) parts.push('spacious');
  else if (state.reverb < 0.7) parts.push('close');
  if (state.delay > 0.12) parts.push('echoing');
  if (state.octave === 1) parts.push('high');
  if (state.octave === -1) parts.push('low');
  if (state.length < 0.8) parts.push('short');
  else if (state.length > 1.35) parts.push('long');
  // Only phrases have patterns to vary; in One note mode the counters are the pattern.
  if (patterns && state.busy === 1) parts.push('busier');
  else if (patterns && state.busy === -1) parts.push('sparser');
  if (patterns && state.variant > 0) parts.push('new pattern');
  return parts.join(', ');
}
