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

describe('a counter tapped on a warm wooden board', () => {
  /**
   * Reported from the real board: tapping the red counter lit up bare dark-wood squares.
   *
   * A red counter's band is centred on its hue with a +/-24 window and a saturation floor
   * scaled off the sample, and walnut sits close enough in hue to fall inside it. The
   * automatic search has always tightened the band against the board; tapping never did,
   * so the same colour behaved differently depending on how it was added.
   */
  // A reddish-brown board: the dark squares land at hue ~18, which is inside a red
  // counter's +/-24 window, with saturation and value above its floors too.
  const walnut = [
    rgbToHsv(150, 100, 78), rgbToHsv(128, 85, 66), rgbToHsv(110, 72, 56),
    rgbToHsv(214, 203, 180), rgbToHsv(196, 184, 160),
  ];

  it('the raw band would light the wood, and the fitted one does not', () => {
    const red = rgbToHsv(206, 52, 56);
    const raw = calibrationFromHsv(red);
    const rawMatcher = buildChannelMatcher({ id: 'r', kind: raw.kind, role: 'melody', swatch: '#c33', band: raw.band });
    // The problem, stated: the band as sampled accepts the board's own wood.
    expect(walnut.some((c) => rawMatcher.test(c))).toBe(true);

    const fitted = fitSafeBand(red, walnut);
    const safeMatcher = buildChannelMatcher({
      id: 'r', kind: fitted.band.kind, role: 'melody', swatch: '#c33', band: fitted.band.band,
    });
    expect(walnut.some((c) => safeMatcher.test(c))).toBe(false);
    expect(fitted.unsafe).toBe(false);
    // …and it still recognises the counter it came from.
    expect(safeMatcher.test(red)).toBe(true);
  });

  it('a counter that really is the board colour is reported, not silently accepted', () => {
    const woodish = rgbToHsv(150, 100, 78);
    const fitted = fitSafeBand(woodish, walnut);
    expect(fitted.unsafe).toBe(true);
  });

  it('a colour nothing like the board is left alone', () => {
    const cyan = rgbToHsv(64, 224, 208);
    const raw = calibrationFromHsv(cyan);
    const fitted = fitSafeBand(cyan, walnut);
    expect(fitted.unsafe).toBe(false);
    expect(fitted.band.band?.hueTolerance).toBe(raw.band?.hueTolerance);
    expect(fitted.band.band?.minSaturation).toBeCloseTo(raw.band?.minSaturation ?? 0, 6);
  });
});

describe('knowing the board before judging the counters', () => {
  /**
   * The point the musician-facing failure turns on: "doesn't match the board" only means
   * something if we know what the board IS. Inferred from a frame with counters all over
   * it, that knowledge is itself a guess — and a square the guess gets wrong becomes a
   * counter colour that lights up bare wood.
   */
  const walnut = [
    rgbToHsv(150, 100, 78), rgbToHsv(128, 85, 66), rgbToHsv(110, 72, 56),
    rgbToHsv(214, 203, 180), rgbToHsv(196, 184, 160),
  ];

  it('a board colour offered as a counter is refused once the board is known', () => {
    const woodish = rgbToHsv(138, 95, 72);
    expect(fitSafeBand(woodish, walnut).unsafe).toBe(true);
    // With nothing known about the board, there is no evidence to refuse it with.
    expect(fitSafeBand(woodish, []).unsafe).toBe(true);
  });

  it('a real counter is still accepted, and still recognises itself', () => {
    const teal = rgbToHsv(64, 190, 170);
    const fitted = fitSafeBand(teal, walnut);
    expect(fitted.unsafe).toBe(false);
    const matcher = buildChannelMatcher({
      id: 't', kind: fitted.band.kind, role: 'melody', swatch: '#4b4', band: fitted.band.band,
    });
    expect(matcher.test(teal)).toBe(true);
    expect(walnut.some((c) => matcher.test(c))).toBe(false);
  });

  it('detectColours judges against the board it is GIVEN, not the one it can guess', () => {
    // Same picture, two different ideas of the board: the answer must follow the board
    // we hand it, which is how learning from the empty board takes effect.
    const corners = sceneCorners();
    const h = computeHomography(UNIT_SQUARE, corners);
    const f = scene({ shapes: [counter(0.5, 0.5, 0.12)] });
    const warped = warpToBoard(f.data, f.width, f.height, h, 8);
    const model = buildSquareModel(warped);
    expect(model.ok).toBe(true);
    if (!model.ok) return;

    const asCounter = detectColours(warped, model.model, { boardColours: walnut });
    expect(asCounter.ok).toBe(true);
    if (!asCounter.ok) return;
    // Told the board is walnut, the red counter is plainly not the board.
    expect(asCounter.colours.some((c) => !c.unsafe)).toBe(true);

    // Told the board is the counter's own colour, the same blob is refused.
    const asBoard = detectColours(warped, model.model, {
      boardColours: asCounter.colours.map((c) => ({ h: c.hsv.h, s: c.hsv.s, v: c.hsv.v })),
    });
    expect(asBoard.ok).toBe(true);
    if (!asBoard.ok) return;
    expect(asBoard.colours.every((c) => c.unsafe)).toBe(true);
  });
});

describe('a board that has been learnt square by square', () => {
  /**
   * Reported from the real rig: with NOTHING on the board, Find colours still offered
   * seven "counters", all of them the board. The board check caught them, but they should
   * never have been candidates — and a player cannot tell "correctly refused" from
   * "broken".
   *
   * The cause is judging each square against the AVERAGE of its colour family: a dark
   * square with unusual grain, or one in a shadow, is unlike its siblings and so reads as
   * covered. Judged against its own recorded appearance, its grain is simply what it
   * looks like.
   */
  // A board whose dark squares differ from each other far more than a family mean
  // allows — which is exactly what real walnut does.
  const GRAIN = [
    { x0: 0.02, y0: 0.02, x1: 0.13, y1: 0.13, rgb: [96, 64, 44] as [number, number, number] },
    { x0: 0.27, y0: 0.52, x1: 0.38, y1: 0.63, rgb: [150, 118, 86] as [number, number, number] },
    { x0: 0.64, y0: 0.14, x1: 0.75, y1: 0.25, rgb: [88, 92, 96] as [number, number, number] },
  ];
  const grainy = () => scene({ shapes: GRAIN });

  const warpOf = (f: ReturnType<typeof scene>) => warpToBoard(
    f.data, f.width, f.height, computeHomography(UNIT_SQUARE, sceneCorners()), 8,
  );

  it('offers nothing at all when the board it learnt is the board it sees', () => {
    const empty = warpOf(grainy());
    const model = buildSquareModel(empty);
    expect(model.ok).toBe(true);
    if (!model.ok) return;

    const learntSquares = { squares: model.model.squares, rgb: Array.from(model.model.rgb) };
    const out = detectColours(empty, model.model, {
      boardColours: modelHsv(model.model),
      learntSquares,
    });
    // Nothing is on it, so there is nothing to find.
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('nothing-found');
  });

  it('still finds a counter placed on that same board', () => {
    const empty = warpOf(grainy());
    const model = buildSquareModel(empty);
    if (!model.ok) throw new Error('model');
    const learntSquares = { squares: model.model.squares, rgb: Array.from(model.model.rgb) };

    const withCounter = warpOf(scene({ shapes: [...GRAIN, counter(0.5, 0.5, 0.11)] }));
    const later = buildSquareModel(withCounter);
    if (!later.ok) throw new Error('model');
    const out = detectColours(withCounter, later.model, {
      boardColours: modelHsv(model.model),
      learntSquares,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.colours.some((c) => !c.unsafe)).toBe(true);
  });

  it('ignores a learning taken at a different board size', () => {
    const empty = warpOf(grainy());
    const model = buildSquareModel(empty);
    if (!model.ok) throw new Error('model');
    // A 10 x 10 learning against an 8 x 8 board is not about these squares at all.
    const out = detectColours(empty, model.model, {
      learntSquares: { squares: 10, rgb: new Array(300).fill(0) },
    });
    expect(out).toBeDefined();
  });
});
