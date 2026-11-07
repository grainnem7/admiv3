import { describe, it, expect, vi } from 'vitest';
import { aloneLine, faceCheckItem, hatSpeedItem, hatVolumeItem, ipadCheckItems, readySummary, secondLaptopItem, keepingTimeCheckItems, pieceCheckItems, updatedFromNowLine, type IpadCheckInput, type PieceCheckInput } from '../ui/screens/boardSequencer/pieceCheck';
import type { KeepingTimeReport } from '../songs/keepingTime';
import { DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene, SceneSettings } from '../songs/performance/launcher';

/**
 * The check before the piece (Make a piece → Ending & check): it must never say Ready
 * when the piece can go silent, run over, or leave a scene out (T3-01, T2-06, T2-07,
 * T2-11).
 */

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0.3, evolveAmount: 0, bpm: 90, chords: { sequence: 'asBefore', bars: 2 }, bandJobs: { asBefore: true, pads: true, bass: true, drums: true, counter: false }, sceneEnergy: 0 };
const scene = (name: string, at: number | null, loops: number[], extra: Partial<Scene> = {}): Scene =>
  ({ id: name, name, loops, settings, ...(at === null ? {} : { at }), ...extra });
const NOTE = [{ row: 0, col: 0 }];

function input(over: Partial<PieceCheckInput> = {}): PieceCheckInput {
  return {
    scenes: [scene('Arrival', 0, [0]), scene('Build', 90, [0, 1]), scene('Open', 210, [0, 1]), scene('Home', 360, [0])],
    loopSlots: [NOTE, NOTE, null, null, null, null, null, null],
    loopNames: ['Bed', '', '', '', '', '', '', ''],
    performance: { ...DEFAULT_PERFORMANCE, lengthSec: 420, style: 'fade', fadePasses: 2 },
    passSec: 5.3,
    playerName: 'Tim',
    onTakeOut: vi.fn(),
    ...over,
  };
}
const problems = (p: PieceCheckInput): string[] => pieceCheckItems(p).filter((i) => i.state === 'problem').map((i) => i.label);
const find = (p: PieceCheckInput, label: string | RegExp) =>
  pieceCheckItems(p).find((i) => (typeof label === 'string' ? i.label === label : label.test(i.label)));

describe('the check — a piece that is ready', () => {
  it('every scene has loops, a time, and is inside the piece: no problems', () => {
    expect(problems(input())).toEqual([]);
    expect(find(input(), 'Every loop the scenes use is saved')?.state).toBe('ok');
    expect(find(input(), '4 scenes come in on the clock, one at 0:00')?.state).toBe('ok');
  });
});

describe('the check — a scene that would be silent', () => {
  it('a scene with no loops, not marked to play alone, is a problem that names it and says how to fix it', () => {
    const p = input({ scenes: [scene('Arrival', 0, [0]), scene('Open', 210, [])] });
    const item = find(p, 'No loop plays in Open');
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe('The room will be silent there unless Tim plays: press its card under the board, add a loop or tick “Tim alone”.');
  });

  it('several such scenes are named together', () => {
    const p = input({ scenes: [scene('Arrival', 0, []), scene('Build', 90, [0]), scene('Open', 210, [])] });
    expect(find(p, 'No loop plays in Arrival and Open')?.state).toBe('problem');
  });

  it('marked "Tim alone", the same scene is fine', () => {
    const p = input({ scenes: [scene('Arrival', 0, [0]), scene('Open', 210, [], { alone: true })] });
    expect(problems(p)).toEqual([]);
  });

  it('with no player name, it says "the player"', () => {
    const p = input({ playerName: null, scenes: [scene('Open', 0, [])] });
    expect(find(p, 'No loop plays in Open')?.fix).toBe('The room will be silent there unless the player plays: press its card under the board, add a loop or tick “The player alone”.');
  });
});

describe('the check — an empty loop', () => {
  it('names the loop and the scenes, and offers "Take it out" right there (T2-06)', () => {
    const p = input({
      loopSlots: [null, NOTE, null, null, null, null, null, null],
      scenes: [scene('Arrival', 0, [0, 1]), scene('Build', 90, [1]), scene('Home', 360, [0, 1])],
    });
    const item = find(p, 'Arrival and Home use Bed, which is empty');
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe('Take it out of those scenes, or make a new loop and add that instead.');
    expect(item?.action?.label).toBe('Take it out');
    item?.action?.onClick();
    expect(p.onTakeOut).toHaveBeenCalledWith(0);
    expect(find(p, 'Every loop the scenes use is saved')).toBeUndefined();
  });

  it('an unnamed empty loop is "Loop N"; each empty loop has its own line', () => {
    const p = input({ scenes: [scene('Arrival', 0, [0, 2]), scene('Build', 90, [3])] });
    expect(find(p, 'Arrival uses Loop 3, which is empty')?.fix).toBe('Take it out of the scene, or make a new loop and add that instead.');
    expect(find(p, 'Build uses Loop 4, which is empty')?.state).toBe('problem');
  });

  it('a scene whose only loop is empty is silent too', () => {
    const p = input({ loopSlots: [NOTE, null], scenes: [scene('Arrival', 0, [0]), scene('Open', 210, [1])] });
    expect(problems(p)).toEqual(['Open uses Loop 2, which is empty', 'No loop plays in Open']);
  });
});

describe('the check — times', () => {
  it('a scene with no time only comes in if someone presses Next (T2-11)', () => {
    const p = input({ scenes: [scene('Arrival', 0, [0]), scene('Open', null, [0])] });
    const item = find(p, 'Open has no time');
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe('It only comes in if someone presses Next: delete it, or shorten a scene and keep it again.');
    expect(find(p, '1 scene comes in on the clock, one at 0:00')?.state).toBe('ok');
  });

  it('a scene at or after the end of the piece is never heard', () => {
    const p = input({ performance: { ...input().performance, lengthSec: 360 } });
    const item = find(p, 'Home comes in at or after the end (6:00)');
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe('It is never heard: shorten the scene before it, or make the piece longer.');
    // At 7:00 the piece cannot be made longer, so that is not offered.
    const at7 = input({ scenes: [scene('Arrival', 0, [0]), scene('Late', 420, [0])] });
    expect(find(at7, 'Late comes in at or after the end (7:00)')?.fix).toBe('It is never heard: shorten the scene before it.');
  });

  it('two scenes at the same moment: only one is heard', () => {
    const p = input({ scenes: [scene('Arrival', 0, [0]), scene('Build', 105, [0]), scene('Open', 105, [1])] });
    const item = find(p, 'Build and Open come in at the same moment (1:45)');
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe('Only one of them is heard: change a scene’s length under the board so each has its own time.');
  });

  it('a scene that comes in after the ending has begun is not heard (a warning)', () => {
    // The ending (fade over 2 passes of 5.3 s) begins about 16.7 s before 7:00.
    const p = input({ scenes: [scene('Arrival', 0, [0]), scene('Last', 410, [0])] });
    const item = find(p, /^Last comes in after the ending has begun/);
    expect(item?.label).toBe('Last comes in after the ending has begun (about 6:43)');
    expect(item?.state).toBe('warn');
    expect(item?.fix).toBe('The piece is ending by then, so it is not heard: shorten the scene before it, or choose a shorter ending.');
    expect(problems(p)).toEqual([]);
  });
});

describe('the check — length and ending', () => {
  it('a length over 7:00 (only from old saved data) is a problem (T2-07)', () => {
    const p = input({ performance: { ...input().performance, lengthSec: 480 } });
    const item = find(p, 'The piece is 8:00 long: the most is 7:00');
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe('Set Length of the piece to 7:00 or less.');
  });

  it('keeps the ending line', () => {
    expect(find(input(), 'Ending: fade over 2 passes, when you press End')?.state).toBe('ok');
    const long = input({ performance: { ...input().performance, lengthSec: 30, fadePasses: 4 } });
    expect(find(long, 'The ending is too long for the piece')?.state).toBe('problem');
  });

  it('no scenes is still only a warning: the board plays and the clock ends the piece', () => {
    expect(find(input({ scenes: [] }), 'No scenes yet')?.state).toBe('warn');
    expect(problems(input({ scenes: [] }))).toEqual([]);
  });
});

describe('the check — the iPad', () => {
  function ipad(over: Partial<IpadCheckInput> = {}): IpadCheckInput {
    return { enabled: true, connected: true, simpleLayout: true, pageOutOfDate: false, playerName: 'Tim', onUseSimpleLayout: vi.fn(), ...over };
  }
  const labels = (p: IpadCheckInput): string[] => ipadCheckItems(p).map((i) => i.label);

  it('not in use: one line, and nothing about its layout or its page', () => {
    expect(ipadCheckItems(ipad({ enabled: false, simpleLayout: false, pageOutOfDate: true }))).toEqual([{ label: 'iPad not in use', state: 'ok' }]);
  });

  it('connected, in the simple layout and up to date: one line, ready', () => {
    expect(ipadCheckItems(ipad())).toEqual([{ label: 'iPad connected', state: 'ok' }]);
  });

  it('not connected is a warning saying where the link is', () => {
    const item = ipadCheckItems(ipad({ connected: false }))[0];
    expect(item).toMatchObject({ label: 'iPad not connected', state: 'warn' });
  });

  it("not in the simple layout: a warning that names the player, with the button that sets it", () => {
    const p = ipad({ simpleLayout: false });
    const item = ipadCheckItems(p).find((i) => i.label === "Tim's iPad is not in the simple layout");
    expect(item?.state).toBe('warn');
    expect(item?.fix).toBe('More on the iPad means one stray touch can do more, such as skip a scene or stop a loop. Fine if you chose it on purpose.');
    expect(item?.action?.label).toBe('Use the simple layout');
    expect(item?.action?.name).toBe("Use the simple layout on Tim's iPad");
    item?.action?.onClick();
    expect(p.onUseSimpleLayout).toHaveBeenCalledTimes(1);
  });

  it('the layout warning never stops Ready (a fuller layout may be on purpose), connected or not', () => {
    for (const connected of [true, false]) {
      const items = ipadCheckItems(ipad({ simpleLayout: false, connected }));
      expect(items.some((i) => i.label.endsWith('is not in the simple layout'))).toBe(true);
      expect(items.filter((i) => i.state === 'problem')).toEqual([]);
    }
  });

  it("an iPad page from before an update: named, with what to do", () => {
    const item = ipadCheckItems(ipad({ pageOutOfDate: true })).find((i) => /page is out of date/.test(i.label));
    expect(item?.label).toBe("Tim's iPad page is out of date: reload it on the iPad.");
    expect(item?.state).toBe('problem');
    expect(item?.fix).toBe("An old page may not have today's protections, such as the bounce guard on End piece. If this stays after the reload, reload Timbo on this laptop too.");
  });

  it('an out-of-date page is only said while the iPad is connected', () => {
    expect(labels(ipad({ pageOutOfDate: true, connected: false })).some((l) => /out of date/.test(l))).toBe(false);
  });

  it("with no player name, it says \"The player's iPad\"", () => {
    expect(labels(ipad({ playerName: null, simpleLayout: false, pageOutOfDate: true }))).toEqual([
      'iPad connected', "The player's iPad page is out of date: reload it on the iPad.", "The player's iPad is not in the simple layout",
    ]);
  });
});

describe('the lines shown with Undo after a scene changes', () => {
  it('Update from now names the loops and the band now (R2-T2-02)', () => {
    expect(updatedFromNowLine('Open', ['Bed', 'Beat'], 'full')).toBe('Open now has what is playing: Bed, Beat · full band.');
    expect(updatedFromNowLine('Build', ['Bed'], 'gentle')).toBe('Build now has what is playing: Bed · quiet band.');
    expect(updatedFromNowLine('Home', [], 'off')).toBe('Home now has what is playing: no loops · no band.');
  });

  it('ticking "alone" names the loops it took out (R2-T2-03)', () => {
    expect(aloneLine('Open', 'Tim', ['Bed', 'Pulse'])).toBe('Open is now Tim alone: Bed and Pulse taken out.');
    expect(aloneLine('Home', null, ['Bed'])).toBe('Home is now the player alone: Bed taken out.');
  });
});

describe('the check — when each colour comes in', () => {
  it('a colour that comes in at or after the end of the piece is warned of, in plain words', () => {
    const p = input({ performance: { ...DEFAULT_PERFORMANCE, lengthSec: 300, style: 'fade', fadePasses: 2 }, colourTimes: [
      { name: 'Red', at: 90 }, { name: 'Blue', at: 300 }, { name: 'Green', at: 330 },
    ] });
    const items = pieceCheckItems(p);
    const blue = items.find((i) => i.label === 'Blue comes in at 5:00, after the piece ends.');
    expect(blue?.state).toBe('warn');
    expect(blue?.fix).toMatch(/earlier time/);
    expect(items.some((i) => i.label === 'Green comes in at 5:30, after the piece ends.')).toBe(true);
    expect(items.some((i) => i.label.startsWith('Red comes in'))).toBe(false);
  });

  it('says nothing when every colour comes in inside the piece, or none has a time', () => {
    expect(pieceCheckItems(input({ colourTimes: [{ name: 'Red', at: 90 }] })).some((i) => /after the piece ends/.test(i.label))).toBe(false);
    expect(pieceCheckItems(input()).some((i) => /after the piece ends/.test(i.label))).toBe(false);
  });
});

describe('the check — keeping time (spec 2026-10-28)', () => {
  const fine: KeepingTimeReport = {
    runSec: 420, driftSec: 0.004, driftRate: 0.00001, lateBeats: 0, skippedBeats: 0, worstLateSec: 0,
    lostSec: 0, recentLostSec: 0, behind: false, everBehind: false, drifting: false,
  };

  it('before any run: not measured yet, and it says how to measure it', () => {
    const [item] = keepingTimeCheckItems({ report: null, running: false, valve: [] });
    expect(item).toMatchObject({ label: 'Keeping time: not measured yet', state: 'warn' });
    expect(item.fix).toBe('Play the piece once all the way through, with everything on. This line then says whether the sound kept time.');
  });

  it('after a healthy run: fine, with how long the run was', () => {
    expect(keepingTimeCheckItems({ report: fine, running: false, valve: [] })).toEqual([
      { label: 'Keeping time: fine in the last run (7:00)', state: 'ok' },
    ]);
  });

  it('while it plays: fine so far', () => {
    expect(keepingTimeCheckItems({ report: { ...fine, runSec: 30 }, running: true, valve: [] })[0])
      .toEqual({ label: 'Keeping time: fine so far', state: 'ok' });
  });

  it('a run that fell behind: how far, the late beats, and what to try', () => {
    const r = { ...fine, lateBeats: 7, skippedBeats: 2, lostSec: 2.43, everBehind: true };
    const [item] = keepingTimeCheckItems({ report: r, running: false, valve: ['fill'] });
    expect(item.label).toBe('Keeping time: the sound fell 2.4 s behind in the last run (7 beats late, 2 dropped)');
    expect(item.state).toBe('warn');
    expect(item.fix).toBe('Close other programs, plug the laptop in, and turn Extra notes off (Sound tab). Then run the piece again. To keep up, Timbo paused Extra notes.');
  });

  it('a clock that drifted: reported, with the advice to check the sound output', () => {
    const r = { ...fine, driftSec: 3.21, drifting: true };
    const [item] = keepingTimeCheckItems({ report: r, running: false, valve: [] });
    expect(item.label).toBe('Keeping time: the sound’s clock ran 3.2 s slow in the last run');
    expect(item.fix).toBe('Dropping extras can’t fix this: check the sound output (plug the laptop in, or choose another output), then run the piece again.');
  });

  it('a stall or two that stayed under the threshold is still fine', () => {
    expect(keepingTimeCheckItems({ report: { ...fine, lateBeats: 1, lostSec: 0.2 }, running: false, valve: [] })[0].state).toBe('ok');
  });
});

describe('the ready check, for the show (owner, 7 Nov 2026: the gig set up smoother)', () => {
  it('the face check: working, still loading, could not load, or off', () => {
    expect(faceCheckItem({ faceAssist: true, face: 'on', follow: 'hat' })).toEqual({ label: 'Face check on: it backs up the hat', state: 'ok' });
    expect(faceCheckItem({ faceAssist: true, face: 'loading', follow: 'hat' })).toMatchObject({ label: 'Face check still loading', state: 'warn', place: 'cap' });
    expect(faceCheckItem({ faceAssist: true, face: 'unavailable', follow: 'hat' })).toMatchObject({ label: 'Face check could not load: the hat works alone', state: 'warn', place: 'cap' });
    expect(faceCheckItem({ faceAssist: true, face: 'unavailable', follow: 'hat' })?.fix).toContain('internet');
    expect(faceCheckItem({ faceAssist: false, face: 'off', follow: 'hat' })).toMatchObject({ label: 'Face check is off: nothing backs up the hat', state: 'note', place: 'cap' });
    // Following the head, the face is the whole thing: said by the hat's own line.
    expect(faceCheckItem({ faceAssist: true, face: 'on', follow: 'head' })).toBeNull();
  });

  it('how far the hat moves the speed: only when the hat is on Speed', () => {
    expect(hatSpeedItem('tempo', 'volume', 0.15)).toEqual({ label: 'The hat moves Speed 15 % either side of the scene’s', state: 'ok' });
    expect(hatSpeedItem('volume', 'tempo', 0.1)?.label).toBe('The hat moves Speed 10 % either side of the scene’s');
    expect(hatSpeedItem('tempo', 'off', 1)).toMatchObject({ label: 'The hat moves Speed all the way to Slowest and Fastest', state: 'note', place: 'cap' });
    expect(hatSpeedItem('volume', 'fill', 0.15)).toBeNull();
  });

  it('the second laptop: said when it is there, nothing when it is not (it is optional)', () => {
    expect(secondLaptopItem(true)).toEqual({ label: 'Second laptop connected', state: 'ok' });
    expect(secondLaptopItem(false)).toBeNull();
  });

  it('the Show button’s words: all good, or how many to look at (notes are not counted)', () => {
    expect(readySummary([{ label: 'a', state: 'ok' }, { label: 'b', state: 'note' }])).toBe('Ready check: all good ✓');
    expect(readySummary([{ label: 'a', state: 'warn' }, { label: 'b', state: 'problem' }, { label: 'c', state: 'ok' }])).toBe('Ready check: 2 to look at');
    expect(readySummary([{ label: 'a', state: 'warn' }])).toBe('Ready check: 1 to look at');
  });
});

describe('the quietest the hat can make the music (owner, 7 Nov 2026)', () => {
  it('said when the hat is on Volume: fine from 50 %, a thing to look at below', () => {
    expect(hatVolumeItem('tempo', 'volume', { min: 0.6, max: 1 })).toEqual({ label: 'The hat keeps the volume between 60 % and 100 %', state: 'ok' });
    expect(hatVolumeItem('volume', 'off', { min: 0.2, max: 1 })).toMatchObject({ label: 'The hat can make the music as quiet as 20 %', state: 'warn', place: 'cap' });
    expect(hatVolumeItem('tempo', 'fill', { min: 0.2, max: 1 })).toBeNull();
  });
});
