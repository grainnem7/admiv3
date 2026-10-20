// The instruments and kit pieces a colour can pick, and plain names for whatever a colour
// actually plays — its own pick, or what the sound world gives its part.

import { worldOf, type LayeredVoiceSpec, type SoundWorldChoice, type SynthLayerId } from '../../../audio/worlds/soundWorlds';
import type { ColourChannel } from '../../../tracking/boardColours';

// Real sample sets (mapped straight to SAMPLE_CONFIGS) plus the sustained pad. These are
// the better-quality instruments available to us.
export const INSTRUMENT_OPTIONS: { key: string; name: string }[] = [
  { key: 'piano', name: 'Piano' },
  { key: 'electricPiano', name: 'Electric piano' },
  { key: 'harp', name: 'Harp' },
  { key: 'organ', name: 'Organ' },
  { key: 'clarinet', name: 'Clarinet' },
  { key: 'frenchHorn', name: 'French horn' },
  { key: 'cello', name: 'Cello' },
  { key: 'guitarNylon', name: 'Nylon guitar' },
  { key: 'bassElectric', name: 'Electric bass' },
  { key: 'pad', name: 'Pad (sustained)' },
  { key: 'chord', name: 'Chord stab' },
];

// Kit pieces the RoundRobinDrumKit can play. '' keeps the default bottom→top mapping
// (kick, snare, hat, crash) by row.
export const DRUM_OPTIONS: { key: string; name: string }[] = [
  { key: 'kick', name: 'Kick' },
  { key: 'snare', name: 'Snare' },
  { key: 'hat', name: 'Hi-hat' },
  { key: 'crash', name: 'Crash' },
  { key: 'kickCrash', name: 'Kick + crash' },
  { key: 'tom', name: 'Tom' },
  { key: 'clap', name: 'Clap' },
  { key: 'rim', name: 'Rim' },
];

/** Samples the worlds use that are not in the picker. */
const SAMPLE_NAMES: Record<string, string> = {
  ...Object.fromEntries(INSTRUMENT_OPTIONS.map((o) => [o.key, o.name])),
  contrabass: 'Upright bass',
  padChoir: 'Choir pad',
};

const SYNTH_NAMES: Record<SynthLayerId, string> = {
  sub: 'sub bass',
  pad: 'soft pad',
  pluck: 'synth pluck',
  sawBass: 'saw bass',
  bell: 'bells',
  supersaw: 'wide saw chords',
  keys: 'keys',
};

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function describeSpec(spec: LayeredVoiceSpec): string {
  const sample = spec.sample ? SAMPLE_NAMES[spec.sample] ?? spec.sample : null;
  const synth = spec.synth ? SYNTH_NAMES[spec.synth] : null;
  if (sample && synth) return `${sample} + ${synth}`;
  return capital(sample ?? synth ?? 'Synth');
}

/** What this colour sounds like right now, in words: "Piano", "Harp + bells", "Lo-fi kit: snare". */
export function soundNameFor(ch: ColourChannel, choice: SoundWorldChoice): string {
  const world = worldOf(choice);
  if (ch.role === 'drums') {
    const kit = world ? `${world.name} kit` : 'Drum kit';
    const piece = DRUM_OPTIONS.find((o) => o.key === ch.drum)?.name;
    return piece ? `${kit}: ${piece.toLowerCase()}` : kit;
  }
  if (ch.role !== 'melody' && ch.role !== 'chord' && ch.role !== 'bass') return '';
  if (ch.instrument) return SAMPLE_NAMES[ch.instrument] ?? ch.instrument;
  if (world) return describeSpec(world.voices[ch.role]);
  return ch.role === 'bass' ? 'Electric bass' : 'Electric piano';
}
