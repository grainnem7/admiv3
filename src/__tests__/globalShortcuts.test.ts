import { describe, it, expect } from 'vitest';
import { debugPanelAllowed, globalSpaceTogglesMute, isDebugKey, showGlobalMuteButton } from '../ui/globalShortcuts';

describe('global shortcuts', () => {
  it('Space never toggles the global mute on the Board Sequencer, but still does elsewhere', () => {
    expect(globalSpaceTogglesMute('boardSequencer')).toBe(false);
    expect(globalSpaceTogglesMute('performance')).toBe(true);
    expect(globalSpaceTogglesMute('remix')).toBe(true);
  });
  it('the floating MuteButton is hidden only on the Board Sequencer', () => {
    expect(showGlobalMuteButton('boardSequencer')).toBe(false);
    expect(showGlobalMuteButton('welcome')).toBe(true);
  });
});

describe('the Debug Panel (T4-11)', () => {
  it('never exists in the production build, even with ?debug in the address', () => {
    expect(debugPanelAllowed({ dev: false, search: '' })).toBe(false);
    expect(debugPanelAllowed({ dev: false, search: '?debug' })).toBe(false);
    expect(debugPanelAllowed({ dev: false, search: '?debug=1' })).toBe(false);
  });
  it('in development, only when the address asks for it', () => {
    expect(debugPanelAllowed({ dev: true, search: '' })).toBe(false);
    expect(debugPanelAllowed({ dev: true, search: '?remote=1234' })).toBe(false);
    expect(debugPanelAllowed({ dev: true, search: '?debug' })).toBe(true);
    expect(debugPanelAllowed({ dev: true, search: '?x=1&debug=1' })).toBe(true);
  });

  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  const el = (tag: string, editable = false): Element => {
    const e = document.createElement(tag);
    if (editable) e.setAttribute('contenteditable', 'true');
    return e;
  };

  it('a plain "d" on a button or the page is the shortcut', () => {
    expect(isDebugKey(key('d'), el('button'))).toBe(true);
    expect(isDebugKey(key('D'), null)).toBe(true);
    expect(isDebugKey(key('d'), document.body)).toBe(true);
  });
  it('a "d" typed into a text box, a list (select) or editable text is not', () => {
    expect(isDebugKey(key('d'), el('input'))).toBe(false);
    expect(isDebugKey(key('d'), el('textarea'))).toBe(false);
    // Typing a letter in a select jumps through its list: that must never open anything.
    expect(isDebugKey(key('d'), el('select'))).toBe(false);
    expect(isDebugKey(key('d'), el('div', true))).toBe(false);
  });
  it('any other key, or d with Ctrl, Cmd or Alt, is not', () => {
    expect(isDebugKey(key('e'), el('button'))).toBe(false);
    expect(isDebugKey(key('d', { ctrlKey: true }), el('button'))).toBe(false);
    expect(isDebugKey(key('d', { metaKey: true }), el('button'))).toBe(false);
    expect(isDebugKey(key('d', { altKey: true }), el('button'))).toBe(false);
  });
});
