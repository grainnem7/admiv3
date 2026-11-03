import { describe, it, expect, beforeEach } from 'vitest';
import { suggestReadSettings } from '../tracking/boardGrid';
import {
  loadBoardSequencerConfig,
  saveBoardSequencerConfig,
  clearBoardSequencerConfig,
  DEFAULT_BOARD_SEQUENCER_CONFIG,
  referencedChannelIds,
  safeShowLayout,
  isSafeShowLayout,
  type BoardSequencerStored,
} from '../profiles/BoardSequencerConfig';
import { DEFAULT_REMOTE_TOUCH } from '../remote/protocol';

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
    expect(loaded?.rows).toBe(8);
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

  it('a kept loop’s job and sound survive a save and load; an unknown job is dropped', () => {
    saveBoardSequencerConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      loopSlots: [[{ row: 1, col: 2, colour: 'red', job: 'melody', sound: 'violin' }, { row: 2, col: 2, colour: 'red', job: 'xyz' as never, sound: 'x' }]],
    });
    const back = loadBoardSequencerConfig();
    expect(back?.loopSlots[0]).toEqual([{ row: 1, col: 2, colour: 'red', job: 'melody', sound: 'violin' }, { row: 2, col: 2, colour: 'red' }]);
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

  it('brand-new default grid is square 8 × 8 (one counter per square) with suggested read settings', () => {
    const suggested = suggestReadSettings(8, 8, 8);
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ rows: 8, cols: 8, boardSquares: 8, samplesPerAxis: suggested.samplesPerAxis, readSettingsCustom: false });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.minFilledFraction).toBeCloseTo(suggested.minFilledFraction, 9);
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
    expect(c.samplesPerAxis).toBe(15);
    expect(c.minFilledFraction).toBeCloseTo(0.03, 6);
  });

  it('migration: a tuned legacy min fill is kept, sampling is still suggested', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 4, cols: 4, minFilledFraction: 0.2 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.readSettingsCustom).toBe(true);
    expect(c.minFilledFraction).toBeCloseTo(0.2, 6);
    expect(c.samplesPerAxis).toBe(15);
  });

  it('untuned settings saved before the denser sampling are moved on, once', () => {
    // Saved on an 8 x 8 grid under the old suggestion: 5 x 5 samples, 18% fill. A centred
    // counter covered exactly 5 of those 25 points, so a shaded rim made it vanish.
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      rows: 8, cols: 8, samplesPerAxis: 5, minFilledFraction: 0.18, readSettingsCustom: false,
    }));
    const c = loadBoardSequencerConfig()!;
    expect(c.samplesPerAxis).toBe(9);
    expect(c.minFilledFraction).toBeCloseTo(0.12, 6);
    expect(c.readSettingsRev).toBe(2);
  });

  it('the coverage a player tuned is kept; the sampling is never coarser than suggested', () => {
    // Nothing on screen sets the sampling, so it is not the player's choice: keeping 5 x 5
    // because they had moved the coverage slider lost counters on the real board.
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      rows: 8, cols: 8, samplesPerAxis: 5, minFilledFraction: 0.25, readSettingsCustom: true, readSettingsRev: 2,
    }));
    expect(loadBoardSequencerConfig()).toMatchObject({ samplesPerAxis: 9, minFilledFraction: 0.25 });
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

describe('BoardSequencerConfig — control counter settings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults: hold on removal, 150 ms stillness, 0.3 s glide, per-role ranges', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({
      controlStillMs: 150, controlGlideSec: 0.3, controlReturnMs: 3000, toggleAmount: 0.35, captureQuietMs: 500,
    });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.controlRanges).toEqual({
      volume: { min: 0.2, max: 1 },
      reverb: { min: 0, max: 0.6 },
      delay: { min: 0, max: 0.6 },
      tone: { min: 0, max: 1 },
      tempo: { min: 60, max: 240 },
      fill: { min: 0, max: 1 },
      evolve: { min: 0, max: 1 },
    });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval).toEqual({
      volume: 'hold', reverb: 'hold', delay: 'hold', tone: 'hold', tempo: 'hold', fill: 'hold', evolve: 'hold',
    });
  });

  it('round-trips tuned control settings', () => {
    saveBoardSequencerConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      controlStillMs: 400,
      controlRemoval: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval, volume: 'zero' },
      controlRanges: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.controlRanges, tempo: { min: 50, max: 120 } },
    });
    const c = loadBoardSequencerConfig()!;
    expect(c.controlStillMs).toBe(400);
    expect(c.controlRemoval.volume).toBe('zero');
    expect(c.controlRanges.tempo).toEqual({ min: 50, max: 120 });
  });

  it('sanitises garbage ranges, removals and clamps the timings', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      controlStillMs: -50, controlGlideSec: 99, controlReturnMs: 'soon', toggleAmount: 4, captureQuietMs: 99999,
      controlRanges: { volume: { min: 'low', max: 0.8 }, tempo: 'fast' },
      controlRemoval: { volume: 'explode', tone: 'default' },
    }));
    const c = loadBoardSequencerConfig()!;
    expect(c.controlStillMs).toBe(0);
    expect(c.controlGlideSec).toBe(2);
    expect(c.controlReturnMs).toBe(3000);
    expect(c.toggleAmount).toBe(1);
    expect(c.captureQuietMs).toBe(5000);
    expect(c.controlRanges.volume).toEqual({ min: 0.2, max: 0.8 });
    expect(c.controlRanges.tempo).toEqual({ min: 60, max: 240 });
    expect(c.controlRemoval.volume).toBe('hold');
    expect(c.controlRemoval.tone).toBe('default');
  });

  it('keeps every control range within what the sound can safely take', () => {
    // Typed in: a reverb of 8 went straight into the reverb send, a volume of 4 into the mix.
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      controlRanges: { reverb: { min: -1, max: 8 }, volume: { min: 0.2, max: 4 }, tempo: { min: 5, max: 900 } },
    }));
    const c = loadBoardSequencerConfig()!;
    expect(c.controlRanges.reverb).toEqual({ min: 0, max: 1 });
    expect(c.controlRanges.volume).toEqual({ min: 0.2, max: 1 });
    expect(c.controlRanges.tempo).toEqual({ min: 20, max: 400 });
  });
});

describe('BoardSequencerConfig — hand and knock guard', () => {
  beforeEach(() => localStorage.clear());

  it('the hand guard starts OFF, because when it is wrong it blinds the board', () => {
    // It drops the cells it thinks a hand is over BEFORE anything is read, so a false
    // positive doesn't degrade detection, it stops it. On a real webcam \u2014 sensor noise,
    // auto-exposure drift, neither of which the synthetic frames it was tuned on have \u2014
    // it held half an empty board. It goes back on once it is proven against a camera.
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.handGuardEnabled).toBe(false);
    // The knock guard only adds ghosts after a knock, so it can never blind anything.
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.knockGuardEnabled).toBe(true);
  });

  it('keeps the spec\u2019s thresholds for when it is switched on', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({
      handMarginSquares: 0.75, handReleaseMs: 250, settleAfterHandMs: 300,
      intruderSensitivity: 18, restNudgeMs: 4000,
      knockMinCount: 3, knockMinFraction: 0.4, knockWindowMs: 300,
    });
  });

  it('an inherited "on" is cleared once, then the choice sticks', () => {
    // It was ON by default and is known to blind the board on a real camera. Leaving a
    // saved true set would hand the fault to exactly the people who hit it first and
    // never chose it — so it is cleared once...
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ handGuardEnabled: true }));
    const cleared = loadBoardSequencerConfig()!;
    expect(cleared.handGuardEnabled).toBe(false);

    // ...and turning it back on after that is respected.
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ handGuardEnabled: true, handGuardReset: true }));
    expect(loadBoardSequencerConfig()?.handGuardEnabled).toBe(true);
  });

  it('clamps every threshold to its usable range and keeps the switches boolean', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      handGuardEnabled: false, handMarginSquares: 9, handReleaseMs: 10, settleAfterHandMs: 9999,
      intruderSensitivity: 200, restNudgeMs: 10, knockGuardEnabled: 'yes',
      knockMinCount: 99, knockMinFraction: 5, knockWindowMs: 5,
    }));
    expect(loadBoardSequencerConfig()).toMatchObject({
      handGuardEnabled: false, handMarginSquares: 2, handReleaseMs: 100, settleAfterHandMs: 1000,
      intruderSensitivity: 40, restNudgeMs: 2000, knockGuardEnabled: true,
      knockMinCount: 8, knockMinFraction: 0.8, knockWindowMs: 150,
    });
  });
});

describe('BoardSequencerConfig — zones', () => {
  beforeEach(() => localStorage.clear());

  it('controls start anywhere and there are no loop pads', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.controlZone).toEqual({ mode: 'anywhere', index: 0 });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.loopZone).toEqual({ mode: 'off', index: 0 });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.loopPadMode).toBe('hold');
  });

  it('an old bottom-row loop bank becomes a bottom-row lane', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 6, cols: 8, loopBankEnabled: true }));
    const c = loadBoardSequencerConfig()!;
    expect(c.loopZone).toEqual({ mode: 'row', index: 5 });
    expect(c.loopBankEnabled).toBe(true);
  });

  it('no loop bank means no lane', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 4, cols: 4, loopBankEnabled: false }));
    const c = loadBoardSequencerConfig()!;
    expect(c.loopZone.mode).toBe('off');
    expect(c.loopBankEnabled).toBe(false);
  });

  it('round-trips chosen lanes and keeps them inside the grid', () => {
    saveBoardSequencerConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      rows: 4,
      cols: 4,
      controlZone: { mode: 'col', index: 9 },
      loopZone: { mode: 'row', index: 2 },
      loopPadMode: 'toggle',
    });
    const c = loadBoardSequencerConfig()!;
    expect(c.controlZone).toEqual({ mode: 'col', index: 3 });   // clamped to the grid
    expect(c.loopZone).toEqual({ mode: 'row', index: 2 });
    expect(c.loopPadMode).toBe('toggle');
    expect(c.loopBankEnabled).toBe(true);
  });

  it('sanitises a garbage lane back to the default', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ controlZone: { mode: 'diagonal', index: -4 } }));
    expect(loadBoardSequencerConfig()!.controlZone).toEqual({ mode: 'anywhere', index: 0 });
  });
});

/** Store a raw object under the legacy key and read it back through sanitisation. */
function loadWith(raw: Record<string, unknown>) {
  localStorage.setItem('admi-board-sequencer', JSON.stringify(raw));
  return loadBoardSequencerConfig()!;
}

describe('BoardSequencerConfig — one shared harmony (stage 1)', () => {
  beforeEach(() => localStorage.clear());

  it('a new player gets the world’s own chords, two bars each, and the clash nudge on', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.chords).toEqual({ sequence: 'world', bars: 2 });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.clashNudge).toBe(true);
  });

  it('a player saved before chords existed plays as before: chords "As before", no nudge', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.chords).toEqual({ sequence: 'asBefore', bars: 2 });
    expect(c.clashNudge).toBe(false);
  });

  it('keeps what was chosen, and makes nonsense safe', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8, chords: { sequence: 'tense', bars: 4 }, clashNudge: true }));
    expect(loadBoardSequencerConfig()).toMatchObject({ chords: { sequence: 'tense', bars: 4 }, clashNudge: true });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8, chords: { sequence: 7, bars: 'long' } }));
    expect(loadBoardSequencerConfig()!.chords).toEqual({ sequence: 'asBefore', bars: 2 });
  });
});

describe('BoardSequencerConfig — a shape and an AI that repeats (stage 3)', () => {
  beforeEach(() => localStorage.clear());

  it('a new player: Energy off for their own sound, no ideas of the piece yet, the same ideas each time, tunes for new colours', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ sceneEnergy: 0, pieceIdeas: 0, surpriseMe: false, tunesForNewColours: true });
  });

  it('a player saved before: Energy off, seeds as they were, colours as they were, and new colours one note', () => {
    const c = loadWith({
      rows: 8, cols: 8, version: 2,
      channels: [{ id: 'red', kind: 'hue', role: 'melody', swatch: '#f00', band: { hMin: 0, hMax: 10, sMin: 40, vMin: 30 } }],
      scenes: [{ id: 's', name: 'Open', loops: [], at: 0, settings: { soundWorld: 'warm', band: 'full', phrases: true, fillAmount: 0.4, evolveAmount: 0.5, bpm: 90 } }],
    });
    expect(c).toMatchObject({ sceneEnergy: 0, pieceIdeas: 0, surpriseMe: false, tunesForNewColours: false });
    expect(c.scenes[0].settings.sceneEnergy).toBe(0);
    expect(c.scenes[0].ideas).toBeUndefined();
    expect(c.scenes[0].aiIdeas).toBeUndefined();
    expect(c.channels[0]?.plays).toBeUndefined();
  });

  it('keeps a scene’s Energy, its ideas and Magenta’s kept ideas; nonsense is made safe', () => {
    const note = { step: 1, offset: 0, role: 'melody', colour: 'm', midi: 72, dur: 0.5, accent: 0.6, cell: { row: 1, col: 1 }, rule: 'ai' };
    const c = loadWith({
      rows: 8, cols: 8, pieceIdeas: 99, surpriseMe: true,
      scenes: [
        { id: 'a', name: 'A', loops: [], at: 0, ideas: 5, aiIdeas: [{ key: 'k1', notes: [note] }, { key: 'bad' }], settings: { sceneEnergy: 4 } },
        { id: 'b', name: 'B', loops: [], at: 60, ideas: -1, aiIdeas: 'x', settings: { sceneEnergy: 9 } },
      ],
    });
    expect(c).toMatchObject({ pieceIdeas: 99, surpriseMe: true });
    expect(c.scenes[0]).toMatchObject({ ideas: 5, aiIdeas: [{ key: 'k1', notes: [note] }], settings: { sceneEnergy: 4 } });
    expect(c.scenes[1].ideas).toBeUndefined();
    expect(c.scenes[1].aiIdeas).toBeUndefined();
    expect(c.scenes[1].settings.sceneEnergy).toBe(0);
  });
});

describe('counts that must be whole numbers', () => {
  it('rounds a fraction instead of storing one', () => {
    // Array.from({ length: numPages }) throws on a fraction, and the page picker showed
    // nothing selected — from a value that sanitisation had waved through.
    const rounded = loadWith({ numPages: 2.5, loopStepsBlack: 1.4 });
    expect(rounded.numPages).toBe(3);
    expect(rounded.loopStepsBlack).toBe(1);
    expect(Number.isInteger(rounded.numPages)).toBe(true);
  });

  it('falls back when the count is out of range or not a number at all', () => {
    expect(loadWith({ numPages: 0 }).numPages).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.numPages);
    expect(loadWith({ numPages: -2 }).numPages).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.numPages);
    expect(loadWith({ numPages: 1e9 }).numPages).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.numPages);
    expect(loadWith({ numPages: 'four' }).numPages).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.numPages);
    expect(loadWith({ loopStepsRed: -3 }).loopStepsRed).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.loopStepsRed);
  });

  it('keeps a sensible one', () => {
    expect(loadWith({ numPages: 4, loopStepsRed: 3 })).toMatchObject({ numPages: 4, loopStepsRed: 3 });
  });
});

describe('saved work that has to survive a reload', () => {
  it('keeps where each counter sat, so a reloaded loop still swings', () => {
    // Box detail is the whole point of "where the counter sits matters": drop it and a
    // saved loop replays flat and dead on the beat next to a live board that doesn't.
    const cfg = loadWith({
      loopSlots: [[{ row: 1, col: 2, colour: 'c1', velocity: 0.42, timingBeats: 0.2, conditional: true }]],
      pages: [[{ row: 0, col: 0, colour: 'c1', velocity: 0.9, timingBeats: -0.1 }]],
    });
    expect(cfg.loopSlots[0]?.[0]).toMatchObject({
      row: 1, col: 2, colour: 'c1', velocity: 0.42, timingBeats: 0.2, conditional: true,
    });
    expect(cfg.pages[0][0]).toMatchObject({ velocity: 0.9, timingBeats: -0.1 });
  });

  it('drops box detail that is out of range rather than storing nonsense', () => {
    const cfg = loadWith({
      loopSlots: [[{ row: 0, col: 0, colour: 'c1', velocity: 9, timingBeats: 50 }]],
    });
    expect(cfg.loopSlots[0]?.[0]).toEqual({ row: 0, col: 0, colour: 'c1' });
  });
});

describe('a saved board is a stopped board (R2-T2-01)', () => {
  it('loads with no scene on now, whatever was saved: the next piece opens in its plan, not in a scene left marked', () => {
    const scene = (name: string, at: number) => ({
      id: name, name, loops: [], at,
      settings: { soundWorld: 'warm', band: 'off', phrases: false, fillAmount: 0, evolveAmount: 0, bpm: 90 },
    });
    const cfg = loadWith({ scenes: [scene('Arrival', 0), scene('Coda', 390)], currentScene: 1 });
    expect(cfg.scenes.map((s) => s.name)).toEqual(['Arrival', 'Coda']);
    expect(cfg.currentScene).toBeNull();
  });
});

describe('a piece saved before the 7:00 limit and "alone" scenes', () => {
  it('loads: its scenes as they were, a length over 7:00 as 7:00', () => {
    const scene = {
      id: 'p1-2', name: 'Open', loops: [], at: 210,
      settings: { soundWorld: 'warm', band: 'full', phrases: false, fillAmount: 0.4, evolveAmount: 0.5, bpm: 90 },
    };
    const cfg = loadWith({ scenes: [scene], performance: { lengthSec: 480, ending: 'cue', style: 'fade', fadePasses: 2, startOn: 'play' } });
    expect(cfg.performance.lengthSec).toBe(420);
    expect(cfg.performance).toMatchObject({ ending: 'cue', style: 'fade', fadePasses: 2 });
    // As they were: a scene saved before chord sequences, band jobs and Energy plays all three
    // as before (Energy off).
    expect(cfg.scenes).toEqual([{ ...scene, settings: { ...scene.settings, chords: { sequence: 'asBefore', bars: 2 }, bandJobs: { asBefore: true, pads: true, bass: true, drums: true, counter: false }, sceneEnergy: 0 } }]);
  });
});

describe('two lanes that would sit on top of each other', () => {
  it('turns the loop pads off, where the player can see it', () => {
    // Controls win, so an overlapping loop lane is dead pads that the board still draws
    // as pads. Saying "off" is honest; leaving it is a bank that silently doesn't work.
    const cfg = loadWith({
      rows: 4, cols: 4, controlZone: { mode: 'row', index: 3 }, loopZone: { mode: 'row', index: 3 },
    });
    expect(cfg.loopZone.mode).toBe('off');
    expect(cfg.loopBankEnabled).toBe(false);
  });

  it('leaves lanes that keep clear of one another alone', () => {
    const cfg = loadWith({
      rows: 4, cols: 4, controlZone: { mode: 'row', index: 0 }, loopZone: { mode: 'row', index: 3 },
    });
    expect(cfg.loopZone).toEqual({ mode: 'row', index: 3 });
    expect(cfg.loopBankEnabled).toBe(true);
  });
});

describe("the safe show layout for Tim's iPad", () => {
  const touch = { ...DEFAULT_REMOTE_TOUCH, actOn: 'lift' as const, confirmSec: 10, secondTapMinMs: 800, playExtras: ['stopAll' as const, 'capture' as const], playLoops: [0, 2], showNext: true };

  it('shows only the Extra notes strip, New idea and End piece, and locks Speed', () => {
    const l = safeShowLayout(touch);
    expect(l.remoteStrips).toEqual(['fill']);
    expect(l.remotePads).toEqual(['newIdea']);
    expect(l.remoteTouch.playExtras).toEqual(['endPiece']);
    expect(l.remoteLocked).toContain('tempo');
    expect(l.remoteLocked).not.toContain('fill');
  });

  it('hides Mute, the loop pads and pages, the scene pads, Next scene, Capture and Stop all', () => {
    const l = safeShowLayout(touch);
    expect(l.remotePads).not.toContain('mute');
    expect(l.remoteLoopsPage).toBe(false); // the Loops and Loops & scenes pages: loop pads, scene pads, Next, Capture, Stop all
    expect(l.remoteTouch.playLoops).toEqual([]);
    expect(l.remoteTouch.playExtras).not.toContain('nextScene');
    expect(l.remoteTouch.playExtras).not.toContain('capture');
    expect(l.remoteTouch.playExtras).not.toContain('stopAll');
    expect(l.remoteTouch.showNext).toBe(false);
  });

  it("keeps how the player's touch is read: act on lift, the second-tap window, the bounce guard", () => {
    const l = safeShowLayout(touch);
    expect(l.remoteTouch).toMatchObject({ actOn: 'lift', confirmSec: 10, secondTapMinMs: 800 });
  });

  it('is recognised, and anything added back on top of it is not', () => {
    const cfg = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...safeShowLayout(touch) };
    expect(isSafeShowLayout(cfg)).toBe(true);
    expect(isSafeShowLayout({ ...cfg, remotePads: ['newIdea', 'mute'] })).toBe(false);
    expect(isSafeShowLayout({ ...cfg, remoteLoopsPage: true })).toBe(false);
    expect(isSafeShowLayout({ ...cfg, remoteLocked: [] })).toBe(false);
    expect(isSafeShowLayout({ ...cfg, remoteTouch: { ...cfg.remoteTouch, playExtras: ['endPiece', 'stopAll'] } })).toBe(false);
  });

  it('is where a new player starts', () => {
    expect(isSafeShowLayout(DEFAULT_BOARD_SEQUENCER_CONFIG)).toBe(true);
  });

  it('leaves a player saved before it exactly as they were', () => {
    // Saved before the layout existed: everything shown, nothing locked.
    const old = loadWith({
      bpm: 96, remoteStrips: ['tempo', 'dynamics', 'fill', 'evolve'], remotePads: ['newIdea', 'newSound', 'keep', 'mute'],
      remoteLoopsPage: true, remoteLocked: [], remoteTouch: { actOn: 'touch', confirmSec: 6, playExtras: ['stopAll'], playLoops: [1], showNext: true },
    });
    expect(old.remoteStrips).toEqual(['tempo', 'dynamics', 'fill', 'evolve']);
    expect(old.remotePads).toEqual(['newIdea', 'newSound', 'keep', 'mute']);
    expect(old.remoteLoopsPage).toBe(true);
    expect(old.remoteLocked).toEqual([]);
    expect(old.remoteTouch).toEqual({ actOn: 'touch', confirmSec: 6, secondTapMinMs: 500, playExtras: ['stopAll'], playLoops: [1], showNext: true });
    // And one saved before the iPad settings existed at all.
    const older = loadWith({ bpm: 96 });
    expect(older.remotePads).toEqual(['newIdea', 'newSound', 'keep', 'mute']);
    expect(older.remoteLoopsPage).toBe(true);
    expect(isSafeShowLayout(older)).toBe(false);
  });
});

describe('BoardSequencerConfig — Fastest 240 for the hat', () => {
  beforeEach(() => localStorage.clear());

  it('a new player gets Speed from 60 to 240', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.controlRanges.tempo).toEqual({ min: 60, max: 240 });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90 }));
    expect(loadBoardSequencerConfig()!.controlRanges.tempo).toEqual({ min: 60, max: 240 });
  });

  it('a saved Fastest of exactly the old default 160 is raised to 240, once; any other is the player’s own and kept', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ controlRanges: { tempo: { min: 60, max: 160 } } }));
    const raised = loadBoardSequencerConfig()!;
    expect(raised.controlRanges.tempo).toEqual({ min: 60, max: 240 });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ controlRanges: { tempo: { min: 55, max: 150 } } }));
    expect(loadBoardSequencerConfig()!.controlRanges.tempo).toEqual({ min: 55, max: 150 });
    // Once only: a player who sets 160 again afterwards keeps it.
    saveBoardSequencerConfig({ ...raised, controlRanges: { ...raised.controlRanges, tempo: { min: 60, max: 160 } } });
    expect(loadBoardSequencerConfig()!.controlRanges.tempo).toEqual({ min: 60, max: 160 });
  });
});

describe('BoardSequencerConfig — when each colour comes in, and scenes that glide', () => {
  beforeEach(() => localStorage.clear());
  const melody = { id: 'c1', kind: 'hue', role: 'melody', swatch: '#e03030' };
  const bass = { id: 'c2', kind: 'hue', role: 'bass', swatch: '#3050e0' };

  it('none by default: every colour plays from the start', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.colourComesInAt).toEqual({});
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ version: 2, channels: [melody] }));
    expect(loadBoardSequencerConfig()!.colourComesInAt).toEqual({});
  });

  it('keeps each colour’s time; drops a colour that is gone and anything malformed', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      version: 2, channels: [melody, bass], colourComesInAt: { c1: 90, c2: 'soon', gone: 30 },
    }));
    expect(loadBoardSequencerConfig()!.colourComesInAt).toEqual({ c1: 90 });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ version: 2, channels: [melody], colourComesInAt: [5] }));
    expect(loadBoardSequencerConfig()!.colourComesInAt).toEqual({});
  });

  it('round-trips the times', () => {
    saveBoardSequencerConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG, channels: [melody, bass] as BoardSequencerStored['channels'], colourComesInAt: { c1: 90, c2: 150 },
    });
    expect(loadBoardSequencerConfig()!.colourComesInAt).toEqual({ c1: 90, c2: 150 });
  });

  it('a scene saved before glides loads as at once; a glide time in range is kept', () => {
    const scene = { id: 's1', name: 'Build', loops: [], settings: { bpm: 120 }, at: 90 };
    localStorage.setItem('admi-board-sequencer', JSON.stringify({
      scenes: [scene, { ...scene, id: 's2', glideSec: 8 }, { ...scene, id: 's3', glideSec: 600 }],
    }));
    const scenes = loadBoardSequencerConfig()!.scenes;
    expect('glideSec' in scenes[0]).toBe(false);
    expect(scenes[1].glideSec).toBe(8);
    expect('glideSec' in scenes[2]).toBe(false);
  });
});

describe('BoardSequencerConfig — keeping time (Sound → Advanced)', () => {
  beforeEach(() => localStorage.clear());

  it('a profile saved before it has the safe defaults: falling behind after 1 s lost, the clock after 1 s, the valve on', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.keepTimeBehindSec).toBe(1);
    expect(c.keepTimeDriftSec).toBe(1);
    expect(c.keepTimeValve).toBe(true);
  });

  it('round-trips the thresholds and the switch, and holds them inside their ranges', () => {
    saveBoardSequencerConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, keepTimeBehindSec: 2.5, keepTimeDriftSec: 4, keepTimeValve: false });
    expect(loadBoardSequencerConfig()).toMatchObject({ keepTimeBehindSec: 2.5, keepTimeDriftSec: 4, keepTimeValve: false });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ keepTimeBehindSec: 0, keepTimeDriftSec: 99, keepTimeValve: 'yes' }));
    expect(loadBoardSequencerConfig()).toMatchObject({ keepTimeBehindSec: 0.3, keepTimeDriftSec: 10, keepTimeValve: true });
  });
});

describe('BoardSequencerConfig — a band with jobs (stage 2)', () => {
  beforeEach(() => localStorage.clear());

  it('a new player: pads, bass and drums kept as jobs; keep my notes on top, 3 dB', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.bandJobs).toEqual({ asBefore: false, pads: true, bass: true, drums: true, counter: false });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.keepOnTop).toBe(true);
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.keepOnTopDb).toBe(3);
  });

  it('a player saved before jobs existed: the band as before; keep on top on (owner: on by default)', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8, band: 'full' }));
    const c = loadBoardSequencerConfig()!;
    expect(c.bandJobs).toEqual({ asBefore: true, pads: true, bass: true, drums: true, counter: false });
    expect(c.keepOnTop).toBe(true);
    expect(c.keepOnTopDb).toBe(3);
  });

  it('keeps what was chosen, and makes nonsense safe', () => {
    const jobs = { asBefore: false, pads: false, bass: true, drums: false, counter: true };
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8, bandJobs: jobs, keepOnTop: false, keepOnTopDb: 6 }));
    expect(loadBoardSequencerConfig()).toMatchObject({ bandJobs: jobs, keepOnTop: false, keepOnTopDb: 6 });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8, bandJobs: 'all', keepOnTopDb: 'loud' }));
    expect(loadBoardSequencerConfig()).toMatchObject({ bandJobs: { asBefore: true }, keepOnTop: true, keepOnTopDb: 3 });
  });
});

describe('named pieces (producer flow, item 3)', () => {
  it('a player saved before pieces existed gets one piece made from their scenes, and the working copy stays theirs', () => {
    const scene = { id: 's1', name: 'Arrival', loops: [0], settings: {}, at: 0 };
    const cfg = loadWith({ scenes: [scene], performance: { lengthSec: 300, ending: 'cue', style: 'fade', fadePasses: 2, startOn: 'play' } });
    expect(cfg.pieces.length).toBe(1);
    expect(cfg.pieceId).toBe(cfg.pieces[0].id);
    expect(cfg.pieces[0].name).toBe('Piece 1');
    expect(cfg.pieces[0].scenes.map((s) => s.name)).toEqual(['Arrival']);
    expect(cfg.pieces[0].performance.lengthSec).toBe(300);
    expect(cfg.scenes.map((s) => s.name)).toEqual(['Arrival']);
    expect(cfg.autoStart).toBe(false);
  });

  it('a saved list keeps every piece; the open one takes the working copy', () => {
    const cfg = loadWith({
      scenes: [], performance: { lengthSec: 120 },
      pieces: [{ id: 'x', name: 'Opening set', scenes: [{ id: 'q', name: 'Quiet', loops: [], settings: {}, at: 0 }], performance: { lengthSec: 240 } }, { id: 'y', name: 'Encore', scenes: [] }],
      pieceId: 'y', autoStart: true,
    });
    expect(cfg.pieces.map((p) => p.name)).toEqual(['Opening set', 'Encore']);
    expect(cfg.pieceId).toBe('y');
    expect(cfg.pieces[1].performance.lengthSec).toBe(120);
    expect(cfg.pieces[0].scenes.length).toBe(1);
    expect(cfg.autoStart).toBe(true);
  });
});
