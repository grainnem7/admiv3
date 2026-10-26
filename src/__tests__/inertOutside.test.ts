// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { inertOutside } from '../ui/screens/boardSequencer/ui/Modal';

describe('a dialog puts the page behind it out of reach', () => {
  it('marks everything but the dialog (and what holds it) inert, and undoes exactly that', () => {
    document.body.innerHTML = `
      <div id="app">
        <header id="head"><button>Exit</button></header>
        <main id="main"><button>Play</button></main>
        <div id="overlay"><div role="dialog"><button>Close</button></div></div>
      </div>
      <div id="other"></div>
      <div id="already" inert></div>`;
    const overlay = document.getElementById('overlay')!;
    const undo = inertOutside(overlay);
    for (const id of ['head', 'main', 'other']) expect(document.getElementById(id)!.hasAttribute('inert')).toBe(true);
    for (const id of ['overlay', 'app']) expect(document.getElementById(id)!.hasAttribute('inert')).toBe(false);
    undo();
    for (const id of ['head', 'main', 'other']) expect(document.getElementById(id)!.hasAttribute('inert')).toBe(false);
    // Something that was inert before stays as it was.
    expect(document.getElementById('already')!.hasAttribute('inert')).toBe(true);
  });
});
