/**
 * The session log: what the player made and what the instrument added, as a file.
 *
 * The research question behind ADMI is musical agency, so the log keeps the two apart:
 * every note carries its origin (placed, phrase, fill, band), its pitch or drum, its
 * loudness and its time; every setting change says who made it (the laptop, the iPad, a
 * control counter); and the board itself is written down whenever it changes. It is kept
 * in memory while the board runs and saved as JSON (everything) or CSV (notes only) when
 * asked. Nothing leaves the machine unless the facilitator saves it.
 */

import type { FiredNote } from './BoardSequencerEngine';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

export interface LoggedNote {
  /** Seconds from the session's start, when the note was heard. */
  t: number;
  origin: NonNullable<FiredNote['origin']>;
  role: FiredNote['role'];
  colour: string;
  row: number;
  col: number;
  /** MIDI pitch(es) or the kit piece. */
  midi?: number;
  midis?: number[];
  drum?: string;
  velocity?: number;
  durSec: number;
  source: FiredNote['source'];
}

export type LogActor = 'laptop' | 'ipad' | 'counter';

export type LogEvent =
  | { t: number; kind: 'start'; player: string; settings: Record<string, unknown> }
  | { t: number; kind: 'stop' }
  | { t: number; kind: 'board'; cells: { row: number; col: number; colour: string }[] }
  | { t: number; kind: 'setting'; by: LogActor; change: Record<string, unknown> }
  | { t: number; kind: 'action'; by: LogActor; action: string };

export interface SessionLogData {
  version: 1;
  startedAt: string;
  player: string;
  notes: LoggedNote[];
  events: LogEvent[];
}

/** Enough for a long session, not enough to exhaust the page. */
export const MAX_LOGGED_NOTES = 60000;

/** Settings worth writing down: the ones that change what is heard. Never the channels' colour bands. */
const LOGGED_SETTINGS = [
  'bpm', 'swing', 'humanize', 'scaleRootMidi', 'scaleName', 'rows', 'cols', 'numPages', 'pingPong',
  'noteLengthBeats', 'velocity', 'volume', 'soundWorld', 'phrases', 'band', 'fillAmount', 'fillSeed',
  'fillEngine', 'evolveAmount', 'evolveSceneLoops', 'evolveSeed', 'evolveHoldLap', 'studioMix',
  'midiEnabled', 'midiSends', 'loopStepsRed', 'loopStepsBlack', 'loopStepsBlue', 'variationEnabled',
] as const;

/** The part of a settings object the log keeps. */
export function loggedSettings(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LOGGED_SETTINGS) if (k in cfg) out[k] = cfg[k];
  if (Array.isArray(cfg.channels)) {
    out.channels = (cfg.channels as { id: string; role: string; instrument?: string }[])
      .map((c) => ({ id: c.id, role: c.role, ...(c.instrument ? { instrument: c.instrument } : {}) }));
  }
  return out;
}

export class SessionLog {
  private notes: LoggedNote[] = [];
  private events: LogEvent[] = [];
  private startedAt = new Date();
  private player = '';
  /** Audio-context time at the session's start: note times are relative to it. */
  private audioZero = 0;
  private lastBoardKey = '';
  private running = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Seconds since the session started. */
  private t(): number {
    return Math.round((this.now() - this.startMs) * 1000) / 1_000_000;
  }
  private startMs = 0;

  start(player: string, settings: Record<string, unknown>, audioNow: number): void {
    this.notes = [];
    this.events = [];
    this.startedAt = new Date();
    this.startMs = this.now();
    this.audioZero = audioNow;
    this.player = player;
    this.lastBoardKey = '';
    this.running = true;
    this.events.push({ t: 0, kind: 'start', player, settings: loggedSettings(settings) });
  }

  stop(): void {
    if (!this.running) return;
    this.events.push({ t: this.t(), kind: 'stop' });
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Every note the engine fired, as it is drained. */
  addNotes(fired: readonly FiredNote[]): void {
    if (!this.running) return;
    for (const f of fired) {
      if (this.notes.length >= MAX_LOGGED_NOTES) return;
      this.notes.push({
        t: Math.round((f.audioTime - this.audioZero) * 1000) / 1000,
        origin: f.origin ?? 'placed',
        role: f.role, colour: f.colour, row: f.row, col: f.col,
        ...(f.midi !== undefined ? { midi: f.midi } : {}),
        ...(f.midis ? { midis: f.midis } : {}),
        ...(f.drum ? { drum: f.drum } : {}),
        ...(f.velocity !== undefined ? { velocity: Math.round(f.velocity * 1000) / 1000 } : {}),
        durSec: Math.round(f.durSec * 1000) / 1000,
        source: f.source,
      });
    }
  }

  /** The board as settled: written only when it changes. */
  board(cells: readonly ActiveCell[]): void {
    if (!this.running) return;
    const key = cells.map((c) => `${c.row},${c.col},${c.colour}`).sort().join(';');
    if (key === this.lastBoardKey) return;
    this.lastBoardKey = key;
    this.events.push({ t: this.t(), kind: 'board', cells: cells.map((c) => ({ row: c.row, col: c.col, colour: c.colour })) });
  }

  setting(by: LogActor, change: Record<string, unknown>): void {
    if (!this.running) return;
    const kept = loggedSettings(change);
    if (Object.keys(kept).length === 0) return;
    this.events.push({ t: this.t(), kind: 'setting', by, change: kept });
  }

  action(by: LogActor, action: string): void {
    if (!this.running) return;
    this.events.push({ t: this.t(), kind: 'action', by, action });
  }

  counts(): { notes: number; placed: number; added: number; events: number } {
    const placed = this.notes.filter((n) => n.origin === 'placed' || n.origin === 'phrase').length;
    return { notes: this.notes.length, placed, added: this.notes.length - placed, events: this.events.length };
  }

  toJSON(): SessionLogData {
    return { version: 1, startedAt: this.startedAt.toISOString(), player: this.player, notes: this.notes, events: this.events };
  }

  /** The notes as CSV, one line each, for a spreadsheet. */
  toCsv(): string {
    const head = 't,origin,role,colour,row,col,pitch,drum,velocity,durSec,source';
    const esc = (v: unknown): string => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = this.notes.map((n) => [
      n.t, n.origin, n.role, n.colour, n.row, n.col,
      n.midis ? n.midis.join(' ') : n.midi, n.drum, n.velocity, n.durSec, n.source,
    ].map(esc).join(','));
    return [head, ...rows].join('\n');
  }
}

/** A file name that says whose session and when, safe on every filesystem. */
export function sessionFileName(player: string, startedAt: Date, ext: 'json' | 'csv'): string {
  const stamp = startedAt.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const who = player.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
  return `admi-board-${who}-${stamp}.${ext}`;
}
