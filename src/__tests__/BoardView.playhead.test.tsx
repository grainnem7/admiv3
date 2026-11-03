/**
 * B9 (audit 2026-10-30): the playhead and the tune bands were drawn before the squares, so
 * they showed only in the gaps (1.43:1 in dark, 1.15:1 in light). Now the squares' dots come
 * first; the tune bands and the playhead go on top of them, the playhead as a marker along
 * the top of its column, at least 3:1 against the column's tint in both modes (L3).
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
    it(`${mode}: the playhead is a marker drawn after every square's dot, at least 3:1 against the column's tint, at least 2 px tall`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      // The squares: a dot in the edge colour, one per square.
      const lastDot = ops.map((o, i) => (o.op === 'fill' && o.fillStyle === palette.borderControl ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      expect(lastDot).toBeGreaterThan(-1);
      // The column's tint comes before the dots, so they show on it.
      const tint = ops.findIndex((o) => o.op === 'fillRect' && o.fillStyle === palette.raised);
      expect(tint).toBeGreaterThan(-1);
      expect(tint).toBeLessThan(lastDot);
      const marker = ops.findIndex((o) => o.op === 'fillRect' && o.fillStyle === palette.fg);
      expect(marker).toBeGreaterThan(lastDot);
      const o = ops[marker];
      expect(contrastRatio(o.fillStyle, palette.raised)).toBeGreaterThanOrEqual(3);
      expect(o.alpha).toBe(1);
      expect(o.args[3]).toBeGreaterThanOrEqual(2);
    });

    it(`${mode}: the tune band is drawn after the squares' dots`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      const lastDot = ops.map((o, i) => (o.op === 'fill' && o.fillStyle === palette.borderControl ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      const band = ops.findIndex((o) => o.op === 'fillRect' && o.fillStyle === '#d03a2c');
      expect(band).toBeGreaterThan(lastDot);
    });
  }
});
