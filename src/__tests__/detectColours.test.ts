import { describe, it, expect } from 'vitest';
import { warpToBoard, buildSquareModel, modelHsv } from '../tracking/boardColourDetect/squareModel';
import { detectColours, fitSafeBand, MAX_BOARD_MATCH } from '../tracking/boardColourDetect/detectColours';
import { computeHomography, UNIT_SQUARE } from '../utils/homography';
import { buildChannelMatcher, calibrationFromHsv } from '../tracking/boardColours';
import { rgbToHsv } from '../tracking/ColorTracker';
import { scene, sceneCorners, counter, BOARD_RGB } from './helpers/syntheticBoard';

const SQUARES = 8;
const BOX = { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
const opts = (shapes: ReturnType<typeof counter>[] = []) =>
  ({ width: 320, height: 240, boardBox: BOX, squares: SQUARES, shapes });

const warped = (shapes: ReturnType<typeof counter>[] = []) => {
  const frame = scene(opts(shapes));
  const h = computeHomography(UNIT_SQUARE, sceneCorners(opts()));
  return warpToBoard(frame.data, frame.width, frame.height, h, SQUARES);
};

const modelOf = (shapes: ReturnType<typeof counter>[] = []) => {
  const result = buildSquareModel(warped(shapes));
  if (!result.ok) throw new Error(result.reason);
  return result.model;
};

describe('buildSquareModel', () => {
  it('learns the board’s two families of square', () => {
    const model = modelOf();
    const lightGrey = (model.light.r + model.light.g + model.light.b) / 3;
    const darkGrey = (model.dark.r + model.dark.g + model.dark.b) / 3;
    expect(lightGrey).toBeGreaterThan(darkGrey + 20);
    expect(model.squares).toBe(SQUARES);
  });

  it('a few counters do not spoil it', () => {
    const model = modelOf([counter(2.5 / 8, 2.5 / 8, 0.09), counter(5.5 / 8, 5.5 / 8, 0.09)]);
    expect((model.light.r + model.light.g + model.light.b) / 3)
      .toBeGreaterThan((model.dark.r + model.dark.g + model.dark.b) / 3);
  });

  it('says so when there is no board left to learn from', () => {
    const covered = warped([{ x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1, rgb: [220, 40, 40] }]);
    const result = buildSquareModel(covered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('board-too-covered');
  });
});

describe('detectColours', () => {
  it('finds the counters that are on the board', () => {
    const shapes = [counter(1.5 / 8, 1.5 / 8, 0.09), counter(4.5 / 8, 4.5 / 8, 0.09)];
    const out = detectColours(warped(shapes), modelOf(shapes));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.colours.length).toBeGreaterThanOrEqual(1);
    expect(out.colours[0].counters).toBeGreaterThanOrEqual(1);
    // The red counters come back as a red swatch.
    const hsv = out.colours[0].hsv;
    expect(hsv.h < 20 || hsv.h > 340).toBe(true);
  });

  it('merges counters of the same colour into one card, and can be told not to', () => {
    const shapes = [counter(1.5 / 8, 1.5 / 8, 0.09), counter(4.5 / 8, 4.5 / 8, 0.09), counter(6.5 / 8, 2.5 / 8, 0.09)];
    const merged = detectColours(warped(shapes), modelOf(shapes));
    const each = detectColours(warped(shapes), modelOf(shapes), { oneEach: true });
    if (!merged.ok || !each.ok) throw new Error('expected detections');
    expect(merged.colours).toHaveLength(1);
    expect(merged.colours[0].counters).toBeGreaterThanOrEqual(3);
    expect(each.colours.length).toBeGreaterThan(merged.colours.length);
  });

  it('says when there is nothing on the board', () => {
    const out = detectColours(warped(), modelOf());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('nothing-found');
  });

  it('the bands it offers do not light the board itself', () => {
    const shapes = [counter(2.5 / 8, 2.5 / 8, 0.09), counter(5.5 / 8, 5.5 / 8, 0.09)];
    const model = modelOf(shapes);
    const out = detectColours(warped(shapes), model);
    if (!out.ok) throw new Error('expected a detection');
    for (const colour of out.colours) {
      if (colour.unsafe) continue;
      expect(colour.boardMatch).toBeLessThanOrEqual(MAX_BOARD_MATCH);
    }
  });
});

describe('fitSafeBand', () => {
  const boardColours = () => modelHsv(modelOf());

  it('tightens a band that matches the board until it stops', () => {
    // A colour very close to the board's own light squares.
    const boardish = rgbToHsv(BOARD_RGB[0], BOARD_RGB[1], BOARD_RGB[2]);
    const naive = calibrationFromHsv(boardish);
    const naiveMatcher = buildChannelMatcher({
      id: 'x', kind: naive.kind, role: 'off', swatch: '#000',
      band: naive.band, blackBand: naive.blackBand, whiteBand: naive.whiteBand,
    });
    const before = boardColours().filter((c) => naiveMatcher.test(c)).length;
    expect(before).toBeGreaterThan(0);          // the naive band really does light the board

    const fitted = fitSafeBand(boardish, boardColours());
    // Either it was tightened until it is safe, or it is reported as unsafe — never
    // quietly handed over as if it were fine.
    expect(fitted.unsafe || fitted.boardMatch <= MAX_BOARD_MATCH).toBe(true);
  });

  it('leaves a colour nothing like the board alone', () => {
    const vivid = rgbToHsv(40, 90, 230);        // a strong blue
    const fitted = fitSafeBand(vivid, boardColours());
    expect(fitted.unsafe).toBe(false);
    expect(fitted.boardMatch).toBe(0);
  });

  it('with no board to check against, it flags the colour rather than blessing it', () => {
    // This check exists to stop the board's own colour being offered as a playing
    // counter. With no board model there is no evidence either way, and "no evidence"
    // must not read as "safe" — that is the one failure this function exists to prevent.
    // Flagged still means proposed, just switched off until the player says otherwise.
    const fitted = fitSafeBand(rgbToHsv(200, 40, 40), []);
    expect(fitted.boardMatch).toBe(1);
    expect(fitted.unsafe).toBe(true);
  });
});
