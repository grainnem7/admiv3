import { describe, it, expect, vi } from 'vitest';
import {
  BAND_GAIN, bandEventsAtStep, bandParts, defaultHarmonyAt, type BandInput,
} from '../songs/band/band';

const PENT = [0, 2, 4, 7, 9];
// Chords are built from the pentatonic's seven-note parent (C major), so "in key" is that.
const SCALE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const C = { root: 60, tones: [60, 64, 67] };

const input = (over: Partial<BandInput> = {}): BandInput => ({
  level: 'gentle', step: 0, loop: 8, style: 'warm', harmony: C, chordChange: true, chordSpan: 4,
  playerRoles: new Set(['melody']), ...over,
});
const loop = (over: Partial<BandInput> = {}) =>
  Array.from({ length: 8 }, (_, step) => bandEventsAtStep(input({ ...over, step, chordChange: step === 0 || step === 4 })));

describe('the band makes room for the player', () => {
  it('plays nothing when off', () => {
    expect(bandParts('off', new Set())).toEqual([]);
    expect(bandEventsAtStep(input({ level: 'off' }))).toEqual([]);
  });

  it('drops the part whose role the player has taken over', () => {
    expect(bandParts('gentle', new Set(['melody']))).toEqual(['pad', 'bass', 'groove']);
    expect(bandParts('gentle', new Set(['bass']))).toEqual(['pad', 'groove']);
    expect(bandParts('gentle', new Set(['chord', 'drums']))).toEqual(['bass']);
    expect(bandParts('full', new Set(['chord', 'drums', 'bass']))).toEqual([]);
  });

  it('a melody counter takes nothing from the band: the band has no melody', () => {
    expect(bandParts('full', new Set(['melody']))).toEqual(['pad', 'bass', 'groove']);
  });
});

describe('what the band plays', () => {
  it('the pad sounds the chord when it changes and holds it until the next change', () => {
    const pad = bandEventsAtStep(input()).filter((e) => e.part === 'pad');
    expect(pad.map((e) => e.midi! % 12).sort()).toEqual([0, 4, 7]);
    expect(pad[0].dur).toBeGreaterThan(3.5);
    expect(bandEventsAtStep(input({ chordChange: false })).filter((e) => e.part === 'pad')).toEqual([]);
  });

  it('the bass lands on the root under each chord', () => {
    const bass = bandEventsAtStep(input()).filter((e) => e.part === 'bass');
    expect(bass).toHaveLength(1);
    expect(bass[0].midi! % 12).toBe(0);
    expect(bass[0].midi).toBeLessThan(48);
  });

  it('gentle is a soft pulse; full is the whole kit and a walking bass', () => {
    const count = (level: BandInput['level'], part: string) => loop({ level }).flat().filter((e) => e.part === part).length;
    expect(count('full', 'groove')).toBeGreaterThan(count('gentle', 'groove'));
    expect(count('full', 'bass')).toBeGreaterThan(count('gentle', 'bass'));
    const gentleHits = loop({ level: 'gentle' }).flat().filter((e) => e.part === 'groove');
    expect(gentleHits.every((e) => e.accent <= 0.5)).toBe(true);
  });

  it('with no harmony at all, only the groove plays', () => {
    const events = bandEventsAtStep(input({ harmony: null }));
    expect(events.every((e) => e.part === 'groove')).toBe(true);
  });

  it('is quieter than the player', () => {
    expect(BAND_GAIN.gentle).toBeLessThan(0.5);
    expect(BAND_GAIN.full).toBeLessThan(0.5);
  });
});

describe("each world's own progression", () => {
  it('is in key, changes chord through the loop, and comes back round', () => {
    for (const style of ['warm', 'lofi', 'ambient', 'electronic'] as const) {
      const chords = Array.from({ length: 8 }, (_, step) => defaultHarmonyAt(style, step, 8, 60, PENT));
      for (const h of chords) for (const t of h.tones) expect(SCALE_PCS.has(((t % 12) + 12) % 12)).toBe(true);
      expect(new Set(chords.map((h) => h.root)).size).toBeGreaterThan(1);
      expect(defaultHarmonyAt(style, 8, 8, 60, PENT)).toEqual(chords[0]);
    }
  });

  it('starts on the key note for every world but Lo-fi (which starts on ii)', () => {
    expect(defaultHarmonyAt('warm', 0, 8, 60, PENT).root % 12).toBe(0);
    expect(defaultHarmonyAt('lofi', 0, 8, 60, PENT).root % 12).not.toBe(0);
  });
});

// ---- the engine's band clock: waits for the player, lets the last pass finish ----

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import { popsAt } from '../ui/screens/boardSequencer/components/boardViewModel';

const fakeParam = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const fakeGain = () => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() });
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'b', kind: 'hue', role: 'bass', swatch: '#00f' },
];
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, unknown>;
  drumKit: { play: ReturnType<typeof vi.fn> };
  bandVoices: { pad: { play: ReturnType<typeof vi.fn> }; bass: { play: ReturnType<typeof vi.fn> }; gain: ReturnType<typeof fakeGain>; rev: ReturnType<typeof fakeGain> };
  band: string;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
function engine(level: 'gentle' | 'full' = 'gentle') {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: PENT, swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
    soundWorld: 'warm', band: level, fillEngine: 'rules',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const voice = () => ({ voice: { play: vi.fn(), setBrightness: vi.fn(), connect: vi.fn(), dispose: vi.fn() }, gain: fakeGain(), rev: fakeGain(), del: fakeGain(), revBase: 0.2, delBase: 0, toneBase: 1 });
  p.voiceByChannel = new Map([['m', voice()], ['b', voice()]]);
  p.drumKit = { play: vi.fn() };
  p.band = level;
  p.bandVoices = { pad: { play: vi.fn() }, bass: { play: vi.fn() }, gain: fakeGain(), rev: fakeGain() };
  return { e, p };
}
const lapOf = (p: Priv, lap: number) => { for (let b = lap * 4; b < lap * 4 + 4; b++) p.fireStep(b, b, 1, null); };
const bandNotes = (e: BoardSequencerEngine) => e.drainFiredNotes().filter((f) => f.origin === 'band');

describe('engine — the band waits for the player', () => {
  it('is silent on an empty board', () => {
    const { e, p } = engine();
    lapOf(p, 0);
    expect(bandNotes(e)).toEqual([]);
    expect(e.getBandStatus().playing).toBe(false);
  });

  it('comes in on the pass after the first counter, and stops after the pass the last one left in', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 3, col: 1, colour: 'm' }]);
    lapOf(p, 0);
    expect(bandNotes(e)).toEqual([]);              // the pass the counter arrived in: not yet
    lapOf(p, 1);
    expect(bandNotes(e).length).toBeGreaterThan(0); // the next pass: in
    // Lifted halfway through pass 2: that pass finishes with the band, then silence.
    p.fireStep(8, 8, 1, null);
    p.fireStep(9, 9, 1, null);
    e.setActiveCells([]);
    e.drainFiredNotes();
    p.fireStep(10, 10, 1, null);
    p.fireStep(11, 11, 1, null);
    expect(bandNotes(e).length).toBeGreaterThan(0);
    lapOf(p, 3);
    expect(bandNotes(e)).toEqual([]);
  });

  it('hands the bass to the player when a bass counter goes down', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 3, col: 1, colour: 'm' }]);
    lapOf(p, 0);
    lapOf(p, 1);
    expect(e.getBandStatus().parts).toEqual(['pad', 'bass', 'groove']);
    expect(p.bandVoices.bass.play).toHaveBeenCalled();
    p.bandVoices.bass.play.mockClear();
    e.setActiveCells([{ row: 3, col: 1, colour: 'm' }, { row: 7, col: 0, colour: 'b' }]);
    lapOf(p, 2);
    expect(e.getBandStatus().parts).toEqual(['pad', 'groove']);
    expect(p.bandVoices.bass.play).not.toHaveBeenCalled();
  });

  it('band notes are logged but never drawn as counters', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 3, col: 1, colour: 'm' }]);
    lapOf(p, 0);
    lapOf(p, 1);
    const fired = e.drainFiredNotes();
    const band = fired.filter((f) => f.origin === 'band');
    expect(band.length).toBeGreaterThan(0);
    expect(band.every((f) => f.row === -1 && f.col === -1)).toBe(true);
    expect(popsAt(band, band[0].audioTime)).toEqual([]);
  });

  it('off means nothing, whatever is on the board', () => {
    const { e, p } = engine();
    e.setBand('off');
    e.setActiveCells([{ row: 3, col: 1, colour: 'm' }]);
    lapOf(p, 0);
    lapOf(p, 1);
    expect(bandNotes(e)).toEqual([]);
  });
});
