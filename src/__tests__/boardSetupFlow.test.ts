import { describe, it, expect } from 'vitest';
import {
  resolveEntry, canOpenStep, canContinue, canPlay, stepIndicator, continueLabel, nextStep, prevStep,
  type CameraStatus, type SetupConfigView,
} from '../ui/screens/boardSequencer/boardSetupFlow';

const cam = (phase: CameraStatus['phase'], colourless: boolean | null = false): CameraStatus => ({ phase, colourless });
const noSetup: SetupConfigView = { enabled: false, channels: [] };
const cornersOnly: SetupConfigView = { enabled: true, channels: [{ role: 'off' }] };
const valid: SetupConfigView = { enabled: true, channels: [{ role: 'melody' }] };

describe('resolveEntry', () => {
  it.each([
    [noSetup, false, 'camera'],
    [noSetup, true, 'board'],
    [cornersOnly, true, 'colours'],
    [valid, true, 'board'],
  ] as const)('%o stored=%s → %s', (cfg, stored, step) => {
    expect(resolveEntry(cfg, stored)).toBe(step);
  });
});

describe('step gating', () => {
  it('camera counts once running or on fallback; starting only when a setup is stored', () => {
    for (const phase of ['running', 'fallback'] as const) expect(canOpenStep('board', noSetup, cam(phase), false)).toBe(true);
    expect(canOpenStep('board', noSetup, cam('starting'), false)).toBe(false);
    expect(canOpenStep('board', valid, cam('starting'), true)).toBe(true);
    expect(canOpenStep('board', valid, cam('error'), true)).toBe(false);
  });

  it('after a Mirror/camera change (corners reset, colours kept) Colours/Ready are closed and Play is off', () => {
    const afterMirror: SetupConfigView = { enabled: false, channels: [{ role: 'melody' }] };
    expect(canOpenStep('colours', afterMirror, cam('running'), true)).toBe(false);
    expect(canOpenStep('ready', afterMirror, cam('running'), true)).toBe(false);
    expect(canPlay(afterMirror, cam('running'))).toBe(false);
  });

  it('Continue rules per step', () => {
    expect(canContinue('camera', noSetup, cam('starting'), false)).toBe(false);
    expect(canContinue('camera', noSetup, cam('error'), false)).toBe(false);
    expect(canContinue('camera', noSetup, cam('fallback'), false)).toBe(true);
    expect(canContinue('board', noSetup, cam('running'), false)).toBe(false);
    expect(canContinue('board', cornersOnly, cam('running'), true)).toBe(true);
    expect(canContinue('colours', cornersOnly, cam('running'), true)).toBe(false);
    expect(canContinue('colours', valid, cam('running'), true)).toBe(true);
    expect(canContinue('ready', valid, cam('running'), true)).toBe(false);
  });

  it('Play needs corners, an active colour and a camera that is not in error', () => {
    expect(canPlay(valid, cam('running'))).toBe(true);
    expect(canPlay(valid, cam('fallback'))).toBe(true);
    expect(canPlay(valid, cam('error'))).toBe(false);
    expect(canPlay(cornersOnly, cam('running'))).toBe(false);
  });

  it('colourless camera: Continue anyway, never a block', () => {
    expect(canContinue('camera', noSetup, cam('running', true), false)).toBe(true);
    expect(continueLabel('camera', cam('running', true))).toBe('Continue anyway');
    expect(continueLabel('camera', cam('running', null))).toBe('Continue');
    expect(continueLabel('camera', cam('running', false))).toBe('Continue');
  });
});

describe('stepIndicator', () => {
  it('shows done/warning/current/todo/pending', () => {
    expect(stepIndicator('camera', 'board', valid, cam('running'), true)).toBe('done');
    expect(stepIndicator('camera', 'board', valid, cam('fallback'), true)).toBe('warning');
    expect(stepIndicator('camera', 'board', valid, cam('starting'), true)).toBe('pending');
    expect(stepIndicator('board', 'board', valid, cam('running'), true)).toBe('current');
    expect(stepIndicator('colours', 'board', valid, cam('running'), true)).toBe('done');
    expect(stepIndicator('colours', 'board', cornersOnly, cam('running'), true)).toBe('todo');
    // Ready is reachable once board and colours are done, so the map must say so —
    // leaving it grey makes a finished set-up look unfinished.
    expect(stepIndicator('ready', 'board', valid, cam('running'), true)).toBe('done');
    expect(stepIndicator('ready', 'board', cornersOnly, cam('running'), true)).toBe('todo');
  });
});

describe('next/prev', () => {
  it('walks the four steps', () => {
    expect(nextStep('camera')).toBe('board');
    expect(nextStep('ready')).toBeNull();
    expect(prevStep('camera')).toBeNull();
    expect(prevStep('ready')).toBe('colours');
  });
});

import { askWhoIsPlaying } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('who is playing', () => {
  it('the very first run asks: name and hand', () => {
    expect(askWhoIsPlaying([], null)).toBe(true);
  });
  it('one player: no question, as before', () => {
    expect(askWhoIsPlaying(['tim'], 'tim')).toBe(false);
    expect(askWhoIsPlaying(['tim'], null)).toBe(false);
  });
  it('several players: the last one is remembered, so no question', () => {
    expect(askWhoIsPlaying(['tim', 'alex'], 'alex')).toBe(false);
  });
  it('several players and no one remembered, or the remembered one deleted: ask', () => {
    expect(askWhoIsPlaying(['tim', 'alex'], null)).toBe(true);
    expect(askWhoIsPlaying(['tim'], 'gone')).toBe(true);
  });
});

import { openingView } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('where the screen opens', () => {
  const ready = { boardSource: 'camera' as const, enabled: true, channels: [{ role: 'melody' as const }] };
  const none = { setupRequested: false, pieceRunning: false };
  it('nothing saved: set-up', () => {
    expect(openingView(null, none)).toBe('setup');
  });
  it('a camera board with the board found and a colour with a job: Play', () => {
    expect(openingView(ready, none)).toBe('play');
  });
  it('board not confirmed, or no colour with a job: set-up', () => {
    expect(openingView({ ...ready, enabled: false }, none)).toBe('setup');
    expect(openingView({ ...ready, channels: [{ role: 'off' }] }, none)).toBe('setup');
  });
  it('"Set up the board again" asked for: set-up', () => {
    expect(openingView(ready, { ...none, setupRequested: true })).toBe('setup');
  });
  it('a laptop board: Play, unless set-up was asked for', () => {
    const laptop = { boardSource: 'laptop' as const, enabled: false, channels: [] };
    expect(openingView(laptop, none)).toBe('play');
    expect(openingView(laptop, { ...none, setupRequested: true })).toBe('setup');
  });
  it('a reload mid-piece: Play, where Carry on is', () => {
    expect(openingView({ ...ready, enabled: false }, { ...none, pieceRunning: true })).toBe('play');
  });
});

import { viewAfterPick, shouldCheckBoard } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('picking a player', () => {
  const ready = { boardSource: 'camera' as const, enabled: true, channels: [{ role: 'melody' as const }] };
  it('stopped: where their own board needs them (set-up if anything is missing)', () => {
    expect(viewAfterPick({ ...ready, enabled: false }, false, 'play')).toBe('setup');
    expect(viewAfterPick(ready, false, 'setup')).toBe('play');
  });
  it('playing: stays put', () => {
    expect(viewAfterPick({ ...ready, enabled: false }, true, 'play')).toBe('play');
  });
});

describe('when the board is checked on arrival', () => {
  const ok = { checked: false, view: 'play' as const, laptop: false, enabled: true, cameraUp: true, running: false, chooserOpen: false };
  it('on Play, camera up, board set up, not playing, nothing in front: check', () => {
    expect(shouldCheckBoard(ok)).toBe(true);
  });
  it('not while Who’s playing is open, nor twice, nor on the laptop board, nor while playing', () => {
    expect(shouldCheckBoard({ ...ok, chooserOpen: true })).toBe(false);
    expect(shouldCheckBoard({ ...ok, checked: true })).toBe(false);
    expect(shouldCheckBoard({ ...ok, laptop: true })).toBe(false);
    expect(shouldCheckBoard({ ...ok, running: true })).toBe(false);
    expect(shouldCheckBoard({ ...ok, cameraUp: false })).toBe(false);
  });
});

import { setupSteps } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('the steps on each board', () => {
  it('the laptop board has only the colours and Ready: no camera, no board to find', () => {
    expect(setupSteps(true)).toEqual(['colours', 'ready']);
    expect(prevStep('colours', true)).toBeNull();
    expect(nextStep('colours', true)).toBe('ready');
    expect(prevStep('ready', true)).toBe('colours');
  });
  it('the camera board keeps all four', () => {
    expect(setupSteps(false)).toEqual(['camera', 'board', 'colours', 'ready']);
    expect(prevStep('colours')).toBe('board');
  });
});

import { requestLaptopOnOpen, laptopRequestedOnOpen, clearSetupRequest as clearRequests } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('"Play on the laptop" from Welcome', () => {
  const camera = { boardSource: 'camera' as const, enabled: false, channels: [] };
  const none = { setupRequested: false, pieceRunning: false };
  it('opens on Play, even for a board that isn’t set up, or nothing saved yet', () => {
    expect(openingView(camera, { ...none, laptopRequested: true })).toBe('play');
    expect(openingView(null, { ...none, laptopRequested: true })).toBe('play');
  });
  it('is asked for once, and cleared with the other requests', () => {
    requestLaptopOnOpen();
    expect(laptopRequestedOnOpen()).toBe(true);
    clearRequests();
    expect(laptopRequestedOnOpen()).toBe(false);
  });
});

import { stepOnBoard } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('a step the board doesn’t have', () => {
  it('the laptop board never shows the camera or board step: it goes to the colours', () => {
    expect(stepOnBoard('camera', true)).toBe('colours');
    expect(stepOnBoard('board', true)).toBe('colours');
    expect(stepOnBoard('ready', true)).toBe('ready');
    expect(stepOnBoard('camera', false)).toBe('camera');
  });
});

import { configForNewPlayer } from '../ui/screens/boardSequencer/boardSetupFlow';

describe('a new player', () => {
  it('nothing saved yet (a first run): the screen keeps its settings, with the hand they chose', () => {
    const shown = { handedness: 'right' as const, boardSource: 'laptop' as const };
    expect(configForNewPlayer(null, shown, 'left')).toEqual({ handedness: 'left', boardSource: 'laptop' });
  });
  it('a saved rig: their own config as loaded', () => {
    type C = { handedness: 'left' | 'right'; boardSource: 'camera' | 'laptop' };
    const loaded: C = { handedness: 'left', boardSource: 'camera' };
    const shown: C = { handedness: 'right', boardSource: 'laptop' };
    expect(configForNewPlayer(loaded, shown, 'left')).toBe(loaded);
  });
});
