import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ReadyList, type ReadyItem } from '../ui/screens/boardSequencer/play/ReadyCheck';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = (items: ReadyItem[]): void => { act(() => root.render(<ReadyList items={items} />)); };
const frames = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const button = (name: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === name);

describe('ReadyList', () => {
  const warn: ReadyItem = {
    label: "Tim's iPad is not in the safe show layout", state: 'warn', fix: 'Fine if you chose it on purpose.',
    action: { label: 'Use the safe show layout', name: "Use the safe show layout on Tim's iPad", onClick: vi.fn() },
  };
  const ok: ReadyItem = { label: 'Board found', state: 'ok' };

  it('a fix button that goes once it has fixed its line: focus goes to the summary, which says what is left (R3-TB-01)', async () => {
    render([ok, warn]);
    const fix = button('Use the safe show layout');
    act(() => fix?.focus());
    act(() => fix?.click());
    expect(warn.action?.onClick).toHaveBeenCalledTimes(1);
    render([ok]);
    await frames();
    const summary = host.querySelector('p[role="status"]');
    expect(summary?.textContent).toBe('Everything is ready.');
    expect(document.activeElement).toBe(summary);
  });

  it('a fix button that stays (the line is still not fixed): focus stays on it', async () => {
    render([ok, warn]);
    const fix = button('Use the safe show layout');
    act(() => fix?.focus());
    act(() => fix?.click());
    render([ok, warn]);
    await frames();
    expect(document.activeElement).toBe(button('Use the safe show layout'));
  });
});
