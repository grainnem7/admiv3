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

import { BoardSequencerEngine, type FiredNote } from '../songs/BoardSequencerEngine';
import { LEAD_INS, LEAD_IN_WORDS, leadInEvents, sanitizeLeadIn } from '../songs/band/bandJobs';
import type { ColourChannel } from '../tracking/boardColours';

/**
 * A Stop lead in (Rising Light version 3, G1): the last two beats before the scene are
 * silent (the loops, the band, the extra notes), then it crashes in. The player's own
 * counters still sound: it is his moment.
 */

const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'black', role: 'drums', swatch: '#000', drum: 'kick' },
];
const fakeGain = () => ({ gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });

interface Priv {
  timer: unknown;
  lastInternalBeat: number;
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  bandVoices: Record<string, unknown>;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
    soundWorld: 'warm', phrases: false, fillEngine: 'rules', chords: { sequence: 'calm', bars: 1 },
    band: 'full', bandWithLoops: true, bandJobs: { asBefore: false, pads: true, bass: true, drums: true, counter: false },
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', fakeVoiceEntry()]]);
  p.drumKit = { play: vi.fn() };
  const v = () => ({ play: vi.fn(), dispose: vi.fn() });
  p.bandVoices = { pad: v(), bass: v(), lead: v(), gain: fakeGain(), rev: fakeGain(), leadGain: fakeGain(), top: fakeGain() };
  e.setBand('full');
  e.setFill(0.8, 1, null);
  // A loop with a note on every step, and the player's own counter on step 6.
  e.setActiveLoops([Array.from({ length: 8 }, (_, col) => ({ row: 4, col, colour: 'm' }))]);
  e.setActiveCells([{ row: 2, col: 6, colour: 'm' }]);
  return { e, p };
}

describe('the Stop lead in', () => {
  it('is a lead in with plain words, kept when saved', () => {
    expect(LEAD_INS).toContain('stop');
    expect(LEAD_IN_WORDS.stop.what).toBe('Stop: the last two beats before the scene are silent, then it crashes in.');
    expect(sanitizeLeadIn('stop')).toBe('stop');
    // It lands with a crash and a kick, and brings no bass approach into its silence.
    expect(leadInEvents('stop', 0, 8, null).map((ev) => ev.drum).sort()).toEqual(['crash', 'kick']);
    expect(leadInEvents('stop', 1, 8, { root: 60, tones: [60, 64, 67] } as never)).toEqual([]);
  });

  it('cued for beat 16: beats 14 and 15 send no loop, band or extra note; the player’s counter on 14 still sounds; 16 crashes in with the scene', () => {
    const { e, p } = engine();
    p.timer = 1;
    p.lastInternalBeat = 9;
    e.cueLeadIn('stop');
    expect(e.getLeadIn()).toEqual({ kind: 'stop', landBeat: 16 });
    const at = new Map<number, FiredNote[]>();
    for (let b = 10; b <= 16; b++) {
      p.fireStep(b, b, 1, null);
      at.set(b, e.drainFiredNotes());
    }
    for (const b of [14, 15]) {
      const notes = at.get(b) ?? [];
      expect(notes.filter((n) => n.source === 'loop'), `beat ${b} loops`).toHaveLength(0);
      expect(notes.filter((n) => n.origin === 'band' || n.origin === 'fill'), `beat ${b} band and fill`).toHaveLength(0);
    }
    expect((at.get(14) ?? []).filter((n) => n.source === 'live')).toHaveLength(1);
    // Before the stop, and on the landing beat, everything plays; it lands with a crash.
    expect((at.get(13) ?? []).some((n) => n.source === 'loop')).toBe(true);
    expect((at.get(16) ?? []).some((n) => n.source === 'loop')).toBe(true);
    expect((at.get(16) ?? []).some((n) => n.drum === 'crash')).toBe(true);
    p.timer = null;
  });
});
