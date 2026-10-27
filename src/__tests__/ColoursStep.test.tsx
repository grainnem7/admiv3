import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ColoursStep, type ColoursStepProps } from '../ui/screens/boardSequencer/setup/ColoursStep';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';
import type { ColourChannel } from '../tracking/boardColours';
import type { TrackedColor } from '../tracking/ColorTracker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const red: ColourChannel = { id: 'r', kind: 'hue', role: 'melody', swatch: '#f00', band: { hue: 0 } as TrackedColor };

function props(channels: ColourChannel[], over: Partial<ColoursStepProps> = {}): ColoursStepProps {
  return {
    channels, counts: {}, palette: BOARD_TOKENS.calm.dark, arming: null, pending: null,
    boardLearnt: 0, onLearnBoard: vi.fn(), learnMessage: null, onFindColours: vi.fn(), onArmTap: vi.fn(),
    onCancelArm: vi.fn(), onAddPending: vi.fn(), onDiscardPending: vi.fn(), onRecalibrate: vi.fn(), onRole: vi.fn(),
    config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, channels }, setChannelSound: vi.fn(), onHear: vi.fn(), hearing: null,
    onLoopSlot: vi.fn(), running: false, onRemove: vi.fn(), onClearAll: vi.fn(), isReferenced: () => false,
    minFilledFraction: 0.2, readSettingsCustom: false, onMinFill: vi.fn(), counterHeight: 0.3, onCounterHeight: vi.fn(),
    onResetReadSettings: vi.fn(), settleWindowMs: 300, onSettleWindow: vi.fn(), onBlackDarkness: vi.fn(),
    picker: null, onMovePicker: vi.fn(), onSampleSquare: vi.fn(), finding: false, onCancelFind: vi.fn(),
    found: null, onUseFound: vi.fn(), onDiscardFound: vi.fn(),
    hands: {
      handGuardEnabled: true, onHandGuardEnabled: vi.fn(), knockGuardEnabled: true, onKnockGuardEnabled: vi.fn(),
      handMarginSquares: 1, onHandMargin: vi.fn(), intruderSensitivity: 0.5, onSensitivity: vi.fn(),
      checking: false, onCheckHand: vi.fn(), checkResult: null,
    },
    ...over,
  };
}

const text = (): string => host.textContent ?? '';
const button = (name: string): HTMLButtonElement | undefined => [...host.querySelectorAll('button')].find((b) => b.textContent === name);

describe('the Colours step on the laptop board', () => {
  it('no colours yet: Add four colours, and none of the camera’s tools', () => {
    const laptop = { onAddColours: vi.fn(), onAddColour: vi.fn() };
    act(() => root.render(<ColoursStep {...props([], { laptop })} />));
    expect(text()).not.toMatch(/Find colours|Tap a counter|Learn the empty board|Detection sensitivity|Hands/);
    act(() => button('Add four colours')?.click());
    expect(laptop.onAddColours).toHaveBeenCalled();
  });

  it('with colours: the table, Add a colour, and no camera counts or Recalibrate', () => {
    const laptop = { onAddColours: vi.fn(), onAddColour: vi.fn() };
    act(() => root.render(<ColoursStep {...props([red], { laptop })} />));
    expect(host.querySelector('select[aria-label="Red: plays"]')).not.toBeNull();
    expect(button('Add a colour')).toBeDefined();
    expect(text()).not.toMatch(/ down|Recalibrate/);
  });

  it('the camera board still has its tools', () => {
    act(() => root.render(<ColoursStep {...props([red])} />));
    expect(text()).toMatch(/Find colours/);
    expect(text()).toMatch(/0 down/);
  });
});
