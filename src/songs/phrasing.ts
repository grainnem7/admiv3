/**
 * Phrasing (sound investigation, S2, sixth part): what a player does to a line of notes that
 * a sequencer does not.
 *  - Legato: a note that leads to the next one of the same colour overlaps it a little, so
 *    a sampled instrument's legato engine (every counter chain in Ableton is a "Solo
 *    Legato" preset) plays the transition instead of starting each note from nothing.
 *  - Contour: a note that goes up from the last one is a touch stronger, one that comes
 *    down a touch softer, the way a line is sung.
 * Both pure; neither moves a note's start in time.
 */

/** How far a note runs past the start of the next one, in seconds. */
export const LEGATO_OVERLAP_SEC = 0.06;

/** The length of a note that rings to the next, with the overlap when there is a next. */
export function legatoLength(ringSec: number, gapBeats: number, loopBeats: number, secPerBeat: number): number {
  const hasNext = gapBeats > 0 && gapBeats < loopBeats;
  return hasNext ? Math.max(ringSec, gapBeats * secPerBeat + LEGATO_OVERLAP_SEC) : ringSec;
}

/**
 * How much louder or softer a note is for the way the line moves to it: up stronger, down
 * softer, within a few percent, more for a leap. The move is read from the figure itself
 * (the colour's previous counter in the same pass), never from what happened to play
 * last, so a scene plays the same however it is reached.
 */
export const CONTOUR_STEP = 0.05;
export function contourFactor(previousMidi: number | undefined, midi: number): number {
  if (previousMidi === undefined) return 1;
  return contourByInterval(midi - previousMidi);
}

/** The same, from the interval in semitones (up positive). */
export function contourByInterval(semitones: number): number {
  if (semitones === 0) return 1;
  const leap = Math.min(7, Math.abs(semitones));
  const k = CONTOUR_STEP * (leap / 7);
  return semitones > 0 ? 1 + k : 1 - k;
}
