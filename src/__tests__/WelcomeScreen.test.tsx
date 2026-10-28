import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import WelcomeScreen from '../ui/screens/WelcomeScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('Welcome', () => {
  it('lists no keys that are not true on the board: no "Space Mute", no "D Debug" (R2-T4-07, R2-T2-08)', () => {
    act(() => root.render(<WelcomeScreen />));
    expect(host.textContent).toContain('Set up the board');
    expect(host.textContent).not.toMatch(/Debug/);
    expect(host.textContent).not.toMatch(/Space\s*Mute/);
    expect(host.querySelector('kbd')).toBeNull();
  });
});
