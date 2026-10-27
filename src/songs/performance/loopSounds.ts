/**
 * A kept loop remembers what each counter PLAYED, not only its colour. The board's colours
 * change from session to session (a fresh set-up, green now piano instead of violin), and a
 * loop kept as violin must replay as violin: that is what Tim made. So Keep records each
 * counter's job and sound, and a loop is played through its own "loop colours" — one
 * synthetic colour per job + sound — rather than through today's colours.
 *
 * Loops kept before this (colour only) pass through untouched and play as today's colour.
 * Pure: no engine, no DOM.
 */
import type { ActiveCell } from '../../tracking/BoardSequencerMode';
import type { ColourChannel } from '../../tracking/boardColours';
import type { StoredLoopCell } from '../../profiles/BoardSequencerConfig';
import { soundOptionName } from '../../ui/screens/boardSequencer/soundCatalogue';
import { COLOUR_JOB_CHANNELS } from '../../midi/boardMidi';

export type LoopJob = NonNullable<StoredLoopCell['job']>;

/** A loop's note with nothing to draw it in today: neutral, never a colour that means something. */
export const LOOP_GREY = '#9a9a9a';

const LOOP_PREFIX = 'loop:';

/** The colour id a loop's notes of one job and sound play under. */
export function loopColourId(job: LoopJob, sound: string): string {
  return `${LOOP_PREFIX}${job}:${sound}`;
}

function soundOf(ch: ColourChannel): string {
  return (ch.role === 'drums' ? ch.drum : ch.instrument) ?? '';
}

/** The counters on the board as a loop to keep: only sounding colours, each with its job and sound. */
export function keepCells(cells: readonly ActiveCell[], channels: readonly ColourChannel[]): StoredLoopCell[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const out: StoredLoopCell[] = [];
  for (const c of cells) {
    const ch = byId.get(c.colour);
    if (!ch) continue;
    const role = ch.role;
    if (role !== 'melody' && role !== 'bass' && role !== 'chord' && role !== 'drums') continue;
    const cell: StoredLoopCell = { row: c.row, col: c.col, colour: c.colour };
    if (c.velocity !== undefined) cell.velocity = c.velocity;
    if (c.timingBeats !== undefined) cell.timingBeats = c.timingBeats;
    if (c.conditional) cell.conditional = true;
    cell.job = role;
    cell.sound = soundOf(ch);
    out.push(cell);
  }
  return out;
}

/** Today's colour that plays this job and sound, if any. */
function todaysMatch(job: LoopJob, sound: string, today: readonly ColourChannel[]): ColourChannel | undefined {
  return today.find((c) => c.role === job && soundOf(c) === sound);
}

/**
 * A kept loop as the engine should play it: cells re-coloured to their loop colours, and
 * the channels those colours need. The channel borrows today's swatch (and phrase choice)
 * from a colour that plays the same thing, so the loop is drawn like Tim's own notes of
 * that sound; otherwise it is grey.
 */
export function loopChannelsFor(
  cells: readonly StoredLoopCell[], today: readonly ColourChannel[],
): { cells: ActiveCell[]; channels: ColourChannel[] } {
  const channels = new Map<string, ColourChannel>();
  const out: ActiveCell[] = cells.map((c) => {
    if (!c.job) return { ...c };
    const sound = c.sound ?? '';
    const id = loopColourId(c.job, sound);
    if (!channels.has(id)) {
      const match = todaysMatch(c.job, sound, today);
      channels.set(id, {
        id, kind: 'hue', role: c.job, swatch: match?.swatch ?? LOOP_GREY, changes: false,
        plays: match?.plays ?? 'note',
        ...(c.job === 'drums' ? { drum: sound } : { instrument: sound }),
      });
    }
    const { job: _job, sound: _sound, ...rest } = c;
    return { ...rest, colour: id };
  });
  return { cells: out, channels: [...channels.values()] };
}

/**
 * Kept cells as they should be drawn: a cell that carries a job is drawn as its loop
 * colour (so loopSwatch gives today's colour for that sound, or grey), an older cell as
 * its own colour. Positions and box detail are untouched.
 */
export function drawCells(cells: readonly StoredLoopCell[]): { row: number; col: number; colour: string }[] {
  return cells.map((c) => ({ row: c.row, col: c.col, colour: c.job ? loopColourId(c.job, c.sound ?? '') : c.colour }));
}

const JOB_WORDS: Record<LoopJob, string> = { melody: 'Melody', bass: 'Bass', chord: 'Chords', drums: 'Drums' };

/** A loop colour in words ("Violin loop", "Bass loop"); null for any other colour id. */
export function loopColourLabel(id: string): string | null {
  if (!id.startsWith(LOOP_PREFIX)) return null;
  const [job, ...rest] = id.slice(LOOP_PREFIX.length).split(':');
  const sound = rest.join(':');
  if (!sound) return `${JOB_WORDS[job as LoopJob] ?? 'A'} loop`;
  const name = soundOptionName(sound);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} loop`;
}

/**
 * One channel per colour: which track each kept loop's notes go to. A loop plays on the
 * track of today's colour that has the same job and sound (so Ableton's sound there is the
 * one it was kept with); otherwise on its job's first track.
 */
export function loopColourChannels(
  loopSlots: readonly (StoredLoopCell[] | null)[], today: readonly ColourChannel[], trackOf: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const slot of loopSlots) {
    for (const c of slot ?? []) {
      if (!c.job) continue;
      const id = loopColourId(c.job, c.sound ?? '');
      if (out.has(id)) continue;
      const match = todaysMatch(c.job, c.sound ?? '', today);
      const own = match ? trackOf.get(match.id) : undefined;
      out.set(id, own ?? COLOUR_JOB_CHANNELS[c.job === 'drums' ? 'melody' : c.job][0]);
    }
  }
  return out;
}

/** What colour to draw a cell in: a loop colour as today's colour for that sound, a known colour as itself, else grey. */
export function loopSwatch(colour: string, today: readonly ColourChannel[]): string {
  if (colour.startsWith(LOOP_PREFIX)) {
    const [job, ...sound] = colour.slice(LOOP_PREFIX.length).split(':');
    return todaysMatch(job as LoopJob, sound.join(':'), today)?.swatch ?? LOOP_GREY;
  }
  return today.find((c) => c.id === colour)?.swatch ?? LOOP_GREY;
}
