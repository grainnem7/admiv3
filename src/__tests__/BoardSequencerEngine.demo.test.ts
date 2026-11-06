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
import { DEMO_LOOPS, F_SHARP_MAJOR, F_SHARP_MINOR } from '../songs/demo/demoPiece';
import { loopChannelsFor } from '../songs/performance/loopSounds';

/**
 * The demo piece through the engine: its loops play as written, the guitar's V chord keeps
 * its root, and a scene's key lands on the pass with its loops.
 */

const ROWS = 8;
const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: ROWS, cols: 8, scaleRootMidi: F_SHARP_MINOR.rootMidi, scaleSemitones: [...F_SHARP_MINOR.semitones], swing: 0, humanize: 0,
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
  it('the pulse sends sixteen notes a pass, eighth notes apart, an octave over the bass', () => {
    const { e, p } = engineWith(['Pulse']);
    const notes = [...play(e, p, 0, 8).values()].flat().filter((n) => n.role === 'bass' && n.midi !== undefined);
    expect(notes).toHaveLength(16);
    const times = notes.map((n) => n.audioTime).sort((x, y) => x - y);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(0.5, 5);
    // F#3 on every strong beat (1 and 3 of each bar), short notes (a pluck), never into the next.
    expect(notes.filter((n) => Math.abs(n.audioTime % 2) < 1e-6).map((n) => n.midi)).toEqual([54, 54, 54, 54]);
    for (const n of notes) expect(n.durSec).toBeLessThan(0.5);
  });

  it('the swells hold the chord the pads hold for a whole pass, and sound again at the top of the next', () => {
    const { e, p } = engineWith(['Swells'], { chords: { sequence: 'tide', bars: 2 } });
    const fired = play(e, p, 0, 9);
    const at = (b: number) => (fired.get(b) ?? []).filter((n) => n.role === 'chord');
    expect(at(0)).toHaveLength(1);
    expect(at(0)[0].durSec).toBeCloseTo(8, 5);
    // F#m(add9): F# A C# G#.
    expect(new Set((at(0)[0].midis ?? []).map(pc))).toEqual(new Set([6, 9, 1, 8]));
    expect(at(8)).toHaveLength(1);
  });

  it('the pulse chords play whatever chord the pads hold: F#m(add9), then D major (its seventh left to the pads), over Tide', () => {
    const { e, p } = engineWith(['Pulse chords'], { chords: { sequence: 'tide', bars: 2 } });
    const fired = play(e, p, 0, 16);
    const chordAt = (beat: number): Set<number> => new Set((fired.get(beat) ?? []).flatMap((n) => n.midis ?? []).map(pc));
    expect(chordAt(0)).toEqual(new Set([6, 9, 1, 8]));
    // In a left-hand voicing the seventh, a semitone from the root, gives way.
    expect(chordAt(8)).toEqual(new Set([2, 6, 9]));
  });

  it('the theme asks, then answers on the second pass; its long notes ring as written', () => {
    const { e, p } = engineWith(['Piano theme'], { variationEnabled: true });
    const fired = play(e, p, 0, 16);
    const at = (b: number) => (fired.get(b) ?? []).filter((n) => n.role === 'melody' && n.midi !== undefined);
    expect(at(0).map((n) => n.midi)).toEqual([73]);
    expect(at(0)[0].durSec).toBeGreaterThanOrEqual(3);
    expect(at(5)).toHaveLength(0);
    expect(at(13).map((n) => n.midi)).toEqual([71]);
    expect(at(15).map((n) => n.midi)).toEqual([78]);
  });

  it('the percussion plays one kit piece per counter: the heartbeat’s kick, rim and shaker, half a beat late where written', () => {
    const { e, p } = engineWith(['Percussion heartbeat']);
    const fired = [...play(e, p, 0, 8).values()].flat().filter((n) => n.drum);
    const times = (d: string) => fired.filter((n) => n.drum === d).map((n) => n.audioTime).sort((x, y) => x - y);
    expect(times('kick')).toEqual([0, 1.5, 4, 5.5]);
    expect(times('rim')).toEqual([2, 6]);
    expect(times('hat')).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  });

  it('a scene’s key lands on the pass: F sharp minor to the end of the pass, F sharp major from its first beat', () => {
    const { e, p } = engineWith(['Piano question']);
    p.timer = 1;
    play(e, p, 0, 3);
    e.landOnNextPass({ key: { rootMidi: F_SHARP_MAJOR.rootMidi, semitones: F_SHARP_MAJOR.semitones } });
    // The screen catching up with the same key changes nothing yet.
    e.setScale(F_SHARP_MAJOR.rootMidi, [...F_SHARP_MAJOR.semitones]);
    const tune = (m: Map<number, FiredNote[]>, b: number): number | undefined => (m.get(b) ?? []).find((n) => n.role === 'melody' && n.midi !== undefined)?.midi;
    const rest = play(e, p, 3, 14);
    // Beat 5 of the minor pass: A (the theme's third note); in the next pass, in the major: G#.
    expect(tune(rest, 4)).toBe(69);
    expect(tune(rest, 12)).toBe(68);
    p.timer = null;
  });

  it('the player picking another key while a scene’s waits: theirs wins at once', () => {
    const { e, p } = engineWith(['Piano question']);
    p.timer = 1;
    play(e, p, 0, 2);
    e.landOnNextPass({ key: { rootMidi: F_SHARP_MAJOR.rootMidi, semitones: F_SHARP_MAJOR.semitones } });
    e.setScale(62, [...F_SHARP_MINOR.semitones]);
    play(e, p, 2, 10);
    expect(p.cfg.scaleRootMidi).toBe(62);
    expect(p.cfg.scaleSemitones).toEqual(F_SHARP_MINOR.semitones);
    p.timer = null;
  });
});

describe('the band with the loops', () => {
  it('off (as before): loops alone never bring the band in; on (the demo): the pads join the loops on the next pass', () => {
    for (const withLoops of [false, true]) {
      const { e, p } = engineWith(['Pulse chords'], { bandWithLoops: withLoops, band: 'gentle', bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false } });
      const bp = p as unknown as { bandVoices: unknown };
      const g = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
      bp.bandVoices = { pad: { play: vi.fn(), dispose: vi.fn() }, bass: { play: vi.fn(), dispose: vi.fn() }, gain: g(), rev: g() };
      e.setBand('gentle');
      const fired = [...play(e, p, 0, 24).values()].flat();
      expect(fired.some((n) => n.origin === 'band'), String(withLoops)).toBe(withLoops);
      if (withLoops) {
        // A bass loop over the bass (the pulse) is not the bass: the band's bass plays under it.
        const t = engineWith(['Pulse', 'Pulse chords'], { bandWithLoops: true, band: 'gentle', bandJobs: { asBefore: false, pads: true, bass: true, drums: false, counter: false } });
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
    const { e, p } = engineWith(['Pulse chords'], {
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
      const { e, p } = engineWith(['Pulse chords'], { bandWithLoops: true, widePads: wide, band: 'full', bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false } });
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
