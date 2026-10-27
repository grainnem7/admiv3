import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { NewLoopPanel, type NewLoopPanelProps } from '../ui/screens/boardSequencer/play/NewLoopPanel';
import { startNewLoop } from '../songs/performance/newLoop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function props(over: Partial<NewLoopPanelProps> = {}): NewLoopPanelProps {
  return {
    state: startNewLoop(0), loopNumber: 4, countersOnBoard: 0, kept: null,
    otherLoops: [{ slot: 0, name: 'Bed' }, { slot: 1, name: '' }],
    onStartWithThese: vi.fn(), onHearWith: vi.fn(), onKeep: vi.fn(), onRename: vi.fn(), onLeave: vi.fn(),
    ...over,
  };
}
const render = (p: NewLoopPanelProps): void => { act(() => root.render(<NewLoopPanel {...p} />)); };
const text = (): string => host.textContent ?? '';
const button = (name: string | RegExp): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? '')));

describe('New loop', () => {
  it('says it is silent, and while counters are still down asks for them to be lifted, with Start with these', () => {
    const p = props({ state: startNewLoop(3), countersOnBoard: 3 });
    render(p);
    expect(text()).toContain('New loop 4 · silent');
    expect(text()).toContain('Lift the 3 counters to start from silence');
    act(() => button('Start with these')?.click());
    expect(p.onStartWithThese).toHaveBeenCalled();
    expect(button('Keep')).toBeUndefined();
  });

  it('composing: Hear it with… chips, a loop to hear with, Keep and Leave', () => {
    const p = props({ countersOnBoard: 2 });
    render(p);
    expect(text()).not.toContain('Lift the');
    act(() => button('Band')?.click());
    expect(p.onHearWith).toHaveBeenCalledWith({ band: true });
    act(() => button('Extra notes')?.click());
    expect(p.onHearWith).toHaveBeenCalledWith({ fill: true });
    const select = host.querySelector('select[aria-label="Hear it with a loop"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['No other loop', 'Bed', 'Loop 2']);
    act(() => { select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(p.onHearWith).toHaveBeenCalledWith({ loop: 0 });
    act(() => button('Keep')?.click());
    expect(p.onKeep).toHaveBeenCalled();
    act(() => button('Leave')?.click());
    expect(p.onLeave).toHaveBeenCalled();
  });

  it('Keep is off with nothing on the board, and says why', () => {
    render(props({ countersOnBoard: 0 }));
    const keep = button('Keep');
    expect(keep?.disabled).toBe(true);
    expect(text()).toContain('Nothing to keep yet');
  });

  it('after Keep: the name box has focus, and the quick names fill it', () => {
    const p = props({ kept: { slot: 3, name: '' } });
    render(p);
    expect(text()).toContain('Kept: Loop 4');
    const name = host.querySelector('input[aria-label="Name of the new loop"]') as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    act(() => button('Bed')?.click());
    expect(p.onRename).toHaveBeenCalledWith(3, 'Bed');
    for (const quick of ['Bed', 'Pulse', 'Beat', 'Shine']) expect(button(quick)).toBeDefined();
  });
});
