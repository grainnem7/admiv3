import { describe, it, expect, vi, beforeEach } from 'vitest';

const port = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../midi/MIDIManager', () => ({
  MIDIManager: { getSelectedOutput: () => port, getConnectedSelectedOutput: () => port, isSelectedConnected: () => true },
}));

import {
  keyAt, keyFields, keyOf, sanitizeSceneKey, sanitizeScenes, sceneSettingsOf, withOwnKey, withSceneKey, type Scene, type SceneKey,
} from '../songs/performance/launcher';
import { loopChannelsFor, loopColourId } from '../songs/performance/loopSounds';
import { abletonPlan, CHAIN_CC, chainCcValue, chainForKey, controlKey, type AbletonPlanInput } from '../midi/abletonSounds';
import { BoardMidiSender, ROLE_CHANNEL, SWITCH_EARLY_MS } from '../midi/boardMidi';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import type { ColourChannel } from '../tracking/boardColours';
import { chordOnDegree, chordPcs, harmonyFromChord, triadPcs } from '../songs/harmony/harmony';
import { phraseEventsAtStep, type PhraseInput } from '../songs/phrases/phrases';

const A_MAJOR: SceneKey = { rootMidi: 69, scaleName: 'Major', semitones: [0, 2, 4, 5, 7, 9, 11] };
const A_MINOR: SceneKey = { rootMidi: 69, scaleName: 'Minor', semitones: [0, 2, 3, 5, 7, 8, 10] };

describe('a scene’s key', () => {
  const settings = sceneSettingsOf(DEFAULT_BOARD_SEQUENCER_CONFIG);
  const scene = (id: string, key?: SceneKey): Scene => ({ id, name: id, loops: [], settings, ...(key ? { key } : {}) });

  it('is kept when saved, and a bad one is dropped (the scene stays)', () => {
    const [ok, bad, none] = sanitizeScenes(JSON.parse(JSON.stringify([
      scene('a', A_MINOR), { ...scene('b'), key: { rootMidi: 200, scaleName: 'X', semitones: [0, 2] } }, scene('c'),
    ])), settings);
    expect(ok.key).toEqual(A_MINOR);
    expect(bad.id).toBe('b');
    expect(bad.key).toBeUndefined();
    expect(none.key).toBeUndefined();
    expect(sanitizeSceneKey({ rootMidi: 69, scaleName: 'Major', semitones: [2, 0, 4, 5, 7, 9, 11] })?.semitones).toEqual(A_MAJOR.semitones);
    expect(sanitizeSceneKey({ rootMidi: 69, scaleName: 'Odd', semitones: [1, 2, 4, 5, 7] })).toBeNull();
  });

  it('a scene without its own plays in the key of the nearest scene before it; none set, null', () => {
    const scenes = [scene('a', A_MAJOR), scene('b'), scene('c', A_MINOR), scene('d')];
    expect(keyAt(scenes, 1)).toEqual(A_MAJOR);
    expect(keyAt(scenes, 3)).toEqual(A_MINOR);
    expect(keyAt([scene('x')], 0)).toBeNull();
    expect(keyAt(scenes, null)).toBeNull();
  });

  it('goes into the config’s key fields, and the player’s own key comes back after the run', () => {
    const own = keyOf(DEFAULT_BOARD_SEQUENCER_CONFIG);
    const during = withSceneKey(DEFAULT_BOARD_SEQUENCER_CONFIG, { key: A_MINOR });
    expect(during).toMatchObject(keyFields(A_MINOR));
    expect(withSceneKey(DEFAULT_BOARD_SEQUENCER_CONFIG, {})).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG);
    const after = withOwnKey(during, own);
    expect(keyOf(after)).toEqual(own);
    expect(withOwnKey(during, null)).toBe(during);
  });
});

describe('a loop that says what it plays', () => {
  it('plays tunes or notes as kept, whatever today’s colour of that sound does', () => {
    const today: ColourChannel[] = [{ id: 'k', kind: 'hue', role: 'drums', swatch: '#111', drum: '', plays: 'note' }];
    const tune = loopChannelsFor([{ row: 4, col: 0, colour: 'x', job: 'drums', sound: '', plays: 'tune' }], today);
    expect(tune.channels[0].plays).toBe('tune');
    expect(tune.cells[0]).not.toHaveProperty('plays');
    const asToday = loopChannelsFor([{ row: 4, col: 0, colour: 'x', job: 'drums', sound: '' }], today);
    expect(asToday.channels[0].plays).toBe('note');
  });
});

describe('chords keep their root, third and fifth', () => {
  it('a seventh voiced with its root above the third (E7 near D4): the triad is still E G# B', () => {
    const e7 = harmonyFromChord(chordOnDegree(4, 69, A_MAJOR.semitones, 'warm'));
    expect(e7.tones[0] % 12).not.toBe(4); // the voicing does not start on the root
    expect(triadPcs(e7)).toEqual([4, 8, 11]);
    expect(chordPcs(e7)).toEqual([4, 8, 11, 2]);
    expect(triadPcs({ root: 48, tones: [52, 55, 60] })).toEqual([4, 7, 0]);
  });

  it('a chord tune on the V chord plays its root', () => {
    const input: PhraseInput = {
      cells: [{ row: 3, col: 0, colour: 'c', role: 'chord' }],
      stepFor: () => 0, loopFor: () => 8, rows: 8, rootMidi: 69, semitones: A_MAJOR.semitones, songChord: null, style: 'warm',
    };
    const notes = phraseEventsAtStep(input).filter((e) => e.midi !== undefined).map((e) => (e.midi as number) % 12);
    expect(new Set(notes)).toEqual(new Set([4, 8, 11, 2]));
  });
});

describe('Ableton: a loop’s own instrument on its track', () => {
  const colour = (id: string, role: ColourChannel['role'], extra: Partial<ColourChannel> = {}): ColourChannel =>
    ({ id, kind: 'hue', role, swatch: '#f00', ...extra });
  const mine = [colour('blue', 'bass', { instrument: 'contrabass' }), colour('red', 'melody', { instrument: 'piano' })];
  const base = (extra: Partial<AbletonPlanInput> = {}): AbletonPlanInput => ({
    channels: mine, world: 'warm', channelMode: 'part', energy: 0.5, space: 0.5, swing: 0, ...extra,
  });
  const trombone = { colour: loopColourId('bass', 'trombone'), role: 'bass' as const, instrument: 'trombone' };
  const harp = { colour: loopColourId('melody', 'harp'), role: 'melody' as const, instrument: 'harp' };
  const chainOn = (input: AbletonPlanInput, channel: number): number | undefined => input && abletonPlan(input).controls.get(controlKey(channel, CHAIN_CC))?.value;

  it('with none of the player’s bass counters down, the Bass track plays the trombone loop’s trombone', () => {
    const trom = chainForKey('trombone') ?? -1;
    expect(chainOn(base({ loopSounds: [trombone] }), ROLE_CHANNEL.bass)).toBe(chainCcValue(trom, ROLE_CHANNEL.bass));
    // The player's melody colour is not touched by a bass loop.
    expect(chainOn(base({ loopSounds: [trombone] }), ROLE_CHANNEL.melody)).toBe(chainCcValue(chainForKey('piano') ?? -1, ROLE_CHANNEL.melody));
  });

  it('a bass counter of the player’s down: their own sound, the loop plays through it', () => {
    const plan = base({ loopSounds: [trombone], coloursOnBoard: new Set(['blue']) });
    expect(chainOn(plan, ROLE_CHANNEL.bass)).toBe(chainCcValue(chainForKey('contrabass') ?? -1, ROLE_CHANNEL.bass));
  });

  it('a track the player has no colour for gets the loop’s instrument and the usual levels; the latest loop wins', () => {
    const plan = abletonPlan(base({ channels: [], loopSounds: [harp, { ...harp, colour: loopColourId('melody', 'clarinet'), instrument: 'clarinet' }] }));
    expect(plan.controls.get(controlKey(ROLE_CHANNEL.melody, CHAIN_CC))?.value).toBe(chainCcValue(chainForKey('clarinet') ?? -1, ROLE_CHANNEL.melody));
    expect(plan.controls.has(controlKey(ROLE_CHANNEL.melody, 24))).toBe(true);
  });

  it('loops on their own channels: the parts’ tracks are left to the player’s colours', () => {
    const plan = base({ loopSounds: [trombone], loopChannels: true });
    expect(chainOn(plan, ROLE_CHANNEL.bass)).toBe(chainCcValue(chainForKey('contrabass') ?? -1, ROLE_CHANNEL.bass));
  });
});

describe('a chain switch at a time', () => {
  beforeEach(() => port.send.mockClear());

  it('a note still waiting for its off on that channel ends a moment before the switch; the switch is just before the beat', () => {
    const t0 = performance.now();
    const sender = new BoardMidiSender({ currentTime: 0, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: t0 }) });
    // A harp note from 0.2 s to 2.2 s on the melody track.
    sender.send({ role: 'melody', origin: 'placed', audioTime: 0.2, durSec: 2, velocity: 0.8, midi: 69, colour: 'h' }, false, { enabled: true, sends: 'player' });
    expect(port.send.mock.calls.some((c) => ((c[0] as number[])[0] & 0xf0) === 0x80)).toBe(false);
    sender.sendControlsAt([{ channel: ROLE_CHANNEL.melody, cc: CHAIN_CC, value: 30 }], 1.0);
    const calls = port.send.mock.calls.map((c) => ({ data: c[0] as number[], at: c[1] as number }));
    const off = calls.find((c) => (c.data[0] & 0xf0) === 0x80 && c.data[1] === 69);
    const cc = calls.find((c) => (c.data[0] & 0xf0) === 0xb0 && c.data[1] === CHAIN_CC);
    expect(off).toBeDefined();
    expect(cc?.at).toBeCloseTo(t0 + 1000 - SWITCH_EARLY_MS, 0);
    expect(off?.at).toBeCloseTo(t0 + 999 - SWITCH_EARLY_MS, 0);
  });

  it('another channel’s notes are left to end at their own time', () => {
    const t0 = performance.now();
    const sender = new BoardMidiSender({ currentTime: 0, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: t0 }) });
    sender.send({ role: 'bass', origin: 'placed', audioTime: 0.2, durSec: 2, velocity: 0.8, midi: 45, colour: 'b' }, false, { enabled: true, sends: 'player' });
    sender.sendControlsAt([{ channel: ROLE_CHANNEL.melody, cc: CHAIN_CC, value: 30 }], 1.0);
    expect(port.send.mock.calls.some((c) => ((c[0] as number[])[0] & 0xf0) === 0x80)).toBe(false);
  });
});
