/**
 * When each colour comes in: a sound colour's counters stay silent until its time while the
 * piece's clock runs, then play. Tim can't put counters on the board himself, so they are
 * all placed before the piece starts; this is how the opening is the loops alone and his
 * colours come in later.
 *
 * Only while the piece's clock runs (the piece from 0:00, Rehearse from here, Carry on):
 * ▶ Play, the warm-up and the board after Stop play every colour. Only colours that play
 * notes are held back; a control colour (Speed, volume, the toggles…) never is. Loops play
 * as they always do, including loops made from a waiting colour. Pure: the screen keeps the
 * clock, the runtime filters the counters before the engine hears them.
 */

import { describeChannel, isSequencedRole, type ColourChannel, type ColourId } from '../../tracking/boardColours';
import { formatClock, MAX_PIECE_SEC } from './clock';

/** When each colour comes in, in seconds from the piece's start, by colour id. No time = from the start. */
export type ColourEntries = Readonly<Record<ColourId, number>>;

/** Whether a colour can be held back: only colours that play notes. */
export function holdsBack(ch: Pick<ColourChannel, 'role'>): boolean {
  return isSequencedRole(ch.role);
}

/**
 * The sound colours still waiting `pieceSec` into the piece, earliest first. None while no
 * piece clock runs (null): ▶ Play and the warm-up play every colour.
 */
export function waitingColours(
  channels: readonly ColourChannel[], entries: ColourEntries | undefined, pieceSec: number | null,
): ColourChannel[] {
  // Read every frame on the way to the engine: a config without times must never throw there.
  if (pieceSec === null || !entries) return [];
  const at = (ch: ColourChannel): number | undefined => entries[ch.id];
  return channels
    .filter((ch) => holdsBack(ch) && typeof at(ch) === 'number' && pieceSec < (at(ch) as number))
    .sort((a, b) => (at(a) as number) - (at(b) as number));
}

/**
 * The player's counters as the engine should hear them: none of a waiting colour's, and none
 * of a colour silenced by the Board button on the iPad's Simple page (`out`, spec 2026-11-04). A colour out is
 * silent whether or not the piece's clock runs; it stays on the board.
 */
export function cellsSoundingAt<C extends { colour: ColourId }>(
  cells: readonly C[], channels: readonly ColourChannel[], entries: ColourEntries | undefined, pieceSec: number | null,
  out?: ReadonlySet<ColourId>,
): C[] {
  const waiting = new Set(waitingColours(channels, entries, pieceSec).map((ch) => ch.id));
  if (out) for (const id of out) waiting.add(id);
  return waiting.size === 0 ? [...cells] : cells.filter((c) => !waiting.has(c.colour));
}

/** "Waiting: Red at 1:30, Blue at 2:30"; null when nothing waits. */
export function waitingLine(waiting: readonly ColourChannel[], entries: ColourEntries): string | null {
  if (waiting.length === 0) return null;
  return `Waiting: ${waiting.map((ch) => `${describeChannel(ch)} at ${formatClock(entries[ch.id] ?? 0)}`).join(', ')}`;
}

/** "Red comes in", "Red and Blue come in", "Red, Blue and Green come in". */
export function comesInLine(names: readonly string[]): string {
  const list = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? 'comes' : 'come'} in`;
}

const MAX_ID = 40;

/**
 * Stored colour times made safe: whole seconds from 0 to the longest a piece can be; anything
 * else is dropped. With `channelIds`, the time of a colour that no longer exists goes too.
 */
export function sanitizeColourEntries(v: unknown, channelIds: ReadonlySet<string> | null = null): Record<ColourId, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: Record<ColourId, number> = {};
  for (const [id, at] of Object.entries(v as Record<string, unknown>)) {
    if (id.length === 0 || id.length > MAX_ID || (channelIds !== null && !channelIds.has(id))) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > MAX_PIECE_SEC) continue;
    out[id] = Math.round(at);
  }
  return out;
}

/** The times with one colour's set, or cleared (null = from the start). */
export function withColourEntry(entries: ColourEntries, id: ColourId, at: number | null): Record<ColourId, number> {
  const out: Record<ColourId, number> = { ...entries };
  if (at === null) delete out[id];
  else out[id] = at;
  return out;
}

/** What is wrong with a colour's time, in words, or null when it is fine. */
export function colourEntryProblem(at: number | null, lengthSec: number): string | null {
  if (at === null) return null;
  if (at > MAX_PIECE_SEC) return `The piece is at most ${formatClock(MAX_PIECE_SEC)}.`;
  if (at >= lengthSec) return `After the end of the piece (${formatClock(lengthSec)}): it would never be heard.`;
  return null;
}
