import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRESS_AGAIN_SEC, noticeMs, NOTICE_MIN_MS, PRESS_AGAIN_CHOICES, pressAgainMs, sanitizePressAgainSec, undoMs,
} from '../ui/screens/boardSequencer/pressAgain';
import { spaceAction, spaceTogglesPlay } from '../ui/screens/boardSequencer/spaceKey';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig } from '../profiles/BoardSequencerConfig';

describe('Time to press again (A7)', () => {
  it('offers 3 / 4 / 6 / 10 seconds, and 4 is the default', () => {
    expect([...PRESS_AGAIN_CHOICES]).toEqual([3, 4, 6, 10]);
    expect(DEFAULT_PRESS_AGAIN_SEC).toBe(4);
    expect(pressAgainMs(6)).toBe(6000);
  });
  it('a saved value that is not a choice becomes 4 s', () => {
    expect(sanitizePressAgainSec(undefined)).toBe(4);
    expect(sanitizePressAgainSec(5)).toBe(4);
    expect(sanitizePressAgainSec('10')).toBe(4);
    expect(sanitizePressAgainSec(10)).toBe(10);
  });
  it('Undo lasts 15 s, or four times the press-again time when that is longer', () => {
    expect(undoMs(3)).toBe(15_000);
    expect(undoMs(4)).toBe(16_000);
    expect(undoMs(6)).toBe(24_000);
    expect(undoMs(10)).toBe(40_000);
  });
  it('a notice stays at least 5 s', () => {
    expect(NOTICE_MIN_MS).toBe(5000);
    expect(noticeMs(1500)).toBe(5000);
    expect(noticeMs(2500)).toBe(5000);
    expect(noticeMs(6000)).toBe(6000);
  });
});

describe('the settings are saved per player', () => {
  it('a new player: 4 s, Space on', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.pressAgainSec).toBe(4);
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.spacePlays).toBe(true);
  });
  it('an old saved player (neither field) loads with today’s behaviour', () => {
    const old = { ...DEFAULT_BOARD_SEQUENCER_CONFIG } as Record<string, unknown>;
    delete old.pressAgainSec;
    delete old.spacePlays;
    const c = sanitizeBoardSequencerConfig(old);
    expect(c?.pressAgainSec).toBe(4);
    expect(c?.spacePlays).toBe(true);
  });
  it('keeps what was chosen', () => {
    const c = sanitizeBoardSequencerConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, pressAgainSec: 10, spacePlays: false });
    expect(c?.pressAgainSec).toBe(10);
    expect(c?.spacePlays).toBe(false);
  });
});

describe('Space plays and stops can be switched off', () => {
  const s = { running: false, offerShowing: false, msSinceStop: 1e6, msSincePieceEnded: 1e6, pieceOn: false };
  it('on: Space plays on the board', () => {
    expect(spaceAction('play', document.body, s)).toBe('play');
    expect(spaceAction('play', document.body, { ...s, running: true })).toBe('stop');
  });
  it('off: Space does nothing, in Play and in Show', () => {
    expect(spaceAction('play', document.body, { ...s, spacePlays: false })).toBe('none');
    expect(spaceAction('bigBoard', document.body, { ...s, spacePlays: false })).toBe('none');
    expect(spaceAction('play', document.body, { ...s, running: true, spacePlays: false })).toBe('none');
  });
  it('it is still the focused control’s own key', () => {
    expect(spaceTogglesPlay('play', document.createElement('button'))).toBe(false);
  });
});
