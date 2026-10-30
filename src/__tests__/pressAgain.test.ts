import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRESS_AGAIN_SEC, noticeMs, NOTICE_MIN_MS, PRESS_AGAIN_CHOICES, pressAgainMs, sanitizePressAgainSec, undoMs,
} from '../profiles/pressAgain';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig } from '../profiles/BoardSequencerConfig';

describe('A7: the time to press again', () => {
  it('is 3, 4, 6 or 10 seconds, and 4 by default', () => {
    expect([...PRESS_AGAIN_CHOICES]).toEqual([3, 4, 6, 10]);
    expect(DEFAULT_PRESS_AGAIN_SEC).toBe(4);
    expect(pressAgainMs(6)).toBe(6000);
  });

  it('keeps a stored choice and turns anything else into 4', () => {
    for (const c of PRESS_AGAIN_CHOICES) expect(sanitizePressAgainSec(c)).toBe(c);
    for (const bad of [undefined, null, 0, 5, -3, 4.5, '6', NaN, Infinity]) expect(sanitizePressAgainSec(bad)).toBe(4);
  });

  it('Undo lasts 15 s, or the press-again time x 4 when that is longer', () => {
    expect(undoMs(3)).toBe(15_000);
    expect(undoMs(4)).toBe(16_000);
    expect(undoMs(6)).toBe(24_000);
    expect(undoMs(10)).toBe(40_000);
  });

  it('a notice lasts at least 5 s', () => {
    expect(NOTICE_MIN_MS).toBe(5000);
    expect(noticeMs(1200)).toBe(5000);
    expect(noticeMs(2500)).toBe(5000);
    expect(noticeMs(5000)).toBe(5000);
    expect(noticeMs(30_000)).toBe(30_000);
  });
});

describe('A7: saved per player, and the old players keep today\'s behaviour', () => {
  it('a new player: 4 s, Space on', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.pressAgainSec).toBe(4);
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.spaceKeyOn).toBe(true);
  });

  it('a player saved before these settings loads with 4 s and Space on', () => {
    const old = sanitizeBoardSequencerConfig({ bpm: 100 })!;
    expect(old.pressAgainSec).toBe(4);
    expect(old.spaceKeyOn).toBe(true);
  });

  it('keeps what was chosen, and Space off', () => {
    const c = sanitizeBoardSequencerConfig({ pressAgainSec: 10, spaceKeyOn: false })!;
    expect(c.pressAgainSec).toBe(10);
    expect(c.spaceKeyOn).toBe(false);
    expect(sanitizeBoardSequencerConfig({ pressAgainSec: 7 })!.pressAgainSec).toBe(4);
    expect(sanitizeBoardSequencerConfig({ spaceKeyOn: 'no' })!.spaceKeyOn).toBe(true);
  });
});

import { spaceAction, spaceTogglesPlay } from '../ui/screens/boardSequencer/spaceKey';

describe('A7: Space plays and stops can be switched off', () => {
  const s = { running: false, offerShowing: false, msSinceStop: 10_000, msSincePieceEnded: 10_000, pieceOn: false };
  it('is on unless it is switched off', () => {
    expect(spaceTogglesPlay('play', document.body)).toBe(true);
    expect(spaceTogglesPlay('play', document.body, true)).toBe(true);
    expect(spaceAction('play', document.body, s)).toBe('play');
    expect(spaceAction('play', document.body, { ...s, spaceOn: true })).toBe('play');
  });
  it('does nothing, in Play and in Show, started or stopped, when it is off', () => {
    expect(spaceTogglesPlay('play', document.body, false)).toBe(false);
    for (const view of ['play', 'bigBoard'] as const) {
      expect(spaceAction(view, document.body, { ...s, spaceOn: false })).toBe('none');
      expect(spaceAction(view, document.body, { ...s, running: true, pieceOn: true, spaceOn: false })).toBe('none');
    }
  });
});
