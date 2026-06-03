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

  it('sanitizes rowMode to pitched unless explicitly drumKit', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, rowMode: 'drumKit' }));
    expect(loadBoardSequencerConfig()?.rowMode).toBe('drumKit');
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, rowMode: 'nonsense' }));
    expect(loadBoardSequencerConfig()?.rowMode).toBe('pitched');
  });
});
