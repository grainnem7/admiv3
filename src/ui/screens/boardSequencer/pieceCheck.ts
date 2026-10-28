/**
 * The Ready check's lines about the piece itself: its loops, its scenes, their times, the
 * length and the ending. A show must never go silent or run over 7:00 because of the
 * software, so whatever would make it — a scene with nothing to play, a scene that never
 * comes in, an empty loop, a length over 7:00 — is a problem, never "Ready".
 */
import {
  describeEnding, endingLeadSec, endingTooLong, formatClock, MAX_PIECE_SEC, type PerformanceSettings,
} from '../../../songs/performance/clock';
import { loopLabel, type Scene } from '../../../songs/performance/launcher';
import type { ReadyItem } from './play/ReadyCheck';

export interface PieceCheckInput {
  scenes: readonly Scene[];
  /** The saved loops, one per slot (null or empty = nothing saved there). */
  loopSlots: readonly (readonly unknown[] | null)[];
  loopNames: readonly string[];
  performance: PerformanceSettings;
  /** How long one pass lasts at the tempo now, in seconds: it says when the ending begins. */
  passSec: number;
  /** Who plays ("Tim"); null = "the player". */
  playerName: string | null;
  /** Take an empty loop out of every scene that uses it. */
  onTakeOut(slot: number): void;
}

/** "Open", "Arrival and Open", "Arrival, Build and Open". */
export function listNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The player in a sentence, and at the start of one: "Tim", or "the player" with no name. */
export function playerWords(name: string | null): { name: string; Name: string } {
  const n = name?.trim() ?? '';
  return n.length > 0 ? { name: n, Name: n } : { name: 'the player', Name: 'The player' };
}

export function pieceCheckItems(p: PieceCheckInput): ReadyItem[] {
  const items: ReadyItem[] = [];
  const { scenes, performance: perf } = p;
  const len = perf.lengthSec;
  const saved = (slot: number): boolean => (p.loopSlots[slot]?.length ?? 0) > 0;
  const names = (list: readonly Scene[]): string => listNames(list.map((s) => s.name));
  const who = playerWords(p.playerName);

  // A loop a scene uses that holds nothing: named, with the fix right here (T2-06).
  const emptySlots = [...new Set(scenes.flatMap((s) => s.loops))].filter((slot) => !saved(slot)).sort((a, b) => a - b);
  if (emptySlots.length === 0) items.push({ label: 'Every loop the scenes use is saved', state: 'ok' });
  for (const slot of emptySlots) {
    const using = scenes.filter((s) => s.loops.includes(slot));
    const loop = loopLabel(p.loopNames, slot);
    items.push({
      label: `${names(using)} ${using.length === 1 ? 'uses' : 'use'} ${loop}, which is empty`,
      state: 'problem',
      fix: `Take it out of ${using.length === 1 ? 'the scene' : 'those scenes'}, or make a new loop and add that instead.`,
      action: { label: 'Take it out', name: `Take it out: ${loop}, from ${names(using)}`, onClick: () => p.onTakeOut(slot) },
    });
  }

  // The band and Extra notes only play while a counter is down: a scene where no loop
  // plays is silence unless the player plays (T3-01), so only marked, never by accident.
  const silent = scenes.filter((s) => s.alone !== true && !s.loops.some(saved));
  if (silent.length > 0) {
    items.push({
      label: `No loop plays in ${names(silent)}`,
      state: 'problem',
      fix: `The room will be silent there unless ${who.name} plays: in Scenes, add a loop or tick “${who.Name} alone”.`,
    });
  }

  const timed = scenes.filter((s) => typeof s.at === 'number');
  items.push(scenes.length === 0
    ? { label: 'No scenes yet', state: 'warn', fix: 'Optional. Make a piece, step 2: Make my plan. Without scenes the piece does not change by itself.' }
    : timed.some((s) => s.at === 0)
      ? { label: `${timed.length} ${timed.length === 1 ? 'scene comes' : 'scenes come'} in on the clock, one at 0:00`, state: 'ok' }
      : { label: 'No scene at 0:00', state: 'warn', fix: 'Give the opening scene the time 0:00, so the piece starts in it.' });

  // A scene with no time only comes in by hand (T2-11).
  const byHand = scenes.filter((s) => typeof s.at !== 'number');
  if (byHand.length > 0) {
    const one = byHand.length === 1;
    items.push({
      label: `${names(byHand)} ${one ? 'has' : 'have'} no time`,
      state: 'problem',
      fix: `${one ? 'It only comes' : 'They only come'} in if someone presses Next: give ${one ? 'it' : 'each'} a time in Scenes, or delete ${one ? 'it' : 'them'}.`,
    });
  }

  const at = (s: Scene): number => s.at as number;
  const late = timed.filter((s) => at(s) >= len);
  if (late.length > 0) {
    const one = late.length === 1;
    items.push({
      label: `${names(late)} ${one ? 'comes' : 'come'} in at or after the end (${formatClock(len)})`,
      state: 'problem',
      fix: `${one ? 'It is' : 'They are'} never heard: give ${one ? 'it' : 'each'} an earlier time in Scenes${len < MAX_PIECE_SEC ? ', or make the piece longer' : ''}.`,
    });
  }

  // Two scenes at one moment: the clock brings in only one of them.
  const inside = timed.filter((s) => at(s) < len);
  for (const moment of [...new Set(inside.map(at))].sort((a, b) => a - b)) {
    const same = inside.filter((s) => at(s) === moment);
    if (same.length > 1) {
      items.push({
        label: `${names(same)} come in at the same moment (${formatClock(moment)})`,
        state: 'problem',
        fix: 'Only one of them is heard: give each its own time in Scenes.',
      });
    }
  }

  // Once the ending has begun no scene comes in. Only a warning: the scene before plays
  // on, and when the ending begins depends on the tempo, which a scene can change.
  if (!endingTooLong(perf, p.passSec)) {
    const endingFrom = len - endingLeadSec(perf, p.passSec);
    const afterEnding = inside.filter((s) => at(s) > endingFrom);
    if (afterEnding.length > 0) {
      const one = afterEnding.length === 1;
      items.push({
        label: `${names(afterEnding)} ${one ? 'comes' : 'come'} in after the ending has begun (about ${formatClock(endingFrom)})`,
        state: 'warn',
        fix: `The piece is ending by then, so ${one ? 'it is' : 'they are'} not heard: give ${one ? 'it' : 'each'} an earlier time, or choose a shorter ending.`,
      });
    }
  }

  // Not possible from the screen (the length is refused over 7:00 and loads as 7:00), but
  // the check never takes that on trust.
  if (len > MAX_PIECE_SEC) {
    items.push({
      label: `The piece is ${formatClock(len)} long: the most is ${formatClock(MAX_PIECE_SEC)}`,
      state: 'problem',
      fix: `Set Length of the piece to ${formatClock(MAX_PIECE_SEC)} or less.`,
    });
  }

  items.push(endingTooLong(perf, p.passSec)
    ? { label: 'The ending is too long for the piece', state: 'problem', fix: 'Fewer passes, or a longer piece.' }
    : { label: `Ending: ${describeEnding(perf)}, ${perf.ending === 'cue' ? 'when you press End' : 'at the time'}`, state: 'ok' });
  return items;
}

export interface IpadCheckInput {
  /** iPad controls are on. */
  enabled: boolean;
  connected: boolean;
  /** The iPad is set out as the safe show layout (show decision F3). */
  safeLayout: boolean;
  /** The iPad's page is from another build than this laptop's, or too old to say. */
  pageOutOfDate: boolean;
  /** Who plays ("Tim"); null = "the player". */
  playerName: string | null;
  /** "Use the safe show layout", from the check itself. */
  onUseSafeLayout(): void;
}

/**
 * The check's lines about the iPad: whether it is connected; whether its page is from
 * before an update (a Safari tab left open from a rehearsal has none of today's
 * protections); and whether it is in the safe show layout. The safe layout is the default
 * only for new players, so a saved player keeps a fuller iPad until it is chosen: only a
 * warning, as the fuller layout may be on purpose.
 */
export function ipadCheckItems(p: IpadCheckInput): ReadyItem[] {
  if (!p.enabled) return [{ label: 'iPad not in use', state: 'ok' }];
  const who = playerWords(p.playerName);
  const items: ReadyItem[] = [p.connected
    ? { label: 'iPad connected', state: 'ok' }
    : { label: 'iPad not connected', state: 'warn', fix: 'Open the link from the Connections tab in Safari on the iPad.' }];
  if (p.connected && p.pageOutOfDate) {
    items.push({
      label: `${who.Name}'s iPad page is out of date: reload it on the iPad.`,
      state: 'problem',
      fix: "An old page may not have today's protections, such as the bounce guard on End piece. If this stays after the reload, reload ADMI on this laptop too.",
    });
  }
  if (!p.safeLayout) {
    items.push({
      label: `${who.Name}'s iPad is not in the safe show layout`,
      state: 'warn',
      fix: 'More on the iPad means one stray touch can do more, such as skip a scene or stop a loop. Fine if you chose it on purpose.',
      action: { label: 'Use the safe show layout', name: `Use the safe show layout on ${who.name}'s iPad`, onClick: p.onUseSafeLayout },
    });
  }
  return items;
}
