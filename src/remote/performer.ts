/**
 * The second performer's page (owner, 7 Nov 2026: "I will be performing alongside Tim. I only
 * have one iPad, but I would like to play and contribute from another laptop"). The same page
 * as the iPad's, opened on another laptop with `&performer=1` added to the iPad's link: it joins
 * the same laptop with the same code, alongside Tim's iPad.
 *
 * Tim's iPad settings are his alone: his simple layout, the strips and pads he is shown, his
 * reach and how his touches are taken. A locked strip stays locked (the laptop ignores it from
 * any page: a speed that must not change mid-piece), and the page says so. The second performer gets everything, on
 * the whole strip, acting on touch: the four strips and pads, the loops and scenes, Next scene
 * and End piece (still two taps), and the instruments and colours on a page of their own.
 */
import { DEFAULT_REMOTE_TOUCH, SIMPLE_ROWS, type RemoteState } from './protocol';

/** The laptop's state, as the second performer's page shows it. */
export function forPerformer(s: RemoteState): RemoteState {
  const { layout: _layout, shown: _shown, reach: _reach, learning: _learning, stripMode: _mode, rows: _rows, ...rest } = s;
  return {
    ...rest,
    touch: { ...DEFAULT_REMOTE_TOUCH, playExtras: ['nextScene', 'endPiece'], playLoops: [], showNext: true },
    rows: [...SIMPLE_ROWS],
  };
}

/** Whether this page was opened as the second performer's (`?remote=1234&performer=1`). */
export function isPerformerPage(search: string): boolean {
  return new URLSearchParams(search).get('performer') === '1';
}

/** The second performer's link: the iPad's, with `performer=1`. */
export function performerLink(ipadLink: string): string {
  return `${ipadLink}${ipadLink.includes('?') ? '&' : '?'}performer=1`;
}
