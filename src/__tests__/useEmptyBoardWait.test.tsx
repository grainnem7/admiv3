// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { EMPTY_CHECK_MS, useEmptyBoardWait } from '../ui/screens/boardSequencer/useEmptyBoardWait';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * New loop's "Lift the counters to start from silence". The screen hands the hook a new
 * look at the board on every render, reading that render's counters, as the screen's own
 * `soundingOnBoard` does. On the camera board while stopped, the wait kept the look from
 * when it began: lifting the counters was never seen, the panel said the board was clear,
 * and Keep never came.
 */

interface Props { waiting: boolean; sounding: number; settleMs: number | null; onSeen(n: number): void }
function Board({ waiting, sounding, settleMs, onSeen }: Props): null {
  useEmptyBoardWait(waiting, () => ({ sounding, settleMs }), onSeen);
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const render = (p: Props): void => { act(() => root.render(<Board {...p} />)); };
const wait = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const CAMERA_SETTLE_MS = 600;

describe('New loop waits for the board to be cleared', () => {
  it('camera board, stopped: counters lifted after the wait began are seen, and the wait ends after the settle window', () => {
    const onSeen = vi.fn();
    render({ waiting: true, sounding: 2, settleMs: CAMERA_SETTLE_MS, onSeen });
    expect(onSeen).toHaveBeenLastCalledWith(2);
    // The camera now sees an empty board: the screen renders with no counters.
    render({ waiting: true, sounding: 0, settleMs: CAMERA_SETTLE_MS, onSeen });
    wait(CAMERA_SETTLE_MS - 2 * EMPTY_CHECK_MS);
    expect(onSeen).not.toHaveBeenCalledWith(0); // not on the first clear look: it must stay clear
    wait(4 * EMPTY_CHECK_MS);
    expect(onSeen).toHaveBeenLastCalledWith(0);
  });

  it('camera board: one clear look among counters never ends the wait', () => {
    const onSeen = vi.fn();
    render({ waiting: true, sounding: 1, settleMs: CAMERA_SETTLE_MS, onSeen });
    render({ waiting: true, sounding: 0, settleMs: CAMERA_SETTLE_MS, onSeen });
    wait(2 * EMPTY_CHECK_MS);
    render({ waiting: true, sounding: 1, settleMs: CAMERA_SETTLE_MS, onSeen });
    wait(CAMERA_SETTLE_MS * 2);
    expect(onSeen).not.toHaveBeenCalledWith(0);
    expect(onSeen).toHaveBeenLastCalledWith(1);
  });

  it('laptop board: a clear board counts at once (a click is certain)', () => {
    const onSeen = vi.fn();
    render({ waiting: true, sounding: 3, settleMs: null, onSeen });
    render({ waiting: true, sounding: 0, settleMs: null, onSeen });
    wait(EMPTY_CHECK_MS);
    expect(onSeen).toHaveBeenLastCalledWith(0);
  });

  it('no longer waiting: the board is not looked at', () => {
    const onSeen = vi.fn();
    render({ waiting: true, sounding: 3, settleMs: null, onSeen });
    render({ waiting: false, sounding: 3, settleMs: null, onSeen });
    onSeen.mockClear();
    wait(10 * EMPTY_CHECK_MS);
    expect(onSeen).not.toHaveBeenCalled();
  });
});
