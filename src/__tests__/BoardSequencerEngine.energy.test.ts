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
vi.mock('../songs/generative/magentaFill', () => ({
  loadMagenta: vi.fn(() => Promise.resolve()), magentaFill: vi.fn(() => Promise.resolve([])), magentaStatus: vi.fn(() => 'failed'),
}));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import type { BandJobs } from '../songs/band/bandJobs';
import { BAND_GAIN } from '../songs/band/band';
import { energyBandGain } from '../songs/performance/energy';

/**
 * A scene's Energy in the engine (harmony spec, stage 3): the band's level, how busy its
 * drums and the extra notes are, and the brightness rise together; changes land on the
 * pass; Tim's own notes are left as they are.
 */

const ROWS = 8;
const COLS = 16;
const ALL: BandJobs = { asBefore: false, pads: true, bass: true, drums: true, counter: true };
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'hue', role: 'drums', swatch: '#000' },
];
const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: ROWS, cols: COLS, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 5, 7, 9, 11], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
  soundWorld: 'warm', phrases: false, fillEngine: 'rules', chords: { sequence: 'rising', bars: 1 }, clashNudge: true,
  band: 'full', bandJobs: ALL, ...over,
});
const fakeGain = () => ({ gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
interface Priv {
  timer: unknown;
  lastInternalBeat: number;
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  bandVoices: { gain: ReturnType<typeof fakeGain> } & Record<string, unknown>;
  mixTone: { frequency: { setTargetAtTime: ReturnType<typeof vi.fn> } } | null;
  worldGain: ReturnType<typeof fakeGain> | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
const BOARD: ActiveCell[] = [
  { row: 5, col: 0, colour: 'm' }, { row: 3, col: 5, colour: 'm' }, { row: 4, col: 10, colour: 'm' },
  { row: ROWS - 1, col: 0, colour: 'd' },
];

function engine(energy: number, over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map(channels.filter((c) => c.role !== 'drums').map((c) => [c.id, fakeVoiceEntry()]));
  p.drumKit = { play: vi.fn() };
  const v = () => ({ play: vi.fn(), dispose: vi.fn() });
  p.bandVoices = { pad: v(), bass: v(), lead: v(), gain: fakeGain(), rev: fakeGain(), leadGain: fakeGain(), top: fakeGain() };
  p.mixTone = { frequency: { setTargetAtTime: vi.fn() } };
  p.worldGain = fakeGain();
  e.setBand(over.band ?? 'full');
  e.setFill(0.4, 3, null);
  e.setSceneEnergy(energy);
  e.setActiveCells(BOARD);
  return { e, p };
}

/** Three passes: what the band's drums, the extra notes and Tim played, and how hard. */
function listen(energy: number, over: Partial<BoardEngineConfig> = {}) {
  const { e, p } = engine(energy, over);
  const notes = [];
  for (let b = 0; b < 48; b++) {
    p.fireStep(b, b, 1, null);
    notes.push(...e.drainFiredNotes());
  }
  const lastGain = p.bandVoices.gain.gain.setTargetAtTime.mock.calls.at(-1)?.[0] as number | undefined;
  const lastHz = p.mixTone?.frequency.setTargetAtTime.mock.calls.at(-1)?.[0] as number | undefined;
  const lastLevel = p.worldGain?.gain.setTargetAtTime.mock.calls.at(-1)?.[0] as number | undefined;
  return {
    drums: notes.filter((n) => n.colour === 'band:groove').length,
    extras: notes.filter((n) => n.origin === 'fill').length,
    tim: notes.filter((n) => n.origin === 'placed').map((n) => `${n.midi ?? n.drum}|${n.velocity}`),
    drumVel: Math.max(...notes.filter((n) => n.colour === 'band:groove').map((n) => n.velocity ?? 0)),
    bandGain: lastGain ?? BAND_GAIN.full,
    brightHz: lastHz ?? 20000,
    level: lastLevel ?? 1,
  };
}

describe('Energy, in the engine', () => {
  it('the whole sound’s level, the band’s, its drums, the extra notes and the brightness rise with Energy', () => {
    const at = [1, 2, 3, 4, 5].map((e) => listen(e));
    for (let k = 1; k < at.length; k++) {
      expect(at[k].level).toBeGreaterThan(at[k - 1].level);
      expect(at[k].bandGain).toBeGreaterThan(at[k - 1].bandGain);
      expect(at[k].drums).toBeGreaterThanOrEqual(at[k - 1].drums);
      expect(at[k].extras).toBeGreaterThanOrEqual(at[k - 1].extras);
      expect(at[k].brightHz).toBeGreaterThan(at[k - 1].brightHz);
      expect(at[k].drumVel).toBeGreaterThanOrEqual(at[k - 1].drumVel);
    }
    expect(at[4].drums).toBeGreaterThan(at[0].drums);
    expect(at[4].extras).toBeGreaterThan(at[0].extras);
    expect(at[2].bandGain).toBeCloseTo(BAND_GAIN.full, 6);
    expect(at[4].bandGain).toBeCloseTo(BAND_GAIN.full * energyBandGain(5), 6);
  });

  it('Tim’s own notes are the same at every Energy', () => {
    const tim = listen(1).tim;
    expect(tim.length).toBeGreaterThan(0);
    for (const e of [2, 3, 4, 5]) expect(listen(e).tim).toEqual(tim);
  });

  it('Energy off is as before', () => {
    const off = listen(0);
    expect(off.bandGain).toBe(BAND_GAIN.full);
    expect(off.brightHz).toBe(20000);
    expect(off.level).toBe(1);
  });

  it('5 stays under the limiter: no band note’s velocity is pushed past full, and the band at most 3 dB up', () => {
    const top = listen(5);
    expect(top.drumVel).toBeLessThanOrEqual(1);
    expect(20 * Math.log10(top.bandGain / BAND_GAIN.full)).toBeLessThanOrEqual(3.0001);
  });

  it('a scene’s Energy lands on the pass, with its loops', () => {
    const { e, p } = engine(2);
    p.timer = 1;
    for (let b = 0; b < 20; b++) {
      if (b === 6) e.landOnNextPass({ sceneEnergy: 5 });
      p.lastInternalBeat = b;
      p.fireStep(b, b, 1, null);
      expect(e.getSceneEnergy()).toBe(b < 16 ? 2 : 5);
    }
    p.timer = null;
  });
});
