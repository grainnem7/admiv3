import { describe, it, expect, vi } from 'vitest';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import { midiEventsFor } from '../midi/boardMidi';
import { STRUM_DOWN_SEC } from '../songs/strum';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

/**
 * A fingerpicked guitar (Rising Light version 2, D4): a chord loop's note may set its own
 * roll, seconds between strings, so the guitar rolls each chord slowly, string by string,
 * like fingers, instead of strumming it.
 */
const channels: ColourChannel[] = [{ id: 'g', kind: 'hue', role: 'chord', swatch: '#0f0', instrument: 'guitarAcoustic' }];

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> } }>;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine() {
  const cfg: BoardEngineConfig = {
    bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
  };
  const e = new BoardSequencerEngine(cfg);
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const play = vi.fn();
  p.voiceByChannel = new Map([['g', fakeVoiceEntry(play)]]);
  return { e, p, play };
}

describe('a chord loop’s own roll', () => {
  it('a cell with roll 0.09 sends its chord’s notes 90 ms apart, low string first, all ending together', () => {
    const { e, p, play } = engine();
    e.setActiveLoops([[{ row: 1, col: 0, colour: 'g', roll: 0.09 } as ActiveCell]]);
    p.fireStep(0, 10, 1, null);
    const [fired] = e.drainFiredNotes();
    expect(fired.strumSec).toBe(0.09);
    // In ADMI's own sound: each string 90 ms after the one below it, each ending at the same moment.
    const calls = play.mock.calls.map(([midi, , dur, at]) => ({ midi: midi as number, at: at as number, end: (at as number) + (dur as number) }));
    const byPitch = [...calls].sort((a, b) => a.midi - b.midi);
    byPitch.forEach((c, i) => expect(c.at).toBeCloseTo(10 + i * 0.09, 6));
    expect(new Set(calls.map((c) => c.end.toFixed(6))).size).toBe(1);
    // Over MIDI: the same, 90 ms apart, low first, one note off time for all.
    const events = midiEventsFor(fired, { enabled: true, sends: 'all' }, (t) => t * 1000);
    const on = events.filter((ev) => (ev.data[0] & 0xf0) === 0x90).map((ev) => [ev.data[1], Math.round(ev.atMs)]);
    const sorted = [...on].sort((a, b) => a[0] - b[0]);
    expect(sorted.map((x) => x[1] - sorted[0][1])).toEqual(sorted.map((_, i) => i * 90));
    expect(new Set(events.filter((ev) => (ev.data[0] & 0xf0) === 0x80).map((ev) => Math.round(ev.atMs))).size).toBe(1);
  });

  it('a negative roll goes high string first, at its written loudness', () => {
    const { e, p, play } = engine();
    e.setActiveLoops([[{ row: 1, col: 1, colour: 'g', roll: -0.07, velocity: 0.4 } as ActiveCell]]);
    p.fireStep(1, 10, 1, null);
    const [fired] = e.drainFiredNotes();
    expect(fired.strumSec).toBe(-0.07);
    const first = [...play.mock.calls].sort((a, b) => (a[3] as number) - (b[3] as number))[0];
    expect(first[0]).toBe(Math.max(...play.mock.calls.map((c) => c[0] as number)));
    // A written roll is not an up strum: no softening, the cell's own loudness stands.
    const plain = engine();
    plain.e.setActiveLoops([[{ row: 1, col: 1, colour: 'g', roll: 0.07, velocity: 0.4 } as ActiveCell]]);
    plain.p.fireStep(1, 10, 1, null);
    expect(fired.velocity).toBeCloseTo(plain.e.drainFiredNotes()[0].velocity ?? 0, 6);
  });

  it('without a roll, the guitar strums as before', () => {
    const { e, p } = engine();
    e.setActiveLoops([[{ row: 1, col: 0, colour: 'g' }]]);
    p.fireStep(0, 10, 1, null);
    expect(e.drainFiredNotes()[0].strumSec).toBe(STRUM_DOWN_SEC);
  });
});
