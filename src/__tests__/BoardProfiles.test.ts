import { describe, it, expect, beforeEach } from 'vitest';
import {
  RIG_KEY, PLAYERS_KEY, ACTIVE_PLAYER_KEY, LEGACY_KEY,
  loadActiveBoardConfig, saveActiveBoardConfig, listBoardPlayers, getActiveBoardPlayer,
  createBoardPlayer, setActiveBoardPlayer, splitBoardConfig, resolveBoardConfig, allReferencedChannelIds,
} from '../profiles/BoardProfiles';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, type BoardSequencerStored } from '../profiles/BoardSequencerConfig';
import { suggestReadSettings } from '../tracking/boardGrid';

const withColours = (): BoardSequencerStored => ({
  ...DEFAULT_BOARD_SEQUENCER_CONFIG,
  enabled: true,
  corners: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
  cameraDeviceId: 'usb-1', mirrorX: false, bpm: 120, rows: 8, cols: 8,
  channels: [
    { id: 'c1', kind: 'hue', role: 'melody', swatch: '#e00', instrument: 'harp', volume: 0.5, band: { id: 'c1', hue: 0, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 } },
    { id: 'c2', kind: 'black', role: 'drums', swatch: '#111', blackBand: { maxValue: 30, maxSaturation: 40 } },
  ],
  loopSlots: [[{ row: 0, col: 0, colour: 'c7' }]],
});

describe('BoardProfiles', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored at all', () => {
    expect(loadActiveBoardConfig()).toBeNull();
  });

  it('split + resolve round-trips a config', () => {
    const cfg = withColours();
    const { rig, settings, channelSettings } = splitBoardConfig(cfg);
    expect(rig.fields).toMatchObject({ enabled: true, cameraDeviceId: 'usb-1', mirrorX: false, boardSquares: 8 });
    expect(rig.channels[0]).not.toHaveProperty('role');
    expect(settings).toMatchObject({ bpm: 120, rows: 8 });
    expect(settings).not.toHaveProperty('corners');
    expect(channelSettings.c1).toMatchObject({ role: 'melody', instrument: 'harp', volume: 0.5 });
    const back = resolveBoardConfig(rig, { id: 'p', name: 'P', settings, channelSettings });
    expect(back).toEqual(cfg);
  });

  it('migrates the legacy single config into a rig + "Player 1", leaving the old key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const cfg = loadActiveBoardConfig();
    expect(cfg).toMatchObject({ bpm: 120, rows: 8, cameraDeviceId: 'usb-1' });
    expect(cfg?.channels.map((c) => c.role)).toEqual(['melody', 'drums']);
    expect(listBoardPlayers()).toHaveLength(1);
    expect(getActiveBoardPlayer()).toMatchObject({ name: 'Player 1', settings: { handedness: 'right', seatEdge: 'low' } });
    expect(localStorage.getItem(RIG_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('saves rig fields for everyone and player fields only for the active player', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const tim = createBoardPlayer('Tim', 'left');
    expect(getActiveBoardPlayer()?.id).toBe(tim.id);
    const timCfg = loadActiveBoardConfig()!;
    // New player on the same rig: same board + colours, all jobs Off, default grid.
    expect(timCfg).toMatchObject({ enabled: true, cameraDeviceId: 'usb-1', rows: 4, cols: 4, handedness: 'left' });
    expect(timCfg.channels.map((c) => c.role)).toEqual(['off', 'off']);
    saveActiveBoardConfig({ ...timCfg, bpm: 70, mirrorX: true, channels: timCfg.channels.map((c) => ({ ...c, role: 'bass' })) });
    const first = listBoardPlayers().find((p) => p.name === 'Player 1')!;
    setActiveBoardPlayer(first.id);
    const p1 = loadActiveBoardConfig()!;
    expect(p1.bpm).toBe(120);                  // player field untouched
    expect(p1.mirrorX).toBe(true);             // rig field shared
    expect(p1.channels.map((c) => c.role)).toEqual(['melody', 'drums']);
  });

  it('a removed colour disappears for every player', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const cfg = loadActiveBoardConfig()!;
    createBoardPlayer('Tim', 'left');
    const tim = loadActiveBoardConfig()!;
    saveActiveBoardConfig({ ...tim, channels: tim.channels.filter((c) => c.id !== 'c2') });
    setActiveBoardPlayer(listBoardPlayers()[0].id);
    expect(loadActiveBoardConfig()!.channels.map((c) => c.id)).toEqual(['c1']);
    expect(cfg.channels).toHaveLength(2);
  });

  it('collects referenced channel ids across every player', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    loadActiveBoardConfig();
    createBoardPlayer('Tim', 'left');
    const tim = loadActiveBoardConfig()!;
    saveActiveBoardConfig({ ...tim, pages: [[{ row: 1, col: 1, colour: 'c9' }]] });
    expect([...allReferencedChannelIds()].sort()).toEqual(['c7', 'c9']);
  });

  // The round-trip test above can't catch a field filed in the wrong bucket, because
  // split + resolve is symmetric either way. What it costs a player is only visible with
  // two of them: a setting that belongs to one person leaking onto everyone, or a shared
  // rig setting being trapped on one profile.
  it('a setting changed by one player reaches the other only if it belongs to the rig', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const base = loadActiveBoardConfig()!;
    const p1 = getActiveBoardPlayer()!;

    // Something from each bucket, all changed at once by Player 1.
    saveActiveBoardConfig({
      ...base,
      bpm: 137, handedness: 'left', themeMode: 'light', numPages: 3, octaveShift: -1,
      variationEnabled: true, twoCounterMode: 'both', boxDetailEnabled: true,
      controlZone: { mode: 'row', index: 0 }, loopZone: { mode: 'col', index: 3 },
      boardSquares: 10, mirrorY: true, cameraLabel: 'Studio cam',
    });

    const tim = createBoardPlayer('Tim', 'left');
    const timCfg = loadActiveBoardConfig()!;
    // The rig is the room: the board and the camera are the same for whoever sits down.
    expect(timCfg).toMatchObject({ boardSquares: 10, mirrorY: true, cameraLabel: 'Studio cam' });
    // Everything else is theirs alone, and starts fresh.
    expect(timCfg).toMatchObject({
      bpm: DEFAULT_BOARD_SEQUENCER_CONFIG.bpm,
      themeMode: DEFAULT_BOARD_SEQUENCER_CONFIG.themeMode,
      numPages: DEFAULT_BOARD_SEQUENCER_CONFIG.numPages,
      octaveShift: DEFAULT_BOARD_SEQUENCER_CONFIG.octaveShift,
      variationEnabled: DEFAULT_BOARD_SEQUENCER_CONFIG.variationEnabled,
      twoCounterMode: DEFAULT_BOARD_SEQUENCER_CONFIG.twoCounterMode,
      boxDetailEnabled: DEFAULT_BOARD_SEQUENCER_CONFIG.boxDetailEnabled,
    });
    expect(timCfg.controlZone).toEqual(DEFAULT_BOARD_SEQUENCER_CONFIG.controlZone);
    expect(timCfg.loopZone).toEqual(DEFAULT_BOARD_SEQUENCER_CONFIG.loopZone);
    // Handedness comes from how the new player was set up, not from whoever played last.
    expect(timCfg.handedness).toBe('left');
    expect(tim.id).not.toBe(p1.id);

    // And going back finds Player 1's own settings exactly as they left them.
    setActiveBoardPlayer(p1.id);
    expect(loadActiveBoardConfig()).toMatchObject({
      bpm: 137, themeMode: 'light', numPages: 3, octaveShift: -1, variationEnabled: true,
      twoCounterMode: 'both', boxDetailEnabled: true,
    });
  });

  it('a new player reads the board at the size the rig actually is', () => {
    // Read settings are suggested from the board size; a 10 x 10 board covers far less of
    // a cell per counter than an 8 x 8 one, so inheriting the default was a misread.
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...withColours(), boardSquares: 10, rows: 4, cols: 4 }));
    loadActiveBoardConfig();
    createBoardPlayer('Tim', 'left');
    const timCfg = loadActiveBoardConfig()!;
    expect(timCfg.boardSquares).toBe(10);
    expect(timCfg.minFilledFraction).toBeCloseTo(suggestReadSettings(10, 4, 4).minFilledFraction, 10);
    expect(timCfg.samplesPerAxis).toBe(suggestReadSettings(10, 4, 4).samplesPerAxis);
  });

  it('first run with nothing stored: saving creates the rig and Player 1', () => {
    saveActiveBoardConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, bpm: 100 });
    expect(localStorage.getItem(PLAYERS_KEY)).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_PLAYER_KEY)).not.toBeNull();
    expect(loadActiveBoardConfig()?.bpm).toBe(100);
  });
});
