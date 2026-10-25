/**
 * What the reader needs to find counters against the learnt board, from the saved
 * settings — and, when it can't, why not, in words a facilitator can act on.
 */
import type { ColourChannel, ColourId } from '../boardColours';
import {
  hexToRgb, loadBoardReference, orientReference, type BoardReference, type CounterPrototype, type StoredBoardReference,
} from './boardReference';
import type { Point } from '../../utils/homography';

export interface DetectionSettings {
  counterDetection: 'board' | 'bands';
  boardReference: StoredBoardReference | null;
  boardSquares: number;
  channels: readonly ColourChannel[];
  /** The corners now: a board turned or flipped since it was learnt is read the same way round. */
  corners?: readonly Point[];
}

export interface DetectionSetup {
  /** What the reader will actually do. */
  mode: 'board' | 'bands';
  reference: BoardReference | null;
  prototypes: CounterPrototype[];
  /** The black and white colours, which a vivid counter's rim must not out-vote. */
  achromatic: Set<ColourId>;
  /** Why it is using the colour ranges, when 'board' was asked for. */
  reason: string | null;
}

let cache: { stored: StoredBoardReference; corners: readonly Point[] | undefined; loaded: BoardReference | null } | null = null;

/** Decoding the stored board is not free: once per learnt board and corners, not once per frame. */
function load(stored: StoredBoardReference, corners: readonly Point[] | undefined): BoardReference | null {
  if (cache && cache.stored === stored && cache.corners === corners) return cache.loaded;
  const raw = loadBoardReference(stored);
  const loaded = raw && corners ? orientReference(raw, stored.corners, corners) : raw;
  cache = { stored, corners, loaded };
  return loaded;
}

export function detectionSetup(s: DetectionSettings): DetectionSetup {
  const achromatic = new Set(s.channels.filter((c) => c.kind !== 'hue').map((c) => c.id));
  const prototypes: CounterPrototype[] = [];
  for (const c of s.channels) {
    if (c.role === 'off') continue;
    const rgb = hexToRgb(c.swatch);
    if (rgb) prototypes.push({ id: c.id, rgb });
  }
  const bands = (reason: string | null): DetectionSetup => ({ mode: 'bands', reference: null, prototypes, achromatic, reason });
  if (s.counterDetection === 'bands') return bands(null);
  if (!s.boardReference) return bands('Learn the board (Set up → Board, with the board empty) to find counters against it.');
  const reference = load(s.boardReference, s.corners);
  if (!reference) return bands('The learnt board could not be read. Learn the board again.');
  if (reference.squares !== s.boardSquares) return bands('The board size has changed since it was learnt. Learn the board again.');
  if (prototypes.length === 0) return bands('No counter colour has a job yet.');
  return { mode: 'board', reference, prototypes, achromatic, reason: null };
}
