import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ReadyList, type ReadyItem } from '../ui/screens/boardSequencer/play/ReadyCheck';
import { backupItem, boardItem } from '../ui/screens/boardSequencer/pieceCheck';

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

describe('advice is not a warning: the check can reach Ready (B21)', () => {
  it('the laptop board, chosen on purpose, and "Not backed up" are advice', () => {
    expect(boardItem({ laptop: true, cameraOk: false })).toMatchObject({ label: 'Board: the laptop board', state: 'note' });
    expect(backupItem(false)).toMatchObject({ label: 'Not backed up to a file yet', state: 'note' });
    expect(backupItem(true)).toMatchObject({ state: 'ok' });
    expect(boardItem({ laptop: false, cameraOk: true }).state).toBe('ok');
    expect(boardItem({ laptop: false, cameraOk: false }).state).toBe('problem');
  });

  it('with only advice left, the summary says Everything is ready, and the advice is still shown, with its words', () => {
    render([
      { label: 'Board found', state: 'ok' },
      boardItem({ laptop: true, cameraOk: false }),
      backupItem(false),
    ]);
    expect(host.textContent).toContain('Everything is ready.');
    expect(host.textContent).toContain('Board: the laptop board');
    // Its words wait behind the line (U7).
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Not backed up'))?.click());
    expect(host.textContent).toContain('Press Back up to a file below');
    expect(host.textContent).not.toContain('to check');
  });
});

describe('U7: advice is one line until opened; problems and things to check are open', () => {
  it('advice folds: its words come when its line is pressed', () => {
    render([{ label: 'Board found', state: 'ok' }, boardItem({ laptop: true, cameraOk: false }), backupItem(false)]);
    expect(host.textContent).toContain('Not backed up to a file yet');
    expect(host.textContent).not.toContain('Press Back up to a file below');
    const line = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Not backed up to a file yet'))!;
    expect(line.getAttribute('aria-expanded')).toBe('false');
    act(() => line.click());
    expect(line.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Press Back up to a file below');
  });

  it('a problem is open from the start, with its fix and its button', () => {
    const onClick = vi.fn();
    render([{ label: 'Open uses Bed, which is empty', state: 'problem', fix: 'Take it out of the scene.', action: { label: 'Take it out', name: 'Take it out: Bed', onClick } }]);
    expect(host.textContent).toContain('Take it out of the scene.');
    expect(button('Take it out')).toBeDefined();
  });

  it('a ✓ line has nothing to open', () => {
    render([{ label: 'Board found', state: 'ok' }]);
    expect(host.querySelector('button')).toBeNull();
  });
});
