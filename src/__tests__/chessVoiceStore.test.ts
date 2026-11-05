import { describe, it, expect, vi } from 'vitest';
vi.mock('tone', () => ({}));
import { useChessVoices } from '../songs/chess/chessVoiceStore';
import { chessEvents, sendChessSounds, parseChessNoteId } from '../songs/chess/ChessSoundEngine';
import { evalWords } from '../ui/screens/chess/EvalLine';

describe('chess voices on screen', () => {
  it('a muted voice is neither heard nor drawn; the others are', () => {
    const heard: string[] = [];
    const off = chessEvents.on('noteOn', (e) => { heard.push(parseChessNoteId(e.noteId)?.voice ?? ''); });
    useChessVoices.getState().toggleMute('wp');
    sendChessSounds([
      { voice: 'wp', midi: 60, velocity: 0.8, delaySec: 0, square: 'e4' },
      { voice: 'wn', midi: 62, velocity: 0.8, delaySec: 0, square: 'f3' },
    ]);
    expect(heard).toEqual(['wn']);
    useChessVoices.getState().toggleMute('wp');
    expect(useChessVoices.getState().muted.size).toBe(0);
    off();
  });

  it('a sound can be changed and put back', () => {
    useChessVoices.getState().setSound('wq', 'violin');
    expect(useChessVoices.getState().sounds.wq).toBe('violin');
    useChessVoices.getState().resetSounds();
    expect(useChessVoices.getState().sounds.wq).toBe('trumpet');
  });

  it('the evaluation in words', () => {
    expect(evalWords(10)).toBe('Even');
    expect(evalWords(150)).toBe('White ahead by 1.5 pawns');
    expect(evalWords(-10000)).toBe('Black has checkmate');
  });
});
