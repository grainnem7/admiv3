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
import { A_MAJOR, A_MINOR, DEMO_LOOPS } from '../songs/demo/demoPiece';
import { loopChannelsFor } from '../songs/performance/loopSounds';

/**
 * The demo piece through the engine: its loops play as written, the guitar's V chord keeps
 * its root, and a scene's key lands on the pass with its loops.
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
  it('the guitar loop plays I V vi IV in A major, the V chord with its root (E G# B, never G# B D)', () => {
    const { e, p } = engineWith(['Guitar']);
    const fired = play(e, p, 0, 8);
    const chordAt = (beat: number): Set<number> => new Set((fired.get(beat) ?? []).flatMap((n) => n.midis ?? []).map(pc));
    expect(chordAt(0)).toEqual(new Set([9, 1, 4]));
    expect(chordAt(2)).toEqual(new Set([4, 8, 11]));
    expect(chordAt(4)).toEqual(new Set([6, 9, 1]));
    expect(chordAt(6)).toEqual(new Set([2, 6, 9]));
  });

  it('the trombone sings an octave above the bass’s register: its first note is C#4', () => {
    const { e, p } = engineWith(['Trombone']);
    const first = (play(e, p, 0, 1).get(0) ?? []).find((n) => n.role === 'bass');
    expect(first?.midi).toBe(61);
  });

  it('the guitar strums: down on the beat (low string first), up between (high first, softer)', () => {
    const { e, p } = engineWith(['Guitar Drive'.replace('Drive', 'drive')]);
    const fired = play(e, p, 0, 2);
    const down = (fired.get(0) ?? []).find((n) => n.role === 'chord');
    const up = (fired.get(1) ?? []).find((n) => n.role === 'chord');
    expect(down?.strumSec ?? 0).toBeGreaterThan(0);
    expect(up?.strumSec ?? 0).toBeLessThan(0);
    expect(up?.velocity ?? 1).toBeLessThan(down?.velocity ?? 0);
  });

  it('the drums loop plays the groove (hats between the kick and snare), not one hit', () => {
    const { e, p } = engineWith(['Drums']);
    const fired = [...play(e, p, 0, 8).values()].flat();
    const drums = new Set(fired.map((n) => n.drum));
    expect(drums.has('kick') && drums.has('snare') && drums.has('hat')).toBe(true);
  });

  it('a scene’s key lands on the pass: A major to the end of the pass, A minor from its first beat', () => {
    const { e, p } = engineWith(['Harp']);
    p.timer = 1;
    play(e, p, 0, 3);
    e.landOnNextPass({ key: { rootMidi: A_MINOR.rootMidi, semitones: A_MINOR.semitones } });
    // The screen catching up with the same key changes nothing yet.
    e.setScale(A_MINOR.rootMidi, [...A_MINOR.semitones]);
    const harp = (m: Map<number, FiredNote[]>, b: number): number | undefined => (m.get(b) ?? []).find((n) => n.role === 'melody' && n.midi !== undefined)?.midi;
    const rest = play(e, p, 3, 10);
    // Beat 4 of the A major pass: C sharp (the harp's third step); beat 1 of the next pass in A
    // minor, then its C natural on beat 2.
    expect(harp(rest, 4)).toBe(73);
    expect(harp(rest, 8)).toBe(69);
    expect(harp(rest, 9)).toBe(72);
    p.timer = null;
  });

  it('the player picking another key while a scene’s waits: theirs wins at once', () => {
    const { e, p } = engineWith(['Harp']);
    p.timer = 1;
    play(e, p, 0, 2);
    e.landOnNextPass({ key: { rootMidi: A_MINOR.rootMidi, semitones: A_MINOR.semitones } });
    e.setScale(62, [...A_MAJOR.semitones]);
    play(e, p, 2, 10);
    expect(p.cfg.scaleRootMidi).toBe(62);
    expect(p.cfg.scaleSemitones).toEqual(A_MAJOR.semitones);
    p.timer = null;
  });

  it('a tune’s decorations play on every other pass, and on the plain pass a long note rings on to the next note that plays', () => {
    const { e, p } = engineWith(['Clarinet'], { variationEnabled: true });
    const fired = play(e, p, 0, 16);
    const at = (b: number) => (fired.get(b) ?? []).filter((n) => n.role === 'melody' && n.midi !== undefined);
    // Pass one, plain: E (2 beats), nothing on beat 2; pass two decorated: E, then F# on beat 2.
    expect(at(1)).toHaveLength(0);
    expect(at(9)).toHaveLength(1);
    expect(at(0)[0].durSec).toBeGreaterThanOrEqual(2);
    expect(at(8)[0].durSec).toBeLessThan(1.5);
  });
});

describe('the band with the loops', () => {
  it('off (as before): loops alone never bring the band in; on (the demo): the pads join the loops on the next pass', () => {
    for (const withLoops of [false, true]) {
      const { e, p } = engineWith(['Guitar'], { bandWithLoops: withLoops, band: 'gentle', bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false } });
      const bp = p as unknown as { bandVoices: unknown };
      const g = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
      bp.bandVoices = { pad: { play: vi.fn(), dispose: vi.fn() }, bass: { play: vi.fn(), dispose: vi.fn() }, gain: g(), rev: g() };
      e.setBand('gentle');
      const fired = [...play(e, p, 0, 24).values()].flat();
      expect(fired.some((n) => n.origin === 'band'), String(withLoops)).toBe(withLoops);
      if (withLoops) {
        // A bass loop lifted an octave (the trombone) is not the bass: the band's bass plays under it.
        const t = engineWith(['Trombone', 'Guitar'], { bandWithLoops: true, band: 'gentle', bandJobs: { asBefore: false, pads: true, bass: true, drums: false, counter: false } });
        (t.p as unknown as { bandVoices: unknown }).bandVoices = bp.bandVoices;
        t.e.setBand('gentle');
        const notes = [...play(t.e, t.p, 0, 24).values()].flat();
        expect(notes.some((n) => n.origin === 'band' && n.role === 'bass')).toBe(true);
      }
    }
  });
});

describe('wide pads', () => {
  it('under a chord loop: one layer in unison with its chords, a second above them, under the melody', () => {
    for (const wide of [false, true]) {
      const { e, p } = engineWith(['Guitar'], { bandWithLoops: true, widePads: wide, band: 'full', bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false } });
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
