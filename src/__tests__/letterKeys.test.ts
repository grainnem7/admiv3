import { describe, it, expect, afterEach } from 'vitest';
import { letterKeyAction } from '../ui/screens/boardSequencer/letterKeys';

afterEach(() => { document.body.innerHTML = ''; });

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean }> = {}) =>
  ({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...mods });
const piece = { running: true, pieceOn: true, keysOn: true };
const board = { running: true, pieceOn: false, keysOn: true };
const stopped = { running: false, pieceOn: false, keysOn: true };

describe('the letter keys (item 6)', () => {
  it('M mutes while the board plays, N and E steer the piece while it plays, 1 2 3 change the view', () => {
    expect(letterKeyAction(key('m'), 'play', document.body, board)).toBe('mute');
    expect(letterKeyAction(key('M'), 'bigBoard', document.body, piece)).toBe('mute');
    expect(letterKeyAction(key('n'), 'bigBoard', document.body, piece)).toBe('nextScene');
    expect(letterKeyAction(key('e'), 'play', document.body, piece)).toBe('endPiece');
    expect(letterKeyAction(key('1'), 'play', document.body, stopped)).toBe('viewBoard');
    expect(letterKeyAction(key('2'), 'play', document.body, stopped)).toBe('viewPiece');
    expect(letterKeyAction(key('3'), 'play', document.body, stopped)).toBe('viewShow');
  });

  it('nothing to steer: M while stopped, N and E without the piece', () => {
    expect(letterKeyAction(key('m'), 'play', document.body, stopped)).toBeNull();
    expect(letterKeyAction(key('n'), 'play', document.body, board)).toBeNull();
    expect(letterKeyAction(key('e'), 'play', document.body, stopped)).toBeNull();
  });

  it('never while typing, never with a modifier, never held down, never in Set up, never when switched off', () => {
    document.body.innerHTML = '<input type="text" />';
    expect(letterKeyAction(key('m'), 'play', document.body.firstElementChild, board)).toBeNull();
    expect(letterKeyAction(key('m', { ctrlKey: true }), 'play', document.body, board)).toBeNull();
    expect(letterKeyAction(key('m', { metaKey: true }), 'play', document.body, board)).toBeNull();
    expect(letterKeyAction(key('m', { repeat: true }), 'play', document.body, board)).toBeNull();
    expect(letterKeyAction(key('1'), 'setup', document.body, stopped)).toBeNull();
    expect(letterKeyAction(key('m'), 'play', document.body, { ...board, keysOn: false })).toBeNull();
  });

  it('Shift+S stays its own key: a plain s does nothing', () => {
    expect(letterKeyAction(key('s'), 'play', document.body, board)).toBeNull();
  });
});
