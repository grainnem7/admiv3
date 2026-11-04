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
  const t = [...host.querySelectorAll('h3')].find((s) => s.textContent === title);
  return t?.nextElementSibling?.textContent ?? '';
}
const all = (): string => { act(() => root.render(<BoardHelp />)); return host.textContent ?? ''; };

describe('Help says how things work now', () => {
  it('a loop is made with New loop → counters → Keep, never "Save the board here" (F1)', () => {
    const steps = entry('Board, Make a piece, Show');
    expect(steps).toMatch(/Loops: Keep as loop, or New loop from silence: put counters down, then Keep/);
    expect(all()).not.toContain('Save the board here');
  });

  it('New loop waits for the piece to stop, in both places that say how to make a loop (F2)', () => {
    expect(entry('Board, Make a piece, Show')).toContain('While the piece plays no loop is made: stop it first.');
    expect(entry('Using saved loops live')).toContain('Not while the piece plays: stop it first.');
  });

  it('Stop needs two presses only while the piece plays', () => {
    expect(entry('Board, Make a piece, Show')).toContain('while the piece plays, Stop needs two presses');
  });

  it('Space: ▶ Play the board on the Board view, ▶ Start the piece in Show, also while the board plays (R2-T4-01, R3-TA-01)', () => {
    expect(entry('Keyboard')).toContain('Space: ▶ Play the board on the Board view, and Stop while it plays. In Show: ▶ Start the piece, also while the board plays; once the piece plays, Stop (press twice).');
    expect(all()).not.toContain('Start clock');
  });

  it('the names on screen (B16, B13, B23): Board, ▶ Play the board with no clock, Show, Next scene with its Back, ↘ End piece', () => {
    const views = entry('Board, Make a piece, Show');
    expect(views).toContain('Board: just play the board');
    expect(views).toContain('▶ Play the board plays what is on the board: no clock, no scenes.');
    expect(views).toContain('Next scene ▶ (↶ Back to the scene before, for one pass)');
    expect(views).toContain('↘ End piece');
    expect(all()).not.toContain('▶ Show');
    expect(all()).not.toMatch(/⏹|Next ▶/);
    expect(entry('Simplify, and keeping time')).toContain('Simplified: Tim and Bed');
  });

  it('the iPad: Mute needs two taps; the simple layout and what is on it', () => {
    expect(entry('iPad controls')).toContain('Mute needs two');
    const simple = entry('The iPad for a player without fine control');
    expect(simple).toContain('"Use the simple layout"');
    expect(simple).toContain('one page for playing live: Drums, Calm / Busy, what the melody plays (Piano, Flute, Trumpet, Sax) and the Board');
    expect(simple).toContain('Loops are made and switched on the laptop, not the iPad');
    expect(simple).toContain('Drums silent means no drums anywhere: the drum counters on the board (they stay there), the drums in every loop and the band’s drums');
    expect(simple).toContain('Calm plays the loops on their main beats only, with no Extra notes; Busy adds Extra notes round everything');
    expect(simple).toContain('"What the simple layout shows"');
    expect(simple).toContain('"Drums silenced on the iPad"');
    expect(simple).toContain('"Board counters silenced on the iPad"');
    expect(simple).not.toMatch(/Keep what|Nothing kept|New idea|Taken out|IN or OUT|ON or OFF/);
    expect(simple).toContain('Speed is set by the hat alone');
    expect(simple).not.toContain('safe show layout');
  });

  it('the band\'s middle level is Quiet, as on the Sound tab and in a scene (T1-12)', () => {
    expect(entry('The band')).toMatch(/^Off, Quiet or Full\./);
    expect(all()).not.toMatch(/\bGentle\b/);
  });

  it('buttons are called what they are called on screen', () => {
    // Scenes come in with Next or Jump here now (there is no Go); the laptop says Freeze.
    expect(all()).not.toMatch(/with Go\b|Keep freezes|Hold freezes/);
    expect(entry('Extra notes — the instrument adds notes')).toContain('📌 Freeze');
  });
});

describe('Help says how Show keeps the performance safe (audit 2026-10-30, batch 1)', () => {
  it('Show: the status row, Stop’s first 2 seconds, full screen, and the audience screen', () => {
    const show = entry('Board, Make a piece, Show');
    expect(show).toContain('for its first 2 seconds Stop does nothing');
    expect(show).toContain('A line under the clock says how the camera, the hat, the iPad and Ableton are');
    expect(show).toContain('Show stays open if the browser leaves full screen.');
    expect(show).toContain('the audience screen can’t be closed from Show; elsewhere closing it takes a second press');
  });

  it('the iPad: not reaching the laptop, and waiting for Carry on', () => {
    expect(entry('iPad controls')).toContain('"Not reaching the laptop"');
    expect(entry('iPad controls')).toContain('Show says "! iPad not reaching"');
    expect(entry('iPad controls')).toContain('the iPad waits for Carry on');
  });

  it('Keyboard: Esc leaves Show once out of full screen; focus goes to the Now / Next strip, never onto Stop', () => {
    expect(entry('Keyboard')).toContain('Leave Show (or Esc, once out of full screen) goes back.');
    expect(entry('Keyboard')).toContain('Start the piece to the Now / Next strip (never onto Stop)');
  });
});

describe('Help says how to change the times and Space (A7)', () => {
  it('Time to press again and Space plays and stops live in Sound → Advanced → Pressing', () => {
    const keys = entry('Keyboard');
    expect(keys).toContain('Sound → Advanced → Pressing sets Time to press again (3, 4, 6 or 10 seconds, 4 to start with)');
    expect(keys).toContain('"Space plays and stops"');
  });
});

describe('Help says how New loop asks first (U1)', () => {
  it('Keep what’s on the board, or Start from empty, and only kept loops listed', () => {
    const live = entry('Using saved loops live');
    expect(live).toContain('New loop asks first: Keep what’s on the board makes the loop from them at once; Start from empty');
    expect(live).toContain('Only the loops you have kept are listed, with how many places are free');
    expect(live).not.toContain('Start with these');
  });
});

describe('Help on scenes (U2)', () => {
  it('Jump here now is on every scene but the one on now; How scenes work explains them', () => {
    const steps = entry('Board, Make a piece, Show');
    expect(steps).toContain('Jump here now (on every scene but the one on now) switches to it at once');
    expect(steps).toContain('How scenes work, above the timeline, explains them.');
  });
});

describe('Help on Show’s two groups (U3)', () => {
  it('Stop and Mute on the playing hand’s side, the rest on the other', () => {
    expect(entry('Board, Make a piece, Show')).toContain('■ Stop and Mute sit on the playing hand’s side, and Simplify, the audience screen and Leave Show on the other.');
  });
});

describe('Help: More at every width (U4)', () => {
  it('the audience screen, Set up and Camera / Laptop are under More, at the top', () => {
    expect(entry('Board, Make a piece, Show')).toContain('Open the audience screen, Set up and Camera / Laptop are under More, at the top, with Explain the choices');
    expect(all()).not.toContain('narrower screen');
  });
});

describe('Help: Details under the board (U4)', () => {
  it('says what Details holds', () => {
    expect(entry('Board, Make a piece, Show')).toContain('Under the board, Details opens the key to the marks, the AI line, every colour’s sound and count, and Session log.');
  });
});

describe('Help: trying the board in Set up (U4)', () => {
  it('says the laptop board can be tried in Set up, silent until Play', () => {
    expect(entry('Setting up')).toContain('the board can be tried straight away: pick a colour above it and click squares. Nothing sounds until ▶ Play the board.');
  });
});

describe('Help: Explain the choices (U7)', () => {
  it('says where the switch is and what off does', () => {
    expect(entry('Board, Make a piece, Show')).toContain('with Explain the choices: off, the sentences under the choices go and the panels show only the choices.');
  });
});
