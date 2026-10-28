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
    otherLoops: [{ slot: 0, name: 'Bed' }, { slot: 1, name: '' }], takenNames: [],
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

describe('New loop: never "Lift the 0 counters" (T1-05, T2-03)', () => {
  it('waiting with the board already clear says it is ready, with no number', () => {
    render(props({ state: startNewLoop(3), countersOnBoard: 0 }));
    expect(text()).not.toMatch(/Lift the 0/);
    expect(text()).not.toMatch(/0 counters?/);
    expect(text()).toContain('Ready: the board is clear.');
  });

  it('one counter left is "the 1 counter"', () => {
    render(props({ state: startNewLoop(1), countersOnBoard: 1 }));
    expect(text()).toContain('Lift the 1 counter to start from silence.');
  });
});

describe('New loop: the name box takes focus once, after Keep (T4-03)', () => {
  it('a later render (a new name, a new frame) never pulls focus back', () => {
    const p = props({ kept: { slot: 3, name: '' } });
    render(p);
    const name = host.querySelector('input[aria-label="Name of the new loop"]') as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    const done = button('Done') as HTMLButtonElement;
    act(() => done.focus());
    expect(document.activeElement).toBe(done);
    // The screen passes a new object every render; the name changing is a new render too.
    render({ ...p, kept: { slot: 3, name: 'R' } });
    render({ ...p, kept: { slot: 3, name: 'R' } });
    expect(document.activeElement).toBe(done);
  });

  it('keeping another loop focuses the name box again', () => {
    const p = props({ kept: { slot: 3, name: 'Bed' } });
    render(p);
    act(() => (button('Done') as HTMLButtonElement).focus());
    render({ ...p, kept: { slot: 4, name: '' } });
    expect(document.activeElement).toBe(host.querySelector('input[aria-label="Name of the new loop"]'));
  });
});

describe('New loop: every loop full (T4-04)', () => {
  it('the heading has no number, Keep is off, and the reason is on screen', () => {
    render(props({ loopNumber: null, countersOnBoard: 2 }));
    const h = host.querySelector('h3');
    expect(h?.textContent).toBe('New loop · silent');
    expect(button('Keep')?.disabled).toBe(true);
    expect(text()).toContain('Every loop is full: clear one first');
    expect(text()).not.toContain('Nothing to keep yet');
  });
});

describe('New loop: quick names (T1-08)', () => {
  it('a quick name already used by another loop gets a number', () => {
    const p = props({ kept: { slot: 3, name: '' }, takenNames: ['Bed'] });
    render(p);
    expect(button('Bed')).toBeUndefined();
    act(() => button('Bed 2')?.click());
    expect(p.onRename).toHaveBeenCalledWith(3, 'Bed 2');
  });
});

