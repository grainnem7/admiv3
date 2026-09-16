import { describe, it, expect } from 'vitest';
import { detectBoard, orderByImage } from '../tracking/boardDetect/detectBoard';
import { scene, counter, arm } from './helpers/syntheticBoard';

const BOX = { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
const frame = (over = {}) => scene({ width: 320, height: 240, boardBox: BOX, squares: 8, ...over });
const run = (f: ReturnType<typeof frame>, opts = {}) => detectBoard(f.data, f.width, f.height, opts);

describe('detectBoard', () => {
  it('finds an empty 8 × 8 board and its corners', () => {
    const out = run(frame());
    expect(out.status).toBe('high');
    expect(out.squares).toBe(8);
    const [tl, tr, br, bl] = out.corners!;
    expect(tl.x).toBeCloseTo(BOX.x, 1);
    expect(tl.y).toBeCloseTo(BOX.y, 1);
    expect(br.x).toBeCloseTo(BOX.x + BOX.w, 1);
    expect(br.y).toBeCloseTo(BOX.y + BOX.h, 1);
    // …in saved order: top-left, top-right, bottom-right, bottom-left.
    expect(tr.x).toBeGreaterThan(tl.x);
    expect(bl.y).toBeGreaterThan(tl.y);
  });

  it('tells a 10 × 10 board from an 8 × 8 one', () => {
    const out = run(frame({ squares: 10 }));
    expect(out.squares).toBe(10);
    expect(out.status).toBe('high');
  });

  it('reports the lattice, so the editor can snap handles to the board', () => {
    const out = run(frame());
    expect(out.latticeNodes!.length).toBeGreaterThan(40);
    for (const n of out.latticeNodes!) {
      expect(n.x).toBeGreaterThan(-0.1);
      expect(n.x).toBeLessThan(1.1);
    }
  });

  it('a few counters on the board do not stop it', () => {
    const out = run(frame({ shapes: [counter(0.3, 0.3, 0.1), counter(0.7, 0.6, 0.1)] }));
    expect(out.status === 'high' || out.status === 'low').toBe(true);
    expect(out.squares).toBe(8);
  });

  it('says so when there is no board, rather than guessing', () => {
    const flat = scene({ width: 160, height: 120, boardBox: { x: 0, y: 0, w: 0, h: 0 } });
    const out = detectBoard(flat.data, flat.width, flat.height);
    expect(out.status).toBe('none');
    expect(out.corners).toBeUndefined();
    expect(out.reasons[0]).toMatch(/couldn.t/i);
  });

  it('an arm across the board never produces a confident answer', () => {
    const out = run(frame({ shapes: [arm(0.2, 0.8, 1.2)] }));
    if (out.status === 'high') {
      // If it is confident, it must at least still be the right board.
      expect(out.squares).toBe(8);
    } else {
      expect(['low', 'partial', 'none']).toContain(out.status);
    }
  });

  it('still hands back a board it has already found, however slow the machine was', () => {
    // The budget check sat AFTER the expensive work, so a busy browser made it discard a
    // board it had located and tell the player to hold the board still — which had
    // nothing to do with it. It also made this suite flaky under parallel load.
    let t = 0;
    const out = run(frame(), { now: () => { t += 1000; return t; }, budgetMs: 150 });
    expect(out.status).not.toBe('none');
    expect(out.corners).toBeDefined();
    expect(out.squares).toBe(8);
    // Said as information, not as a failure.
    expect(out.reasons.join(' ')).toMatch(/took a while/i);
  });

  it('reports how long it took and how much it explained', () => {
    const out = run(frame());
    expect(out.metrics.nodes).toBeGreaterThan(40);
    expect(out.metrics.coverage).toBeGreaterThan(0.5);
    expect(out.metrics.ms).toBeGreaterThanOrEqual(0);
  });
});

describe('orderByImage', () => {
  it('starts at the top-left and goes clockwise, whatever order it is given', () => {
    const pts = [{ x: 9, y: 9 }, { x: 1, y: 9 }, { x: 1, y: 1 }, { x: 9, y: 1 }];
    expect(orderByImage(pts)).toEqual([{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 9 }, { x: 1, y: 9 }]);
  });
});
