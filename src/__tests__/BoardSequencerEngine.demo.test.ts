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
  loadMagenta: vi.fn(() => Promise.resolve()), magentaFill: vi.fn(() => Promise.resolve([])), magentaStatus: vi.fn(() => 'idle'),
}));

import { BoardSequencerEngine, type BoardEngineConfig, type FiredNote } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import { A_MAJOR, DEMO_LOOPS, F_SHARP_MINOR } from '../songs/demo/demoPiece';
import { loopChannelsFor } from '../songs/performance/loopSounds';

/**
 * The demo piece (Rising Light version 2) through the engine: its loops play as written and
 * grow over four passes, and a scene's key lands on the pass with its loops.
 */

const ROWS = 8;
const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: ROWS, cols: 8, scaleRootMidi: A_MAJOR.rootMidi, scaleSemitones: [...A_MAJOR.semitones], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: [],
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
  soundWorld: 'warm', phrases: true, fillEngine: 'rules', chords: { sequence: 'still', bars: 2 }, clashNudge: false, ...over,
});

interface Priv {
  timer: unknown;
  cfg: BoardEngineConfig;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

const pc = (m: number): number => ((m % 12) + 12) % 12;
const loop = (name: string) => DEMO_LOOPS.find((l) => l.name === name)?.cells ?? [];

function engineWith(names: string[], over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  const { channels } = loopChannelsFor(names.flatMap(loop), []);
  p.voiceByChannel = new Map(channels.map((c: ColourChannel) => [c.id, fakeVoiceEntry()]));
  p.drumKit = { play: vi.fn() };
  const loops = names.map((n) => loopChannelsFor(loop(n), []).cells);
  e.setLaunchedLoops(names.map((_, i) => i), loops, channels);
  return { e, p };
}

function play(e: BoardSequencerEngine, p: Priv, from: number, to: number): Map<number, FiredNote[]> {
  const out = new Map<number, FiredNote[]>();
  for (let b = from; b < to; b++) {
    p.fireStep(b, b, 1, null);
    out.set(b, e.drainFiredNotes());
  }
  return out;
}

describe('the demo through the engine', () => {
  it('the winds’ theme grows over four passes: asks, answers, an E, then the high A ringing over the turn', () => {
    const { e, p } = engineWith(['Winds theme']);
    // As the demo sets it: the loops breathe in loudness but never drop a note.
    e.setLoopVary(0.2);
    const fired = play(e, p, 0, 32);
    const pass = (k: number): string[] => [...fired.entries()].filter(([b]) => Math.floor(b / 8) === k)
      .flatMap(([b, ns]) => ns.filter((n) => n.role === 'melody').map((n) => `${b % 8}:${n.midi}`));
    expect(pass(0)).toEqual(['0:73', '3:71', '4:69', '6:76']);
    expect(pass(1)).toEqual(['0:73', '3:71', '4:69', '5:71', '6:76', '7:78']);
    expect(pass(2)).toEqual(['0:73', '2:76', '3:71', '4:69', '5:71', '6:76', '7:78']);
    expect(pass(3)).toEqual(['0:73', '1:81', '2:76', '3:71', '4:69', '5:71', '6:76', '7:78']);
    // The high A rings to the turn and over it.
    const high = (fired.get(25) ?? []).find((n) => n.midi === 81);
    expect(high?.durSec).toBeGreaterThanOrEqual(7);
  });

  it('the brass swells on the first beat of every bar, an open fifth held through it', () => {
    const { e, p } = engineWith(['Brass swells']);
    const fired = play(e, p, 0, 8);
    const at = (b: number) => (fired.get(b) ?? []).filter((n) => n.role === 'bass').map((n) => n.midi).sort();
    expect(at(0)).toEqual([57, 64]);
    expect(at(4)).toEqual([57, 64]);
    for (const n of fired.get(0) ?? []) expect(n.durSec).toBeCloseTo(4, 5);
  });

  it('the guitar rolls the chord the pads hold, string by string, 90 ms apart: once on the 1st pass, twice after', () => {
    const { e, p } = engineWith(['Guitar roll'], { chords: { sequence: 'glow', bars: 2 } });
    const fired = play(e, p, 0, 16);
    const chordsIn = (from: number) => [...fired.entries()].filter(([b]) => b >= from && b < from + 8)
      .flatMap(([, ns]) => ns.filter((n) => n.role === 'chord'));
    expect(chordsIn(0)).toHaveLength(1);
    expect(chordsIn(8)).toHaveLength(2);
    expect(chordsIn(0)[0].strumSec).toBe(0.09);
    // A add9 under it: the guitar's chord is A's.
    expect(new Set((chordsIn(0)[0].midis ?? []).map(pc)).has(9)).toBe(true);
  });

  it('the groove plays on a sixteenth grid: its kick pattern, the backbeat, hats on the eighths; ghosts on the 2nd pass', () => {
    const { e, p } = engineWith(['Groove']);
    const fired = [...play(e, p, 0, 16).values()].flat().filter((n) => n.drum);
    const times = (d: string, from: number) => fired.filter((n) => n.drum === d && n.audioTime >= from && n.audioTime < from + 8)
      .map((n) => n.audioTime - from).sort((x, y) => x - y);
    expect(times('kick', 0)).toEqual([0, 1.5, 2.75, 4, 5.5, 6.5]);
    expect(times('snare', 0)).toEqual([1, 3, 5, 7]);
    expect(times('hat', 0)).toHaveLength(16);
    expect(times('hat', 8)).toHaveLength(24);
    expect(times('crash', 0)).toEqual([0]);
  });

  it('a scene’s key lands on the pass: A major to the end of the pass, F sharp minor from its first beat (the theme a third lower)', () => {
    const { e, p } = engineWith(['Winds theme']);
    p.timer = 1;
    play(e, p, 0, 3);
    e.landOnNextPass({ key: { rootMidi: F_SHARP_MINOR.rootMidi, semitones: F_SHARP_MINOR.semitones } });
    // The screen catching up with the same key changes nothing yet.
    e.setScale(F_SHARP_MINOR.rootMidi, [...F_SHARP_MINOR.semitones]);
    const tune = (m: Map<number, FiredNote[]>, b: number): number | undefined => (m.get(b) ?? []).find((n) => n.role === 'melody' && n.midi !== undefined)?.midi;
    const rest = play(e, p, 3, 14);
    // Beat 5 of the A major pass: A (the theme's third note); in the next pass, in F sharp minor: F#.
    expect(tune(rest, 4)).toBe(69);
    expect(tune(rest, 12)).toBe(66);
    p.timer = null;
  });

  it('the player picking another key while a scene’s waits: theirs wins at once', () => {
    const { e, p } = engineWith(['Winds theme']);
    p.timer = 1;
    play(e, p, 0, 2);
    e.landOnNextPass({ key: { rootMidi: F_SHARP_MINOR.rootMidi, semitones: F_SHARP_MINOR.semitones } });
    e.setScale(62, [...A_MAJOR.semitones]);
    play(e, p, 2, 10);
    expect(p.cfg.scaleRootMidi).toBe(62);
    expect(p.cfg.scaleSemitones).toEqual(A_MAJOR.semitones);
    p.timer = null;
  });
});

describe('the band with the loops', () => {
  it('off (as before): loops alone never bring the band in; on (the demo): the pads join the loops on the next pass', () => {
    for (const withLoops of [false, true]) {
      const { e, p } = engineWith(['Guitar roll'], { bandWithLoops: withLoops, band: 'gentle', bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false } });
      const bp = p as unknown as { bandVoices: unknown };
      const g = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
      bp.bandVoices = { pad: { play: vi.fn(), dispose: vi.fn() }, bass: { play: vi.fn(), dispose: vi.fn() }, gain: g(), rev: g() };
      e.setBand('gentle');
      const fired = [...play(e, p, 0, 24).values()].flat();
      expect(fired.some((n) => n.origin === 'band'), String(withLoops)).toBe(withLoops);
      if (withLoops) {
        // A bass loop over the bass (the brass) is not the bass: the band's bass plays under it.
        const t = engineWith(['Brass swells', 'Guitar roll'], { bandWithLoops: true, band: 'gentle', bandJobs: { asBefore: false, pads: true, bass: true, drums: false, counter: false } });
        (t.p as unknown as { bandVoices: unknown }).bandVoices = bp.bandVoices;
        t.e.setBand('gentle');
        const notes = [...play(t.e, t.p, 0, 24).values()].flat();
        expect(notes.some((n) => n.origin === 'band' && n.role === 'bass')).toBe(true);
      }
    }
  });
});

describe('the final chord ending with the band joining the loops (the demo)', () => {
  it('while the texture thins, the pads that lead stay to the final chord; the band’s bass leaves', () => {
    const { e, p } = engineWith(['Guitar roll'], {
      bandWithLoops: true, band: 'full', widePads: true, chords: { sequence: 'tide', bars: 2 },
      bandJobs: { asBefore: false, pads: true, bass: true, drums: false, counter: false },
    });
    const g = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
    (p as unknown as { bandVoices: unknown }).bandVoices = { pad: { play: vi.fn(), dispose: vi.fn() }, bass: { play: vi.fn(), dispose: vi.fn() }, gain: g(), rev: g() };
    e.setBand('full');
    const before = [...play(e, p, 0, 16).values()].flat();
    expect(before.some((n) => n.origin === 'band' && n.role === 'bass')).toBe(true);
    // Two passes of thinning, then the chord.
    e.finish(16, vi.fn(), 'chord');
    const thinning = [...play(e, p, 16, 32).values()].flat().filter((n) => n.origin === 'band');
    expect(thinning.some((n) => n.role === 'chord')).toBe(true);
    expect(thinning.some((n) => n.role === 'bass')).toBe(false);
  });
});

describe('wide pads', () => {
  it('under a chord loop: one layer in unison with its chords, a second above them, under the melody', () => {
    for (const wide of [false, true]) {
      const { e, p } = engineWith(['Guitar roll'], { bandWithLoops: true, widePads: wide, band: 'full', bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false } });
      const g = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
      (p as unknown as { bandVoices: unknown }).bandVoices = { pad: { play: vi.fn(), dispose: vi.fn() }, bass: { play: vi.fn(), dispose: vi.fn() }, gain: g(), rev: g() };
      e.setBand('full');
      const pads = (play(e, p, 0, 9).get(8) ?? []).filter((n) => n.origin === 'band' && n.role === 'chord').map((n) => n.midi ?? 0);
      const high = pads.filter((m) => m >= 62);
      expect(high.length > 0, String(wide)).toBe(wide);
      for (const m of pads) expect(m).toBeLessThanOrEqual(69);
    }
  });
});
