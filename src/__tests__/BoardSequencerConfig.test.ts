import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadBoardSequencerConfig,
  saveBoardSequencerConfig,
  clearBoardSequencerConfig,
  DEFAULT_BOARD_SEQUENCER_CONFIG,
  referencedChannelIds,
  type BoardSequencerStored,
} from '../profiles/BoardSequencerConfig';

describe('BoardSequencerConfig', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the browser default camera (empty id/label)', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.cameraDeviceId).toBe('');
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.cameraLabel).toBe('');
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90 }));
    expect(loadBoardSequencerConfig()?.cameraDeviceId).toBe('');
    expect(loadBoardSequencerConfig()?.cameraLabel).toBe('');
  });

  it('round-trips the chosen camera', () => {
    saveBoardSequencerConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG, cameraDeviceId: 'abc123', cameraLabel: 'USB webcam',
    });
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.cameraDeviceId).toBe('abc123');
    expect(loaded?.cameraLabel).toBe('USB webcam');
  });

  it('sanitises a garbage camera choice back to the default', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ cameraDeviceId: 42, cameraLabel: {} }));
    expect(loadBoardSequencerConfig()?.cameraDeviceId).toBe('');
    expect(loadBoardSequencerConfig()?.cameraLabel).toBe('');
  });

  it('returns null when nothing is stored', () => {
    expect(loadBoardSequencerConfig()).toBeNull();
  });

  it('has no predefined colours by default (empty channels)', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.channels).toEqual([]);
  });

  it('keeps an empty channels array as empty (no red fallback)', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    expect(loadBoardSequencerConfig()?.channels).toEqual([]);
  });

  it('round-trips a valid config', () => {
    const cfg: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, bpm: 110 };
    saveBoardSequencerConfig(cfg);
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.bpm).toBe(110);
    expect(loaded?.rows).toBe(4);
    expect(loaded?.scaleSemitones).toEqual([0, 2, 4, 7, 9]);
  });

  it('falls back to defaults for missing/garbage numeric fields', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 'fast', corners: 'nope' }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded).not.toBeNull();
    expect(loaded?.bpm).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.bpm);
    expect(loaded?.corners).toEqual(DEFAULT_BOARD_SEQUENCER_CONFIG.corners);
  });

  it('clear removes the stored config', () => {
    saveBoardSequencerConfig(DEFAULT_BOARD_SEQUENCER_CONFIG);
    clearBoardSequencerConfig();
    expect(loadBoardSequencerConfig()).toBeNull();
  });

  it('wipes pre-v2 colour data (no fixed-palette migration)', () => {
    // Old fixed-palette shape AND old channels without a version → start empty.
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, blackDrums: true, blueBass: true,
      colourRoles: { green: 'melody' },
      channels: [{ id: 'c1', kind: 'hue', role: 'melody', swatch: '#e53935', band: { id: 'r', hue: 0, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 } }],
    }));
    expect(loadBoardSequencerConfig()?.channels).toEqual([]);
  });

  it('round-trips an explicit channels array on the current version', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, version: 2,
      channels: [
        { id: 'c1', kind: 'hue', role: 'melody', swatch: '#0f0', band: { id: 'b', hue: 120, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 } },
        { id: 'c2', kind: 'black', role: 'drums', swatch: '#000', blackBand: { maxValue: 30, maxSaturation: 40 } },
      ],
    }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.channels).toHaveLength(2);
    expect(loaded?.channels[0].band?.hue).toBe(120);
    expect(loaded?.channels[1].kind).toBe('black');
    expect(loaded?.version).toBe(2);
  });

  it('round-trips the variation calibration', () => {
    const cfg: BoardSequencerStored = {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG, variationEnabled: true, variationOffsetThreshold: 0.55,
    };
    saveBoardSequencerConfig(cfg);
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.variationEnabled).toBe(true);
    expect(loaded?.variationOffsetThreshold).toBeCloseTo(0.55);
  });

  it('defaults variation OFF and threshold to 0.6 when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.variationEnabled).toBe(false);
    expect(loaded?.variationOffsetThreshold).toBe(0.6);
  });

  it('round-trips the ping-pong flag', () => {
    const cfg: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, pingPong: true };
    saveBoardSequencerConfig(cfg);
    expect(loadBoardSequencerConfig()?.pingPong).toBe(true);
  });

  it('defaults pingPong to false when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    expect(loadBoardSequencerConfig()?.pingPong).toBe(false);
  });

  it('round-trips loop bank enabled + slots (null slot + conditional preserved)', () => {
    const cfg: BoardSequencerStored = {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      loopBankEnabled: true,
      loopSlots: [[{ row: 1, col: 2, colour: 'red', conditional: true }], null],
    };
    saveBoardSequencerConfig(cfg);
    const back = loadBoardSequencerConfig();
    expect(back?.loopBankEnabled).toBe(true);
    expect(back?.loopSlots[0]).toEqual([{ row: 1, col: 2, colour: 'red', conditional: true }]);
    expect(back?.loopSlots[1]).toBeNull();
  });

  it('defaults loop bank off / empty when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    const back = loadBoardSequencerConfig();
    expect(back?.loopBankEnabled).toBe(false);
    expect(back?.loopSlots).toEqual([]);
  });
});

describe('BoardSequencerConfig — redesign fields', () => {
  beforeEach(() => localStorage.clear());

  it('brand-new default grid is square 4 × 4 with suggested read settings', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ rows: 4, cols: 4, boardSquares: 8, samplesPerAxis: 9, readSettingsCustom: false });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.minFilledFraction).toBeCloseTo(0.045, 6);
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ themeMode: 'dark', boardNudgesEnabled: true, handedness: 'right', seatEdge: 'low' });
  });

  it('keeps saved rows/cols (most recent grid) and clamps them', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 6, cols: 8 }));
    expect(loadBoardSequencerConfig()).toMatchObject({ rows: 6, cols: 8 });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 40, cols: 1 }));
    expect(loadBoardSequencerConfig()).toMatchObject({ rows: 10, cols: 2 });
  });

  it('migration: untuned legacy 4 × 4 gets suggested sampling and fill', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 4, cols: 4, minFilledFraction: 0.1 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.readSettingsCustom).toBe(false);
    expect(c.samplesPerAxis).toBe(9);
    expect(c.minFilledFraction).toBeCloseTo(0.045, 6);
  });

  it('migration: a tuned legacy min fill is kept, sampling is still suggested', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 4, cols: 4, minFilledFraction: 0.2 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.readSettingsCustom).toBe(true);
    expect(c.minFilledFraction).toBeCloseTo(0.2, 6);
    expect(c.samplesPerAxis).toBe(9);
  });

  it('once migrated, saved read settings are never re-suggested on load', () => {
    saveBoardSequencerConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, samplesPerAxis: 12, minFilledFraction: 0.07, readSettingsCustom: false });
    expect(loadBoardSequencerConfig()).toMatchObject({ samplesPerAxis: 12, minFilledFraction: 0.07 });
  });

  it('sanitises the new enum fields', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ boardSquares: 9, themeMode: 'pink', handedness: 'both', seatEdge: 'top', boardNudgesEnabled: 'yes' }));
    expect(loadBoardSequencerConfig()).toMatchObject({ boardSquares: 8, themeMode: 'dark', handedness: 'right', seatEdge: 'low', boardNudgesEnabled: true });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ boardSquares: 10, themeMode: 'light', handedness: 'left', seatEdge: 'start', boardNudgesEnabled: false }));
    expect(loadBoardSequencerConfig()).toMatchObject({ boardSquares: 10, themeMode: 'light', handedness: 'left', seatEdge: 'start', boardNudgesEnabled: false });
  });

  it('referencedChannelIds collects ids used by pages and loop slots', () => {
    const ids = referencedChannelIds({ pages: [[{ row: 0, col: 0, colour: 'c3' }]], loopSlots: [null, [{ row: 1, col: 1, colour: 'c5' }]] });
    expect([...ids].sort()).toEqual(['c3', 'c5']);
  });
});
