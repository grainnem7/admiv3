/**
 * A8 (audit 2026-10-30): Help opens at the top with focus on its heading, has links to its
 * sections, and keeps Close outside the scrolling text.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { HelpDialog } from '../ui/components/board/HelpDialog';
import { HELP } from '../ui/components/board/BoardHelp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let closed = 0;
beforeEach(() => {
  closed = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<HelpDialog onClose={() => { closed++; }} />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const dialog = (): HTMLElement => host.querySelector('[role="dialog"]') as HTMLElement;

describe('Help opens at the top', () => {
  it('focus is on its heading, not on Close at the end', () => {
    const h = document.activeElement as HTMLElement;
    expect(h.tagName).toBe('H2');
    expect(h.textContent).toBe('How to play');
    expect(dialog().contains(h)).toBe(true);
  });

  it('every entry is a heading under it (h2, then h3), and there is one h2', () => {
    expect(dialog().querySelectorAll('h2').length).toBe(1);
    expect(dialog().querySelectorAll('h3').length).toBe(HELP.length);
    expect(dialog().querySelector('h1')).toBeNull();
  });

  it('has a link to each section, and a link moves focus to that section’s heading', () => {
    const nav = dialog().querySelector('nav[aria-label="Help sections"]') as HTMLElement;
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(HELP.map((e) => e.title));
    const keyboard = links.find((a) => a.textContent === 'Keyboard') as HTMLAnchorElement;
    act(() => keyboard.click());
    expect(document.activeElement?.tagName).toBe('H3');
    expect(document.activeElement?.textContent).toBe('Keyboard');
  });

  it('Close is outside the scrolling text, and closes', () => {
    const close = [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Close') as HTMLButtonElement;
    expect(close).toBeTruthy();
    const scroller = dialog().querySelector('[data-scroll]') as HTMLElement;
    expect(scroller).toBeTruthy();
    expect(scroller.contains(close)).toBe(false);
    act(() => close.click());
    expect(closed).toBe(1);
  });
});
