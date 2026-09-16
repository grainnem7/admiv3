import { describe, it, expect } from 'vitest';
import { consensus, AGREE_COUNT } from '../tracking/boardDetect/consensus';
import type { BoardDetection } from '../tracking/boardDetect/detectBoard';

const CORNERS: BoardDetection['corners'] = [
  { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 },
];

const det = (over: Partial<BoardDetection> = {}): BoardDetection => ({
  status: 'high',
  corners: CORNERS,
  squares: 8,
  metrics: { coverage: 0.9, margin: 0.3, rms: 0.05, nodes: 81, ms: 12 },
  reasons: ['Found an 8 × 8 board.'],
  ...over,
});

/** The same board, every corner moved by `d` in frame fractions. */
const moved = (d: number): BoardDetection => det({
  corners: CORNERS.map((p) => ({ x: p.x + d, y: p.y })) as BoardDetection['corners'],
});

describe('consensus', () => {
  it('several frames agreeing is what makes a result trustworthy', () => {
    const out = consensus([det(), det(), det()]);
    expect(out.status).toBe('high');
    expect(out.squares).toBe(8);
  });

  it('one lucky frame is kept but not trusted', () => {
    const out = consensus([det(), moved(0.3), moved(0.6)]);
    expect(out.status).toBe('low');
    expect(out.corners).toBeDefined();
    expect(out.reasons[0]).toMatch(/not sure/i);
  });

  it('needs the full count, not one frame short', () => {
    const almost = Array.from({ length: AGREE_COUNT - 1 }, () => det());
    expect(consensus(almost).status).toBe('low');
    expect(consensus([...almost, det()]).status).toBe('high');
  });

  it('a small wobble between frames still counts as agreement', () => {
    // A fiftieth of the board is well inside a fifth of a square.
    const out = consensus([det(), moved(0.002), moved(-0.002)]);
    expect(out.status).toBe('high');
  });

  it('frames that disagree about the size never agree with each other', () => {
    const out = consensus([det(), det({ squares: 10 }), det({ squares: 10 })]);
    expect(out.status).toBe('low');
  });

  it('a board partly out of view is reported as such', () => {
    const partial = det({ status: 'partial', offscreenCorner: 2, reasons: ['…outside the camera picture.'] });
    const out = consensus([partial, det({ status: 'none', corners: undefined })]);
    expect(out.status).toBe('partial');
    expect(out.offscreenCorner).toBe(2);
  });

  it('nothing found at all stays nothing found', () => {
    const none = det({ status: 'none', corners: undefined, reasons: ['Couldn’t find the board.'] });
    expect(consensus([none, none]).status).toBe('none');
    expect(consensus([]).status).toBe('none');
  });
});
