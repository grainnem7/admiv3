import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

const port = vi.hoisted(() => ({ send: vi.fn() }));
const clock = vi.hoisted(() => ({ now: 0 }));
vi.mock('../midi/MIDIManager', () => ({ MIDIManager: { getSelectedOutput: () => port, getConnectedSelectedOutput: () => port, isSelectedConnected: () => true } }));
vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => clock.now), immediate: vi.fn(() => clock.now),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); cut = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];
type Entry = ReturnType<typeof fakeVoiceEntry> & { pending?: { voice: { cut: ReturnType<typeof vi.fn> }; timer: ReturnType<typeof setInterval> } | null };
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, Entry>;
  bandVoices: { pad: { cut: ReturnType<typeof vi.fn> }; bass: { cut: ReturnType<typeof vi.fn> } } | null;
  drumKit: { stopAll: ReturnType<typeof vi.fn> } | null;
  timer: ReturnType<typeof setInterval> | null;
  pendingLaunch: { slots: number[] } | null;
  tickExpression(): void;
}
const loopCells: ActiveCell[] = [{ row: 2, col: 0, colour: 'm' }];

function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, band: 'off',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const entry: Entry = { ...fakeVoiceEntry(), pending: { voice: { cut: vi.fn() }, timer: 0 as unknown as ReturnType<typeof setInterval> } };
  p.voiceByChannel = new Map([['m', entry]]);
  p.bandVoices = { pad: { cut: vi.fn() }, bass: { cut: vi.fn() } };
  p.drumKit = { stopAll: vi.fn() };
  return { e, p, entry };
}
const cc = (n: number) => port.send.mock.calls.map((c) => c[0] as number[]).filter((d) => (d[0] & 0xf0) === 0xb0 && d[1] === n);

/**
 * New loop: "Silence. Everything stops at once." Stop gets that by throwing the engine
 * away; New loop keeps the engine (the step, the board, the clock carry on), so the engine
 * has to give the same silence itself — every voice, the kit, the band, every loop, and
 * every note sent to Ableton.
 */
describe('engine — silence now, as Stop gives it (T1-02)', () => {
  beforeEach(() => { port.send.mockClear(); clock.now = 0; });

  it('cuts every voice (one still loading too), the band and the kit', () => {
    const { e, p, entry } = engine();
    e.silenceNow();
    expect(entry.voice.cut).toHaveBeenCalledTimes(1);
    expect(entry.pending?.voice.cut).toHaveBeenCalledTimes(1);
    expect(p.bandVoices?.pad.cut).toHaveBeenCalledTimes(1);
    expect(p.bandVoices?.bass.cut).toHaveBeenCalledTimes(1);
    expect(p.drumKit?.stopAll).toHaveBeenCalledTimes(1);
  });

  it('every loop leaves at once, not over a pass; one still wanted comes back at the next pass', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([2, 5], [loopCells, loopCells]);
    p.timer = 1 as unknown as ReturnType<typeof setInterval>; // playing
    // New loop wants none of them (and the screen says so before it silences).
    e.setLaunchedLoops([], []);
    e.silenceNow();
    expect(e.getLaunchedSlots()).toEqual([]);
    expect(p.pendingLaunch).toBeNull();
    // Silenced with a loop still wanted (playing): it is not lost, it comes in at the next pass.
    p.timer = null;
    e.setLaunchedLoops([5], [loopCells]);
    p.timer = 1 as unknown as ReturnType<typeof setInterval>;
    expect(e.getLaunchedSlots()).toEqual([5]);
    e.silenceNow();
    expect(e.getLaunchedSlots()).toEqual([]);
    expect(p.pendingLaunch?.slots).toEqual([5]);
  });

  it('over MIDI: every note released and Expression to 0 at once, back up once the notes queued ahead have gone', () => {
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'player' });
    port.send.mockClear();
    e.silenceNow();
    expect(cc(123).length).toBeGreaterThan(0); // all notes off
    expect(cc(11).length).toBeGreaterThan(0);
    expect(cc(11).every((d) => d[2] === 0)).toBe(true);
    // Still inside the look-ahead: Expression stays down.
    port.send.mockClear();
    clock.now = 0.05;
    p.tickExpression();
    expect(cc(11).filter((d) => d[2] > 0)).toEqual([]);
    // Well past it: back up, so the counters put down next are heard.
    clock.now = 1;
    p.tickExpression();
    expect(cc(11).some((d) => d[2] === 127)).toBe(true);
  });
});

/**
 * The piece started while Tim warms up: a colour that waits for its time goes silent at once,
 * its notes still ringing or already queued cut, and nothing else is touched.
 */
describe('engine — a waiting colour cut as the piece starts', () => {
  it('cuts only that colour’s voice (one still loading too): not the band, the kit or any other colour', () => {
    const { e, p, entry } = engine();
    const other = fakeVoiceEntry();
    p.voiceByChannel.set('b', other as Entry);
    e.silenceColours(['m', 'gone']);
    expect(entry.voice.cut).toHaveBeenCalledTimes(1);
    expect(entry.pending?.voice.cut).toHaveBeenCalledTimes(1);
    expect(other.voice.cut).not.toHaveBeenCalled();
    expect(p.bandVoices?.pad.cut).not.toHaveBeenCalled();
    expect(p.drumKit?.stopAll).not.toHaveBeenCalled();
    e.silenceColours([]);
    expect(entry.voice.cut).toHaveBeenCalledTimes(1);
  });
});
