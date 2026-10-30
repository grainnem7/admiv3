/**
 * The one word list (audit A2): one name for one thing, on the laptop, on the iPad and in
 * Help. A screen that names one of these things takes its word from here, and
 * src/__tests__/words.test.tsx checks that the words it replaced are gone from what the
 * owner reads.
 *
 * Pure: no imports, so the tracking and remote code may use it too.
 */

export const WORDS = {
  /** The notes the instrument adds around the player's (was Fill / fill amount). */
  extraNotes: 'Extra notes',
  /** The sound of each colour slowly changing (was Evolve). */
  soundsChange: 'Sounds change',
  /** How fast the board plays (was Tempo; "90 BPM" stays as the number). */
  speed: 'Speed',
  /** The repeating echo on a sound (was Delay). */
  echo: 'Echo',
  /** How bright a sound is (was Tone). */
  brightness: 'Brightness',
  /** Making a loop: New loop, counters, then Keep. */
  keep: 'Keep',
  /** The old way, under "Other ways to make a loop" (was Save the board here / Overwrite with board). */
  keepBoardAsLoop: 'Keep the board as this loop',
  /** The fade at the end of the piece (was End). */
  endPiece: 'End piece',
  /** Silence now (was Stop all). */
  stop: 'Stop',
  /** The iPad's pad that stops the loops on the next pass, not the music. */
  stopLoops: 'Stop the loops',
  /** Other extra notes (was Try another). */
  newIdea: 'New idea',
  /** Another path for Sounds change: the iPad's word for the same button. */
  newSound: 'New sound',
  /** A scene's, or the whole piece's, fresh AI ideas. */
  newIdeas: 'New ideas',
  /** The tab with the speed, swing and the grid (was Groove, which is also a setting). */
  timing: 'Timing',
  /** The Timing tab's own swing: the fine control under Sound → Groove. */
  swingFine: 'Swing, finely',
  /** Humanize. */
  looseTiming: 'Loose timing',
  /** Ping-pong. */
  thereAndBack: 'There and back',
  /** Pages. */
  pages: 'Boards in turn',
} as const;

/**
 * A scene's Energy, and the Sound tab's: the same names in both places. 0 is a scene that
 * doesn't set it.
 */
export const ENERGY_NAMES = ['Off', 'Calm', 'Steady', 'Lively', 'Driving', 'Big'] as const;

/** A fader job's word (a colour's counter, the hat, a disabled control's reason). */
export const FADER_WORDS = {
  volume: 'Volume',
  reverb: 'Reverb',
  delay: WORDS.echo,
  tone: WORDS.brightness,
  tempo: WORDS.speed,
  fill: WORDS.extraNotes,
  evolve: WORDS.soundsChange,
} as const;

/**
 * The words that are no longer used where the owner reads, each with the word used instead.
 * Whole words only, so "delayed" or "the fill colour" in code never count; "BPM" stays as a
 * number's unit.
 */
export const RETIRED_WORDS: readonly { old: RegExp; use: string }[] = [
  { old: /\bFill amount\b|\bfill amount\b|\(fader\)/, use: `${WORDS.extraNotes} (no "(fader)")` },
  { old: /\bEvolve\b/, use: WORDS.soundsChange },
  { old: /\bTempo\b/, use: WORDS.speed },
  { old: /\bDelay\b/, use: WORDS.echo },
  { old: /\bSave the board here\b|\bOverwrite with board\b/, use: WORDS.keepBoardAsLoop },
  { old: /\bStop all\b/, use: `${WORDS.stop} / ${WORDS.stopLoops}` },
  { old: /\bTry another\b/, use: WORDS.newIdea },
  { old: /\bHumanize\b/, use: WORDS.looseTiming },
  { old: /\bPing-pong\b/, use: WORDS.thereAndBack },
  { old: /\bstandalone\b/, use: 'None' },
  { old: /\bLike ThumbJam\b|\blike ThumbJam\b/, use: 'plain words' },
];

/** The retired words found in a text, for the tests and for a check by eye. */
export function retiredWordsIn(text: string): string[] {
  return RETIRED_WORDS.filter((w) => w.old.test(text)).map((w) => (text.match(w.old) ?? [''])[0]);
}
