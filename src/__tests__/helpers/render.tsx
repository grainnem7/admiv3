/**
 * A minimal React test renderer: `react-dom/client` + `act`, no extra dependencies.
 * Mounts into a container attached to the document, so focus and keyboard behaviour
 * (which is most of what these components promise) can actually be asserted.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

export interface Rendered {
  container: HTMLElement;
  root: Root;
  rerender(node: ReactNode): void;
  unmount(): void;
  /** Every element matching a selector, as an array. */
  all(selector: string): HTMLElement[];
  /** The first element matching a selector (throws when missing, so tests fail loudly). */
  get(selector: string): HTMLElement;
  /** The first element whose text content matches exactly. */
  byText(text: string, selector?: string): HTMLElement;
  /** An element by id (jsdom has no CSS.escape, and generated ids contain colons). */
  byId(id: string): HTMLElement;
}

export function render(node: ReactNode): Rendered {
  // React only allows act() when the environment opts in.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });

  const all = (selector: string): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(selector));

  return {
    container,
    root,
    rerender: (next: ReactNode) => { act(() => { root.render(next); }); },
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
    all,
    get: (selector: string) => {
      const el = container.querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`No element matches ${selector}`);
      return el;
    },
    byId: (id: string) => {
      const el = all('[id]').find((e) => e.id === id);
      if (!el) throw new Error(`No element with id "${id}"`);
      return el;
    },
    byText: (text: string, selector = '*') => {
      const el = all(selector).find((e) => e.textContent?.trim() === text);
      if (!el) throw new Error(`No ${selector} with text "${text}"`);
      return el;
    },
  };
}

/** Run an interaction inside `act` so React flushes before the assertions. */
export function fire(fn: () => void): void {
  act(() => { fn(); });
}

/** Dispatch a keydown the way a real key press would reach the focused element. */
export function pressKey(el: Element, key: string, init: KeyboardEventInit = {}): void {
  fire(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

export function click(el: Element): void {
  fire(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
