/**
 * "Label in name" (WCAG 2.5.3, audit A9): a control's accessible name starts with the words
 * it shows, so someone who says or reads "Save session" finds the button named
 * "Save session…", not "Save the session log…". Pure: the e2e scan of every screen and the
 * unit test share it.
 */

/** The words of a label: lower case, symbols and emoji dropped, runs of space made one. */
export function wordsOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether `name` starts with the words of `visible`; no visible words means nothing to match. */
export function nameStartsWithVisible(name: string, visible: string): boolean {
  const shown = wordsOf(visible);
  if (shown === '') return true;
  const n = wordsOf(name);
  return n === shown || n.startsWith(`${shown} `);
}
