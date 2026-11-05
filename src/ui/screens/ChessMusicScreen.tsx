/**
 * Chess music: a game of chess played as music. Step 1: a built in game replays, one move
 * a second, each move a note (the file is the note, the rank the octave), a capture a drum.
 * Sound goes through ChessSoundEngine; this screen never touches Tone.
 */
import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useAppStore } from '../../state/store';
import { useChessStore, fenAfter } from '../../songs/chess/chessStore';
import { ChessSoundEngine, chessEvents, parseChessNoteId } from '../../songs/chess/ChessSoundEngine';
import { chessVoiceSpecs, voiceLabel, PIECE_TYPES } from '../../songs/chess/chessVoices';

const MOVE_MS = 1000;
const LIGHT_MS = 450;
const FILES = 'abcdefgh';
const GLYPH: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const bigButton: React.CSSProperties = { minHeight: 44, minWidth: 44, padding: '0 20px', fontSize: 18 };

function ChessMusicScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const { moves, played, playing, step, restart, setPlaying } = useChessStore();
  const engineRef = useRef<ChessSoundEngine | null>(null);
  const [lit, setLit] = useState<ReadonlyMap<string, string>>(new Map());

  // The engine lives as long as the screen.
  useEffect(() => {
    const engine = new ChessSoundEngine(chessVoiceSpecs());
    engineRef.current = engine;
    return () => { engine.dispose(); engineRef.current = null; useChessStore.getState().setPlaying(false); };
  }, []);

  // One move a second while playing.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => { useChessStore.getState().step(); }, MOVE_MS);
    return () => clearInterval(id);
  }, [playing]);

  // Every sound is drawn: the square it belongs to lights for a moment.
  useEffect(() => {
    const light = (square: string, kind: string): void => {
      setLit((m) => new Map(m).set(square, kind));
      setTimeout(() => setLit((m) => { const n = new Map(m); n.delete(square); return n; }), LIGHT_MS);
    };
    return chessEvents.onAny((e) => {
      if (e.type === 'noteOn') { const id = parseChessNoteId(e.noteId); if (id) light(id.square, 'note'); }
      else if (e.type === 'trigger' && e.triggerId.startsWith('chess|drum:')) light(e.triggerId.split('|')[2] ?? '', 'drum');
    });
  }, []);

  const onPlay = async (): Promise<void> => {
    await engineRef.current?.start();
    if (useChessStore.getState().played >= moves.length) restart();
    setPlaying(true);
    step(); // the first move at once, so the press is heard
  };

  const board = new Chess(fenAfter(moves, played)).board();
  const last = played > 0 ? moves[played - 1] : null;
  const done = played >= moves.length;

  return (
    <div className="chess-music" style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: 'var(--text-primary, #eee)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost" style={bigButton} onClick={() => setCurrentScreen('welcome')}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 28 }}>Chess music</h1>
      </div>
      <p style={{ fontSize: 18 }}>A game of chess played as music. Each piece has its own sound; the square it lands on is the note. Taking a piece adds a drum, check adds a cymbal.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
        {playing
          ? <button className="btn btn--primary" style={bigButton} onClick={() => setPlaying(false)}>Pause</button>
          : <button className="btn btn--primary" style={bigButton} onClick={() => { void onPlay(); }}>Play</button>}
        <button className="btn btn--ghost" style={bigButton} onClick={restart}>Restart</button>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div role="img" aria-label={last ? `Board after ${last.san}` : 'Board at the start'}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 48px)', border: '2px solid #888' }}>
          {board.flatMap((row, r) => row.map((cell, f) => {
            const sq = `${FILES[f]}${8 - r}`;
            const dark = (r + f) % 2 === 1;
            const flash = lit.get(sq);
            const isLast = last && (last.from === sq || last.to === sq);
            const bg = flash === 'drum' ? '#e04848' : flash ? '#f2c94c' : isLast ? (dark ? '#8a9a3a' : '#c8d66a') : dark ? '#7a5c3e' : '#e8d3b0';
            return (
              <div key={sq} data-square={sq}
                style={{ width: 48, height: 48, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 34, color: cell?.color === 'w' ? '#fff' : '#111', textShadow: cell?.color === 'w' ? '0 0 2px #000' : 'none', transition: 'background 80ms' }}>
                {cell ? GLYPH[cell.color + cell.type] : ''}
              </div>
            );
          }))}
        </div>
        <div style={{ minWidth: 200 }}>
          <p style={{ fontSize: 18, margin: '0 0 8px' }} aria-live="polite">
            {done ? 'The game is over.' : last ? `Move ${played}: ${last.san}` : 'Press Play to hear the game.'}
          </p>
          <details style={{ fontSize: 16, margin: '0 0 12px' }}>
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Which sound each piece plays</summary>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(['w', 'b'] as const).flatMap((side) => PIECE_TYPES.map((p) => <li key={side + p}>{voiceLabel(side + p)}</li>))}
            </ul>
          </details>
          <ol aria-label="Moves" style={{ fontSize: 16, columns: 2, margin: 0, paddingLeft: 24 }}>
            {moves.slice(0, played).map((m, i) => <li key={i}>{m.san}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default ChessMusicScreen;
