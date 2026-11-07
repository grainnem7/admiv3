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
import type { BandLevel } from '../../../songs/band/band';
import type { ReadyItem } from './play/ReadyCheck';
import { VALVE_NAMES, type KeepingTimeReport, type ValveStep } from '../../../songs/keepingTime';
import { SIMPLE_WORDS } from './words';

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
  /** The sound colours that come in at a time ("When each colour comes in"), by name. */
  colourTimes?: readonly { name: string; at: number }[];
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

/** A scene's band in words: the same as the Band buttons (Off, Quiet, Full). */
export const BAND_WORDS: Record<BandLevel, string> = { off: 'no band', gentle: 'quiet band', full: 'full band' };

/** What Update from now put in a scene, shown with Undo: "Open now has what is playing: Bed, Beat · full band." */
export function updatedFromNowLine(scene: string, loops: readonly string[], band: BandLevel): string {
  return `${scene} now has what is playing: ${loops.length > 0 ? loops.join(', ') : 'no loops'} · ${BAND_WORDS[band]}.`;
}

/** What ticking "alone" took out of a scene, shown with Undo: "Open is now Tim alone: Bed and Pulse taken out." */
export function aloneLine(scene: string, player: string | null, loops: readonly string[]): string {
  return `${scene} is now ${playerWords(player).name} alone: ${listNames(loops)} taken out.`;
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
      fix: `The room will be silent there unless ${who.name} plays: press its card under the board, add a loop or tick “${who.Name} alone”.`, place: 'scenes',
    });
  }

  const timed = scenes.filter((s) => typeof s.at === 'number');
  items.push(scenes.length === 0
    ? { label: 'No scenes yet', state: 'warn', fix: 'Optional. Make a piece: Keep as scene, or Make my plan. Without scenes the piece does not change by itself.', place: 'scenes' }
    : timed.some((s) => s.at === 0)
      ? { label: `${timed.length} ${timed.length === 1 ? 'scene comes' : 'scenes come'} in on the clock, one at 0:00`, state: 'ok' }
      : { label: 'No scene at 0:00', state: 'warn', fix: 'Give the opening scene the time 0:00, so the piece starts in it.', place: 'scenes' });

  // A scene with no time only comes in by hand (T2-11).
  const byHand = scenes.filter((s) => typeof s.at !== 'number');
  if (byHand.length > 0) {
    const one = byHand.length === 1;
    items.push({
      label: `${names(byHand)} ${one ? 'has' : 'have'} no time`,
      state: 'problem',
      fix: `${one ? 'It only comes' : 'They only come'} in if someone presses Next: delete ${one ? 'it' : 'them'}, or shorten a scene and keep ${one ? 'it' : 'them'} again.`, place: 'scenes',
    });
  }

  const at = (s: Scene): number => s.at as number;
  const late = timed.filter((s) => at(s) >= len);
  if (late.length > 0) {
    const one = late.length === 1;
    items.push({
      label: `${names(late)} ${one ? 'comes' : 'come'} in at or after the end (${formatClock(len)})`,
      state: 'problem',
      fix: `${one ? 'It is' : 'They are'} never heard: shorten the scene before ${one ? 'it' : 'each'}${len < MAX_PIECE_SEC ? ', or make the piece longer' : ''}.`, place: 'scenes',
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
        fix: 'Only one of them is heard: change a scene’s length under the board so each has its own time.', place: 'scenes',
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
        fix: `The piece is ending by then, so ${one ? 'it is' : 'they are'} not heard: shorten the scene before ${one ? 'it' : 'each'}, or choose a shorter ending.`, place: 'scenes',
      });
    }
  }

  // A colour held back until after the end is never heard in the piece: said, as a warning
  // (it may be meant for a longer piece).
  for (const c of p.colourTimes ?? []) {
    if (c.at < len) continue;
    items.push({
      label: `${c.name} comes in at ${formatClock(c.at)}, after the piece ends.`,
      state: 'warn',
      fix: `${c.name}'s counters stay silent for the whole piece: in Check → The whole piece → When each colour comes in, give it an earlier time, or clear it to play from the start.`, place: 'scenes',
    });
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
  /** The iPad shows the Simple page (spec 2026-11-04; it replaced the safe show layout, F3). */
  simpleLayout: boolean;
  /** The iPad's page is from another build than this laptop's, or too old to say. */
  pageOutOfDate: boolean;
  /** Who plays ("Tim"); null = "the player". */
  playerName: string | null;
  /** "Use the simple layout", from the check itself. */
  onUseSimpleLayout(): void;
}

/**
 * The check's lines about the iPad: whether it is connected; whether its page is from
 * before an update (a Safari tab left open from a rehearsal has none of today's
 * protections); and whether it shows the simple layout. The simple layout is the default
 * only for new players, so a saved player keeps their layout until it is chosen: only a
 * warning, as the fuller layout may be on purpose.
 */
export function ipadCheckItems(p: IpadCheckInput): ReadyItem[] {
  if (!p.enabled) return [{ label: 'iPad not in use', state: 'ok' }];
  const who = playerWords(p.playerName);
  const items: ReadyItem[] = [p.connected
    ? { label: 'iPad connected', state: 'ok' }
    : { label: 'iPad not connected', state: 'warn', fix: 'Open the link from the Connections tab in Safari on the iPad.', place: 'connections' }];
  if (p.connected && p.pageOutOfDate) {
    items.push({
      label: `${who.Name}'s iPad page is out of date: reload it on the iPad.`,
      state: 'problem',
      fix: "An old page may not have today's protections, such as the bounce guard on End piece. If this stays after the reload, reload Timbo on this laptop too.",
    });
  }
  if (!p.simpleLayout) {
    items.push({
      label: `${who.Name}'s iPad is not in the simple layout`,
      state: 'warn',
      fix: 'More on the iPad means one stray touch can do more, such as skip a scene or stop a loop. Fine if you chose it on purpose.',
      action: { label: SIMPLE_WORDS.useSimple, name: `${SIMPLE_WORDS.useSimple} on ${who.name}'s iPad`, onClick: p.onUseSimpleLayout },
    });
  }
  return items;
}

/**
 * Keeping time (spec 2026-10-28): did the sound keep up with the clock in the last run?
 * One full run with everything on, on the show laptop, should say "Keeping time: fine".
 */
export function keepingTimeCheckItems(p: { report: KeepingTimeReport | null; running: boolean; valve: readonly ValveStep[] }): ReadyItem[] {
  const r = p.report;
  if (r === null) {
    return [{
      label: 'Keeping time: not measured yet', state: 'warn',
      fix: 'Play the piece once all the way through, with everything on. This line then says whether the sound kept time.',
    }];
  }
  const when = p.running ? 'so far in this run' : 'in the last run';
  const items: ReadyItem[] = [];
  if (r.everBehind) {
    const beats = [`${r.lateBeats} ${r.lateBeats === 1 ? 'beat' : 'beats'} late`, ...(r.skippedBeats > 0 ? [`${r.skippedBeats} dropped`] : [])].join(', ');
    const paused = p.valve.length > 0 ? ` To keep up, Timbo paused ${listNames(p.valve.map((s) => VALVE_NAMES[s]))}.` : '';
    items.push({
      label: `Keeping time: the sound fell ${r.lostSec.toFixed(1)} s behind ${when} (${beats})`, state: 'warn',
      fix: `Close other programs, plug the laptop in, and turn Extra notes off (Sound tab). Then run the piece again.${paused}`, place: 'sound',
    });
  }
  if (r.drifting) {
    items.push({
      label: `Keeping time: the sound’s clock ran ${r.driftSec.toFixed(1)} s slow ${when}`, state: 'warn',
      fix: 'Dropping extras can’t fix this: check the sound output (plug the laptop in, or choose another output), then run the piece again.',
    });
  }
  if (items.length > 0) return items;
  return [{ label: p.running ? 'Keeping time: fine so far' : `Keeping time: fine in the last run (${formatClock(r.runSec)})`, state: 'ok' }];
}

/**
 * Which board is in use. The laptop board is chosen with its own button, so it is advice,
 * not a warning (B21): the check can still reach Ready while planning at home.
 */
export function boardItem({ laptop, cameraOk }: { laptop: boolean; cameraOk: boolean }): ReadyItem {
  if (laptop) return { label: 'Board: the laptop board', state: 'note', fix: 'For the performance with the real board, use the camera board.', place: 'cameraBoard' };
  return cameraOk
    ? { label: 'Board: camera running and the board found', state: 'ok' }
    : { label: 'Board: camera or board not ready', state: 'problem', fix: 'Set up: Camera and Board.', place: 'setupCamera' };
}

/** A backup file is advice (B21): the work is already saved on the laptop. */
export function backupItem(backedUp: boolean): ReadyItem {
  return backedUp
    ? { label: 'Backed up to a file this session', state: 'ok' }
    : { label: 'Not backed up to a file yet', state: 'note', fix: 'Press Back up to a file below, and keep the file off the laptop.' };
}

// ---- the hat, the face and the second laptop, for the show (owner, 7 Nov 2026) ------------

/** Whether the face check that backs up the hat is working (Cap tab → Check it is on the head). */
export function faceCheckItem(p: { faceAssist: boolean; face: 'off' | 'loading' | 'on' | 'unavailable'; follow: 'hat' | 'head' }): ReadyItem | null {
  // Following the head, the face is the whole thing, and the hat's own line says so.
  if (p.follow === 'head') return null;
  if (!p.faceAssist) {
    return { label: 'Face check is off: nothing backs up the hat', state: 'note', place: 'cap', fix: 'Cap tab → More hat settings: Check it is on the head. With it on, red off the head never takes over, and the face carries on when the hat is hidden.' };
  }
  if (p.face === 'on') return { label: 'Face check on: it backs up the hat', state: 'ok' };
  if (p.face === 'unavailable') {
    return { label: 'Face check could not load: the hat works alone', state: 'warn', place: 'cap', fix: 'Connect this laptop to the internet once, then switch the cap off and on in the Cap tab: Timbo keeps its own copy after that.' };
  }
  return { label: 'Face check still loading', state: 'warn', place: 'cap', fix: 'Wait a few seconds with the camera on. If it stays like this, the laptop needs the internet once.' };
}

/** How far a whole turn of the head moves the speed, when the hat is on Speed. */
export function hatSpeedItem(xRole: string, yRole: string, span: number): ReadyItem | null {
  if (xRole !== 'tempo' && yRole !== 'tempo') return null;
  if (span >= 1) {
    return { label: 'The hat moves Speed all the way to Slowest and Fastest', state: 'note', place: 'cap', fix: 'For a performed piece, 15 % either side keeps it musical: Cap tab, How far the hat moves the speed.' };
  }
  return { label: `The hat moves Speed ${Math.round(span * 100)} % either side of the scene’s`, state: 'ok' };
}

/** The second performer's laptop: said when it is connected; it is optional, so nothing otherwise. */
export function secondLaptopItem(connected: boolean): ReadyItem | null {
  return connected ? { label: 'Second laptop connected', state: 'ok' } : null;
}

/** The Show button's words: all good, or how many things to look at (problems and warnings). */
export function readySummary(items: readonly ReadyItem[]): string {
  const n = items.filter((i) => i.state === 'problem' || i.state === 'warn').length;
  return n === 0 ? 'Ready check: all good ✓' : `Ready check: ${n} to look at`;
}
