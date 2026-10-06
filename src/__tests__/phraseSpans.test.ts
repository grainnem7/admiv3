import { describe, it, expect } from 'vitest';
import { phraseSpans } from '../ui/screens/boardSequencer/components/boardViewModel';

const seq = () => true;

describe('phraseSpans — which beats each counter owns', () => {
  it('a lone counter owns the whole loop', () => {
    expect(phraseSpans([{ row: 2, col: 3, colour: 'm' }], 8, seq)).toEqual([{ row: 2, col: 3, len: 8, colour: 'm' }]);
  });

  it('two counters of one colour divide the loop, wrapping round', () => {
    const spans = phraseSpans([{ row: 2, col: 1, colour: 'm' }, { row: 5, col: 5, colour: 'm' }], 8, seq);
    expect(spans).toContainEqual({ row: 2, col: 1, len: 4, colour: 'm' });
    expect(spans).toContainEqual({ row: 5, col: 5, len: 4, colour: 'm' });
  });

  it('colours do not divide each other', () => {
    const spans = phraseSpans([{ row: 2, col: 1, colour: 'm' }, { row: 7, col: 5, colour: 'b' }], 8, seq);
    expect(spans.every((s) => s.len === 8)).toBe(true);
  });

  it('two counters in one column share its span', () => {
    const spans = phraseSpans([{ row: 2, col: 1, colour: 'm' }, { row: 3, col: 1, colour: 'm' }, { row: 4, col: 5, colour: 'm' }], 8, seq);
    expect(spans.filter((s) => s.col === 1).map((s) => s.len)).toEqual([4, 4]);
  });

  it('leaves out control colours, which have no phrase', () => {
    expect(phraseSpans([{ row: 2, col: 1, colour: 'vol' }], 8, (c) => c !== 'vol')).toEqual([]);
  });
});
