/**
 * Named pieces (producer flow, item 3). A player keeps several pieces: each is its scenes,
 * its length and ending, and when each colour comes in. The loops are the player's and are
 * shared by every piece. The config's own `scenes`, `performance` and `colourComesInAt`
 * are the piece open now (the working copy, which everything else already reads); every
 * change to them is mirrored into the list, so switching pieces loses nothing.
 */
import { cleanName, sanitizeScenes, type Scene, type SceneSettings } from './launcher';
import { DEFAULT_PERFORMANCE, sanitizePerformance, type PerformanceSettings } from './clock';
import { sanitizeColourEntries } from './colourEntries';

export interface PieceFields {
  scenes: Scene[];
  performance: PerformanceSettings;
  colourComesInAt: Record<string, number>;
}

export interface SavedPiece extends PieceFields {
  id: string;
  name: string;
}

export interface WithPieces extends PieceFields {
  pieces: SavedPiece[];
  /** The piece open now: one of `pieces`. */
  pieceId: string;
}

export const MAX_PIECES = 12;
const MAX_NAME = 24;

export function newPieceId(now = Date.now()): string {
  return `piece-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** "Piece 1", "Piece 2", … never a name already in the list. */
export function freePieceName(taken: readonly string[], base = 'Piece'): string {
  for (let n = 1; n < 1000; n++) {
    const name = `${base} ${n}`.slice(0, MAX_NAME);
    if (!taken.includes(name)) return name;
  }
  return base;
}

/** "Build" → "Build 2", then "Build 3", never a name already in the list. */
export function copyPieceName(name: string, taken: readonly string[]): string {
  const base = name.replace(/\s\d+$/, '').trim() || 'Piece';
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}`.slice(0, MAX_NAME);
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base} 2`.slice(0, MAX_NAME);
}

const fieldsOf = (c: PieceFields): PieceFields => ({ scenes: c.scenes, performance: c.performance, colourComesInAt: c.colourComesInAt });

/** The working copy written into the piece open now. A missing piece is made from it. */
export function mirrorPiece<T extends WithPieces>(c: T): T {
  const i = c.pieces.findIndex((p) => p.id === c.pieceId);
  if (i < 0) {
    const piece: SavedPiece = { id: c.pieceId || newPieceId(), name: freePieceName(c.pieces.map((p) => p.name)), ...fieldsOf(c) };
    return { ...c, pieces: [...c.pieces, piece], pieceId: piece.id };
  }
  const cur = c.pieces[i];
  if (cur.scenes === c.scenes && cur.performance === c.performance && cur.colourComesInAt === c.colourComesInAt) return c;
  return { ...c, pieces: c.pieces.map((p, k) => (k === i ? { ...p, ...fieldsOf(c) } : p)) };
}

/** Open a piece: its fields become the working copy. Null when there is no such piece. */
export function openPiece<T extends WithPieces>(c: T, id: string): T | null {
  const mirrored = mirrorPiece(c);
  const p = mirrored.pieces.find((x) => x.id === id);
  if (!p) return null;
  return { ...mirrored, pieceId: p.id, scenes: p.scenes, performance: p.performance, colourComesInAt: p.colourComesInAt };
}

/** A new, empty piece (the usual length and ending), opened. Null when the list is full. */
export function addPiece<T extends WithPieces>(c: T, id = newPieceId()): T | null {
  const mirrored = mirrorPiece(c);
  if (mirrored.pieces.length >= MAX_PIECES) return null;
  const piece: SavedPiece = { id, name: freePieceName(mirrored.pieces.map((p) => p.name)), scenes: [], performance: { ...DEFAULT_PERFORMANCE }, colourComesInAt: {} };
  return openPiece({ ...mirrored, pieces: [...mirrored.pieces, piece] }, piece.id);
}

/** A copy of a piece, right after it, named after it, opened. Null when the list is full or the piece is unknown. */
export function duplicatePiece<T extends WithPieces>(c: T, id: string, newId = newPieceId()): T | null {
  const mirrored = mirrorPiece(c);
  const i = mirrored.pieces.findIndex((p) => p.id === id);
  if (i < 0 || mirrored.pieces.length >= MAX_PIECES) return null;
  const src = mirrored.pieces[i];
  const copy: SavedPiece = {
    id: newId, name: copyPieceName(src.name, mirrored.pieces.map((p) => p.name)),
    scenes: src.scenes.map((s) => ({ ...s, loops: [...s.loops], settings: { ...s.settings } })),
    performance: { ...src.performance }, colourComesInAt: { ...src.colourComesInAt },
  };
  const pieces = [...mirrored.pieces.slice(0, i + 1), copy, ...mirrored.pieces.slice(i + 1)];
  return openPiece({ ...mirrored, pieces }, copy.id);
}

/** Take a piece out. The last piece stays; deleting the open one opens the nearest left. */
export function deletePiece<T extends WithPieces>(c: T, id: string): T | null {
  const mirrored = mirrorPiece(c);
  const i = mirrored.pieces.findIndex((p) => p.id === id);
  if (i < 0 || mirrored.pieces.length <= 1) return null;
  const pieces = mirrored.pieces.filter((p) => p.id !== id);
  if (id !== mirrored.pieceId) return { ...mirrored, pieces };
  const nb = pieces[Math.max(0, i - 1)];
  return { ...mirrored, pieces, pieceId: nb.id, scenes: nb.scenes, performance: nb.performance, colourComesInAt: nb.colourComesInAt };
}

export function renamePiece<T extends WithPieces>(c: T, id: string, name: string): T {
  const clean = name.slice(0, MAX_NAME);
  return { ...c, pieces: c.pieces.map((p) => (p.id === id ? { ...p, name: clean } : p)) };
}

/**
 * The stored list made safe. A player saved before pieces existed gets one piece, made from
 * the working copy; the working copy is always the truth for the piece open now.
 */
export function sanitizePieces(
  v: unknown, pieceIdV: unknown, working: PieceFields, defaults: SceneSettings, channelIds: ReadonlySet<string>,
): { pieces: SavedPiece[]; pieceId: string } {
  const raw = Array.isArray(v) ? v : [];
  const pieces: SavedPiece[] = [];
  for (const item of raw) {
    if (pieces.length >= MAX_PIECES) break;
    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' && o.id.length > 0 && !pieces.some((p) => p.id === o.id) ? o.id : newPieceId(Date.now() + pieces.length);
    pieces.push({
      id,
      name: cleanName(o.name) || freePieceName(pieces.map((p) => p.name)),
      scenes: sanitizeScenes(o.scenes, defaults),
      performance: sanitizePerformance(o.performance),
      colourComesInAt: sanitizeColourEntries(o.colourComesInAt, channelIds),
    });
  }
  const wanted = typeof pieceIdV === 'string' ? pieceIdV : '';
  const current = pieces.find((p) => p.id === wanted) ?? pieces[0] ?? null;
  if (current === null) {
    const first: SavedPiece = { id: 'piece-1', name: 'Piece 1', ...working };
    return { pieces: [first], pieceId: first.id };
  }
  return mirrorPiece({ pieces, pieceId: current.id, ...working });
}
