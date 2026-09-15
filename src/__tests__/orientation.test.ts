import { describe, it, expect } from 'vitest';
import { rotateCorners, flipCorners, type Corners } from '../tracking/boardDetect/orientation';

const c: Corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe('orientation', () => {
  it('Turn moves the start to the next edge: [c3, c0, c1, c2]', () => {
    expect(rotateCorners(c, 1)).toEqual([c[3], c[0], c[1], c[2]]);
  });
  it('four turns is the identity, negative turns go backwards', () => {
    expect(rotateCorners(c, 4)).toEqual(c);
    expect(rotateCorners(rotateCorners(c, 1), -1)).toEqual(c);
  });
  it('Flip swaps start and end and keeps the low side: [c1, c0, c3, c2]', () => {
    expect(flipCorners(c)).toEqual([c[1], c[0], c[3], c[2]]);
    expect(flipCorners(flipCorners(c))).toEqual(c);
  });
});
