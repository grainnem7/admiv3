import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { focusDropped, focusWhenGone } from '../ui/screens/boardSequencer/ui/focusNext';

/** A frame or two: the helper looks once a frame (setTimeout 16 ms in the tests). */
const frames = (n = 3): Promise<void> => new Promise((r) => setTimeout(r, n * 20));

let host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { host.remove(); });

function make(tag: 'button' | 'h3', text: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (tag === 'h3') el.tabIndex = -1;
  host.appendChild(el);
  return el;
}

describe('focus never drops to the page (T1-04, T4-09)', () => {
  it('a focused button taken off the page leaves focus on the page itself', () => {
    const b = make('button', 'Done');
    b.focus();
    expect(focusDropped()).toBe(false);
    b.remove();
    expect(focusDropped()).toBe(true);
  });

  it('once the pressed button has gone, focus goes to what took its place', async () => {
    const pressed = make('button', 'New loop');
    pressed.focus();
    let heading: HTMLElement | null = null;
    const done = focusWhenGone(() => heading, pressed);
    pressed.remove();
    await frames();
    // It waits for its target to appear (a piece starts once its sound is ready).
    heading = make('h3', 'New loop 1 · silent');
    expect(await done).toBe(heading);
    expect(document.activeElement).toBe(heading);
  });

  it('while the pressed button is still there, focus stays on it (Stop only got ready)', async () => {
    const pressed = make('button', '■ Stop');
    const other = make('button', '▶ Start the piece');
    pressed.focus();
    const done = focusWhenGone(() => other, pressed, 100);
    await frames(8);
    expect(await done).toBeNull();
    expect(document.activeElement).toBe(pressed);
  });

  it('never pulls focus back from somewhere the player has gone meanwhile', async () => {
    const pressed = make('button', 'Delete scene');
    const elsewhere = make('button', 'Name for a new scene');
    const undo = make('button', 'Undo');
    pressed.focus();
    const done = focusWhenGone(() => undo, pressed);
    pressed.remove();
    elsewhere.focus();
    expect(await done).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('a target that is off (disabled) is never focused', async () => {
    const pressed = make('button', 'Done');
    const off = make('button', 'New loop') as HTMLButtonElement;
    off.disabled = true;
    pressed.focus();
    const done = focusWhenGone(() => off, pressed, 100);
    pressed.remove();
    expect(await done).toBeNull();
  });
});
