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
    onLoopSlot: vi.fn(), running: false, onRemove: vi.fn(), onClearAll: vi.fn(),
    usesOf: () => ({ loopsPlayOn: false, quietNotes: 0, quietLoops: [], pageCounters: 0 }),
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

describe('removing colours: the warning says what really happens (T1-06)', () => {
  const green: ColourChannel = { id: 'g', kind: 'hue', role: 'melody', swatch: '#0f0', band: { hue: 120 } as TrackedColor };
  const dialogText = (): string => document.querySelector('[role="dialog"], [role="alertdialog"]')?.textContent ?? '';

  it('Remove Red: kept loops play on, so nothing says loops will go quiet', () => {
    const usesOf = vi.fn(() => ({ loopsPlayOn: true, quietNotes: 0, quietLoops: [], pageCounters: 0 }));
    act(() => root.render(<ColoursStep {...props([red, green], { usesOf })} />));
    act(() => (host.querySelector('button[aria-label="More for Red"]') as HTMLButtonElement).click());
    act(() => button('× Remove Red')?.click());
    expect(usesOf).toHaveBeenCalledWith(['r']);
    expect(dialogText()).toContain('Loops keep the sounds they were made with, so they play on.');
    expect(dialogText()).not.toMatch(/Saved loops and pages that use .* will go quiet/);
  });

  it('Remove all colours: says what goes quiet, counted', () => {
    const usesOf = vi.fn(() => ({ loopsPlayOn: false, quietNotes: 2, quietLoops: ['Bed'], pageCounters: 0 }));
    act(() => root.render(<ColoursStep {...props([red, green], { usesOf })} />));
    act(() => button('Remove all colours')?.click());
    expect(usesOf).toHaveBeenCalledWith(['r', 'g']);
    expect(dialogText()).toContain('Every colour is removed for every player on this board. 2 notes in Bed will go quiet.');
    expect(dialogText()).not.toContain('Saved loops and pages that use them will go quiet.');
  });
});

describe('the Colours step: focus never drops to the page (T4-09)', () => {
  it('Add four colours: focus goes to "Your colours (4)", the list they were added to', async () => {
    const laptop = { onAddColours: vi.fn(), onAddColour: vi.fn() };
    act(() => root.render(<ColoursStep {...props([], { laptop })} />));
    const add = button('Add four colours') as HTMLButtonElement;
    act(() => add.focus());
    act(() => add.click());
    const four = ['r', 'b', 'y', 'g'].map((id, i) => ({ ...red, id, swatch: ['#f00', '#00f', '#ff0', '#0f0'][i] }));
    act(() => root.render(<ColoursStep {...props(four, { laptop })} />));
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    const heading = document.activeElement as HTMLElement;
    expect(heading.tagName).toBe('H3');
    expect(heading.textContent).toBe('Your colours (4)');
  });
});
