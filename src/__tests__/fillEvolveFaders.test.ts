import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import { FADER_ROLES, ROLE_LABELS, isFaderRole } from '../tracking/boardColours';
import { stepControls, initialControlState } from '../tracking/controlCounters';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import type { ColourChannel } from '../tracking/boardColours';
import type { CellReading } from '../tracking/BoardSequencerMode';

describe('fill and evolve as control counters', () => {
  it('are fader jobs a colour can be given, with a label', () => {
    expect(isFaderRole('fill')).toBe(true);
    expect(isFaderRole('evolve')).toBe(true);
    expect(FADER_ROLES).toContain('fill');
    expect(ROLE_LABELS.fill).toMatch(/fill/i);
  });

  it('a fill counter high on the board means a lot of fill; lifted, it holds', () => {
    const channels: ColourChannel[] = [{ id: 'f', kind: 'hue', role: 'fill', swatch: '#0f0' }];
    const cfg = {
      controlStillMs: 0, controlReturnMs: 1000, controlRanges: DEFAULT_BOARD_SEQUENCER_CONFIG.controlRanges,
      controlRemoval: DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval, zone: { mode: 'anywhere' as const, index: 0 },
      heldColours: new Set<string>(), faderAxis: 'row' as const, boardSquares: 8,
    };
    // A fader reads where the counter sits on the board (unit coords, y down): near the
    // top edge is the top of the fader.
    const reading = (y: number): CellReading[] => [{
      row: 0, col: 2, occupied: true, colour: 'f', centroid: { x: 0.3, y }, offset: null, fractions: {},
    } as unknown as CellReading];
    let st = initialControlState();
    let out = stepControls(st, reading(0.04), channels, cfg as never, 16);
    st = out.state;
    expect(out.values.fill).toBeGreaterThan(0.8);
    out = stepControls(st, [], channels, cfg as never, 16);
    expect(out.values.fill).toBeGreaterThan(0.8); // hold: lifting keeps the value
  });

  it('while a fill counter is present its value wins over the saved setting', () => {
    const e = new BoardSequencerEngine({
      bpm: 60, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
      noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: [],
      faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
    });
    const p = e as unknown as { fillAmount: number; evolve: { amount: number } };
    e.setControlValues({ fill: 0.9, evolve: 0.3 });
    e.setFill(0.2, 1, null);
    e.setEvolve({ amount: 0.8, sceneLoops: 8, seed: 1, holdLap: null });
    expect(p.fillAmount).toBeCloseTo(0.9, 9);
    expect(p.evolve.amount).toBeCloseTo(0.3, 9);
    // No fill or evolve counter on the board: the saved settings are back in charge.
    e.setControlValues({});
    e.setFill(0.2, 1, null);
    e.setEvolve({ amount: 0.8, sceneLoops: 8, seed: 1, holdLap: null });
    expect(p.fillAmount).toBeCloseTo(0.2, 9);
    expect(p.evolve.amount).toBeCloseTo(0.8, 9);
  });
});
