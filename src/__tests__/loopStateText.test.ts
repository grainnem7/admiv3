import { describe, it, expect } from 'vitest';
import { loopStateText } from '../ui/screens/boardSequencer/play/PieceSteps';

const loop = (state: 'empty' | 'stopped' | 'playing' | 'starting' | 'stopping', notes = 2) =>
  ({ slot: 0, name: '', notes, cells: [], state });

describe('what a loop row says', () => {
  it('a wanted loop while stopped is just its notes: nothing waits to start with Play', () => {
    expect(loopStateText(loop('playing'), false, true)).toBe('2 notes');
    expect(loopStateText(loop('starting'), false, true)).toBe('2 notes');
    expect(loopStateText(loop('playing'), true, true)).toBe('▶ playing');
    expect(loopStateText(loop('empty'), false, true)).toBe('empty');
  });
});
