import { describe, it, expect } from 'vitest';
import { addPiece, copyPieceName, deletePiece, duplicatePiece, freePieceName, MAX_PIECES, mirrorPiece, openPiece, renamePiece, sanitizePieces, type WithPieces } from '../songs/performance/pieces';
import { DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene } from '../songs/performance/launcher';

const settings = { sceneEnergy: 2 } as unknown as Scene['settings'];
const scene = (id: string, name: string, at: number): Scene => ({ id, name, loops: [0], settings, at });
const base: WithPieces = {
  scenes: [scene('a', 'Arrival', 0)], performance: { ...DEFAULT_PERFORMANCE, lengthSec: 300 }, colourComesInAt: { c1: 30 },
  pieces: [{ id: 'piece-1', name: 'Piece 1', scenes: [], performance: DEFAULT_PERFORMANCE, colourComesInAt: {} }],
  pieceId: 'piece-1',
};

describe('named pieces (item 3)', () => {
  it('the working copy is mirrored into the piece open now', () => {
    const m = mirrorPiece(base);
    expect(m.pieces[0].scenes).toBe(base.scenes);
    expect(m.pieces[0].performance.lengthSec).toBe(300);
    expect(m.pieces[0].colourComesInAt).toEqual({ c1: 30 });
    // Nothing to mirror: the same object comes back.
    expect(mirrorPiece(m)).toBe(m);
  });

  it('New piece opens an empty piece with the usual length; the first piece keeps what it had', () => {
    const n = addPiece(base, 'piece-2')!;
    expect(n.pieceId).toBe('piece-2');
    expect(n.scenes).toEqual([]);
    expect(n.performance.lengthSec).toBe(DEFAULT_PERFORMANCE.lengthSec);
    expect(n.pieces.map((p) => p.name)).toEqual(['Piece 1', 'Piece 2']);
    expect(n.pieces[0].scenes.length).toBe(1);
    // Open brings the first back, scenes and all.
    const back = openPiece(n, 'piece-1')!;
    expect(back.scenes.length).toBe(1);
    expect(back.performance.lengthSec).toBe(300);
  });

  it('Duplicate copies a piece after it, named after it, and opens the copy', () => {
    const d = duplicatePiece(base, 'piece-1', 'copy')!;
    expect(d.pieces.map((p) => p.name)).toEqual(['Piece 1', 'Piece 2']);
    expect(d.pieceId).toBe('copy');
    expect(d.scenes).toEqual(base.scenes);
    expect(d.scenes).not.toBe(base.scenes);
    expect(copyPieceName('Opening set', ['Opening set', 'Opening set 2'])).toBe('Opening set 3');
  });

  it('Delete takes a piece out, never the last, and opens a neighbour when the open one goes', () => {
    expect(deletePiece(base, 'piece-1')).toBeNull();
    const two = addPiece(base, 'piece-2')!;
    const gone = deletePiece(two, 'piece-2')!;
    expect(gone.pieces.map((p) => p.id)).toEqual(['piece-1']);
    expect(gone.pieceId).toBe('piece-1');
    expect(gone.scenes.length).toBe(1);
  });

  it('Rename keeps the name short; names never collide', () => {
    expect(renamePiece(base, 'piece-1', 'A very very long piece name indeed').pieces[0].name.length).toBe(24);
    expect(freePieceName(['Piece 1', 'Piece 2'])).toBe('Piece 3');
  });

  it('the list never grows past twelve', () => {
    let c: WithPieces | null = base;
    for (let i = 2; i <= MAX_PIECES; i++) c = addPiece(c!, `p${i}`);
    expect(c!.pieces.length).toBe(MAX_PIECES);
    expect(addPiece(c!, 'one-more')).toBeNull();
    expect(duplicatePiece(c!, 'piece-1', 'copy')).toBeNull();
  });
});

describe('stored pieces made safe', () => {
  const defaults = settings;
  const ids = new Set(['c1']);
  const working = { scenes: [scene('a', 'Arrival', 0)], performance: DEFAULT_PERFORMANCE, colourComesInAt: { c1: 30 } };

  it('a player saved before pieces existed gets one piece made from their scenes', () => {
    const r = sanitizePieces(undefined, undefined, working, defaults, ids);
    expect(r.pieces.length).toBe(1);
    expect(r.pieceId).toBe('piece-1');
    expect(r.pieces[0].name).toBe('Piece 1');
    expect(r.pieces[0].scenes).toBe(working.scenes);
  });

  it('a saved list keeps its pieces and names; the open one takes the working copy', () => {
    const saved = [
      { id: 'x', name: 'Opening set', scenes: [scene('q', 'Quiet', 0)], performance: { lengthSec: 120 }, colourComesInAt: {} },
      { id: 'y', name: 'Encore', scenes: [], performance: {}, colourComesInAt: {} },
    ];
    const r = sanitizePieces(saved, 'y', working, defaults, ids);
    expect(r.pieces.map((p) => p.name)).toEqual(['Opening set', 'Encore']);
    expect(r.pieceId).toBe('y');
    expect(r.pieces[1].scenes).toBe(working.scenes);
    expect(r.pieces[0].performance.lengthSec).toBe(120);
  });

  it('an unknown open id falls back to the first piece; junk is dropped', () => {
    const r = sanitizePieces([{ id: 'x', name: 'A' }, 'junk', null], 'nope', working, defaults, ids);
    expect(r.pieces.length).toBe(3);
    expect(r.pieceId).toBe('x');
    expect(r.pieces[1].name).toBe('Piece 1');
  });
});
