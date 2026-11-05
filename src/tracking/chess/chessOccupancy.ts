/**
 * Reading a chess board from above: each square is empty, a white piece or a black piece.
 *
 * Pure: an RGBA frame and the board's four corners in, 64 square states out. The board
 * finder (boardDetect) gives the corners; this reads what stands on each square by its
 * brightness and colour. It learns the board from the start position: the empty middle,
 * white's two ranks and black's two ranks give it what an empty square, a white piece and
 * a black piece look like on light and on dark squares, and which way round the board is.
 */
import { applyHomography, computeHomography, UNIT_SQUARE, type Point } from '../../utils/homography';

export type SquareState = 'empty' | 'white' | 'black';
/** 64 squares, index = (rank - 1) * 8 + file: a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export type Occupancy = readonly SquareState[];
/** Which side of the picture White sits at. */
export type WhiteAt = 'bottom' | 'top' | 'left' | 'right';
/** The board's outer corners in the picture as fractions, top-left first, clockwise. */
export type BoardCorners = readonly [Point, Point, Point, Point];

export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const FILES = 'abcdefgh';
export const squareName = (i: number): string => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`;
export const squareIndex = (name: string): number => (Number(name[1]) - 1) * 8 + FILES.indexOf(name[0]);
/** a1 is a dark square. */
export const isDarkSquare = (i: number): boolean => ((i % 8) + Math.floor(i / 8)) % 2 === 0;

/** The start position's occupancy. */
export const START_OCCUPANCY: Occupancy = Array.from({ length: 64 }, (_, i) =>
  i < 16 ? 'white' : i >= 48 ? 'black' : 'empty');

/** The chess square under picture cell (row, col), row 0 at the top. */
export function squareAt(row: number, col: number, whiteAt: WhiteAt): number {
  let file: number; let rank: number; // 0-based
  switch (whiteAt) {
    case 'bottom': file = col; rank = 7 - row; break;
    case 'top': file = 7 - col; rank = row; break;
    case 'left': file = row; rank = col; break;
    case 'right': file = 7 - row; rank = 7 - col; break;
  }
  return rank * 8 + file;
}

/** Features of one picture cell: mean brightness, its spread, and two colour axes. */
export type Features = readonly [number, number, number, number];

/** How much of each square's middle is sampled (the edges catch the next square's piece). */
const INNER = 0.6;
const SAMPLES = 9;

/** The features of all 64 picture cells, row by row from the top-left. */
export function cellFeatures(frame: Frame, corners: BoardCorners): Features[] {
  const px = corners.map((p) => ({ x: p.x * frame.width, y: p.y * frame.height }));
  const h = computeHomography(UNIT_SQUARE, px);
  const out: Features[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      let n = 0; let sl = 0; let sll = 0; let s1 = 0; let s2 = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (col + 0.5 + INNER * ((sx + 0.5) / SAMPLES - 0.5)) / 8;
          const v = (row + 0.5 + INNER * ((sy + 0.5) / SAMPLES - 0.5)) / 8;
          const p = applyHomography(h, { x: u, y: v });
          const x = Math.round(p.x); const y = Math.round(p.y);
          if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
          const k = (y * frame.width + x) * 4;
          const r = frame.data[k]; const g = frame.data[k + 1]; const b = frame.data[k + 2];
          const l = (r + g + b) / 3;
          n++; sl += l; sll += l * l; s1 += r - b; s2 += (r + b) / 2 - g;
        }
      }
      const mean = n ? sl / n : 0;
      out.push([mean, n ? Math.sqrt(Math.max(0, sll / n - mean * mean)) : 0, n ? s1 / n : 0, n ? s2 / n : 0]);
    }
  }
  return out;
}

/** What the board looks like: a centre per state on light and on dark squares, and the spread. */
export interface BoardModel {
  whiteAt: WhiteAt;
  /** centres[dark ? 1 : 0][state] */
  centres: [Record<SquareState, Features>, Record<SquareState, Features>];
  scale: Features;
}

const STATES: readonly SquareState[] = ['empty', 'white', 'black'];
const ORIENTATIONS: readonly WhiteAt[] = ['bottom', 'top', 'left', 'right'];

function mean(fs: readonly Features[]): Features {
  const m = [0, 0, 0, 0];
  for (const f of fs) for (let d = 0; d < 4; d++) m[d] += f[d] / fs.length;
  return m as unknown as Features;
}

function fit(features: readonly Features[], whiteAt: WhiteAt, truth: Occupancy): { model: BoardModel; spread: number } {
  const groups: [Record<SquareState, Features[]>, Record<SquareState, Features[]>] = [
    { empty: [], white: [], black: [] }, { empty: [], white: [], black: [] },
  ];
  features.forEach((f, cell) => {
    const sq = squareAt(Math.floor(cell / 8), cell % 8, whiteAt);
    groups[isDarkSquare(sq) ? 1 : 0][truth[sq]].push(f);
  });
  const centres = groups.map((g) => Object.fromEntries(STATES.map((s) => [s, g[s].length ? mean(g[s]) : [0, 0, 0, 0]]))) as BoardModel['centres'];
  const sq = [0, 0, 0, 0]; let n = 0;
  groups.forEach((g, dark) => STATES.forEach((s) => g[s].forEach((f) => {
    for (let d = 0; d < 4; d++) sq[d] += (f[d] - centres[dark][s][d]) ** 2;
    n++;
  })));
  // The spread inside each state, per feature, with a floor so a flat feature can't dominate.
  const FLOOR = [4, 2, 3, 3];
  const scale = sq.map((v, d) => Math.max(FLOOR[d], Math.sqrt(v / Math.max(1, n)))) as unknown as Features;
  return { model: { whiteAt, centres, scale }, spread: sq.reduce((a, b) => a + b, 0) };
}

/**
 * Learn the board from a picture of the start position. Tries each way round; the one whose
 * groups are tightest wins, and White is the brighter side. Null when the picture doesn't
 * look like a start position (pieces not brighter on one side than the other).
 */
export function learnFromStart(features: readonly Features[], whiteAt?: WhiteAt): BoardModel | null {
  const tries = (whiteAt ? [whiteAt] : ORIENTATIONS).map((o) => fit(features, o, START_OCCUPANCY));
  tries.sort((a, b) => a.spread - b.spread);
  // 'bottom'/'top' (and 'left'/'right') group the squares the same way: White is the brighter.
  const best = tries[0].model;
  const brightness = (s: SquareState): number => (best.centres[0][s][0] + best.centres[1][s][0]) / 2;
  if (whiteAt) return best;
  if (brightness('white') >= brightness('black')) return best;
  const flipped: Record<WhiteAt, WhiteAt> = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
  return fit(features, flipped[best.whiteAt], START_OCCUPANCY).model;
}

/** Read each square with a learnt model: the nearest state among those for its square colour. */
export function readOccupancy(features: readonly Features[], model: BoardModel): SquareState[] {
  const out: SquareState[] = new Array<SquareState>(64).fill('empty');
  features.forEach((f, cell) => {
    const sq = squareAt(Math.floor(cell / 8), cell % 8, model.whiteAt);
    const centres = model.centres[isDarkSquare(sq) ? 1 : 0];
    let best: SquareState = 'empty'; let bestD = Infinity;
    for (const s of STATES) {
      let d = 0;
      for (let k = 0; k < 4; k++) d += ((f[k] - centres[s][k]) / model.scale[k]) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
    out[sq] = best;
  });
  return out;
}

/**
 * How slanted the camera is: the larger ratio of opposite sides of the board in the
 * picture (1 = straight above). Pieces lean away from a slanted camera and cover the
 * squares behind them, so past SLANT_LIMIT the screen asks for the camera to be moved.
 */
export function slantOf(corners: BoardCorners, width: number, height: number): number {
  const p = corners.map((c) => ({ x: c.x * width, y: c.y * height }));
  const len = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
  const top = len(p[0], p[1]); const right = len(p[1], p[2]); const bottom = len(p[2], p[3]); const left = len(p[3], p[0]);
  return Math.max(top / bottom, bottom / top, left / right, right / left);
}
export const SLANT_LIMIT = 1.25;

/** The occupancy as eight lines, rank 8 first, for tests and logs: W, B or a dot. */
export function occupancyText(o: Occupancy): string {
  const lines: string[] = [];
  for (let r = 7; r >= 0; r--) lines.push(o.slice(r * 8, r * 8 + 8).map((s) => (s === 'white' ? 'W' : s === 'black' ? 'B' : '.')).join(''));
  return lines.join('\n');
}

/** The inverse of occupancyText. */
export function occupancyFromText(text: string): SquareState[] {
  const lines = text.trim().split('\n').map((l) => l.trim());
  const out: SquareState[] = new Array<SquareState>(64).fill('empty');
  lines.forEach((line, i) => [...line].forEach((ch, f) => {
    out[(7 - i) * 8 + f] = ch === 'W' ? 'white' : ch === 'B' ? 'black' : 'empty';
  }));
  return out;
}
