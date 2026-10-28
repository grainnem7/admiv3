/**
 * What removing a colour does to saved work, said exactly (T1-06). A loop kept with Keep
 * remembers what each counter played (loopSounds.ts), so it plays on whatever the colours
 * are. A note that knows only its colour (a loop kept before loops remembered sounds, a
 * Capture, a note drawn in Edit notes) plays as that colour, and goes quiet with it; so does
 * a counter saved on a page of the board. Pure: no storage, no DOM.
 */
import type { BoardSequencerStored } from '../../../profiles/BoardSequencerConfig';
import { loopLabel } from '../../../songs/performance/launcher';
import { listNames } from './pieceCheck';

/** One player's saved loops and pages; `player` null is the one playing now. */
export interface PlayerWork {
  player: string | null;
  work: Pick<BoardSequencerStored, 'loopSlots' | 'loopNames' | 'pages'>;
}

export interface ColourUses {
  /** Some loop note of these colours remembers its sound: it plays on. */
  loopsPlayOn: boolean;
  /** Loop notes of these colours that know only the colour: they go quiet. */
  quietNotes: number;
  /** The loops those notes are in ("Bed", "Kay's Pulse"). */
  quietLoops: string[];
  /** Counters of these colours saved on a page of the board: they go quiet. */
  pageCounters: number;
}

export function colourUses(players: readonly PlayerWork[], ids: ReadonlySet<string>): ColourUses {
  const uses: ColourUses = { loopsPlayOn: false, quietNotes: 0, quietLoops: [], pageCounters: 0 };
  for (const { player, work } of players) {
    work.loopSlots.forEach((slot, i) => {
      const mine = (slot ?? []).filter((c) => ids.has(c.colour));
      const quiet = mine.filter((c) => !c.job).length;
      if (mine.length > quiet) uses.loopsPlayOn = true;
      if (quiet === 0) return;
      uses.quietNotes += quiet;
      const name = loopLabel(work.loopNames, i);
      uses.quietLoops.push(player === null ? name : `${player}'s ${name}`);
    });
    for (const page of work.pages) uses.pageCounters += page.filter((c) => ids.has(c.colour)).length;
  }
  return uses;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The warning for removing one colour ("Green"), or every colour (null). */
export function removalWarning(colour: string | null, u: ColourUses): string {
  const of = colour === null ? '' : `${colour} `;
  const words = [colour === null
    ? 'Every colour is removed for every player on this board.'
    : 'It is removed for every player on this board.'];
  if (u.quietNotes > 0) {
    words.push(`${count(u.quietNotes, `${of}note`, `${of}notes`)} in ${listNames(u.quietLoops)} will go quiet.`);
    if (u.loopsPlayOn) words.push('Other loop notes keep their own sounds and play on.');
  } else if (u.loopsPlayOn) {
    words.push('Loops keep the sounds they were made with, so they play on.');
  }
  if (u.pageCounters > 0) {
    words.push(`${count(u.pageCounters, `${of}counter saved on a page`, `${of}counters saved on pages`)} will go quiet.`);
  }
  return words.join(' ');
}
