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
  /** The one way to make a loop (K1, 5 Nov 2026): beside ▶ Play, and the rail's dashed place. */
  keepAsLoop: 'Keep as loop',
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

/** "Red", "Red and Green", "Red, Blue and Green". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The Simple iPad page (spec 2026-11-04) and what the laptop says about it: the same words on
 * both, and in Help.
 */
export const SIMPLE_WORDS = {
  /** The facilitator's one button for the show (was "Use the safe show layout"). */
  useSimple: 'Use the simple layout',
  /** Back to the full layout, with the boxes as they are. */
  useFull: 'Use the full layout instead',
  /** What the drums or the board are doing now. */
  playing: 'Playing',
  silent: 'Silent',
  /** The big button: no drums anywhere while silent (the board's, the loops', the band's). */
  drums: 'Drums',
  drumsSilenced: 'Drums silenced on the iPad',
  bringDrumsBack: 'Bring the drums back',
  /** How much plays, for the whole piece: two halves, the lit one is on; neither lit is normal. */
  calm: 'Calm',
  busy: 'Busy',
  calmMeans: 'Fewer notes',
  busyMeans: 'More notes',
  /** The counters on the board, as one button (the 4 Nov page; kept in the code for one release, not shown). */
  board: 'Board',
  boardSilenced: 'Board counters silenced on the iPad',
  bringBoardBack: 'Bring them back',
  /** The Counters row (K4): one pad per colour, silencing that colour's counters. */
  counters: 'Counters',
  /** The laptop's line for the colours silenced on the iPad: "Red and Green silenced on the iPad". */
  countersSilenced: (names: readonly string[]): string => `${listOf(names)} silenced on the iPad`,
  /** A drum colour's pad while Drums are off everywhere. */
  drumsAreOff: 'Drums are off',
  /** The laptop's line for Calm / Busy, and its way back. */
  feelCalm: 'Calm (from the iPad): the loops play only their main beats, and no Extra notes',
  feelBusy: 'Busy (from the iPad): Extra notes round everything',
  backToNormal: 'Back to normal',
  /** The rows the facilitator can show or hide, in page order. */
  rows: { melody: 'Melody instrument', counters: 'Counters, one per colour' },
  rowsCaption: 'What the simple layout shows',
  noRows: 'Nothing is chosen for this page. Choose what it shows on the laptop.',
  /** The row of melody sounds. */
  melodyPlays: 'Melody plays',
  sounds: { piano: 'Piano', flute: 'Flute', trumpet: 'Trumpet', saxophone: 'Sax' },
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
  { old: /\bSave the board here\b|\bOverwrite with board\b|\bKeep the board as this loop\b|\bOther ways to make a loop\b/, use: WORDS.keepAsLoop },
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
