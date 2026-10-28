import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import BoardHelp from '../ui/components/board/BoardHelp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

/** One entry of the Help: its words, found by its title. */
function entry(title: string): string {
  act(() => root.render(<BoardHelp />));
  const t = [...host.querySelectorAll('span')].find((s) => s.textContent === title);
  return t?.nextElementSibling?.textContent ?? '';
}
const all = (): string => { act(() => root.render(<BoardHelp />)); return host.textContent ?? ''; };

describe('Help says how things work now', () => {
  it('a loop is made with New loop → counters → Keep, never "Save the board here" (F1)', () => {
    const steps = entry('Play, Make a piece, Show');
    expect(steps).toMatch(/1 Loops: press New loop, put counters down, then Keep/);
    expect(all()).not.toContain('Save the board here');
  });

  it('New loop waits for the piece to stop, in both places that say how to make a loop (F2)', () => {
    expect(entry('Play, Make a piece, Show')).toContain('While the piece plays no loop is made: stop it first.');
    expect(entry('Using saved loops live')).toContain('Not while the piece plays: stop it first.');
  });

  it('Stop needs two presses only while the piece plays', () => {
    expect(entry('Play, Make a piece, Show')).toContain('while the piece plays, Stop needs two presses');
  });

  it('the iPad: Mute needs two taps; the safe show layout has three things', () => {
    expect(entry('iPad controls')).toContain('Mute needs two');
    expect(entry('The iPad for a player without fine control')).toContain('only the Extra notes strip, New idea and End piece, with Speed locked');
  });

  it('buttons are called what they are called on screen', () => {
    // Scenes come in with Next or Jump here now (there is no Go); the laptop says Freeze.
    expect(all()).not.toMatch(/with Go\b|Keep freezes|Hold freezes/);
    expect(entry('Extra notes — the instrument adds notes')).toContain('📌 Freeze');
  });
});
