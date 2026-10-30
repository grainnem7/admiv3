/**
 * B9 (audit 2026-10-30): the playhead and the tune bands were drawn before the squares, so
 * they showed only in the gaps (1.43:1 in dark, 1.15:1 in light). Now the squares come
 * first; the tune bands and the playhead go on top of them, the playhead as an outline at
 * least 3:1 against the squares in both modes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { BoardView, type BoardViewFrame } from '../ui/screens/boardSequencer/components/BoardView';
import { BOARD_TOKENS, contrastRatio, type BoardMode } from '../ui/screens/boardSequencer/theme/boardTokens';

interface Op { op: string; fillStyle: string; strokeStyle: string; lineWidth: number; alpha: number; args: number[] }

/** A 2D context that records every drawing call with the style in force when it was made. */
function recordingContext(ops: Op[]): CanvasRenderingContext2D {
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1 };
  const rec = (op: string) => (...args: unknown[]): void => {
    ops.push({ op, fillStyle: String(state.fillStyle), strokeStyle: String(state.strokeStyle), lineWidth: state.lineWidth, alpha: state.globalAlpha, args: args.filter((a): a is number => typeof a === 'number') });
  };
  const noop = (): void => undefined;
  const ctx = {
    get fillStyle() { return state.fillStyle; }, set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; }, set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; }, set lineWidth(v: number) { state.lineWidth = v; },
    get globalAlpha() { return state.globalAlpha; }, set globalAlpha(v: number) { state.globalAlpha = v; },
    font: '', textAlign: 'center', textBaseline: 'middle',
    setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, closePath: noop,
    arc: noop, save: noop, restore: noop, clip: noop, setLineDash: noop,
    fill: rec('fill'), stroke: rec('stroke'), fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), fillText: rec('fillText'),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const emptyFrame = (): BoardViewFrame => ({ detected: new Map(), settled: new Map([['1,2', 'red']]), conditional: new Set() });

let ops: Op[];
let view: Rendered | null = null;
beforeEach(() => {
  ops = [];
  vi.stubGlobal('ResizeObserver', class { observe(): void { /* sized once below */ } disconnect(): void { /* nothing */ } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingContext(ops) as unknown as ReturnType<HTMLCanvasElement['getContext']>);
});
afterEach(() => { view?.unmount(); view = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function draw(mode: BoardMode): void {
  const palette = BOARD_TOKENS.calm[mode];
  view = render(
    <BoardView
      rows={4} cols={8} frame={emptyFrame()} pops={[]} playheadCol={3} playing pingPongDirection={0}
      swatchFor={() => '#d03a2c'} palette={palette}
      spans={[{ row: 1, col: 2, len: 3, colour: 'red' }]}
    />,
  );
}

describe('the playhead and the tune bands sit on top of the squares (B9)', () => {
  for (const mode of ['dark', 'light'] as BoardMode[]) {
    it(`${mode}: the playhead is an outline drawn after every square, at least 3:1 against them`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      // The squares: a fill in the raised colour, one per square.
      const lastSquare = ops.map((o, i) => (o.op === 'fill' && o.fillStyle === palette.raised ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      expect(lastSquare).toBeGreaterThan(-1);
      const outline = ops.findIndex((o) => o.op === 'strokeRect');
      expect(outline).toBeGreaterThan(lastSquare);
      const o = ops[outline];
      expect(contrastRatio(o.strokeStyle, palette.raised)).toBeGreaterThanOrEqual(3);
      expect(o.alpha).toBe(1);
      expect(o.lineWidth).toBeGreaterThanOrEqual(2);
    });

    it(`${mode}: the tune band is drawn after the squares`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      const lastSquare = ops.map((o, i) => (o.op === 'fill' && o.fillStyle === palette.raised ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      const band = ops.findIndex((o) => o.op === 'fillRect' && o.fillStyle === '#d03a2c');
      expect(band).toBeGreaterThan(lastSquare);
    });
  }
});

describe('empty squares have an edge you can see (A4)', () => {
  for (const mode of ['dark', 'light'] as BoardMode[]) {
    it(`${mode}: each square is outlined in the control edge colour, at least 3:1 against the page`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      const squares = ops.filter((o) => o.op === 'fill' && o.fillStyle === palette.raised).length;
      expect(squares).toBeGreaterThanOrEqual(32);
      const edges = ops.filter((o) => o.op === 'stroke' && o.strokeStyle === palette.borderControl && o.lineWidth >= 1);
      expect(edges.length).toBeGreaterThanOrEqual(32);
      expect(contrastRatio(palette.borderControl, palette.bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.borderControl, palette.raised)).toBeGreaterThanOrEqual(3);
    });
  }
});
