import { describe, it, expect } from 'vitest';
import {
  headerNoticeFor, NOT_SAVED_TEXT, OTHER_TAB_NOTE, OTHER_TAB_WARNING, type HeaderNoticeInput,
} from '../ui/screens/boardSequencer/headerNotice';

/**
 * The header's one notice, most urgent first. With only one tab able to save (Web Locks),
 * "also open in another tab" is harmless, and it hid a camera or sound problem on the
 * laptop, with "Change camera" gone from beside the camera's.
 */

const CAMERA = 'The camera stopped. Check it is plugged in.';
const SOUND = 'The sound could not be started.';
const calm: HeaderNoticeInput = { saveFailed: false, otherTab: false, guarded: true, error: null, soundError: null, laptop: false, camNotice: null };
const shown = (over: Partial<HeaderNoticeInput>) => headerNoticeFor({ ...calm, ...over });

describe('the header notice', () => {
  it('nothing wrong: nothing shown', () => {
    expect(shown({})).toEqual({ notice: null, changeCamera: false });
  });

  it('a camera problem, with Change camera beside it; a sound problem, without', () => {
    expect(shown({ error: CAMERA })).toEqual({ notice: { kind: 'error', text: CAMERA }, changeCamera: true });
    expect(shown({ soundError: SOUND })).toEqual({ notice: { kind: 'error', text: SOUND }, changeCamera: false });
  });

  it('with only one tab able to save, the other-tab note is shown only when nothing is wrong', () => {
    expect(shown({ otherTab: true })).toEqual({ notice: { kind: 'changed', text: OTHER_TAB_NOTE }, changeCamera: false });
  });

  it('with only one tab able to save, a camera problem comes before the other-tab note, with Change camera beside it again', () => {
    expect(shown({ otherTab: true, error: CAMERA })).toEqual({ notice: { kind: 'error', text: CAMERA }, changeCamera: true });
  });

  it('with only one tab able to save, a sound problem comes before the other-tab note', () => {
    expect(shown({ otherTab: true, soundError: SOUND })).toEqual({ notice: { kind: 'error', text: SOUND }, changeCamera: false });
  });

  it('with only one tab able to save, a camera note (the wrong camera in use) comes before the other-tab note', () => {
    const camNotice = { kind: 'fallback' as const, text: 'Couldn\'t find "Logitech", so the browser\'s default camera is being used.' };
    expect(shown({ otherTab: true, camNotice })).toEqual({ notice: camNotice, changeCamera: true });
  });

  it('where the browser cannot keep the other tab from saving, the warning keeps its place above the others', () => {
    for (const over of [{ error: CAMERA }, { soundError: SOUND }, {}]) {
      expect(shown({ otherTab: true, guarded: false, ...over })).toEqual({ notice: { kind: 'error', text: OTHER_TAB_WARNING }, changeCamera: false });
    }
  });

  it('not being saved comes first, always', () => {
    for (const guarded of [true, false]) {
      expect(shown({ saveFailed: true, otherTab: true, guarded, error: CAMERA, soundError: SOUND }))
        .toEqual({ notice: { kind: 'error', text: NOT_SAVED_TEXT }, changeCamera: false });
    }
  });

  it('on the laptop board a camera note is not shown', () => {
    expect(shown({ laptop: true, camNotice: { kind: 'changed', text: 'Camera changed.' } })).toEqual({ notice: null, changeCamera: false });
  });
});
