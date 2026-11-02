import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { NewLoopPanel, liftLine, newLoopStatusLine, type NewLoopPanelProps } from '../ui/screens/boardSequencer/play/NewLoopPanel';
import { chooseFromEmpty, startNewLoop, startWithThese } from '../songs/performance/newLoop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function props(over: Partial<NewLoopPanelProps> = {}): NewLoopPanelProps {
  return {
    state: startNewLoop(0), loopNumber: 4, countersOnBoard: 0, kept: null,
    otherLoops: [{ slot: 0, name: 'Bed' }, { slot: 1, name: '' }], takenNames: [],
    stopped: null, onPlay: vi.fn(),
    onStartWithThese: vi.fn(), onKeepBoard: vi.fn(), onStartFromEmpty: vi.fn(), onHearWith: vi.fn(), onKeep: vi.fn(), onRename: vi.fn(), onLeave: vi.fn(),
    ...over,
  };
}
const render = (p: NewLoopPanelProps): void => { act(() => root.render(<NewLoopPanel {...p} />)); };
const text = (): string => host.textContent ?? '';
const button = (name: string | RegExp): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? '')));

describe('New loop', () => {
  it('says it is silent, and while counters are still down asks for them to be lifted, with Start with these', () => {
    const p = props({ state: chooseFromEmpty(startNewLoop(3)), countersOnBoard: 3 });
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
    act(() => button('The band')?.click());
    expect(p.onHearWith).toHaveBeenCalledWith({ band: true });
    act(() => button('Extra notes')?.click());
    expect(p.onHearWith).toHaveBeenCalledWith({ fill: true });
    const select = host.querySelector('select[aria-label="Hear it with a loop"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['On its own', 'Bed', 'Loop 2']);
    act(() => { select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(p.onHearWith).toHaveBeenCalledWith({ loop: 0 });
    act(() => button('Keep')?.click());
    expect(p.onKeep).toHaveBeenCalled();
    act(() => button('Leave')?.click());
    expect(p.onLeave).toHaveBeenCalled();
  });

  it('U1: Leave and Done are real buttons with an edge, not words that look like text', () => {
    render(props({ countersOnBoard: 2 }));
    const leave = button('Leave')!;
    expect(leave.style.background).toBe('var(--bs-raised)');
    render(props({ kept: { slot: 3, name: '' } }));
    expect(button('Done')!.style.background).toBe('var(--bs-raised)');
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

describe('New loop on the laptop board: Clear the board is named (B22)', () => {
  it('"Lift the 3 counters, or press Clear the board."', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(3)), countersOnBoard: 3, laptop: true }));
    expect(text()).toContain('Lift the 3 counters, or press Clear the board.');
  });
  it('on the camera board there is no Clear the board to press: just lift them', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(3)), countersOnBoard: 1 }));
    expect(text()).toContain('Lift the 1 counter to start from silence.');
    expect(text()).not.toContain('Clear the board');
  });
  it('the line is the same one the screen says aloud', () => {
    expect(liftLine(2, true)).toBe('Lift the 2 counters, or press Clear the board.');
    expect(liftLine(1, false)).toBe('Lift the 1 counter to start from silence.');
  });
});

describe('New loop: never "Lift the 0 counters" (T1-05, T2-03)', () => {
  it('waiting with the board already clear says it is ready, with no number', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(3)), countersOnBoard: 0 }));
    expect(text()).not.toMatch(/Lift the 0/);
    expect(text()).not.toMatch(/0 counters?/);
    expect(text()).toContain('Ready: the board is clear.');
  });

  it('one counter left is "the 1 counter"', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(1)), countersOnBoard: 1 }));
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
    const h = host.querySelector('h2');
    expect(h?.textContent).toBe('New loop · not kept yet');
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


/** What a screen reader calls an element: its aria-label, or the text of what labels it. */
const nameOf = (el: Element): string => el.getAttribute('aria-label')
  ?? (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
const group = (name: string): Element | undefined => [...host.querySelectorAll('[role="group"]')].find((g) => nameOf(g) === name);
/** The text a control is described by (aria-describedby). */
const describedBy = (el: Element | undefined): string => (el?.getAttribute('aria-describedby') ?? '').split(' ')
  .map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
const heading = (): string => host.querySelector('h2')?.textContent ?? '';

describe('New loop: names a screen reader can follow (T4-10)', () => {
  it('"Hear it with…" is the name of a group holding Band, Extra notes and the loop to hear with', () => {
    render(props({ countersOnBoard: 2 }));
    const g = group('Hear it with…');
    expect(g).toBeDefined();
    expect(g?.contains(button('The band') ?? null)).toBe(true);
    expect(g?.contains(button('Extra notes') ?? null)).toBe(true);
    expect(g?.querySelector('select[aria-label="Hear it with a loop"]')).not.toBeNull();
  });

  it('the quick names are a group that names the loop', () => {
    render(props({ kept: { slot: 3, name: '' } }));
    const g = group('Name this loop');
    expect(g).toBeDefined();
    for (const quick of ['Bed', 'Pulse', 'Beat', 'Shine']) expect(g?.contains(button(quick) ?? null)).toBe(true);
  });

  it('Keep, while off, is described by why: nothing to keep yet', () => {
    render(props({ countersOnBoard: 0 }));
    expect(describedBy(button('Keep'))).toBe('Nothing to keep yet');
  });

  it('Keep, while off, is described by why: every loop is full', () => {
    render(props({ loopNumber: null, countersOnBoard: 2 }));
    expect(describedBy(button('Keep'))).toBe('Every loop is full: clear one first');
  });

  it('Keep that can be pressed has no reason attached', () => {
    render(props({ countersOnBoard: 2 }));
    expect(button('Keep')?.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('New loop: the heading says what is true (T4-10, T1-09)', () => {
  it('silent while it waits for the board to be clear', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(2)), countersOnBoard: 2 }));
    expect(heading()).toBe('New loop 4 · silent');
  });

  it('never "silent" while the counters sound: not kept yet', () => {
    render(props({ countersOnBoard: 2 }));
    expect(heading()).toBe('New loop 4 · not kept yet');
    expect(heading()).not.toMatch(/silent/);
  });

  it('after Keep: kept, and "Nothing is kept until you press Keep." is gone', () => {
    render(props({ countersOnBoard: 0 }));
    expect(text()).toContain('Nothing is kept until you press Keep.');
    render(props({ countersOnBoard: 2, kept: { slot: 3, name: 'Bed' } }));
    expect(heading()).toBe('New loop 4 · kept');
    expect(text()).not.toContain('Nothing is kept until you press Keep.');
  });

  it('every loop full: no number, and still never "silent" while composing', () => {
    render(props({ loopNumber: null, countersOnBoard: 2 }));
    expect(heading()).toBe('New loop · not kept yet');
  });
});

describe('New loop: focus never drops to the page (T1-04, T4-09)', () => {
  it('opening it, with focus fallen to the page (New loop has gone), puts focus on its heading', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(2)), countersOnBoard: 2 }));
    expect(document.activeElement).toBe(host.querySelector('h2'));
    expect(host.querySelector('h2')?.tabIndex).toBe(-1);
  });

  it('Start with these: focus goes to the heading, which now says the loop is not kept yet', async () => {
    const p = props({ state: chooseFromEmpty(startNewLoop(2)), countersOnBoard: 2 });
    render(p);
    const start = button('Start with these') as HTMLButtonElement;
    act(() => start.focus());
    act(() => start.click());
    render({ ...p, state: startWithThese(p.state) });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.activeElement).toBe(host.querySelector('h2'));
    expect(heading()).toBe('New loop 4 · not kept yet');
  });
});

describe('New loop on a stopped board (R2-T1-01)', () => {
  const STOPPED = 'Stopped. Press ▶ Play the board to hear the counters.';

  it('stopped inside New loop: says so, with a ▶ Play inside the panel, and never "only the counters sound"', () => {
    const p = props({ countersOnBoard: 2, stopped: { why: null, canPlay: true } });
    render(p);
    expect(text()).toContain(STOPPED);
    expect(text().toLowerCase()).not.toContain('only the counters sound');
    const play = button('▶ Play the board');
    expect(play?.disabled).toBe(false);
    act(() => play?.click());
    expect(p.onPlay).toHaveBeenCalled();
    // Keep still keeps what is on the board.
    expect(button('Keep')?.disabled).toBe(false);
  });

  it('while it plays: no "Press ▶ Play" line and no ▶ Play in the panel', () => {
    render(props({ countersOnBoard: 2, stopped: null }));
    expect(text()).not.toContain('Press ▶ Play');
    expect(button('▶ Play the board')).toBeUndefined();
    expect(text()).toContain('Only the counters sound.');
  });

  it('when the board can\'t start: the reason ▶ Play would give, ▶ Play off and described by it', () => {
    render(props({ countersOnBoard: 2, stopped: { why: "The camera isn't working.", canPlay: false } }));
    expect(text()).toContain("The camera isn't working.");
    expect(text()).not.toContain(STOPPED);
    expect(text().toLowerCase()).not.toContain('only the counters sound');
    expect(button('▶ Play the board')?.disabled).toBe(true);
    expect(describedBy(button('▶ Play the board'))).toBe("The camera isn't working.");
  });

  it('a sound problem: said, and ▶ Play can try again', () => {
    render(props({ countersOnBoard: 2, stopped: { why: 'Could not start. The sound device is busy.', canPlay: true } }));
    expect(text()).toContain('Could not start. The sound device is busy.');
    expect(button('▶ Play the board')?.disabled).toBe(false);
  });

  it('waiting for the board to be clear while stopped: both are said', () => {
    render(props({ state: chooseFromEmpty(startNewLoop(3)), countersOnBoard: 3, stopped: { why: null, canPlay: true } }));
    expect(text()).toContain(STOPPED);
    expect(text()).toContain('Lift the 3 counters to start from silence.');
  });

  it('▶ Play in the panel: once the board plays, focus goes to the heading, never the page', async () => {
    const p = props({ countersOnBoard: 2, stopped: { why: null, canPlay: true } });
    render(p);
    const play = button('▶ Play the board') as HTMLButtonElement;
    act(() => play.focus());
    act(() => play.click());
    render({ ...p, stopped: null });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.activeElement).toBe(host.querySelector('h2'));
  });

  it('the status line under the board says the same', () => {
    expect(newLoopStatusLine(null)).toBe('Making a new loop: only the counters sound. Keep it or leave in Make a piece, 1 · Loops.');
    expect(newLoopStatusLine({ why: null, canPlay: true })).toBe(`Making a new loop. ${STOPPED} Keep it or leave in Make a piece, 1 · Loops.`);
    expect(newLoopStatusLine({ why: "The camera isn't working.", canPlay: false })).toBe("Making a new loop. The camera isn't working. Keep it or leave in Make a piece, 1 · Loops.");
  });
});

describe('U1: counters already down, so New loop asks first (owner: a choice every time)', () => {
  const choosing = (): NewLoopPanelProps => props({ state: startNewLoop(3), countersOnBoard: 3 });

  it('says how many are down, and offers Keep what\'s on the board (the main button) beside Start from empty', () => {
    render(choosing());
    expect(text()).toContain('3 counters are on the board.');
    const keep = button("Keep what's on the board")!;
    const empty = button('Start from empty')!;
    expect(keep.style.background).toBe('var(--bs-accent)');
    expect(empty.style.background).toBe('var(--bs-raised)');
    // Nothing about lifting until the owner chooses to start from empty.
    expect(text()).not.toContain('Lift the');
    expect(button('Keep')).toBeUndefined();
  });

  it('each choice does its own thing', () => {
    const p = choosing();
    render(p);
    act(() => button("Keep what's on the board")?.click());
    expect(p.onKeepBoard).toHaveBeenCalledTimes(1);
    act(() => button('Start from empty')?.click());
    expect(p.onStartFromEmpty).toHaveBeenCalledTimes(1);
  });

  it('one counter is "1 counter is on the board."', () => {
    render(props({ state: startNewLoop(1), countersOnBoard: 1 }));
    expect(text()).toContain('1 counter is on the board.');
  });

  it('with every loop full there is nowhere to keep it: the main choice says why', () => {
    render(props({ state: startNewLoop(2), countersOnBoard: 2, loopNumber: null }));
    expect(button("Keep what's on the board")?.disabled).toBe(true);
  });

  it('Leave is there while choosing too', () => {
    const p = choosing();
    render(p);
    act(() => button('Leave')?.click());
    expect(p.onLeave).toHaveBeenCalled();
  });
});
