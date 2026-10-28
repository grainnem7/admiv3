import { describe, it, expect, afterEach } from 'vitest';
import { PLAY_AFTER_STOP_MS, spaceAction, spaceTogglesPlay } from '../ui/screens/boardSequencer/spaceKey';

afterEach(() => { document.body.innerHTML = ''; });

const el = (html: string): Element => {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
};

describe('spaceTogglesPlay', () => {
  it('never starts playback from Set up', () => {
    expect(spaceTogglesPlay('setup', document.body)).toBe(false);
  });

  it('toggles from Play and Big board when nothing is focused', () => {
    expect(spaceTogglesPlay('play', document.body)).toBe(true);
    expect(spaceTogglesPlay('bigBoard', document.body)).toBe(true);
    expect(spaceTogglesPlay('play', null)).toBe(true);
  });

  it('leaves Space to a focused control, including one inside it', () => {
    expect(spaceTogglesPlay('play', el('<button>Mute</button>'))).toBe(false);
    expect(spaceTogglesPlay('play', el('<select><option>a</option></select>'))).toBe(false);
    expect(spaceTogglesPlay('play', el('<input type="range" />'))).toBe(false);
    expect(spaceTogglesPlay('play', el('<div role="switch">Hints</div>'))).toBe(false);
    expect(spaceTogglesPlay('play', el('<button><span>Corner 1</span></button>').firstElementChild!)).toBe(false);
  });

  it('Space on "Earlier takes (n)" opens and closes the list, never the board (R2-T4-05)', () => {
    const summary = el('<details><summary>Earlier takes (2)</summary><ul><li>a take</li></ul></details>').firstElementChild!;
    expect(spaceTogglesPlay('play', summary)).toBe(false);
    expect(spaceAction('play', summary, { running: false, offerShowing: false, msSinceStop: Infinity })).toBe('none');
    expect(spaceAction('play', summary, { running: true, offerShowing: false, msSinceStop: Infinity })).toBe('none');
  });

  it('a plain region is not a control, so Space still toggles', () => {
    expect(spaceTogglesPlay('play', el('<div tabindex="-1">board</div>'))).toBe(true);
  });
});

describe('spaceAction: what one Space press does (R2-T4-01, ledger M7)', () => {
  const stopped = { running: false, offerShowing: false, msSinceStop: Infinity };
  const playing = { running: true, offerShowing: false, msSinceStop: Infinity };
  const region = (): Element => el('<div role="region" aria-label="Show" tabindex="-1">Show</div>');

  it('in Show, stopped, with focus on no control: ▶ Start the piece', () => {
    expect(spaceAction('bigBoard', region(), stopped)).toBe('startPiece');
    expect(spaceAction('bigBoard', document.body, stopped)).toBe('startPiece');
  });

  it('in Show, playing, with or without the piece: Stop', () => {
    expect(spaceAction('bigBoard', region(), playing)).toBe('stop');
    expect(spaceAction('bigBoard', document.body, playing)).toBe('stop');
  });

  it('in Play: ▶ Play when stopped (plain play, never the piece), Stop while playing', () => {
    expect(spaceAction('play', document.body, stopped)).toBe('play');
    expect(spaceAction('play', document.body, playing)).toBe('stop');
  });

  it('a press within 0.4 s of a Stop starts nothing, in Play and in Show', () => {
    const justStopped = { ...stopped, msSinceStop: 200 };
    expect(spaceAction('play', document.body, justStopped)).toBe('none');
    expect(spaceAction('bigBoard', region(), justStopped)).toBe('none');
    expect(spaceAction('bigBoard', region(), { ...stopped, msSinceStop: PLAY_AFTER_STOP_MS - 1 })).toBe('none');
    expect(spaceAction('bigBoard', region(), { ...stopped, msSinceStop: PLAY_AFTER_STOP_MS })).toBe('startPiece');
  });

  it('while the Carry on offer is on screen, Space on anything but a control does nothing', () => {
    const offer = { ...stopped, offerShowing: true };
    expect(spaceAction('play', document.body, offer)).toBe('none');
    expect(spaceAction('bigBoard', region(), offer)).toBe('none');
  });

  it('a focused control keeps its own Space (▶ Carry on pressed by Space is that button\'s), and Set up never plays', () => {
    expect(spaceAction('play', el('<button>▶ Carry on from 2:40</button>'), { ...stopped, offerShowing: true })).toBe('none');
    expect(spaceAction('bigBoard', el('<button>■ Stop</button>'), playing)).toBe('none');
    expect(spaceAction('setup', document.body, stopped)).toBe('none');
    expect(spaceAction('setup', document.body, playing)).toBe('none');
  });
});
