import type { CameraNotice } from './BoardHeader';

export interface HeaderNoticeInput {
  /** The browser refused to save. */
  saveFailed: boolean;
  /** ADMI is open in another tab or window too. */
  otherTab: boolean;
  /** Only one tab saves (the browser's Web Locks): the other tab can't save over this one. */
  guarded: boolean;
  /** A camera problem. */
  error: string | null;
  /** A sound problem (a backing song, the audio engine). */
  soundError: string | null;
  /** The laptop board: no camera to tell about. */
  laptop: boolean;
  /** A camera note: the browser's default camera in use, or the camera just changed. */
  camNotice: CameraNotice | null;
}

export const NOT_SAVED_TEXT = 'Changes are not being saved — the browser refused. Use Back up to a file (Make a piece, step 3) now.';
export const OTHER_TAB_NOTE = "ADMI is also open in another tab. That tab can't save: only this one does.";
export const OTHER_TAB_WARNING = 'ADMI is open in another tab or window. Close all but one, or they will save over each other.';

/**
 * The one notice the header shows, the most urgent first, and whether "Change camera" goes
 * beside it: only beside a camera problem, not beside "another tab" or "not saved". Where
 * only one tab can save (Web Locks), ADMI open in another tab is harmless, so that note
 * comes last and never hides a camera or sound problem. Where the browser can't keep the
 * other tab from saving, the two save over each other: that warning keeps its place.
 */
export function headerNoticeFor(s: HeaderNoticeInput): { notice: CameraNotice | null; changeCamera: boolean } {
  if (s.saveFailed) return { notice: { kind: 'error', text: NOT_SAVED_TEXT }, changeCamera: false };
  if (s.otherTab && !s.guarded) return { notice: { kind: 'error', text: OTHER_TAB_WARNING }, changeCamera: false };
  if (s.error) return { notice: { kind: 'error', text: s.error }, changeCamera: true };
  if (s.soundError) return { notice: { kind: 'error', text: s.soundError }, changeCamera: false };
  if (!s.laptop && s.camNotice) return { notice: s.camNotice, changeCamera: true };
  if (s.otherTab) return { notice: { kind: 'changed', text: OTHER_TAB_NOTE }, changeCamera: false };
  return { notice: null, changeCamera: false };
}
