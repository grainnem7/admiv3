/**
 * Which sounds suit each job, with names that can be read out to a player. The colour
 * table offers these; the choice is stored in the colour's `instrument` field, so a saved
 * player's picks keep their meaning. A synth sound is stored as `synth:<layer>`.
 */
import type { ColourRole } from '../../../tracking/boardColours';
export { SYNTH_PREFIX, synthLayerOf } from '../../../audio/worlds/soundWorlds';

export interface SoundOption {
  key: string;
  name: string;
}

const NAMES: Record<string, string> = {
  piano: 'Piano',
  electricPiano: 'Electric piano',
  harp: 'Harp',
  organ: 'Organ',
  clarinet: 'Clarinet',
  frenchHorn: 'French horn',
  violin: 'Violin',
  cello: 'Cello',
  guitarNylon: 'Nylon guitar',
  bassElectric: 'Electric bass',
  contrabass: 'Upright bass',
  tuba: 'Tuba',
  pad: 'Choir pad',
  padChoir: 'Choir pad',
  chord: 'Electric piano chords',
  'synth:pluck': 'Synth pluck',
  'synth:bell': 'Bells',
  'synth:keys': 'Synth keys',
  'synth:pad': 'Soft synth pad',
  'synth:supersaw': 'Wide synth chords',
  'synth:sub': 'Sub bass',
  'synth:sawBass': 'Synth bass',
};

const option = (key: string): SoundOption => ({ key, name: NAMES[key] });

// Most familiar first: the facilitator reads the list from the top.
const MELODY = ['piano', 'electricPiano', 'harp', 'violin', 'clarinet', 'frenchHorn', 'guitarNylon', 'organ', 'synth:pluck', 'synth:bell', 'synth:keys'].map(option);
const CHORDS = ['piano', 'electricPiano', 'pad', 'guitarNylon', 'organ', 'harp', 'chord', 'synth:pad', 'synth:supersaw', 'synth:keys'].map(option);
const BASS = ['bassElectric', 'contrabass', 'cello', 'tuba', 'synth:sub', 'synth:sawBass'].map(option);

/** The instruments a colour with this job can play; none for drums, controls, loops or off. */
export function soundsFor(role: ColourRole): readonly SoundOption[] {
  if (role === 'melody') return MELODY;
  if (role === 'chord') return CHORDS;
  if (role === 'bass') return BASS;
  return [];
}

/** A sound's plain name ("Upright bass"), or the key itself when it isn't one of ours. */
export function soundOptionName(key: string): string {
  return NAMES[key] ?? key;
}
