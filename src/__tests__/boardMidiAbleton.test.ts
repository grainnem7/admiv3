import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
  assignColourChannels, channelFor, channelsInUse, clampLeadMs, colourChannelMap, configToSoundFrom, effectiveSound,
  gainToCc, MAX_MIDI_LEAD_MS, midiEventsFor, panicEvents, releaseEvents, RELEASE_REPEAT_MS, sendAtMs, sendsFor,
  sharedColourChannels, soundFromToConfig, trackHeld, volumeEvent, BoardMidiSender,
  type HeldNote, type MidiEvent, type MidiNoteLike, type SoundFrom,
} from '../midi/boardMidi';
import type { ColourChannel } from '../tracking/boardColours';

const port = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../midi/MIDIManager', () => ({
  MIDIManager: { getSelectedOutput: () => port, getConnectedSelectedOutput: () => port, isSelectedConnected: () => true },
}));

const status = (d: readonly number[]) => d[0] & 0xf0;
const chOf = (d: readonly number[]) => (d[0] & 0x0f) + 1;
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CC = 0xb0;
const toMs = (t: number) => t * 1000;

function colour(id: string, role: ColourChannel['role'], midiChannel?: number): ColourChannel {
  return { id, kind: 'hue', role, swatch: '#f00', ...(midiChannel !== undefined ? { midiChannel } : {}) };
}

describe('Sound from: ADMI, Ableton or Both, stored as the two flags', () => {
  it('maps both ways for every choice', () => {
    for (const s of ['admi', 'ableton', 'both'] as SoundFrom[]) {
      expect(configToSoundFrom(soundFromToConfig(s))).toBe(s);
    }
    expect(soundFromToConfig('admi').midiEnabled).toBe(false);
    expect(soundFromToConfig('ableton')).toEqual({ midiEnabled: true, midiKeepSound: false });
    expect(soundFromToConfig('both')).toEqual({ midiEnabled: true, midiKeepSound: true });
    expect(configToSoundFrom({ midiEnabled: false, midiKeepSound: false })).toBe('admi');
  });

  it('the fallback: no port, or not yet switched back, means ADMI plays', () => {
    const ableton = { ...soundFromToConfig('ableton'), midiDeviceId: 'p1' };
    const both = { ...soundFromToConfig('both'), midiDeviceId: 'p1' };
    expect(effectiveSound({ ...soundFromToConfig('admi'), midiDeviceId: 'p1' }, true)).toEqual({ internal: true, midi: false, fellBack: false });
    expect(effectiveSound(ableton, true)).toEqual({ internal: false, midi: true, fellBack: false });
    expect(effectiveSound(both, true)).toEqual({ internal: true, midi: true, fellBack: false });
    expect(effectiveSound(ableton, false)).toEqual({ internal: true, midi: false, fellBack: true });
    expect(effectiveSound({ ...ableton, midiDeviceId: '' }, true)).toEqual({ internal: true, midi: false, fellBack: true });
    // The port came back mid-piece: ADMI keeps playing until someone switches.
    expect(effectiveSound(ableton, true, true)).toEqual({ internal: true, midi: false, fellBack: true });
  });

  it('Ableton gets everything; in Both the player\u2019s choice stands', () => {
    expect(sendsFor('ableton', 'player')).toBe('all');
    expect(sendsFor('both', 'player')).toBe('player');
    expect(sendsFor('both', 'all')).toBe('all');
  });
});

describe('channels', () => {
  it('one per part, with the band, Extra notes and every drum on their own', () => {
    expect(channelFor({ role: 'melody', origin: 'placed' })).toBe(1);
    expect(channelFor({ role: 'bass', origin: 'phrase' })).toBe(2);
    expect(channelFor({ role: 'chord', origin: 'placed' })).toBe(3);
    expect(channelFor({ role: 'drums', origin: 'placed' })).toBe(10);
    expect(channelFor({ role: 'chord', origin: 'band', colour: 'band:pad' })).toBe(11);
    expect(channelFor({ role: 'bass', origin: 'band', colour: 'band:bass' })).toBe(12);
    expect(channelFor({ role: 'drums', origin: 'band', colour: 'band:groove' })).toBe(10);
    expect(channelFor({ role: 'melody', origin: 'fill' })).toBe(13);
    expect(channelFor({ role: 'drums', origin: 'fill' })).toBe(10);
    // The final chord: chord 11, its bass 12, its crash 10.
    expect(channelFor({ role: 'chord', origin: 'band', colour: 'band:final' })).toBe(11);
    expect(channelFor({ role: 'bass', origin: 'band', colour: 'band:final' })).toBe(12);
    expect(channelFor({ role: 'drums', origin: 'band', colour: 'band:final' })).toBe(10);
    expect(channelFor({ role: 'volume' })).toBeNull();
  });

  it('one per colour uses each colour\u2019s stored channel; band, fill and drums as before', () => {
    const map = new Map([['red', 5], ['blue', 14]]);
    const opts = { channelMode: 'colour' as const, colourChannels: map };
    expect(channelFor({ role: 'melody', origin: 'placed', colour: 'red' }, opts)).toBe(5);
    expect(channelFor({ role: 'melody', origin: 'phrase', colour: 'blue' }, opts)).toBe(14);
    expect(channelFor({ role: 'melody', origin: 'placed', colour: 'green' }, opts)).toBe(1);
    expect(channelFor({ role: 'melody', origin: 'fill', colour: 'red' }, opts)).toBe(13);
    expect(channelFor({ role: 'drums', origin: 'placed', colour: 'red' }, opts)).toBe(10);
    expect(channelFor({ role: 'melody', origin: 'placed', colour: 'red' }, { channelMode: 'part', colourChannels: map })).toBe(1);
  });

  it('auto assigned once: the lowest free channel, skipping 10 to 13', () => {
    const out = assignColourChannels([colour('a', 'melody', 1), colour('b', 'melody'), colour('d', 'drums'), colour('c', 'bass')]);
    expect(out?.map((c) => c.midiChannel)).toEqual([1, 2, undefined, 3]);
    const full = Array.from({ length: 9 }, (_, i) => colour(`c${i}`, 'melody', i + 1));
    const next = assignColourChannels([...full, colour('x', 'chord')]);
    expect(next?.at(-1)?.midiChannel).toBe(14);
    expect(assignColourChannels([colour('a', 'melody', 1)])).toBeNull();
  });

  it('never reassigned when colours move, are added or change part', () => {
    const first = assignColourChannels([colour('a', 'melody'), colour('b', 'chord')]) ?? [];
    const moved = [first[1], colour('new', 'melody'), first[0]];
    const after = assignColourChannels(moved) ?? moved;
    expect(after.find((c) => c.id === 'a')?.midiChannel).toBe(1);
    expect(after.find((c) => c.id === 'b')?.midiChannel).toBe(2);
    expect(after.find((c) => c.id === 'new')?.midiChannel).toBe(3);
    // Turned into drums and back: it keeps its channel.
    const asDrums = after.map((c) => (c.id === 'a' ? { ...c, role: 'drums' as const } : c));
    expect((assignColourChannels(asDrums) ?? asDrums).find((c) => c.id === 'a')?.midiChannel).toBe(1);
  });

  it('more colours than channels: they share, and the sharing is reported', () => {
    const many = Array.from({ length: 13 }, (_, i) => colour(`c${i}`, 'melody'));
    const out = assignColourChannels(many) ?? [];
    expect(new Set(out.map((c) => c.midiChannel)).size).toBe(12);
    expect(out.every((c) => c.midiChannel !== undefined && (c.midiChannel < 10 || c.midiChannel > 13))).toBe(true);
    expect(sharedColourChannels(out).size).toBe(1);
    expect(sharedColourChannels([colour('a', 'melody', 4), colour('b', 'melody', 5)]).size).toBe(0);
  });

  it('channels in use: the parts, the band, Extra notes, and the colours\u2019 own', () => {
    expect(channelsInUse()).toEqual([1, 2, 3, 10, 11, 12, 13]);
    expect(channelsInUse(colourChannelMap([colour('a', 'melody', 5), colour('b', 'melody', 16)]))).toEqual([1, 2, 3, 5, 10, 11, 12, 13, 16]);
  });
});

describe('what is sent', () => {
  const band: MidiNoteLike = { role: 'chord', origin: 'band', colour: 'band:pad', audioTime: 1, durSec: 0.5, midis: [60, 64], velocity: 0.5 };
  const fill: MidiNoteLike = { role: 'melody', origin: 'fill', colour: 'red', audioTime: 1, durSec: 0.5, midi: 72, velocity: 0.5 };

  it('Ableton mode sends the band and the Extra notes on their channels', () => {
    const sends = sendsFor('ableton', 'player');
    const b = midiEventsFor(band, { enabled: true, sends }, toMs);
    expect(b.filter((e) => status(e.data) === NOTE_ON).map((e) => chOf(e.data))).toEqual([11, 11]);
    const f = midiEventsFor(fill, { enabled: true, sends }, toMs);
    expect(f.filter((e) => status(e.data) === NOTE_ON).map((e) => chOf(e.data))).toEqual([13]);
  });

  it('"player" in Both still leaves them out', () => {
    expect(midiEventsFor(band, { enabled: true, sends: sendsFor('both', 'player') }, toMs)).toEqual([]);
  });
});

describe('releasing notes', () => {
  it('remembers notes until their Note Off has passed', () => {
    const held = new Map<string, HeldNote>();
    const ev: MidiEvent[] = [
      { data: [NOTE_ON, 60, 100], atMs: 100 }, { data: [NOTE_OFF, 60, 0], atMs: 600 },
      { data: [NOTE_ON | 9, 36, 100], atMs: 100 }, { data: [NOTE_OFF | 9, 36, 0], atMs: 160 },
    ];
    trackHeld(held, ev, 50);
    expect(held.size).toBe(2);
    trackHeld(held, [], 200);
    expect([...held.values()]).toEqual([{ channel: 1, pitch: 60, offAtMs: 600 }]);
  });

  it('a Note Off for each held note, nothing twice, then CC 123 and CC 120 on each channel', () => {
    const held = new Map<string, HeldNote>();
    trackHeld(held, [{ data: [NOTE_OFF, 60, 0], atMs: 500 }, { data: [NOTE_OFF, 60, 0], atMs: 400 }, { data: [NOTE_OFF | 1, 43, 0], atMs: 900 }], 0);
    const ev = releaseEvents([...held.values()], [1, 2, 10], 10);
    const offs = ev.filter((e) => status(e.data) === NOTE_OFF).map((e) => `${chOf(e.data)}:${e.data[1]}`);
    expect(offs).toEqual(['1:60', '2:43']);
    const ccs = ev.filter((e) => status(e.data) === CC);
    expect(ccs.filter((e) => e.data[1] === 123).map((e) => chOf(e.data))).toEqual([1, 2, 10]);
    expect(ccs.filter((e) => e.data[1] === 120).map((e) => chOf(e.data))).toEqual([1, 2, 10]);
  });

  it('Panic covers all 16 channels', () => {
    const ev = panicEvents([], 0);
    expect(new Set(ev.filter((e) => e.data[1] === 123).map((e) => chOf(e.data))).size).toBe(16);
    expect(new Set(ev.filter((e) => e.data[1] === 120).map((e) => chOf(e.data))).size).toBe(16);
  });

  describe('the sender', () => {
    beforeEach(() => { vi.useFakeTimers(); port.send.mockClear(); });
    afterEach(() => { vi.useRealTimers(); });

    it('releases now and once more 120 ms later, for the notes that were queued ahead', () => {
      const s = new BoardMidiSender({ currentTime: 0 });
      s.send({ role: 'melody', origin: 'placed', audioTime: 0.08, durSec: 1, midi: 69, velocity: 0.5 }, false, { enabled: true, sends: 'all' });
      port.send.mockClear();
      s.releaseAll([1]);
      const first = port.send.mock.calls.map((c) => c[0] as number[]);
      expect(first.filter((d) => status(d) === NOTE_OFF && d[1] === 69)).toHaveLength(1);
      expect(first.some((d) => d[1] === 123)).toBe(true);
      expect(first.some((d) => d[1] === 120)).toBe(true);
      port.send.mockClear();
      vi.advanceTimersByTime(RELEASE_REPEAT_MS);
      const again = port.send.mock.calls.map((c) => c[0] as number[]);
      expect(again.filter((d) => status(d) === NOTE_OFF && d[1] === 69)).toHaveLength(1);
      // Released notes are forgotten: a second release has no Note Off for them.
      port.send.mockClear();
      s.releaseAll([1]);
      expect(port.send.mock.calls.some((c) => status(c[0] as number[]) === NOTE_OFF)).toBe(false);
    });

    it('"Send early by" moves each message earlier, never before now', () => {
      const s = new BoardMidiSender({ currentTime: 0 });
      const now = performance.now();
      s.send({ role: 'melody', origin: 'placed', audioTime: 0.09, durSec: 0.5, midi: 60, velocity: 0.5 }, false, { enabled: true, sends: 'all', leadMs: 30 });
      const at = port.send.mock.calls[0][1] as number;
      expect(at).toBeGreaterThanOrEqual(now + 60 - 1);
      expect(at).toBeLessThanOrEqual(now + 60 + 5);
    });
  });
});

describe('timing and controllers', () => {
  it('"Send early by" is 0 to 40 ms and never sends before now', () => {
    expect(clampLeadMs(25.4)).toBe(25);
    expect(clampLeadMs(100)).toBe(MAX_MIDI_LEAD_MS);
    expect(clampLeadMs(-3)).toBe(0);
    expect(clampLeadMs('x')).toBe(0);
    expect(sendAtMs(1100, 1000, 30)).toBe(1070);
    expect(sendAtMs(1010, 1000, 30)).toBe(1000);
    expect(sendAtMs(1100, 1000, 999)).toBe(1060);
  });

  it('gains become 0 to 127, and Volume is CC 7 on channel 16', () => {
    expect(gainToCc(1)).toBe(127);
    expect(gainToCc(0)).toBe(0);
    expect(gainToCc(0.5)).toBe(64);
    expect(gainToCc(Number.NaN)).toBe(0);
    expect(volumeEvent(0.5, 3)).toEqual({ data: [0xb0 | 15, 7, 64], atMs: 3 });
  });
});

// ---- the engine: endings, Mute, Volume and switching ----

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import * as Tone from 'tone';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';
import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: null;
  mix: { gain: { setTargetAtTime: Mock } };
  fireStep(beat: number, t: number, spb: number, chord: null): void;
  tickExpression(): void;
}

function engine() {
  const channels: ColourChannel[] = [colour('m', 'melody')];
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, band: 'off',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', fakeVoiceEntry()]]);
  p.drumKit = null;
  p.mix = { gain: { setTargetAtTime: vi.fn() } };
  e.setActiveCells([{ row: 3, col: 0, colour: 'm' }]);
  return { e, p };
}

const sent = () => port.send.mock.calls.map((c) => ({ d: c[0] as number[], at: c[1] as number | undefined }));
const cc = (n: number) => sent().filter((x) => status(x.d) === CC && x.d[1] === n);
const setNow = (t: number) => { (Tone.immediate as Mock).mockReturnValue(t); (Tone.now as Mock).mockReturnValue(t); };

describe('engine: Ableton hears ADMI\u2019s endings, Mute and Volume', () => {
  beforeEach(() => { port.send.mockClear(); setNow(0); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('switching where the sound goes while playing releases every note', () => {
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    p.fireStep(0, 0, 1, null);
    port.send.mockClear();
    e.setMidiOut({ enabled: true, sends: 'all', channelMode: 'colour', colourChannels: new Map([['m', 5]]) }, 'p1');
    expect(sent().some((x) => status(x.d) === NOTE_OFF && x.d[1] === 69)).toBe(true);
    expect(cc(123).length).toBeGreaterThan(0);
    // Sound from back to ADMI: the same.
    p.fireStep(4, 4, 1, null);
    port.send.mockClear();
    e.setMidiOut({ enabled: false, sends: 'all' }, 'p1');
    expect(sent().some((x) => status(x.d) === NOTE_OFF && x.d[1] === 69 && chOf(x.d) === 5)).toBe(true);
  });

  it('Mute: Expression to 0 at once and the notes released; back on, 127', () => {
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    p.fireStep(0, 0, 1, null);
    port.send.mockClear();
    e.setMuted(true);
    expect(cc(11).every((x) => x.d[2] === 0)).toBe(true);
    expect(cc(11).length).toBeGreaterThan(0);
    expect(sent().some((x) => status(x.d) === NOTE_OFF && x.d[1] === 69)).toBe(true);
    port.send.mockClear();
    e.setMuted(false);
    expect(cc(11).every((x) => x.d[2] === 127)).toBe(true);
  });

  it('Stop: Expression to 0 at once, so notes already queued ahead come out silent', () => {
    // Notes go to the port up to ~200 ms (and a phrase's offsets) ahead, and a queued MIDI
    // message can't be taken back: without this a pad or a band chord rang on after Stop.
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    p.fireStep(0, 0, 1, null);
    port.send.mockClear();
    e.stop();
    expect(cc(11).length).toBeGreaterThan(0);
    expect(cc(11).every((x) => x.d[2] === 0)).toBe(true);
    expect(sent().some((x) => status(x.d) === NOTE_OFF && x.d[1] === 69)).toBe(true);
  });

  it('the Volume counter is CC 7 on channel 16, sent only when it changes', () => {
    const { e } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    port.send.mockClear();
    e.setVolume(0.5);
    e.setVolume(0.5);
    e.setVolume(0.501);
    const vol = cc(7);
    expect(vol).toHaveLength(1);
    expect(chOf(vol[0].d)).toBe(16);
    expect(vol[0].d[2]).toBe(64);
  });

  it('a fade: velocities fall with it and CC 11 reaches 0 by its end', () => {
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    e.setActiveCells([0, 1, 2, 3].map((col) => ({ row: 3, col, colour: 'm' })));
    e.finish(4, () => {}, 'fade');
    const vels: number[] = [];
    for (let beat = 0; beat < 4; beat++) {
      setNow(beat);
      port.send.mockClear();
      p.fireStep(beat, beat, 1, null);
      const on = sent().find((x) => status(x.d) === NOTE_ON);
      if (on) vels.push(on.d[2]);
    }
    expect(vels.length).toBeGreaterThan(1);
    for (let i = 1; i < vels.length; i++) expect(vels[i]).toBeLessThan(vels[i - 1]);
    // Expression follows the fade tick by tick: down to 0 by beat 4 (4 s).
    port.send.mockClear();
    const values: number[] = [];
    for (let t = 0; t <= 4.2; t += 0.025) {
      setNow(t);
      p.tickExpression();
    }
    for (const x of cc(11)) values.push(x.d[2]);
    expect(values.at(-1)).toBe(0);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  });

  it('Cancel the ending and Play bring Expression back to 127', () => {
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    e.finish(4, () => {}, 'fade');
    p.fireStep(0, 0, 1, null);
    for (let t = 0; t <= 2; t += 0.025) { setNow(t); p.tickExpression(); }
    expect(cc(11).at(-1)?.d[2]).toBeLessThan(100);
    e.cancelFinish();
    for (let t = 2; t <= 2.4; t += 0.025) { setNow(t); p.tickExpression(); }
    expect(cc(11).at(-1)?.d[2]).toBe(127);
    port.send.mockClear();
    e.start();
    expect(cc(11).length).toBeGreaterThan(0);
    expect(cc(11).every((x) => x.d[2] === 127)).toBe(true);
    e.stop();
  });

  it('in Ableton mode the piece is silent by its length: CC 11 at 0 and every note off', () => {
    // A 12 s piece at 60 BPM on a 4 step board: the fade ending takes its last 4 passes.
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    e.setInternalSound(false);
    const lengthSec = 12;
    let finished = false;
    for (let beat = 0; beat < 40 && !finished; beat++) {
      setNow(beat);
      if (beat === 4) e.finish(4, () => { finished = true; }, 'fade');
      p.fireStep(beat, beat, 1, null);
      for (let t = beat; t < beat + 1; t += 0.025) { setNow(t); p.tickExpression(); }
      vi.advanceTimersByTime(1000);
    }
    expect(finished).toBe(true);
    e.stop();
    vi.advanceTimersByTime(RELEASE_REPEAT_MS);
    const all = sent();
    const startMs = Math.min(...all.filter((x) => x.at !== undefined).map((x) => x.at as number));
    const endMs = startMs + lengthSec * 1000;
    // Expression: 0 on every channel in use, by the end time.
    const lastExpr = new Map<number, { v: number; at: number }>();
    for (const x of cc(11)) lastExpr.set(chOf(x.d), { v: x.d[2], at: x.at ?? 0 });
    expect(lastExpr.size).toBeGreaterThan(0);
    for (const v of lastExpr.values()) {
      expect(v.v).toBe(0);
      expect(v.at).toBeLessThanOrEqual(endMs);
    }
    // Every Note On has a Note Off, and none starts after the end time.
    const ons = all.filter((x) => status(x.d) === NOTE_ON && x.d[2] > 0);
    for (const on of ons) {
      expect(on.at ?? 0).toBeLessThanOrEqual(endMs);
      expect(all.some((x) => status(x.d) === NOTE_OFF && x.d[1] === on.d[1] && chOf(x.d) === chOf(on.d) && (x.at ?? Infinity) >= (on.at ?? 0))).toBe(true);
    }
  });
});

describe('mapping in Ableton', () => {
  it('Expression on each channel in use, one at a time, then Volume on 16', async () => {
    const { mappingTargets } = await import('../midi/boardMidi');
    const t = mappingTargets();
    expect(t.map((x) => `${x.cc}:${x.channel}`)).toEqual(['11:1', '11:2', '11:3', '11:10', '11:11', '11:12', '11:13', '7:16']);
    expect(t[0].what).toContain('Melody');
    const withColours = mappingTargets(new Map([['red', 5]]));
    expect(withColours.some((x) => x.channel === 5 && x.cc === 11)).toBe(true);
  });

  it('sends one controller on one channel only, ending Expression at 0', () => {
    port.send.mockClear();
    new BoardMidiSender({ currentTime: 0 }).sendForMapping({ channel: 12, cc: 11, what: 'Band bass' });
    const msgs = port.send.mock.calls.map((c) => c[0] as number[]);
    expect(msgs.every((d) => d[0] === (0xb0 | 11) && d[1] === 11)).toBe(true);
    expect(msgs.at(-1)?.[2]).toBe(0);
    port.send.mockClear();
    new BoardMidiSender({ currentTime: 0 }).sendForMapping({ channel: 16, cc: 7, what: 'Volume' }, 0.5);
    const vol = port.send.mock.calls.map((c) => c[0] as number[]);
    expect(vol.every((d) => d[0] === (0xb0 | 15) && d[1] === 7)).toBe(true);
    expect(vol.at(-1)?.[2]).toBe(64);
  });
});
