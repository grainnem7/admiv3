import { describe, it, expect } from 'vitest';
import { layoutFor } from '../ui/screens/boardSequencer/layout';

describe('layoutFor', () => {
  it('side by side: left hand puts the panel (with transport) on the left', () => {
    const l = layoutFor('left', 1440, 'standard');
    const r = layoutFor('right', 1440, 'standard');
    expect(l).toMatchObject({ mode: 'side', playAreas: '"panel stage"', setupAreas: '"panel camera"', transport: 'panel-top', pip: 'bottom-right', nudgePad: 'left', bigBoardControls: 'left', footerAlign: 'start' });
    expect(r).toMatchObject({ mode: 'side', playAreas: '"stage panel"', setupAreas: '"camera panel"', pip: 'bottom-left', nudgePad: 'right', bigBoardControls: 'right', footerAlign: 'end' });
  });
  it('stacked below 1024 px and in Large UI, with the bar controls on the player side', () => {
    expect(layoutFor('left', 900, 'standard')).toMatchObject({ mode: 'stacked', transport: 'bottom-bar', transportAlign: 'start' });
    expect(layoutFor('right', 1440, 'large')).toMatchObject({ mode: 'stacked', transport: 'bottom-bar', transportAlign: 'end' });
  });
  it('DOM/focus order is identical for both hands', () => {
    for (const w of [900, 1440]) expect(layoutFor('left', w, 'standard').domOrder).toEqual(layoutFor('right', w, 'standard').domOrder);
  });
});
