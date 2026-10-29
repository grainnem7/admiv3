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
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import { clashes } from '../songs/harmony/currentChord';

/**
 * One shared harmony in the engine (spec 2026-10-28, stage 1): the band, one-note counters,
 * loops and Extra notes all play to one current chord; a chord counter changes one chord;
 * the clash nudge; a scene's sound lands on the pass.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const ROWS = 8;
const rowOf = (degree: number): number => ROWS - 1 - degree;
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'b', kind: 'hue', role: 'bass', swatch: '#00f' },
  { id: 'c', kind: 'hue', role: 'chord', swatch: '#ff0' },
];
const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: ROWS, cols: 16, scaleRootMidi: 60, scaleSemitones: MAJOR, swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
  soundWorld: 'warm', phrases: false, fillEngine: 'rules', chords: { sequence: 'rising', bars: 2 }, clashNudge: true, ...over,
});

interface Priv {
  timer: unknown;
  cfg: BoardEngineConfig;
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  bandVoices: unknown;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map(channels.map((c) => [c.id, fakeVoiceEntry()]));
  p.drumKit = { play: vi.fn() };
  const g = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
  p.bandVoices = { pad: { play: vi.fn(), dispose: vi.fn() }, bass: { play: vi.fn(), dispose: vi.fn() }, gain: g(), rev: g() };
  return { e, p };
}

/** Fire beats [from, to) and return what was played, by beat. */
function play(e: BoardSequencerEngine, p: Priv, from: number, to: number): Map<number, FiredNote[]> {
  const out = new Map<number, FiredNote[]>();
  for (let b = from; b < to; b++) {
    p.fireStep(b, b, 1, null);
    out.set(b, e.drainFiredNotes());
  }
  return out;
}
const pcs = (ns: readonly number[]): number[] => [...new Set(ns.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
const Dm = [2, 5, 9];

describe('the band plays the one current chord', () => {
  it('follows the scene’s sequence, and a one-note chord counter changes just its own chord', () => {
    const { e, p } = engine();
    e.setBand('full');
    // A one-note Dm counter in column 2; Rising is C (8 beats) then G7 (8 beats). Two
    // melody counters too: with three down the band's bass plays (its pad leaves the
    // chords to the player), landing on each chord's root.
    e.setActiveCells([{ row: rowOf(1), col: 2, colour: 'c' }, { row: rowOf(0), col: 1, colour: 'm' }, { row: rowOf(0), col: 9, colour: 'm' }]);
    const heard = play(e, p, 0, 48);
    const bassAt = (beat: number): number[] => pcs((heard.get(beat) ?? []).filter((n) => n.colour === 'band:bass').map((n) => n.midi ?? -1));
    // The band comes in on the second pass: the sequence has moved on to vi (Am), then IV (F).
    expect(bassAt(16)).toEqual([9]);
    expect(bassAt(18)).toEqual([2]);
    expect(bassAt(24)).toEqual([5]);
    // Third pass: round again to I and V, with Dm in the same place.
    expect(bassAt(32)).toEqual([0]);
    expect(bassAt(34)).toEqual([2]);
    expect(bassAt(40)).toEqual([7]);
    // Before, the band ignored one-note chord counters and played its own progression
    // under them, a semitone from the player's chord. Every band pitch on a strong beat
    // is a note of the chord sounding.
    for (const notes of heard.values()) {
      const chordHere = notes.find((n) => n.colour === 'c')?.midis;
      if (chordHere) for (const n of notes) if (n.origin === 'band' && n.midi !== undefined) expect(pcs(chordHere)).toContain(((n.midi % 12) + 12) % 12);
    }
  });

  it('a loop’s one-note chord counter under the player’s plays the player’s chord, not its own', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: rowOf(1), col: 2, colour: 'c' }]); // the player's Dm
    e.setActiveLoops([[{ row: rowOf(3), col: 2, colour: 'c' }]]); // a loop's F in the same column
    const heard = play(e, p, 0, 4);
    const stabs = (heard.get(2) ?? []).filter((n) => n.colour === 'c');
    expect(stabs).toHaveLength(2);
    for (const s of stabs) expect(pcs(s.midis ?? [])).toEqual(Dm);
  });
});

describe('the clash nudge (one note per counter)', () => {
  it('a melody note that rubs against the chord moves to the nearest chord note on a strong beat, only there', () => {
    const { e, p } = engine();
    // F (degree 3) over C, on beat 1 (strong) and beat 2 (weak).
    e.setActiveCells([{ row: rowOf(3), col: 0, colour: 'm' }, { row: rowOf(3), col: 1, colour: 'm' }]);
    const heard = play(e, p, 0, 2);
    expect((heard.get(0) ?? [])[0].midi! % 12).toBe(4); // E
    expect((heard.get(1) ?? [])[0].midi! % 12).toBe(5); // F, the player's own
  });

  it('bass too; and switched off, the player’s note plays as placed', () => {
    const on = engine();
    on.e.setActiveCells([{ row: rowOf(3), col: 0, colour: 'b' }]);
    expect(play(on.e, on.p, 0, 1).get(0)![0].midi! % 12).toBe(4);
    const off = engine({ clashNudge: false });
    off.e.setActiveCells([{ row: rowOf(3), col: 0, colour: 'm' }, { row: rowOf(3), col: 0, colour: 'b' }]);
    for (const n of play(off.e, off.p, 0, 1).get(0)!) expect(n.midi! % 12).toBe(5);
    // And can be switched while playing.
    off.e.setClashNudge(true);
    for (const n of play(off.e, off.p, 16, 17).get(16)!) expect(n.midi! % 12).toBe(4);
  });

  it('a note that does not rub stays the player’s', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: rowOf(1), col: 0, colour: 'm' }]); // D over C
    expect(play(e, p, 0, 1).get(0)![0].midi! % 12).toBe(2);
  });
});

describe('Extra notes play to the chord', () => {
  it('a kept extra note on a strong beat that rubs moves to the chord; elsewhere it plays as it was', () => {
    const { e, p } = engine();
    const note = (step: number, offset: number) => ({ step, offset, dur: 0.5, accent: 1, midi: 65, role: 'melody' as const, colour: 'm', rule: 'echo' as const, cell: { row: 0, col: 0 } });
    e.setFill(0.5, 1, [note(0, 0), note(1, 0), note(2, 0.5)]);
    const heard = play(e, p, 0, 3);
    const fill = (b: number) => (heard.get(b) ?? []).filter((n) => n.origin === 'fill').map((n) => n.midi! % 12);
    expect(fill(0)).toEqual([4]);
    expect(fill(1)).toEqual([5]);
    expect(fill(2)).toEqual([5]);
  });
});

describe('a scene’s sound lands on the pass', () => {
  it('the world, the band, Extra notes, tunes and the chords wait for the pass, while the settings are pushed again meanwhile', () => {
    const { e, p } = engine();
    e.setBand('gentle');
    p.timer = 1; // playing
    e.setActiveCells([{ row: rowOf(0), col: 0, colour: 'm' }]);
    play(e, p, 0, 5);
    e.landOnNextPass({ soundWorld: 'ambient', band: 'full', fillAmount: 0.5, phrases: true, evolveAmount: 0.7, chords: { sequence: 'home', bars: 1 } });
    // The screen pushes the whole config again on its next render, with the scene's values.
    e.setSoundWorld('ambient');
    e.setBand('full');
    e.setFill(0.5, 1, null);
    e.setPhrases(true);
    e.setChords({ sequence: 'home', bars: 1 });
    play(e, p, 5, 16);
    expect(p.cfg.soundWorld).toBe('warm');
    expect(e.getBandStatus().level).toBe('gentle');
    expect(p.cfg.phrases).toBe(false);
    expect(e.getCurrentChord()?.symbol).toBe('G7'); // still Rising's second chord
    play(e, p, 16, 17);
    expect(p.cfg.soundWorld).toBe('ambient');
    expect(e.getBandStatus().level).toBe('full');
    expect(p.cfg.phrases).toBe(true);
    // The sequence starts at the scene's first pass: Home's first chord, IV.
    expect(e.getCurrentChord()?.symbol).toMatch(/^F/);
    p.timer = null;
  });

  it('a change the player makes meanwhile to something else wins, at once', () => {
    const { e, p } = engine();
    e.setBand('gentle');
    p.timer = 1;
    play(e, p, 0, 3);
    e.landOnNextPass({ band: 'full' });
    e.setBand('off');
    expect(e.getBandStatus().level).toBe('off');
    play(e, p, 3, 17);
    expect(e.getBandStatus().level).toBe('off');
    p.timer = null;
  });

  it('stopped, a scene’s sound is set at once; Stop never leaves one waiting', () => {
    const { e, p } = engine();
    e.landOnNextPass({ soundWorld: 'lofi' });
    expect(p.cfg.soundWorld).toBe('lofi');
    p.timer = 1;
    e.landOnNextPass({ soundWorld: 'electronic' });
    e.stop();
    expect(p.cfg.soundWorld).toBe('electronic');
  });
});

describe('no clash on strong beats, in the engine', () => {
  it('a full band, one-note melody and bass and chord counters, over every sequence: nothing on a strong beat rubs', () => {
    for (const sequence of ['asBefore', 'world', 'calm', 'rising', 'dreamy', 'tense', 'home', 'still'] as const) {
      for (const soundWorld of ['warm', 'lofi', 'ambient', 'electronic'] as const) {
        const { e, p } = engine({ soundWorld, chords: { sequence, bars: 1 } });
        e.setBand('full');
        e.setActiveCells([
          { row: rowOf(1), col: 4, colour: 'c' }, { row: rowOf(5), col: 10, colour: 'c' },
          ...[0, 2, 4, 6, 8, 10, 12, 14].map((col, i) => ({ row: (i * 3) % ROWS, col, colour: 'm' })),
          ...[0, 4, 8, 12].map((col, i) => ({ row: (i * 5 + 1) % ROWS, col, colour: 'b' })),
        ] satisfies ActiveCell[]);
        for (let b = 0; b < 64; b++) {
          p.fireStep(b, b, 1, null);
          const chord = e.getCurrentChord();
          const notes = e.drainFiredNotes();
          if (!chord || b % 2 !== 0) continue;
          for (const n of notes) {
            if (n.audioTime !== b) continue; // on the beat itself
            for (const m of n.midis ?? (n.midi !== undefined ? [n.midi] : [])) expect(clashes(m, chord.tones), `${sequence} ${soundWorld} beat ${b} ${n.colour} ${m}`).toBe(false);
          }
        }
      }
    }
  });
});
