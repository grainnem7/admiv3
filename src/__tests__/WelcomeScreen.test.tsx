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

describe('U4: Welcome in the board’s look (owner)', () => {
  it('is a board page: the board’s class, style and dark mode, so it wears the board’s colours', () => {
    act(() => root.render(<WelcomeScreen />));
    const page = host.querySelector('.welcome-screen') as HTMLElement;
    expect(page.classList.contains('bs-root')).toBe(true);
    expect(page.dataset.bsStyle).toBe('calm');
    expect(page.dataset.bsMode).toBe('dark');
  });

  it('keeps one main region (A18): the app’s own', () => {
    act(() => root.render(<WelcomeScreen />));
    expect(host.querySelectorAll('[role="main"], main')).toHaveLength(0);
  });
});

describe('Timbo (owner, 4 Nov 2026)', () => {
  it('is called Timbo, with the red cap as its logo, and no ADMI', () => {
    act(() => root.render(<WelcomeScreen />));
    expect(host.querySelector('h1')?.textContent).toBe('Timbo');
    const logo = host.querySelector('.welcome-logo svg[role="img"]');
    expect(logo?.getAttribute('aria-label')).toBe('Timbo');
    expect(host.textContent).not.toMatch(/ADMI/);
  });
});
