import { describe, it, expect, vi } from 'vitest';
import { allNotesOffEvents, midiEventsFor, ROLE_CHANNEL, sentBy, type MidiNoteLike } from '../midi/boardMidi';
import { audioTimeToPerformanceMs } from '../songs/audibleTime';

const toMs = (t: number) => t * 1000;
const on = (data: number[]) => (data[0] & 0xf0) === 0x90;

describe('what the board says in MIDI', () => {
  const melody: MidiNoteLike = { role: 'melody', origin: 'placed', audioTime: 2, durSec: 0.5, midi: 69, velocity: 0.5 };

  it('a melody note: note on at its moment, note off after its length, on the melody channel', () => {
    const ev = midiEventsFor(melody, { enabled: true, sends: 'player' }, toMs);
    expect(ev).toEqual([
      { data: [0x90 | (ROLE_CHANNEL.melody - 1), 69, 64], atMs: 2000 },
      { data: [0x80 | (ROLE_CHANNEL.melody - 1), 69, 0], atMs: 2500 },
    ]);
  });

  it('a chord stab sends every note of the stack', () => {
    const ev = midiEventsFor({ role: 'chord', origin: 'placed', audioTime: 0, durSec: 1, midis: [60, 64, 67], velocity: 1 }, { enabled: true, sends: 'player' }, toMs);
    expect(ev.filter((e) => on(e.data)).map((e) => e.data[1])).toEqual([60, 64, 67]);
    expect(ev.every((e) => (e.data[0] & 0x0f) === ROLE_CHANNEL.chord - 1)).toBe(true);
  });

  it('drums go to channel 10 as General MIDI notes, and a kick+crash is two hits', () => {
    const kick = midiEventsFor({ role: 'drums', origin: 'placed', audioTime: 0, durSec: 1, drum: 'kick', velocity: 0.8 }, { enabled: true, sends: 'player' }, toMs);
    expect(kick[0].data).toEqual([0x99, 36, 102]);
    expect(kick[1].atMs).toBeLessThan(1000); // a hit, not a held note
    const both = midiEventsFor({ role: 'drums', origin: 'placed', audioTime: 0, durSec: 1, drum: 'kickCrash', velocity: 0.8 }, { enabled: true, sends: 'player' }, toMs);
    expect(both.filter((e) => on(e.data)).map((e) => e.data[1])).toEqual([36, 49]);
  });

  it('"my notes only" sends placed counters and their phrases, not the fill or the band', () => {
    expect(sentBy('placed', 'player')).toBe(true);
    expect(sentBy('phrase', 'player')).toBe(true);
    expect(sentBy('fill', 'player')).toBe(false);
    expect(sentBy('band', 'player')).toBe(false);
    expect(sentBy('band', 'all')).toBe(true);
    expect(midiEventsFor({ ...melody, origin: 'fill' }, { enabled: true, sends: 'player' }, toMs)).toEqual([]);
    expect(midiEventsFor({ ...melody, origin: 'fill' }, { enabled: true, sends: 'all' }, toMs)).toHaveLength(2);
  });

  it('sends nothing when off, and never a silent or out-of-range note', () => {
    expect(midiEventsFor(melody, { enabled: false, sends: 'all' }, toMs)).toEqual([]);
    const quiet = midiEventsFor({ ...melody, velocity: 0, midi: 140 }, { enabled: true, sends: 'all' }, toMs);
    expect(quiet[0].data[2]).toBe(1);
    expect(quiet[0].data[1]).toBe(127);
  });

  it('a very short note still gets a note off after it', () => {
    const ev = midiEventsFor({ ...melody, durSec: 0.001 }, { enabled: true, sends: 'all' }, toMs);
    expect(ev[1].atMs - ev[0].atMs).toBeGreaterThanOrEqual(30);
  });

  it('all notes off reaches every channel the board uses', () => {
    const ev = allNotesOffEvents(5);
    expect(ev.map((e) => (e.data[0] & 0x0f) + 1).sort((a, b) => a - b)).toEqual([1, 2, 3, 10]);
    expect(ev.every((e) => e.data[1] === 123)).toBe(true);
  });
});

describe('audio time → wall clock', () => {
  it('uses the output timestamp pair when the browser gives one', () => {
    const ctx = { currentTime: 10, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }) };
    expect(audioTimeToPerformanceMs(ctx, 10.25, 9999)).toBe(5250);
  });

  it('otherwise counts from now, allowing for the output latency', () => {
    const ctx = { currentTime: 10, outputLatency: 0.02 };
    expect(audioTimeToPerformanceMs(ctx, 10.1, 7000)).toBeCloseTo(7120, 6);
  });
});

// ---- the engine sends what it logs ----

const port = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../midi/MIDIManager', () => ({ MIDIManager: { getSelectedOutput: () => port } }));
vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> } }>;
  drumKit: null;
  mix: { gain: { setTargetAtTime: ReturnType<typeof vi.fn> } };
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, band: 'off',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', { voice: { play: vi.fn() } }]]);
  p.drumKit = null;
  p.mix = { gain: { setTargetAtTime: vi.fn() } };
  e.setActiveCells([{ row: 3, col: 0, colour: 'm' }]);
  return { e, p };
}

describe('engine — MIDI out', () => {
  it('sends the note it plays, and nothing when MIDI out is off', () => {
    port.send.mockClear();
    const { e, p } = engine();
    p.fireStep(0, 0, 1, null);
    expect(port.send).not.toHaveBeenCalled();
    e.setMidiOut({ enabled: true, sends: 'player' });
    p.fireStep(4, 4, 1, null);
    const notes = port.send.mock.calls.map((c) => c[0] as number[]);
    expect(notes.some((d) => (d[0] & 0xf0) === 0x90 && d[1] === 69)).toBe(true);
    expect(notes.some((d) => (d[0] & 0xf0) === 0x80 && d[1] === 69)).toBe(true);
  });

  it('muted: no notes go out, and the receiving instrument is told to stop', () => {
    port.send.mockClear();
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'player' });
    e.setMuted(true);
    expect(port.send.mock.calls.some((c) => (c[0] as number[])[1] === 123)).toBe(true);
    port.send.mockClear();
    p.fireStep(0, 0, 1, null);
    expect(port.send).not.toHaveBeenCalled();
  });

  it('MIDI only: the built-in sound goes silent while the lights and log carry on', () => {
    const { e, p } = engine();
    e.setInternalSound(false);
    expect(p.mix.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBe(0);
    p.fireStep(0, 0, 1, null);
    expect(e.drainFiredNotes().length).toBeGreaterThan(0);
    e.setInternalSound(true);
    expect(p.mix.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(0.6, 9);
  });
});
