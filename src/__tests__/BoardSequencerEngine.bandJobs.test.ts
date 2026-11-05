import { describe, it, expect, vi } from 'vitest';
import { LEFT_HAND_TOP } from '../songs/harmony/harmony';
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
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import { clashes } from '../songs/harmony/currentChord';
import type { BandJobs } from '../songs/band/bandJobs';
import { dipGain, KEEP_ON_TOP_ATTACK_TC, KEEP_ON_TOP_RELEASE_TC } from '../songs/band/keepOnTop';

/**
 * A band with jobs, in the engine (harmony spec, stage 2): it keeps its jobs whatever Tim
 * plays and fits around him and the loops; keep Tim on top; a scene's lead-in.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const ROWS = 8;
const COLS = 16;
const rowOf = (degree: number): number => ROWS - 1 - degree;
const ALL: BandJobs = { asBefore: false, pads: true, bass: true, drums: true, counter: true };
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'b', kind: 'hue', role: 'bass', swatch: '#00f' },
  { id: 'c', kind: 'hue', role: 'chord', swatch: '#ff0' },
  { id: 'd', kind: 'hue', role: 'drums', swatch: '#000' },
];
const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: ROWS, cols: COLS, scaleRootMidi: 60, scaleSemitones: MAJOR, swing: 0, humanize: 0,
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
  bandVoices: { top: ReturnType<typeof fakeGain> } & Record<string, unknown>;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map(channels.filter((c) => c.role !== 'drums').map((c) => [c.id, fakeVoiceEntry()]));
  p.drumKit = { play: vi.fn() };
  const v = () => ({ play: vi.fn(), dispose: vi.fn() });
  p.bandVoices = { pad: v(), bass: v(), lead: v(), gain: fakeGain(), rev: fakeGain(), leadGain: fakeGain(), top: fakeGain() };
  e.setBand(over.band ?? 'full');
  return { e, p };
}

/** Fire beats [from, to) and return what was played, by beat, with the chord on each. */
function play(e: BoardSequencerEngine, p: Priv, from: number, to: number): Map<number, { notes: FiredNote[]; tones: number[] }> {
  const out = new Map<number, { notes: FiredNote[]; tones: number[] }>();
  for (let b = from; b < to; b++) {
    p.fireStep(b, b, 1, null);
    out.set(b, { notes: e.drainFiredNotes(), tones: e.getCurrentChord()?.tones ?? [] });
  }
  return out;
}
const pc = (n: number): number => ((n % 12) + 12) % 12;
const band = (ns: readonly FiredNote[], part: string) => ns.filter((n) => n.colour === `band:${part}`);

/** Tim covering bass, chords and drums: bass on 0 and 8, a chord on 4 and 12, a kick on every 4th. */
const TIM_THREE: ActiveCell[] = [
  { row: rowOf(0), col: 0, colour: 'b' }, { row: rowOf(4), col: 8, colour: 'b' },
  { row: rowOf(1), col: 4, colour: 'c' }, { row: rowOf(3), col: 12, colour: 'c' },
  ...[0, 4, 8, 12].map((col) => ({ row: ROWS - 1, col, colour: 'd' })),
];

describe('band jobs at Full, with Tim on bass, chords and drums', () => {
  it('pads, drums and counter-melody still play; the bass steps aside, then comes back when his lifts', () => {
    const { e, p } = engine();
    e.setActiveCells(TIM_THREE);
    const heard = play(e, p, 0, 32);
    const pass2 = [...heard.entries()].filter(([b]) => b >= 16).flatMap(([, h]) => h.notes);
    expect(band(pass2, 'pad').length).toBeGreaterThan(0);
    expect(band(pass2, 'groove').length).toBeGreaterThan(0);
    expect(band(pass2, 'counter').length).toBeGreaterThan(0);
    expect(band(pass2, 'bass')).toEqual([]);
    expect(e.getBandStatus().parts).toEqual(['pad', 'groove', 'counter']);
    // He lifts his bass: the band's comes back at once.
    e.setActiveCells(TIM_THREE.filter((c) => c.colour !== 'b'));
    const after = [...play(e, p, 32, 48).values()].flatMap((h) => h.notes);
    expect(band(after, 'bass').length).toBeGreaterThan(0);
    expect(e.getBandStatus().parts).toEqual(['pad', 'bass', 'groove', 'counter']);
  });

  it('a loop’s bass counts as a bass too: one bass at a time', () => {
    const { e, p } = engine();
    e.setActiveCells(TIM_THREE.filter((c) => c.colour !== 'b'));
    e.setActiveLoops([[{ row: rowOf(2), col: 0, colour: 'b' }]]);
    const notes = [...play(e, p, 0, 32).values()].flatMap((h) => h.notes);
    expect(band(notes, 'bass')).toEqual([]);
    expect(notes.some((n) => n.colour === 'b')).toBe(true);
  });

  it('pads layer under Tim’s chords in unison, in the left hand, never above the melody', () => {
    const { e, p } = engine();
    e.setActiveCells(TIM_THREE);
    const notes = [...play(e, p, 0, 48).values()].flatMap((h) => h.notes);
    const tim = notes.filter((n) => n.colour === 'c').flatMap((n) => n.midis ?? []);
    const pads = band(notes, 'pad').map((n) => n.midi!);
    expect(pads.length).toBeGreaterThan(0);
    // The same register as his chords, a layer under them, not a second chord up at E6.
    expect(tim.length).toBeGreaterThan(0);
    for (const m of pads) expect(m).toBeLessThanOrEqual(LEFT_HAND_TOP + 12);
    for (const m of pads) expect(m).toBeGreaterThanOrEqual(48);
  });

  it('saved before jobs ("As before"): the band hands Tim every part he takes, as it did', () => {
    const { e, p } = engine({ bandJobs: undefined });
    e.setActiveCells(TIM_THREE);
    const notes = [...play(e, p, 0, 32).values()].flatMap((h) => h.notes);
    expect(notes.filter((n) => n.origin === 'band')).toEqual([]);
  });
});

describe('the band’s drums fill the gaps', () => {
  it('no band drum hit on a step where the board or a loop has a drum; it plays on the others', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: rowOf(0), col: 0, colour: 'm' }, ...[0, 6].map((col) => ({ row: ROWS - 1, col, colour: 'd' }))]);
    e.setActiveLoops([[{ row: ROWS - 2, col: 10, colour: 'd' }]]);
    const heard = play(e, p, 0, 48);
    let bandHits = 0;
    for (const [b, { notes }] of heard) {
      const boardDrum = notes.some((n) => n.drum && n.origin !== 'band');
      const bandDrum = band(notes, 'groove');
      if (boardDrum) expect(bandDrum, `beat ${b}`).toEqual([]);
      bandHits += bandDrum.length;
    }
    expect(bandHits).toBeGreaterThan(0);
  });
});

/** A small seeded random, so the property test is the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('the band fits around Tim and the loops, over random boards (property)', () => {
  it('counter-melody never on a melody note or its pitch; no band drum on a board drum step; no strong-beat clash; one bass', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const r = rng(seed);
      const cell = (colour: string): ActiveCell => ({ row: Math.floor(r() * ROWS), col: Math.floor(r() * COLS), colour });
      const board = ['m', 'm', 'm', 'c', 'd', 'd', ...(r() < 0.5 ? ['b'] : [])].map(cell);
      const loopCells = ['m', 'c', 'd', ...(r() < 0.3 ? ['b'] : [])].map(cell);
      const sequence = (['world', 'calm', 'rising', 'dreamy', 'tense', 'home', 'still'] as const)[seed % 7];
      const soundWorld = (['warm', 'lofi', 'ambient', 'electronic'] as const)[seed % 4];
      const { e, p } = engine({ soundWorld, chords: { sequence, bars: 1 }, band: seed % 3 === 0 ? 'gentle' : 'full' });
      e.setActiveCells(board);
      e.setActiveLoops([loopCells]);
      const anyBass = [...board, ...loopCells].some((c) => c.colour === 'b');
      const heard = play(e, p, 0, 64);
      const melody: { start: number; end: number; pc: number }[] = [];
      for (const { notes } of heard.values()) {
        for (const n of notes) if (n.role === 'melody' && n.origin !== 'band' && n.origin !== 'fill' && n.midi !== undefined) melody.push({ start: n.audioTime, end: n.audioTime + n.durSec, pc: pc(n.midi) });
      }
      for (const [b, { notes, tones }] of heard) {
        const where = `seed ${seed} ${sequence} ${soundWorld} beat ${b}`;
        const counter = band(notes, 'counter');
        if (notes.some((n) => n.role === 'melody' && n.origin !== 'band' && n.origin !== 'fill')) expect(counter, where).toEqual([]);
        for (const c of counter) {
          const sounding = melody.filter((m) => m.start < c.audioTime + c.durSec && m.end > c.audioTime).map((m) => m.pc);
          expect(sounding, `${where}: counter ${c.midi} on Tim's note`).not.toContain(pc(c.midi!));
        }
        if (notes.some((n) => n.drum && n.origin !== 'band')) expect(band(notes, 'groove'), where).toEqual([]);
        if (anyBass) expect(band(notes, 'bass'), where).toEqual([]);
        if (b % 2 === 0 && tones.length > 0) {
          for (const n of notes) {
            if (n.origin !== 'band' || n.midi === undefined || n.audioTime !== b) continue;
            expect(clashes(n.midi, tones), `${where}: ${n.colour} ${n.midi}`).toBe(false);
          }
        }
      }
      // The band was really there.
      expect([...heard.values()].some((h) => h.notes.some((n) => n.origin === 'band')), `seed ${seed}`).toBe(true);
    }
  });
});

describe('keep Tim on top', () => {
  it('the band’s gain dips while Tim’s note sounds, and recovers after', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: rowOf(2), col: 3, colour: 'm' }]);
    const heard = play(e, p, 0, 4);
    const tim = heard.get(3)!.notes.find((n) => n.colour === 'm')!;
    const g = p.bandVoices.top.gain;
    expect(g.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(dipGain(3), 5), 3, KEEP_ON_TOP_ATTACK_TC);
    expect(g.setTargetAtTime).toHaveBeenCalledWith(1, tim.audioTime + tim.durSec, KEEP_ON_TOP_RELEASE_TC);
    expect(g.cancelScheduledValues).toHaveBeenCalledWith(3);
    // Nothing of Tim's on the other beats: no dip scheduled for them.
    expect(g.setTargetAtTime).toHaveBeenCalledTimes(2);
  });

  it('a loop’s note under Tim’s is quieter than the same note alone; off, it is not', () => {
    const loopVel = (withTim: boolean, on = true): number => {
      const { e, p } = engine({ keepOnTop: on, band: 'off' });
      e.setActiveCells(withTim ? [{ row: rowOf(4), col: 0, colour: 'm' }] : []);
      // A loop's chord (a loop's melody on Tim's step would rest: melodies take turns).
      e.setActiveLoops([[{ row: rowOf(2), col: 0, colour: 'c' }]]);
      const notes = play(e, p, 0, 1).get(0)!.notes;
      return notes.find((n) => n.source === 'loop')!.velocity!;
    };
    expect(loopVel(true)).toBeLessThan(loopVel(false) * 0.85);
    expect(loopVel(true, false)).toBeCloseTo(loopVel(false), 5);
  });

  it('the band’s logged loudness dips under Tim (as MIDI hears it), with the dB chosen', () => {
    const { e, p } = engine({ keepOnTopDb: 6 });
    e.setActiveCells([{ row: rowOf(0), col: 0, colour: 'm' }, { row: rowOf(0), col: 8, colour: 'm' }]);
    const heard = play(e, p, 0, 32);
    const pad16 = band(heard.get(16)!.notes, 'pad')[0];
    const plain = engine({ keepOnTop: false });
    plain.e.setActiveCells([{ row: rowOf(0), col: 0, colour: 'm' }, { row: rowOf(0), col: 8, colour: 'm' }]);
    const pad16Plain = band(play(plain.e, plain.p, 0, 32).get(16)!.notes, 'pad')[0];
    expect(pad16.velocity! / pad16Plain.velocity!).toBeCloseTo(dipGain(6), 1);
  });
});

describe('a scene’s band lands on the pass, and its lead-in comes before it', () => {
  it('jobs from a scene wait for the pass', () => {
    const { e, p } = engine({ bandJobs: { ...ALL, counter: false } });
    p.timer = 1;
    e.setActiveCells(TIM_THREE.filter((c) => c.colour !== 'b'));
    play(e, p, 0, 20);
    expect(e.getBandStatus().parts).toEqual(['pad', 'bass', 'groove']);
    e.landOnNextPass({ bandJobs: { ...ALL, bass: false } });
    e.setBandJobs({ ...ALL, bass: false }); // the screen pushing the scene's values again
    play(e, p, 20, 32);
    expect(e.getBandStatus().parts).toEqual(['pad', 'bass', 'groove']);
    play(e, p, 32, 33);
    expect(e.getBandStatus().parts).toEqual(['pad', 'groove', 'counter']);
    p.timer = null;
  });

  it('Drum fill: the last bar before the scene, then a crash as it lands; nothing else of it', () => {
    const { e, p } = engine({ band: 'off' });
    p.timer = 1;
    e.setActiveCells([{ row: rowOf(0), col: 0, colour: 'm' }]);
    play(e, p, 0, 5);
    p.lastInternalBeat = 4;
    e.cueLeadIn('drumFill');
    expect(e.getLeadIn()).toEqual({ kind: 'drumFill', landBeat: 16 });
    const heard = play(e, p, 5, 24);
    const leadAt = (b: number) => band(heard.get(b)!.notes, 'leadIn');
    for (let b = 5; b < 12; b++) expect(leadAt(b), `beat ${b}`).toEqual([]);
    for (let b = 12; b < 16; b++) expect(leadAt(b).length, `beat ${b}`).toBeGreaterThan(0);
    expect(leadAt(16).map((n) => n.drum)).toContain('crash');
    for (let b = 17; b < 24; b++) expect(leadAt(b)).toEqual([]);
    expect(e.getLeadIn()).toBeNull();
    p.timer = null;
  });

  it('Rising: the chord’s notes climb through the last pass; from the clock, it is kept until its pass', () => {
    const { e, p } = engine({ band: 'off' });
    p.timer = 1;
    p.lastInternalBeat = 3;
    // The clock: the scene is due in 15 s (beats at 60 BPM), so it lands on beat 32.
    e.cueLeadIn('rising', 15);
    expect(e.getLeadIn()?.landBeat).toBe(32);
    e.cueLeadIn('rising', 14); // the next tick: kept
    expect(e.getLeadIn()?.landBeat).toBe(32);
    const heard = play(e, p, 0, 32);
    const notes = [...heard.entries()].flatMap(([b, h]) => band(h.notes, 'leadIn').map((n) => ({ b, n, tones: h.tones })));
    expect(notes.length).toBeGreaterThanOrEqual(16);
    expect(Math.min(...notes.map((x) => x.b))).toBe(16);
    for (const { n, tones } of notes) expect(tones.map(pc)).toContain(pc(n.midi!));
    p.timer = null;
  });

  it('no lead-in while the piece is ending, and Stop forgets one', () => {
    const { e, p } = engine();
    e.cueLeadIn('drumFill');
    expect(e.getLeadIn()).toBeNull(); // stopped
    p.timer = 1;
    // The piece's very first beat has no pass before it to lead in from.
    e.cueLeadIn('drumFill');
    expect(e.getLeadIn()).toBeNull();
    p.lastInternalBeat = 5;
    e.cueLeadIn('drumFill');
    expect(e.getLeadIn()).not.toBeNull();
    e.stop();
    expect(e.getLeadIn()).toBeNull();
  });
});
