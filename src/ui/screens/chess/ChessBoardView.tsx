/**
 * A chess board drawn from a position: the last move lit, and every sound drawn on its
 * square as it is heard (a note gold, a drum red), so the music can be seen.
 */
import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { chessEvents, parseChessNoteId } from '../../../songs/chess/ChessSoundEngine';

const FILES = 'abcdefgh';
const LIGHT_MS = 450;
const GLYPH: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

/** Squares lit by sounds on the chess bus, for a moment each. */
function useLitSquares(): ReadonlyMap<string, string> {
  const [lit, setLit] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const light = (square: string, kind: string): void => {
      setLit((m) => new Map(m).set(square, kind));
      const t = setTimeout(() => { timers.delete(t); setLit((m) => { const n = new Map(m); n.delete(square); return n; }); }, LIGHT_MS);
      timers.add(t);
    };
    const off = chessEvents.onAny((e) => {
      if (e.type === 'noteOn') { const id = parseChessNoteId(e.noteId); if (id) light(id.square, 'note'); }
      else if (e.type === 'trigger' && e.triggerId.startsWith('chess|drum:')) light(e.triggerId.split('|')[2] ?? '', 'drum');
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, []);
  return lit;
}

export function ChessBoardView({ fen, last, label }: { fen: string; last: { from: string; to: string } | null; label: string }) {
  const lit = useLitSquares();
  const board = new Chess(fen).board();
  return (
    <div role="img" aria-label={label}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 48px)', border: '2px solid #888', alignSelf: 'flex-start' }}>
      {board.flatMap((row, r) => row.map((cell, f) => {
        const sq = `${FILES[f]}${8 - r}`;
        const dark = (r + f) % 2 === 1;
        const flash = lit.get(sq);
        const isLast = last && (last.from === sq || last.to === sq);
        const bg = flash === 'drum' ? '#e04848' : flash ? '#f2c94c' : isLast ? (dark ? '#8a9a3a' : '#c8d66a') : dark ? '#7a5c3e' : '#e8d3b0';
        return (
          <div key={sq} data-square={sq} data-lit={flash ?? undefined}
            style={{ width: 48, height: 48, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 34, color: cell?.color === 'w' ? '#fff' : '#111', textShadow: cell?.color === 'w' ? '0 0 2px #000' : 'none', transition: 'background 80ms' }}>
            {cell ? GLYPH[cell.color + cell.type] : ''}
          </div>
        );
      }))}
    </div>
  );
}
