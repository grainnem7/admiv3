import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { SetupFlow, type SetupFlowProps } from '../ui/screens/boardSequencer/setup/SetupFlow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function props(over: Partial<SetupFlowProps> = {}): SetupFlowProps {
  return {
    step: 'camera', onStepChange: vi.fn(), cfg: { enabled: false, channels: [] },
    camera: { phase: 'starting', colourless: null }, hasStoredConfig: false, announce: vi.fn(),
    heading: 'Point the camera at the board', children: <p>the camera</p>,
    ...over,
  };
}
const render = (p: SetupFlowProps): void => { act(() => root.render(<SetupFlow {...p} />)); };
const heading = (): HTMLElement | null => host.querySelector('h2');

describe('Set up: focus on the step heading (R2-T4-02)', () => {
  it('a step opening puts focus on its heading, and says which step it is', () => {
    const p = props();
    render(p);
    expect(document.activeElement).toBe(heading());
    expect(p.announce).toHaveBeenCalledWith('Step 1 of 4: Camera');
  });

  it('while something covers set-up (who is playing), its heading never takes focus from it', () => {
    const name = document.createElement('input');
    document.body.appendChild(name);
    try {
      name.focus();
      const p = props({ holdFocus: true });
      render(p);
      expect(document.activeElement).toBe(name);
      expect(p.announce).not.toHaveBeenCalled();
      // Once it is gone (Create), the same step's heading takes focus: never the page.
      name.remove();
      render({ ...p, holdFocus: false });
      expect(document.activeElement).toBe(heading());
      expect(p.announce).toHaveBeenCalledWith('Step 1 of 4: Camera');
    } finally { name.remove(); }
  });
});
