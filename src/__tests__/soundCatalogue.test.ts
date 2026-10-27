import { describe, it, expect } from 'vitest';
import { soundsFor, soundOptionName } from '../ui/screens/boardSequencer/soundCatalogue';
import { voiceSpecFor } from '../audio/worlds/soundWorlds';
import { chainFor } from '../midi/abletonSounds';
import { ROLE_LABELS } from '../tracking/boardColours';

const keys = (role: Parameters<typeof soundsFor>[0]): string[] => soundsFor(role).map((o) => o.key);

describe('the sounds each job can choose from', () => {
  it('melody, chords and bass each have their own list, with the bundled extras', () => {
    expect(keys('melody')).toEqual(expect.arrayContaining([
      'piano', 'electricPiano', 'harp', 'organ', 'clarinet', 'frenchHorn', 'violin', 'guitarNylon',
      'synth:pluck', 'synth:bell', 'synth:keys',
    ]));
    expect(keys('chord')).toEqual(expect.arrayContaining([
      'pad', 'piano', 'electricPiano', 'organ', 'guitarNylon', 'synth:pad', 'synth:supersaw',
    ]));
    expect(keys('bass')).toEqual(expect.arrayContaining([
      'bassElectric', 'contrabass', 'cello', 'tuba', 'synth:sub', 'synth:sawBass',
    ]));
  });

  it('the new instruments are offered for their jobs', () => {
    expect(keys('melody')).toEqual(expect.arrayContaining(['flute', 'saxophone', 'trumpet', 'xylophone', 'guitarAcoustic', 'guitarElectric']));
    expect(keys('chord')).toEqual(expect.arrayContaining(['guitarAcoustic', 'guitarElectric']));
    expect(keys('bass')).toEqual(expect.arrayContaining(['trombone', 'bassoon']));
    expect(soundOptionName('guitarAcoustic')).toBe('Acoustic guitar');
  });

  it('each job’s list is in groups, each group in one piece, in the set order', () => {
    const runs = (role: 'melody' | 'chord' | 'bass'): string[] =>
      soundsFor(role).map((o) => o.group).filter((g, i, all) => i === 0 || g !== all[i - 1]);
    expect(runs('melody')).toEqual(['Keys', 'Strings', 'Wind and brass', 'Plucked and struck', 'Synth']);
    expect(runs('chord')).toEqual(['Keys', 'Plucked and struck', 'Synth']);
    expect(runs('bass')).toEqual(['Plucked and struck', 'Strings', 'Wind and brass', 'Synth']);
    expect(soundsFor('bass')[0].key).toBe('bassElectric');
  });

  it('drums, controls and colours not used have no instrument list', () => {
    expect(soundsFor('drums')).toEqual([]);
    expect(soundsFor('tempo')).toEqual([]);
    expect(soundsFor('off')).toEqual([]);
  });

  it('every sound has a plain name that can be read out', () => {
    for (const role of ['melody', 'chord', 'bass'] as const) {
      for (const o of soundsFor(role)) {
        expect(o.name).not.toBe(o.key);
        expect(soundOptionName(o.key)).toBe(o.name);
      }
    }
    expect(soundOptionName('contrabass')).toBe('Upright bass');
    expect(soundOptionName('synth:pluck')).toBe('Synth pluck');
    expect(soundOptionName('pad')).toBe('Choir pad');
  });
});

describe('a synth sound chosen by name', () => {
  it('plays as that synth layer; a sampled pick is unchanged', () => {
    expect(voiceSpecFor({ role: 'melody', instrument: 'synth:bell' }, 'warm')).toEqual({ synth: 'bell' });
    expect(voiceSpecFor({ role: 'melody', instrument: 'harp' }, 'warm')).toBe('harp');
  });

  it('goes to the nearest Ableton chain', () => {
    expect(chainFor({ role: 'melody', instrument: 'synth:pluck' }, 'warm')).toBe(27);
    expect(chainFor({ role: 'melody', instrument: 'violin' }, 'warm')).toBe(16);
    expect(chainFor({ role: 'bass', instrument: 'tuba' }, 'warm')).toBe(18);
  });
});

describe('job names', () => {
  it('chords are "Chords"', () => {
    expect(ROLE_LABELS.chord).toBe('Chords');
  });
});
