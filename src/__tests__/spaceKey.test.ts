import { describe, it, expect, afterEach } from 'vitest';
import { spaceTogglesPlay } from '../ui/screens/boardSequencer/spaceKey';

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

  it('a plain region is not a control, so Space still toggles', () => {
    expect(spaceTogglesPlay('play', el('<div tabindex="-1">board</div>'))).toBe(true);
  });
});
