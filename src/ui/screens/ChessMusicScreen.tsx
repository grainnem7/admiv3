/**
 * Chess music: a game of chess played as music. Either the built in game replays, one move
 * a second, or the real board under the camera is listened to and each move is heard as
 * it is played. Each piece has its own voice; the square it lands on is the note.
 * Sound goes through ChessSoundEngine; this screen never touches Tone.
 */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { useChessStore, fenAfter } from '../../songs/chess/chessStore';
import { useLiveChessStore } from '../../songs/chess/liveChessStore';
import { ChessSoundEngine } from '../../songs/chess/ChessSoundEngine';
import { chessVoiceSpecs, voiceLabel, PIECE_TYPES, PIECE_NAMES } from '../../songs/chess/chessVoices';
import type { PieceType } from '../../songs/chess/chessNotes';
import { ChessBoardView } from './chess/ChessBoardView';
import { useChessTension } from '../../songs/chess/chessTension';
import { SOUND_WORLDS } from '../../audio/worlds/soundWorlds';
import { LiveBoardPanel } from './chess/LiveBoardPanel';

const MOVE_MS = 1000;
const bigButton: React.CSSProperties = { minHeight: 44, minWidth: 44, padding: '0 20px', fontSize: 18 };

type Source = 'built-in' | 'board';

const PHASE_WORDS = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' } as const;
const energyWords = (e: number): string => (e < 0.4 ? 'calm' : e < 0.7 ? 'building' : 'lively');

function ChessMusicScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const replay = useChessStore();
  const live = useLiveChessStore();
  const engineRef = useRef<ChessSoundEngine | null>(null);
  const [source, setSource] = useState<Source>('built-in');
  const tension = useChessTension();

  // The engine lives as long as the screen.
  useEffect(() => {
    const engine = new ChessSoundEngine(chessVoiceSpecs());
    engineRef.current = engine;
    return () => { engine.dispose(); engineRef.current = null; useChessStore.getState().setPlaying(false); };
  }, []);

  // One move a second while the built in game plays.
  useEffect(() => {
    if (!replay.playing) return;
    const id = setInterval(() => { useChessStore.getState().step(); }, MOVE_MS);
    return () => clearInterval(id);
  }, [replay.playing]);

  const startSound = async (): Promise<void> => { await engineRef.current?.start(); };

  const onPlay = async (): Promise<void> => {
    await startSound();
    if (useChessStore.getState().played >= replay.moves.length) replay.restart();
    replay.setPlaying(true);
    replay.step(); // the first move at once, so the press is heard
  };

  const choose = (s: Source): void => {
    replay.setPlaying(false);
    replay.restart();
    useLiveChessStore.getState().newGame();
    setSource(s);
  };

  const moves = source === 'built-in' ? replay.moves.slice(0, replay.played) : live.history;
  const fen = source === 'built-in' ? fenAfter(replay.moves, replay.played) : live.fen;
  const last = moves.at(-1) ?? null;
  const done = source === 'built-in' && replay.played >= replay.moves.length;

  return (
    <div className="chess-music" style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary, #eee)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost" style={bigButton} onClick={() => setCurrentScreen('welcome')}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 28 }}>Chess music</h1>
      </div>
      <p style={{ fontSize: 18 }}>A game of chess played as music. Each piece has its own sound; the square it lands on is the note. Taking a piece adds a drum, check adds a cymbal.</p>

      <div role="group" aria-label="What to play" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn btn--ghost" style={bigButton} aria-pressed={source === 'built-in'} onClick={() => choose('built-in')}>A famous game</button>
        <button className="btn btn--ghost" style={bigButton} aria-pressed={source === 'board'} onClick={() => choose('board')}>The real board</button>
      </div>

      {source === 'built-in' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 16px' }}>
          {replay.playing
            ? <button className="btn btn--primary" style={bigButton} onClick={() => replay.setPlaying(false)}>Pause</button>
            : <button className="btn btn--primary" style={bigButton} onClick={() => { void onPlay(); }}>Play</button>}
          <button className="btn btn--ghost" style={bigButton} onClick={replay.restart}>Restart</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {source === 'board' && <LiveBoardPanel startSound={startSound} />}
        <ChessBoardView fen={fen} last={last} label={last ? `Board after ${last.san}` : 'Board at the start'} />
        <div style={{ minWidth: 220, flex: 1 }}>
          {source === 'board' && live.message && <p role="alert" style={{ fontSize: 18, margin: '0 0 8px', color: '#f2c94c' }}>{live.message}</p>}
          {source === 'board' && live.question && (
            <div role="group" aria-label={live.question.kind === 'promotion' ? 'What does the pawn become?' : 'Which move was it?'} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 18, margin: '0 0 8px' }}>{live.question.kind === 'promotion' ? 'What does the pawn become?' : 'Which move was it?'}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {live.question.options.map((m) => (
                  <button key={m.san} className="btn btn--primary" style={bigButton} onClick={() => live.answer(m)}>
                    {live.question?.kind === 'promotion' && m.promotion ? PIECE_NAMES[m.promotion as PieceType].replace(/s$/, '') : m.san}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p style={{ fontSize: 18, margin: '0 0 8px' }} aria-live="polite">
            {done ? 'The game is over.' : last ? `Move ${moves.length}: ${last.san}` : source === 'built-in' ? 'Press Play to hear the game.' : 'No moves yet.'}
          </p>
          <p style={{ fontSize: 16, margin: '0 0 8px' }} data-testid="tension">
            {PHASE_WORDS[tension.phase]} · World: {SOUND_WORLDS[tension.world].name} · Energy: {energyWords(tension.energy)}
            {tension.source && <> · {tension.source === 'stockfish' ? 'tension from Stockfish' : 'tension from the pieces left and checks'}</>}
          </p>
          <details style={{ fontSize: 16, margin: '0 0 12px' }}>
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Which sound each piece plays</summary>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(['w', 'b'] as const).flatMap((side) => PIECE_TYPES.map((p) => <li key={side + p}>{voiceLabel(side + p)}</li>))}
            </ul>
          </details>
          <ol aria-label="Moves" style={{ fontSize: 16, columns: 2, margin: 0, paddingLeft: 24 }}>
            {moves.map((m, i) => <li key={i}>{m.san}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default ChessMusicScreen;
