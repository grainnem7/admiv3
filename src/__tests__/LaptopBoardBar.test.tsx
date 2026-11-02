/** U1 (2 Nov 2026): Clear the board read as a word, not a button. It now has an edge. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { LaptopBoardBar } from '../ui/screens/boardSequencer/components/LaptopBoardBar';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';
import type { ColourChannel } from '../tracking/boardColours';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const red = { id: 'c1', name: 'Red', role: 'melody', swatch: '#d03a2c' } as unknown as ColourChannel;

describe('Clear the board (U1)', () => {
  it('is a real button with an edge, as Leave and Done are', () => {
    view = render(
      <LaptopBoardBar
        channels={[red]} knownColours={1} selected="c1" onSelect={vi.fn()} count={3} onClear={vi.fn()}
        onAddColours={vi.fn()} onAddColour={null} palette={BOARD_TOKENS.calm.dark}
      />,
    );
    const clear = view.byText('Clear the board', 'button');
    expect(clear.style.background).toBe('var(--bs-raised)');
  });
});
