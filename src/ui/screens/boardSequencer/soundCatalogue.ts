/**
 * Which sounds suit each job, with names that can be read out to a player. The colour
 * table offers these; the choice is stored in the colour's `instrument` field, so a saved
 * player's picks keep their meaning. A synth sound is stored as `synth:<layer>`.
 */
import type { ColourRole } from '../../../tracking/boardColours';
export { SYNTH_PREFIX, synthLayerOf } from '../../../audio/worlds/soundWorlds';

/** Families the lists are grouped into, in this order; a facilitator scans by family. */
export type SoundGroup = 'Keys' | 'Strings' | 'Wind and brass' | 'Plucked and struck' | 'Synth';

export interface SoundOption {
  key: string;
  name: string;
  group: SoundGroup;
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
  flute: 'Flute',
  saxophone: 'Saxophone',
  trumpet: 'Trumpet',
  trombone: 'Trombone',
  bassoon: 'Bassoon',
  xylophone: 'Xylophone',
  guitarAcoustic: 'Acoustic guitar',
  guitarElectric: 'Electric guitar',
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

/** A job's list, family by family; most familiar first within each. */
const list = (groups: [SoundGroup, string[]][]): SoundOption[] =>
  groups.flatMap(([group, keys]) => keys.map((key) => ({ key, name: NAMES[key], group })));

const MELODY = list([
  ['Keys', ['piano', 'electricPiano', 'organ']],
  ['Strings', ['violin']],
  ['Wind and brass', ['flute', 'clarinet', 'saxophone', 'trumpet', 'frenchHorn']],
  ['Plucked and struck', ['harp', 'guitarNylon', 'guitarAcoustic', 'guitarElectric', 'xylophone']],
  ['Synth', ['synth:pluck', 'synth:bell', 'synth:keys']],
]);
const CHORDS = list([
  ['Keys', ['piano', 'electricPiano', 'organ', 'chord']],
  ['Plucked and struck', ['harp', 'guitarNylon', 'guitarAcoustic', 'guitarElectric']],
  ['Synth', ['pad', 'synth:pad', 'synth:supersaw', 'synth:keys']],
]);
// Electric bass first: it is what a bass plays when nothing is chosen.
const BASS = list([
  ['Plucked and struck', ['bassElectric']],
  ['Strings', ['contrabass', 'cello']],
  ['Wind and brass', ['tuba', 'trombone', 'bassoon']],
  ['Synth', ['synth:sub', 'synth:sawBass']],
]);

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

/** A list cut into runs of the same group, for `<optgroup>`s; options with no group (drum pieces) form one run with group null. */
export function soundOptionGroups<O extends { key: string; name: string; group?: SoundGroup }>(
  options: readonly O[],
): { group: SoundGroup | null; items: O[] }[] {
  const runs: { group: SoundGroup | null; items: O[] }[] = [];
  for (const o of options) {
    const group = o.group ?? null;
    const last = runs.at(-1);
    if (last && last.group === group) last.items.push(o);
    else runs.push({ group, items: [o] });
  }
  return runs;
}
