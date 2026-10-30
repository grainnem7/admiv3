import { describe, it, expect, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { SwatchChip } from '../ui/screens/boardSequencer/ui/SwatchChip';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

describe('the number on a colour chip (A10: nothing under 14 px)', () => {
  for (const size of [18, 20, 22, 24, 28, 36]) {
    it(`a chip asked for at ${size} px shows its number at 14 px or more, inside the chip`, () => {
      view = render(<SwatchChip swatch="#d03a2c" palette={BOARD_TOKENS.calm.dark} number={3} size={size} />);
      const chip = view.container.firstElementChild as HTMLElement;
      expect(Number.parseFloat(chip.style.fontSize)).toBeGreaterThanOrEqual(14);
      expect(Number.parseFloat(chip.style.width)).toBeGreaterThanOrEqual(Number.parseFloat(chip.style.fontSize) * 1.5);
    });
  }
  it('a chip with no number keeps the size it was asked for', () => {
    view = render(<SwatchChip swatch="#d03a2c" palette={BOARD_TOKENS.calm.dark} size={18} />);
    expect((view.container.firstElementChild as HTMLElement).style.width).toBe('18px');
  });
});
