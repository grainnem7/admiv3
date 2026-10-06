import { describe, it, expect } from 'vitest';
import {
  drawOriented, displayedToRaw, orientedSize, quarterTurns, rawToDisplayed, reorientPoints,
  type FrameOrientation, type QuarterTurns,
} from '../tracking/frameOrientation';

/** A 2D context that only tracks its transform, and records it at drawImage. */
function fakeCtx() {
  // [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
  let m = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const mul = (n: number[]): void => {
    const [a, b, c, d, e, f] = m;
    m = [
      a * n[0] + c * n[1], b * n[0] + d * n[1],
      a * n[2] + c * n[3], b * n[2] + d * n[3],
      a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f,
    ];
  };
  const drawn: { m: number[]; w: number; h: number }[] = [];
  const ctx = {
    save: () => { stack.push([...m]); },
    restore: () => { m = stack.pop() ?? [1, 0, 0, 1, 0, 0]; },
    translate: (x: number, y: number) => mul([1, 0, 0, 1, x, y]),
    scale: (x: number, y: number) => mul([x, 0, 0, y, 0, 0]),
    rotate: (t: number) => mul([Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]),
    drawImage: (_s: unknown, _x: number, _y: number, w: number, h: number) => { drawn.push({ m: [...m], w, h }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

const ALL: FrameOrientation[] = [];
for (const rotation of [0, 1, 2, 3] as QuarterTurns[]) {
  for (const mirrorX of [false, true]) for (const mirrorY of [false, true]) ALL.push({ rotation, mirrorX, mirrorY });
}
const label = (o: FrameOrientation): string => `turn ${o.rotation}, mirrorX ${o.mirrorX}, mirrorY ${o.mirrorY}`;

describe('frame orientation', () => {
  it('a quarter turn swaps width and height', () => {
    expect(orientedSize(1280, 720, 1)).toEqual({ width: 720, height: 1280 });
    expect(orientedSize(1280, 720, 2)).toEqual({ width: 1280, height: 720 });
  });

  it('one clockwise turn takes the top-left corner to the top-right', () => {
    expect(rawToDisplayed({ x: 0, y: 0 }, { mirrorX: false, mirrorY: false, rotation: 1 })).toEqual({ x: 1, y: 0 });
  });

  it('normalises stored turns', () => {
    expect(quarterTurns(5)).toBe(1);
    expect(quarterTurns(-1)).toBe(3);
    expect(quarterTurns('x')).toBe(0);
  });

  for (const o of ALL) {
    it(`the pixels drawn and a tap agree (${label(o)})`, () => {
      // The whole point: drawOriented puts raw pixel P at the displayed spot that
      // rawToDisplayed says P is at, so a tap there reads P.
      const raw = { w: 1280, h: 720 };
      const out = orientedSize(raw.w, raw.h, o.rotation);
      const { ctx, drawn } = fakeCtx();
      drawOriented(ctx, {} as CanvasImageSource, out.width, out.height, o);
      const { m, w, h } = drawn[0];
      expect({ w, h }).toEqual(raw);
      for (const p of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.25, y: 0.8 }]) {
        const px = p.x * w;
        const py = p.y * h;
        const got = { x: (m[0] * px + m[2] * py + m[4]) / out.width, y: (m[1] * px + m[3] * py + m[5]) / out.height };
        const want = rawToDisplayed(p, o);
        expect(got.x).toBeCloseTo(want.x, 9);
        expect(got.y).toBeCloseTo(want.y, 9);
      }
    });

    it(`displayed → raw → displayed is exact (${label(o)})`, () => {
      const p = { x: 0.3, y: 0.7 };
      const back = rawToDisplayed(displayedToRaw(p, o), o);
      expect(back.x).toBeCloseTo(p.x, 12);
      expect(back.y).toBeCloseTo(p.y, 12);
    });
  }

  it('turning the picture keeps the corners on the same physical spot', () => {
    const before: FrameOrientation = { mirrorX: true, mirrorY: false, rotation: 0 };
    const after: FrameOrientation = { ...before, rotation: 1 };
    const corners = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.15 }, { x: 0.85, y: 0.9 }, { x: 0.1, y: 0.85 }];
    const turned = reorientPoints(corners, before, after);
    for (let i = 0; i < 4; i++) {
      const a = displayedToRaw(corners[i], before);
      const b = displayedToRaw(turned[i], after);
      expect(b.x).toBeCloseTo(a.x, 12);
      expect(b.y).toBeCloseTo(a.y, 12);
    }
  });
});
