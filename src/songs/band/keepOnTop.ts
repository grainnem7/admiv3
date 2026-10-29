/**
 * Keep Tim on top (harmony spec stage 2, owner approved): while the player's own notes
 * sound, the band, the loops and the extra notes dip a little, so his playing is always
 * heard. A short attack and a short release, so the dip follows his notes and never pumps.
 *
 * The engine shapes the band's own gain with the same curve, and gives each loop and
 * extra note the dip at the moment it starts (they share their instrument with his notes,
 * so only their loudness can dip). Pure: same notes, same gain.
 */

/** How far the rest dips, in dB: the default, and the range the player can set. */
export const KEEP_ON_TOP_DEFAULT_DB = 3;
export const KEEP_ON_TOP_MIN_DB = 1;
export const KEEP_ON_TOP_MAX_DB = 9;

/** Time constants of the dip, in seconds: down in a few tens of ms, back in a few hundred. */
export const KEEP_ON_TOP_ATTACK_TC = 0.015;
export const KEEP_ON_TOP_RELEASE_TC = 0.08;
/** After this long past a note's end the curve is taken as fully back (well past 99.9%). */
export const KEEP_ON_TOP_RELEASE_SPAN = 0.6;

/** When one of the player's notes sounds, in audio-clock seconds. */
export interface SoundingWindow {
  start: number;
  end: number;
}

/** A dip of `db` as a gain (3 dB ≈ 0.71). */
export function dipGain(db: number): number {
  return db <= 0 ? 1 : 10 ** (-db / 20);
}

/** A stored dip made safe: within range, to the half dB; unreadable is the default. */
export function sanitizeKeepOnTopDb(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return KEEP_ON_TOP_DEFAULT_DB;
  return Math.max(KEEP_ON_TOP_MIN_DB, Math.min(KEEP_ON_TOP_MAX_DB, Math.round(v * 2) / 2));
}

/**
 * The gain on everything but the player at time `t`, given when his notes sound: each
 * note pulls it down towards the dip from its start, and lets it back up from its end;
 * overlapping notes keep it down.
 */
export function keepOnTopGain(t: number, windows: readonly SoundingWindow[], db: number): number {
  const dip = dipGain(db);
  if (dip >= 1) return 1;
  let g = 1;
  for (const w of windows) {
    if (t < w.start || t > w.end + KEEP_ON_TOP_RELEASE_SPAN) continue;
    // How far down it got by the end of the note (a very short note may not reach the dip).
    const down = (until: number): number => 1 - (1 - dip) * (1 - Math.exp(-(until - w.start) / KEEP_ON_TOP_ATTACK_TC));
    const v = t <= w.end
      ? down(t)
      : 1 - (1 - down(w.end)) * Math.exp(-(t - w.end) / KEEP_ON_TOP_RELEASE_TC);
    if (v < g) g = v;
  }
  return g;
}

/**
 * How far into a note its loudness is judged, for a note whose dip can only be in its
 * velocity (a loop's or an extra note): its body, not its first instant, so a note that
 * starts together with one of the player's dips with it.
 */
export const KEEP_ON_TOP_NOTE_LOOK_SEC = 0.05;

/** The dip for a note starting at `t` (see KEEP_ON_TOP_NOTE_LOOK_SEC). */
export function noteDip(t: number, windows: readonly SoundingWindow[], db: number): number {
  return keepOnTopGain(t + KEEP_ON_TOP_NOTE_LOOK_SEC, windows, db);
}

/** The windows still able to dip anything at or after `now`. */
export function pruneWindows(windows: readonly SoundingWindow[], now: number): SoundingWindow[] {
  return windows.filter((w) => w.end + KEEP_ON_TOP_RELEASE_SPAN >= now);
}
