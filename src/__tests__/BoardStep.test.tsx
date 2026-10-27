import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { BoardStep, type BoardStepProps } from '../ui/screens/boardSequencer/setup/BoardStep';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function props(over: Partial<BoardStepProps> = {}): BoardStepProps {
  return {
    boardSquares: 8, rows: 8, cols: 8, nudgesEnabled: true, trackingEnabled: true, onTrackingEnabled: vi.fn(),
    running: false, editing: false, onFindBoard: vi.fn(), onTapCorners: vi.fn(), onBoardSquares: vi.fn(), onGrid: vi.fn(),
    onNudgesEnabled: vi.fn(), usingFallbackCamera: false, finding: false, onCancelFind: vi.fn(), findMessage: null,
    boardLearnt: 64, onLearnBoard: vi.fn(), learnMessage: null,
    detection: { mode: 'board', reason: null }, counterDetection: 'board', onCounterDetection: vi.fn(),
    onSaveTestPictures: vi.fn(), testPicturesMessage: null,
    ...over,
  };
}

/** What shows without opening anything: the text outside closed <details>. */
function visibleText(): string {
  const copy = host.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('details:not([open])').forEach((d) => {
    [...d.children].forEach((c) => { if (c.tagName !== 'SUMMARY') c.remove(); });
  });
  return copy.textContent ?? '';
}

describe('learning the empty board', () => {
  it('says it plainly: learnt or not, and no choice of how counters are found', () => {
    act(() => root.render(<BoardStep {...props()} />));
    const text = visibleText();
    expect(text).toContain('✓ Learnt');
    expect(text).not.toMatch(/Colour ranges|Against the learnt board|Counter detection/);
  });

  it('the old way is still there, inside For testing', () => {
    act(() => root.render(<BoardStep {...props()} />));
    const testing = [...host.querySelectorAll('details')].find((d) => /For testing/.test(d.querySelector('summary')?.textContent ?? ''));
    expect(testing?.textContent).toMatch(/old way/);
  });

  it('when counters can’t be found against the board, it says why', () => {
    act(() => root.render(<BoardStep {...props({ detection: { mode: 'bands', reason: 'The board size has changed since it was learnt. Learn the board again.' } })} />));
    expect(visibleText()).toContain('The board size has changed');
  });

  it('the old way chosen for testing is said outside, so it is never left on by mistake', () => {
    act(() => root.render(<BoardStep {...props({ counterDetection: 'bands', detection: { mode: 'bands', reason: null } })} />));
    expect(visibleText()).toMatch(/old way/);
  });
});
