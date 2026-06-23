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

  it('migrates legacy blackDrums/blueBass flags into channels', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, blackDrums: true, blueBass: true,
    }));
    const loaded = loadBoardSequencerConfig();
    const roles = (loaded?.channels ?? []).map((c) => c.role).sort();
    expect(roles).toEqual(['bass', 'drums', 'melody']);
    expect((loaded?.channels ?? []).some((c) => c.kind === 'black' && c.role === 'drums')).toBe(true);
  });

  it('migrates a legacy redColour hue into a hue channel band', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, redColour: { id: 'r', hue: 5, hueTolerance: 10, minSaturation: 40, minValue: 30, minArea: 0 },
    }));
    const loaded = loadBoardSequencerConfig();
    const melody = loaded?.channels.find((c) => c.role === 'melody');
    expect(melody?.band?.hue).toBe(5);
  });

  it('migrates new-style colourRoles into channels (and defaults faderAxis to row)', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90, colourRoles: { green: 'melody', purple: 'volume' },
    }));
    const loaded = loadBoardSequencerConfig();
    const roles = (loaded?.channels ?? []).map((c) => c.role).sort();
    expect(roles).toEqual(['melody', 'volume']);
    expect(loaded?.faderAxis).toBe('row');
  });

  it('round-trips an explicit channels array', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      bpm: 90,
      channels: [
        { id: 'c1', kind: 'hue', role: 'melody', swatch: '#0f0', band: { id: 'b', hue: 120, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 } },
        { id: 'c2', kind: 'black', role: 'drums', swatch: '#000', blackBand: { maxValue: 30, maxSaturation: 40 } },
      ],
    }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.channels).toHaveLength(2);
    expect(loaded?.channels[0].band?.hue).toBe(120);
    expect(loaded?.channels[1].kind).toBe('black');
  });

  it('sanitizes rowMode to pitched unless explicitly drumKit', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, rowMode: 'drumKit' }));
    expect(loadBoardSequencerConfig()?.rowMode).toBe('drumKit');
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, rowMode: 'nonsense' }));
    expect(loadBoardSequencerConfig()?.rowMode).toBe('pitched');
  });
});
