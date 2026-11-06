import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

const clock = vi.hoisted(() => ({ t: 0 }));
vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => clock.t), immediate: vi.fn(() => clock.t),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));
vi.mock('../songs/generative/magentaFill', () => ({
  loadMagenta: vi.fn(() => Promise.resolve()), magentaFill: vi.fn(() => Promise.resolve([])), magentaStatus: vi.fn(() => 'idle'),
}));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { StemsPlayer } from '../audio/songStems';
import type { SongMap, SongSectionSpec } from '../songs/song/songSection';

/**
 * Song sections (spec 2026-11-06): a section of a recording inside a piece. The record
 * leads its section; the board's beat count carries on through it.
 */

const SPACING = 0.9; // the record: 0.9 s a beat (about 67 BPM)
const D = [50, 57, 62, 66];
const G = [55, 59, 62, 67];
const map: SongMap = {
  beats: Array.from({ length: 64 }, (_, i) => 1 + i * SPACING),
  // D for the first 2 bars, then G.
  chords: [{ time: 0, notes: D, root: 50, name: 'D' }, { time: 1 + 8 * SPACING - 0.01, notes: G, root: 43, name: 'G' }],
};
const verse = (fromBar: number, toBar: number, vocals = 1): SongSectionSpec => ({ songId: 'song', fromBar, toBar, levels: { vocals, drums: 0, bass: 0, other: 0 } });

const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];
const cfg = (): BoardEngineConfig => ({
  bpm: 120, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 5, 7, 9, 11], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, soundWorld: 'warm', phrases: false,
});

interface Priv {
  timer: unknown;
  startSec: number;
  lastInternalBeat: number;
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: null;
  cfg: BoardEngineConfig;
  scheduleTick(): void;
  fireStep(beat: number, t: number, spb: number, chord: { notes: number[] } | null): void;
}

function fakeStems(): StemsPlayer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ready: () => true,
    start: (at, offset) => { calls.push(`start ${at.toFixed(2)} from ${offset.toFixed(2)}`); },
    setLevels: (_l, at) => { calls.push(`levels ${at.toFixed(2)}`); },
    stop: (at) => { calls.push(`stop ${at.toFixed(2)}`); },
    dispose: () => undefined,
  };
}

function engine() {
  const e = new BoardSequencerEngine(cfg());
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', fakeVoiceEntry()]]);
  p.drumKit = null;
  // A melody counter on every step, so every beat sounds.
  e.setActiveCells(Array.from({ length: 8 }, (_, col) => ({ row: 7, col, colour: 'm' })));
  const stems = fakeStems();
  e.setSong(stems, map);
  // Record each beat the board sends: its number, when, and with which chord.
  const sent: { beat: number; at: number; chord: number[] | null }[] = [];
  const fire = p.fireStep.bind(p);
  p.fireStep = (beat, t, spb, chord) => { sent.push({ beat, at: t, chord: chord?.notes ?? null }); fire(beat, t, spb, chord); };
  p.timer = 1;
  p.startSec = 0;
  p.lastInternalBeat = -1;
  return { e, p, stems, sent };
}

/** Run the scheduler every 20 ms up to `until` seconds. */
function runTo(p: Priv, until: number): void {
  for (; clock.t <= until; clock.t = Math.round((clock.t + 0.02) * 1000) / 1000) p.scheduleTick();
}

describe('a song section inside a piece', () => {
  beforeEach(() => { clock.t = 0; });

  it('starts on the next pass boundary, from its first bar, and the board follows the record’s beats', () => {
    const { e, p, stems, sent } = engine();
    runTo(p, 1.2); // 120 BPM: beats 0, 1, 2 sent (0.5 s each)
    e.cueSongSection(verse(2, 4)); // song beats 8 to 15: one pass
    runTo(p, 4.05);
    // Board beat 8 (the pass boundary, 4.0 s on the board's clock) is song beat 8: the stems start there, from the song's beat 8.
    expect(stems.calls[0]).toBe(`start 4.00 from ${(1 + 8 * SPACING).toFixed(2)}`);
    const b8 = sent.find((x) => x.beat === 8);
    expect(b8?.at).toBeCloseTo(4.0, 5);
    runTo(p, 4 + 7 * SPACING + 0.05);
    const b15 = sent.find((x) => x.beat === 15);
    expect(b15?.at).toBeCloseTo(4 + 7 * SPACING, 5);
    expect(e.getBpm()).toBeCloseTo(60 / SPACING, 3);
  });

  it('every board beat is sent once, in order, through the section and after it; then the board’s clock takes over at the record’s tempo', () => {
    const { e, p, stems, sent } = engine();
    const ends: number[] = [];
    e.setOnSectionEnd((bpm) => ends.push(bpm));
    runTo(p, 0.6);
    e.cueSongSection(verse(2, 4));
    runTo(p, 4 + 8 * SPACING + 3);
    const beats = sent.map((x) => x.beat);
    expect(beats).toEqual(Array.from({ length: beats.length }, (_, i) => i));
    expect(ends).toHaveLength(1);
    expect(ends[0]).toBeCloseTo(60 / SPACING, 3);
    // The record fades out where its section ends, and the next beat is a beat of the record's tempo later.
    const end = 4 + 8 * SPACING;
    expect(stems.calls).toContain(`stop ${end.toFixed(2)}`);
    expect(sent.find((x) => x.beat === 16)?.at).toBeCloseTo(end, 5);
    expect(sent.find((x) => x.beat === 17)?.at).toBeCloseTo(end + SPACING, 5);
    expect(e.getSongSection()).toBeNull();
  });

  it('in a section the notes follow the record’s chords', () => {
    const { e, p, sent } = engine();
    runTo(p, 0.6);
    e.cueSongSection(verse(2, 4));
    runTo(p, 4 + 8 * SPACING);
    expect(sent.find((x) => x.beat === 7)?.chord).toBeNull();
    expect(sent.find((x) => x.beat === 8)?.chord).toEqual(G);
  });

  it('a section that starts where the last one ends carries the same playback on: one start, its levels moved', () => {
    const { e, p, stems, sent } = engine();
    runTo(p, 0.6);
    e.cueSongSection(verse(2, 4));
    runTo(p, 4.2);
    e.cueSongSection(verse(4, 6, 0.5));
    runTo(p, 4 + 16 * SPACING + 0.5);
    expect(stems.calls.filter((c) => c.startsWith('start'))).toHaveLength(1);
    expect(stems.calls).toContain(`levels ${(4 + 8 * SPACING).toFixed(2)}`);
    const beats = sent.map((x) => x.beat);
    expect(beats).toEqual(Array.from({ length: beats.length }, (_, i) => i));
    expect(sent.find((x) => x.beat === 23)?.at).toBeCloseTo(4 + 15 * SPACING, 5);
  });

  it('the speed is the record’s while it leads: a speed change (the hat) waits until the section is over', () => {
    const { e, p } = engine();
    runTo(p, 0.6);
    e.cueSongSection(verse(2, 4));
    runTo(p, 5);
    e.setBpm(200);
    expect(e.getBpm()).toBeCloseTo(60 / SPACING, 3);
    expect(p.cfg.bpm).toBe(120);
  });

  it('Stop ends the record at once', () => {
    const { e, p, stems } = engine();
    runTo(p, 0.6);
    e.cueSongSection(verse(2, 4));
    runTo(p, 5);
    e.stop();
    expect(stems.calls.some((c) => c.startsWith('stop'))).toBe(true);
    expect(e.getSongSection()).toBeNull();
  });

  it('no song loaded: a cue is ignored and the board keeps its own clock', () => {
    const { e, p, sent } = engine();
    e.setSong(null, null);
    runTo(p, 0.6);
    e.cueSongSection(verse(2, 4));
    runTo(p, 5);
    expect(sent.find((x) => x.beat === 8)?.at).toBeCloseTo(4, 5);
    expect(e.getSongSection()).toBeNull();
  });
});

