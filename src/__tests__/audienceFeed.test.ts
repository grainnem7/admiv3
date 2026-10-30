import { describe, it, expect } from 'vitest';
import { audienceHat, audienceNotes, audienceState, createAudienceFeed, drawStalled, dueNotes, STALE_NOTE_SEC, type HatInput } from '../audience/feed';
import { choosePlacement, outcomeOf, type ScreenInfo } from '../audience/placement';
import { audienceNoticeText, openingNotice } from '../audience/useAudienceWindow';
import { readAudienceMessage, readLaptopMessage, type AudienceState, type LaptopMessage } from '../audience/protocol';
import type { FiredNote } from '../songs/BoardSequencerEngine';

const HAT: HatInput = {
  capEnabled: true, laptop: false, mouse: false, camera: 'running', seen: true, paused: false, locked: false,
  learning: false, axes: { x: 0.25, y: 0.75 }, xRole: 'tempo', yRole: 'tone',
};

describe("the light's hat", () => {
  it('follows the real hat: where it is on its learnt range, and its Brightness', () => {
    expect(audienceHat(HAT)).toEqual({ mode: 'follow', x: 0.25, y: 0.75, warmth: 0.75 });
  });

  it('takes Brightness from whichever way the hat moves it', () => {
    expect(audienceHat({ ...HAT, xRole: 'tone', yRole: 'tempo' }).warmth).toBe(0.25);
  });

  it('with Brightness on neither way, the height of the hat warms the light', () => {
    expect(audienceHat({ ...HAT, yRole: 'volume' }).warmth).toBe(0.75);
  });

  it('counts as out of sight: hat unseen, the mouse, a pause, frozen, learning, no picture yet', () => {
    for (const over of [
      { seen: false }, { mouse: true, camera: 'mouse' as const }, { mouse: true }, { paused: true }, { locked: true },
      { learning: true }, { camera: 'starting' as const }, { axes: { x: null, y: null } },
    ]) {
      expect(audienceHat({ ...HAT, ...over })).toEqual({ mode: 'lost', x: null, y: null, warmth: null });
    }
  });

  it('with no hat in use (off, or the laptop board), the light is on its own', () => {
    expect(audienceHat({ ...HAT, capEnabled: false }).mode).toBe('free');
    expect(audienceHat({ ...HAT, laptop: true }).mode).toBe('free');
  });
});

const note = (over: Partial<FiredNote> = {}): FiredNote => ({
  row: 1, col: 2, colour: 'c1', role: 'melody', audioTime: 10, durSec: 0.5, source: 'live', ...over,
});

describe('which notes bloom now', () => {
  it('only notes being heard: not the look-ahead, not old ones', () => {
    const soon = note({ audioTime: 10.2 });
    const now = note({ audioTime: 9.95 });
    const old = note({ audioTime: 10 - STALE_NOTE_SEC - 0.05 });
    const r = dueNotes([soon, now, old], 10);
    expect(r.due).toEqual([now]);
    expect(r.rest).toEqual([soon]);
  });
});

/** A channel that keeps what was posted, and lets the test speak as the other window. */
function fakeChannel() {
  const sent: LaptopMessage[] = [];
  const ch = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: (m: LaptopMessage) => { sent.push(m); },
    close: () => {},
  };
  const hear = (data: unknown): void => ch.onmessage?.({ data } as MessageEvent);
  return { ch, sent, hear };
}

const STATE: Omit<AudienceState, 'kind'> = {
  rows: 8, cols: 8, counters: [{ row: 1, col: 1, colour: '#f00' }], playing: false, scene: null, world: 'none', bpm: 100,
  hat: { mode: 'free', x: null, y: null, warmth: null },
};

describe('the feed to the audience screen', () => {
  it('sends nothing until an audience screen says it is there, and says hello when it starts', () => {
    const { ch, sent, hear } = fakeChannel();
    const feed = createAudienceFeed(ch);
    expect(sent).toEqual([{ kind: 'hello' }]);
    expect(feed.alive(0)).toBe(false);
    feed.state(STATE, 0);
    expect(sent).toHaveLength(1);
    hear({ kind: 'here' });
    expect(feed.alive(performance.now())).toBe(true);
    feed.state(STATE, 1000);
    expect(sent.at(-1)).toEqual({ kind: 'state', ...STATE });
  });

  it('sends the state only when it changes, or once a second', () => {
    const { ch, sent, hear } = fakeChannel();
    const feed = createAudienceFeed(ch);
    hear({ kind: 'here' });
    feed.state(STATE, 1000);
    const n = sent.length;
    feed.state(STATE, 1100);
    expect(sent).toHaveLength(n);
    feed.state({ ...STATE, scene: 'Build' }, 1200);
    expect(sent).toHaveLength(n + 1);
    feed.state({ ...STATE, scene: 'Build' }, 2300);
    expect(sent).toHaveLength(n + 2);
  });

  it('hears an audience screen leave', () => {
    const { ch, hear } = fakeChannel();
    const feed = createAudienceFeed(ch);
    hear({ kind: 'here' });
    hear({ kind: 'bye' });
    expect(feed.alive(performance.now())).toBe(false);
  });

  it('never answers the tabs: other messages are ignored', () => {
    const { ch, sent, hear } = fakeChannel();
    createAudienceFeed(ch);
    hear('hello');
    hear({ kind: 'nonsense' });
    expect(sent).toEqual([{ kind: 'hello' }]);
  });
});

describe('messages between the windows', () => {
  it('reads only well-formed messages', () => {
    expect(readLaptopMessage({ kind: 'state', ...STATE })).toEqual({ kind: 'state', ...STATE });
    expect(readLaptopMessage({ kind: 'state', rows: 'x' })).toBeNull();
    expect(readLaptopMessage({ kind: 'notes', notes: [{ row: 1, col: 2, colour: '#fff', band: false }] })).not.toBeNull();
    expect(readLaptopMessage({ kind: 'notes', notes: 'x' })).toBeNull();
    expect(readLaptopMessage('hello')).toBeNull();
    expect(readAudienceMessage({ kind: 'here' })).toEqual({ kind: 'here' });
    expect(readAudienceMessage({ kind: 'state' })).toBeNull();
  });
});

const laptopScreen: ScreenInfo = {
  left: 0, top: 0, width: 1920, height: 1080, availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040, isPrimary: true, isInternal: true,
};
const projector: ScreenInfo = {
  left: 1920, top: 0, width: 1280, height: 720, availLeft: 1920, availTop: 0, availWidth: 1280, availHeight: 720, isPrimary: false, isInternal: false,
};

describe('placing the audience screen', () => {
  it('goes onto the second screen and fills it, when the browser may place windows', () => {
    expect(choosePlacement({ api: true, granted: true, screens: [laptopScreen, projector], current: laptopScreen }))
      .toEqual({ kind: 'screen', left: 1920, top: 0, width: 1280, height: 720 });
  });

  it('picks the screen the laptop page is not on, even when the laptop page is on the second one', () => {
    expect(choosePlacement({ api: true, granted: true, screens: [laptopScreen, projector], current: projector }))
      .toMatchObject({ kind: 'screen', left: 0 });
  });

  it('asks for a drag when permission is refused, the browser cannot place windows, or there is one screen', () => {
    expect(choosePlacement({ api: true, granted: false })).toEqual({ kind: 'drag', why: 'refused' });
    expect(choosePlacement({ api: false })).toEqual({ kind: 'drag', why: 'no-api' });
    expect(choosePlacement({ api: true, granted: true, screens: [laptopScreen], current: laptopScreen }))
      .toEqual({ kind: 'drag', why: 'one-screen' });
  });
});

describe('what the audience screen is told', () => {
  const cfg = {
    rows: 8, cols: 16, currentScene: 1, soundWorld: 'ambient' as const,
    channels: [{ id: 'c1', swatch: '#ff0000' }, { id: 'c2', swatch: '#0000ff' }],
    scenes: [{ name: 'Open' }, { name: 'Build' }],
  };
  const hat = { mode: 'free' as const, x: null, y: null, warmth: null };

  it("Tim's counters in their colours, the board's size, the world, the speed", () => {
    const s = audienceState(cfg, [{ row: 2, col: 3, colour: 'c2' }], true, 132, hat);
    expect(s).toEqual({
      rows: 8, cols: 16, counters: [{ row: 2, col: 3, colour: '#0000ff' }], playing: true, scene: 'Build',
      world: 'ambient', bpm: 132, hat,
    });
  });

  it('the scene name only while the board plays', () => {
    expect(audienceState(cfg, [], false, 100, hat).scene).toBeNull();
    expect(audienceState({ ...cfg, currentScene: null }, [], true, 100, hat).scene).toBeNull();
  });

  it("each note at its square in its colour; the band's have no square", () => {
    const swatch = (id: string): string => (id === 'c1' ? '#ff0000' : '#888888');
    expect(audienceNotes([
      note({ row: 1, col: 2, colour: 'c1' }),
      note({ row: 4, col: 5, colour: 'c1', origin: 'fill' }),
      note({ row: -1, col: -1, colour: 'band:bass', origin: 'band' }),
    ], swatch)).toEqual([
      { row: 1, col: 2, colour: '#ff0000', band: false },
      { row: 4, col: 5, colour: '#ff0000', band: false },
      { row: -1, col: -1, colour: '#888888', band: true },
    ]);
  });
});

describe('the feed costs nothing it need not', () => {
  it('says when a state is wanted: only with a window open, and not more often than it sends', () => {
    const { ch, hear } = fakeChannel();
    const feed = createAudienceFeed(ch);
    expect(feed.wantsState(0)).toBe(false);
    hear({ kind: 'here' });
    expect(feed.wantsState(1000)).toBe(true);
    feed.state(STATE, 1000);
    expect(feed.wantsState(1010)).toBe(false);
    expect(feed.wantsState(1100)).toBe(true);
  });
});

describe('the two-window routine (audit 2026-10-30: B5, B6, B26)', () => {
  it('B5: the placed and drag notices end by sending the owner back to the laptop', () => {
    expect(audienceNoticeText('placed')).toMatch(/then click back on this laptop screen\.$/);
    expect(audienceNoticeText('drag')).toMatch(/then click back on this laptop screen\.$/);
  });

  it('B5: with only one screen found, asks whether the projector is set to Extend', () => {
    expect(outcomeOf({ kind: 'drag', why: 'one-screen' })).toBe('oneScreen');
    expect(outcomeOf({ kind: 'drag', why: 'refused' })).toBe('drag');
    expect(outcomeOf({ kind: 'screen', left: 0, top: 0, width: 1, height: 1 })).toBe('placed');
    expect(audienceNoticeText('oneScreen')).toBe('Only one screen found. Is the projector set to Extend (Windows key + P)?');
  });

  it('B26: a window slow to say it is there is "still opening" after 8 s, and "didn’t open" only after about 20 s', () => {
    expect(openingNotice(7_000, false)).toBeNull();
    expect(openingNotice(8_500, false)).toBe('stillOpening');
    expect(openingNotice(19_000, false)).toBe('stillOpening');
    expect(openingNotice(20_500, false)).toBe('blocked');
    // Once it has said it is there, nothing more is said.
    expect(openingNotice(9_000, true)).toBeNull();
    expect(openingNotice(25_000, true)).toBeNull();
    expect(audienceNoticeText('stillOpening')).toBe('Still opening the audience screen…');
  });

  it('B6: the audience screen is fed from a timer once the drawing loop stops (page hidden, or no frame for 0.5 s)', () => {
    expect(drawStalled(false, 1000, 900)).toBe(false);
    expect(drawStalled(false, 1600, 1000)).toBe(true);
    expect(drawStalled(true, 1000, 990)).toBe(true);
    // Never drawn yet (the board not running): the timer feeds it.
    expect(drawStalled(false, 1000, null)).toBe(true);
  });
});
