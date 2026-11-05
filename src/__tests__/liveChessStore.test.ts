import { describe, it, expect, vi } from 'vitest';
vi.mock('tone', () => ({}));
import { Chess } from 'chess.js';
import { useLiveChessStore } from '../songs/chess/liveChessStore';
import { chessEvents, parseChessNoteId } from '../songs/chess/ChessSoundEngine';
import { occupancyOfFen, NOT_A_MOVE } from '../songs/chess/moveFromBoard';
import { START_OCCUPANCY } from '../tracking/chess/chessOccupancy';

const after = (sans: string[]) => { const g = new Chess(); sans.forEach((s) => g.move(s)); return occupancyOfFen(g.fen()); };

describe('the live game', () => {
  it('a move on the board is played on the bus; a strange board keeps the game and says so', () => {
    const heard: string[] = [];
    const off = chessEvents.on('noteOn', (e) => { heard.push(parseChessNoteId(e.noteId)?.voice ?? ''); });
    const s = useLiveChessStore.getState();
    s.newGame();
    s.seen(after(['e4']));
    expect(useLiveChessStore.getState().history.map((m) => m.san)).toEqual(['e4']);
    expect(heard).toEqual(['wp']);
    const wrong = [...after(['e4'])]; wrong[63] = 'empty';
    s.seen(wrong);
    expect(useLiveChessStore.getState().message).toBe(NOT_A_MOVE);
    expect(useLiveChessStore.getState().history).toHaveLength(1);
    s.seen(after(['e4'])); // set back
    expect(useLiveChessStore.getState().message).toBeNull();
    s.seen(START_OCCUPANCY); // a take back
    expect(useLiveChessStore.getState().history).toHaveLength(0);
    off();
  });

  it('promotion waits for an answer', () => {
    const s = useLiveChessStore.getState();
    s.newGame();
    // Walk a white pawn to the seventh rank, then promote by taking on b8.
    const line = ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2'];
    line.forEach((_, i) => s.seen(after(line.slice(0, i + 1))));
    expect(useLiveChessStore.getState().history).toHaveLength(8);
    s.seen(after([...line, 'bxa8=Q']));
    const q = useLiveChessStore.getState().question;
    expect(q?.kind).toBe('promotion');
    s.answer(q!.options.find((m) => m.promotion === 'n')!);
    expect(useLiveChessStore.getState().history.at(-1)?.san).toBe('bxa8=N');
  });
});
