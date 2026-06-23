import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadBoardSequencerConfig,
  saveBoardSequencerConfig,
  clearBoardSequencerConfig,
  DEFAULT_BOARD_SEQUENCER_CONFIG,
  type BoardSequencerStored,
} from '../profiles/BoardSequencerConfig';

describe('BoardSequencerConfig', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(loadBoardSequencerConfig()).toBeNull();
  });

  it('round-trips a valid config', () => {
    const cfg: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, bpm: 110 };
    saveBoardSequencerConfig(cfg);
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.bpm).toBe(110);
    expect(loaded?.rows).toBe(6);
    expect(loaded?.scaleSemitones).toEqual([0, 2, 4, 7, 9]);
    expect(loaded?.rowMode).toBe('pitched');
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

  it('migrates legacy blackDrums/blueBass flags into colourRoles', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, blackDrums: true, blueBass: true,
    }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.colourRoles.red).toBe('melody');
    expect(loaded?.colourRoles.black).toBe('drums');
    expect(loaded?.colourRoles.blue).toBe('bass');
  });

  it('migrates a legacy redColour into hueBands.red', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, redColour: { id: 'r', hue: 5, hueTolerance: 10, minSaturation: 40, minValue: 30, minArea: 0 },
    }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.hueBands.red?.hue).toBe(5);
  });

  it('keeps new-style colourRoles when present (and defaults faderAxis to row)', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, colourRoles: { green: 'melody', purple: 'volume' },
    }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.colourRoles.green).toBe('melody');
    expect(loaded?.colourRoles.purple).toBe('volume');
    expect(loaded?.colourRoles.red).toBeUndefined(); // explicit roles replace the migration defaults
    expect(loaded?.faderAxis).toBe('row');
  });

  it('sanitizes rowMode to pitched unless explicitly drumKit', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, rowMode: 'drumKit' }));
    expect(loadBoardSequencerConfig()?.rowMode).toBe('drumKit');
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, rowMode: 'nonsense' }));
    expect(loadBoardSequencerConfig()?.rowMode).toBe('pitched');
  });
});
