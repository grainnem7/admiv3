import { describe, it, expect, afterEach } from 'vitest';
import { COALESCE_MS, describeEdit, EMPTY_HISTORY, isEdit, recordEdit, redoEdit, undoEdit, undoKey, UNDO_LIMIT } from '../ui/screens/boardSequencer/editHistory';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, type BoardSequencerStored } from '../profiles/BoardSequencerConfig';

afterEach(() => { document.body.innerHTML = ''; });

const base: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, laptopBoard: [] };
const withBoard = (cells: { row: number; col: number; colour: string }[]): BoardSequencerStored => ({ ...base, laptopBoard: cells });

describe('what counts as an edit (item 5)', () => {
  it('the board, the loops, the scenes, the piece and the colour times are edits; live sound settings are not', () => {
    expect(isEdit(['laptopBoard'])).toBe(true);
    expect(isEdit(['scenes', 'currentScene'])).toBe(true);
    expect(isEdit(['loopSlots', 'loopNames'])).toBe(true);
    expect(isEdit(['bpm'])).toBe(false);
    expect(isEdit(['soundWorld', 'scenes'])).toBe(false);
    expect(isEdit(['currentScene'])).toBe(false);
  });
});

describe('recording, undoing and redoing', () => {
  it('a counter put down can be undone, then redone', () => {
    const a = withBoard([{ row: 3, col: 1, colour: 'c1' }]);
    const h = recordEdit(EMPTY_HISTORY, base, a, ['laptopBoard'], 1000);
    expect(h.undo.length).toBe(1);
    const u = undoEdit(h)!;
    expect(u.patch).toEqual({ laptopBoard: [] });
    expect(describeEdit(u.keys)).toBe('the board');
    const r = redoEdit(u.history)!;
    expect(r.patch).toEqual({ laptopBoard: a.laptopBoard });
    expect(r.history.undo.length).toBe(1);
    expect(r.history.redo.length).toBe(0);
  });

  it('a patch that changes nothing records nothing; a live setting records nothing', () => {
    expect(recordEdit(EMPTY_HISTORY, base, base, ['laptopBoard'], 1)).toBe(EMPTY_HISTORY);
    expect(recordEdit(EMPTY_HISTORY, base, { ...base, bpm: 100 }, ['bpm'], 1)).toBe(EMPTY_HISTORY);
  });

  it('typing a loop name is one step: quick patches of the same keys merge', () => {
    let h = EMPTY_HISTORY;
    let c = base;
    for (const [i, name] of ['B', 'Be', 'Bed'].entries()) {
      const next = { ...c, loopNames: ['', '', '', '', '', '', '', ''].map((n, k) => (k === 0 ? name : n)) };
      h = recordEdit(h, c, next, ['loopNames'], 1000 + i * 100);
      c = next;
    }
    expect(h.undo.length).toBe(1);
    expect(undoEdit(h)!.patch.loopNames?.[0]).toBe('');
    // A pause starts a new step.
    const later = { ...c, loopNames: c.loopNames.map((n, k) => (k === 0 ? 'Bed 2' : n)) };
    h = recordEdit(h, c, later, ['loopNames'], 1000 + 200 + COALESCE_MS + 1);
    expect(h.undo.length).toBe(2);
  });

  it('three counters put down in a second are three steps: a counter is never merged with the last', () => {
    let h = EMPTY_HISTORY;
    let c = base;
    for (let i = 0; i < 3; i++) {
      const next = withBoard([...c.laptopBoard, { row: i, col: 1, colour: 'c1' }]);
      h = recordEdit(h, c, next, ['laptopBoard'], 1000 + i * 100);
      c = next;
    }
    expect(h.undo.length).toBe(3);
    expect(undoEdit(h)!.patch.laptopBoard?.length).toBe(2);
  });

  it('a new edit after an undo drops the redo list, and the list never grows past the limit', () => {
    let h = recordEdit(EMPTY_HISTORY, base, withBoard([{ row: 1, col: 1, colour: 'c1' }]), ['laptopBoard'], 1000);
    h = undoEdit(h)!.history;
    expect(h.redo.length).toBe(1);
    h = recordEdit(h, base, withBoard([{ row: 2, col: 2, colour: 'c1' }]), ['laptopBoard'], 5000);
    expect(h.redo.length).toBe(0);
    for (let i = 0; i < UNDO_LIMIT + 10; i++) {
      h = recordEdit(h, base, withBoard([{ row: i % 8, col: 1, colour: 'c1' }]), ['laptopBoard'], 10000 + i * 5000);
    }
    expect(h.undo.length).toBe(UNDO_LIMIT);
  });

  it('nothing to undo or redo says so', () => {
    expect(undoEdit(EMPTY_HISTORY)).toBeNull();
    expect(redoEdit(EMPTY_HISTORY)).toBeNull();
  });
});

describe('the undo keys', () => {
  const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean }> = {}) =>
    ({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...mods });

  it('Ctrl+Z or Cmd+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo', () => {
    expect(undoKey(key('z', { ctrlKey: true }), document.body)).toBe('undo');
    expect(undoKey(key('z', { metaKey: true }), document.body)).toBe('undo');
    expect(undoKey(key('Z', { ctrlKey: true, shiftKey: true }), document.body)).toBe('redo');
    expect(undoKey(key('y', { ctrlKey: true }), document.body)).toBe('redo');
  });

  it('a plain z, a held key, Alt, or typing in a field: not ours', () => {
    expect(undoKey(key('z'), document.body)).toBeNull();
    expect(undoKey(key('z', { ctrlKey: true, repeat: true }), document.body)).toBeNull();
    expect(undoKey(key('z', { ctrlKey: true, altKey: true }), document.body)).toBeNull();
    document.body.innerHTML = '<input type="text" />';
    expect(undoKey(key('z', { ctrlKey: true }), document.body.firstElementChild)).toBeNull();
  });
});
