import { describe, it, expect } from 'vitest';
import { estimateBoardShift, shiftCorners, type TrackOptions } from '../tracking/handGuard/boardTrack';
import { buildWatchGrid, initialWatchState, stepWatcher, STILL_FRAMES_NEEDED } from '../tracking/handGuard/intruderMask';
import { computeHomography, UNIT_SQUARE } from '../utils/homography';
import { scene, sceneCorners, arm } from './helpers/syntheticBoard';
import type { Corners } from '../tracking/boardDetect/orientation';

const ROWS = 4;
const COLS = 4;
const SQUARES = 8;
const FRAME = { width: 80, height: 60, downscale: 1 };
const BOX = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

const opts: TrackOptions = { maxShiftSquares: 0.6, minImprovement: 0.15 };

const homography = () => computeHomography(UNIT_SQUARE, sceneCorners());

/** Learn the empty board, exactly as the watcher does at Play. */
function learntBackground() {
  const grid = buildWatchGrid(homography(), FRAME, ROWS, COLS, SQUARES);
  let state = initialWatchState();
  const empty = scene();
  for (let i = 0; i <= STILL_FRAMES_NEEDED + 1; i++) {
    state = stepWatcher(state, grid, empty.data, i * 33, {
      sensitivity: 18, marginSquares: 0.75, releaseMs: 250, restNudgeMs: 4000, dtMs: 33,
    }).state;
  }
  return { grid, bg: state.bg! };
}

/** The same board, shifted by `du` of the board width. */
const shifted = (du: number, dv = 0) => scene({
  boardBox: { ...BOX, x: BOX.x + du * BOX.w, y: BOX.y + dv * BOX.h },
});

describe('estimateBoardShift', () => {
  it('finds a nudge and points the right way', () => {
    const { grid, bg } = learntBackground();
    // A third of a square to the right (the board is 8 squares across).
    const du = 0.33 / SQUARES;
    const out = estimateBoardShift(grid, bg, shifted(du).data, homography(), FRAME, opts);
    expect(out.improved).toBe(true);
    expect(out.dx).toBeGreaterThan(0);
    expect(out.dx).toBeCloseTo(du, 1);
    expect(out.after).toBeLessThan(out.before);
  });

  it('a still board gets no correction, so nothing drifts', () => {
    const { grid, bg } = learntBackground();
    const out = estimateBoardShift(grid, bg, scene().data, homography(), FRAME, opts);
    expect(out.improved).toBe(false);
    expect(out).toMatchObject({ dx: 0, dy: 0, scale: 1 });
  });

  it('refuses a move bigger than the limit, leaving it to the hint', () => {
    const { grid, bg } = learntBackground();
    const out = estimateBoardShift(grid, bg, shifted(3 / SQUARES).data, homography(), FRAME, opts);
    expect(out.improved).toBe(false);
  });

  it('is not fooled into a correction by a hand over the board', () => {
    const { grid, bg } = learntBackground();
    const out = estimateBoardShift(
      grid, bg, scene({ shapes: [arm(0.35, 0.6)] }).data, homography(), FRAME, opts,
    );
    // Either it finds nothing, or what it finds is tiny — never a real move.
    expect(Math.abs(out.dx)).toBeLessThan(0.2 / SQUARES);
    expect(Math.abs(out.dy)).toBeLessThan(0.2 / SQUARES);
  });

  it('does not accumulate drift when run repeatedly on a still board', () => {
    const { grid, bg } = learntBackground();
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const out = estimateBoardShift(grid, bg, scene().data, homography(), FRAME, opts);
      total += Math.abs(out.dx) + Math.abs(out.dy);
    }
    expect(total).toBeLessThan(0.1 / SQUARES);
  });
});

describe('shiftCorners', () => {
  const square: Corners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

  it('no shift and no scale leaves the corners where they are', () => {
    const same = shiftCorners(square, 0, 0, 1);
    for (let i = 0; i < 4; i++) {
      expect(same[i].x).toBeCloseTo(square[i].x, 12);
      expect(same[i].y).toBeCloseTo(square[i].y, 12);
    }
  });

  it('moves along the board’s own axes', () => {
    const moved = shiftCorners(square, 0.1, 0, 1);
    for (let i = 0; i < 4; i++) {
      expect(moved[i].x).toBeCloseTo(square[i].x + 0.08, 10);   // 0.1 of a 0.8-wide board
      expect(moved[i].y).toBeCloseTo(square[i].y, 10);
    }
  });

  it('composes: two shifts equal their sum', () => {
    const twice = shiftCorners(shiftCorners(square, 0.05, 0.02, 1), 0.05, 0.02, 1);
    const once = shiftCorners(square, 0.1, 0.04, 1);
    for (let i = 0; i < 4; i++) {
      expect(twice[i].x).toBeCloseTo(once[i].x, 10);
      expect(twice[i].y).toBeCloseTo(once[i].y, 10);
    }
  });

  it('scale grows the board about its own centre', () => {
    const bigger = shiftCorners(square, 0, 0, 1.1);
    expect(bigger[0].x).toBeCloseTo(0.5 - 0.4 * 1.1, 10);
    expect(bigger[2].x).toBeCloseTo(0.5 + 0.4 * 1.1, 10);
  });
});
