/**
 * Keeping time: does the sound keep up with the wall clock? (spec 2026-10-28)
 *
 * The engine times its beats from the audio clock, so it can fall behind in two ways:
 * - **Clock drift:** the audio clock itself runs slower than real time (the sound device).
 *   Dropping extras can't fix that; it is only reported.
 * - **Late beats:** the page is too busy to send beats in time. A beat sent after its own
 *   time is clamped to now (late); past the catch-up cap it is dropped (skipped).
 *
 * Measuring costs nothing per note: drift is read only when a report is asked for (two
 * clock readings), and a scheduler pass only reports in when it was late, which is rare.
 */

/** Lateness is added up over this many seconds: a stall older than this is history. */
export const LATE_WINDOW_SEC = 20;

/** Less late than this is not late: rounding, and the audio clock's own steps. */
export const LATE_TOLERANCE_SEC = 0.01;

export interface KeepingTimeLimits {
  /**
   * Seconds of sound lost to late beats within LATE_WINDOW_SEC before ADMI says the sound
   * is falling behind (and the valve may step). One second tolerates a one-off stall such
   * as a sample loading (about 0.1 to 0.3 s); several stalls close together, or one long
   * freeze, cross it.
   */
  behindSec: number;
  /** How far the sound's clock may drift behind the wall clock before it is reported (s). */
  driftSec: number;
  /** Whether the safety valve drops extras when the sound falls behind. */
  valve: boolean;
}

export const DEFAULT_KEEPING_TIME_LIMITS: KeepingTimeLimits = { behindSec: 1, driftSec: 1, valve: true };

/** The calibratable ranges (Sound → Advanced). */
export const KEEPING_TIME_RANGE = {
  behindSec: { min: 0.3, max: 5 },
  driftSec: { min: 0.3, max: 10 },
} as const;

export interface KeepingTimeReport {
  /** Wall seconds since the board started. */
  runSec: number;
  /** Wall time minus audio time since the start: how far the sound's clock is behind (s). */
  driftSec: number;
  /** driftSec as a share of the run (0.01 = 1 % slow). */
  driftRate: number;
  /** Beats sent after their own time. */
  lateBeats: number;
  /** Beats dropped by the catch-up cap. */
  skippedBeats: number;
  /** The latest any beat was sent (s). */
  worstLateSec: number;
  /** Sound lost to stalls over the whole run (s). */
  lostSec: number;
  /** Sound lost to stalls over the last LATE_WINDOW_SEC (s). */
  recentLostSec: number;
  /** Falling behind now. */
  behind: boolean;
  /** Fell behind at some point in this run. */
  everBehind: boolean;
  /** The sound's clock has drifted past its threshold. */
  drifting: boolean;
}

interface LateEvent { atMs: number; lagSec: number }

export class TimeKeeper {
  private limits: KeepingTimeLimits;
  private audio0 = 0;
  private wall0 = 0;
  private events: LateEvent[] = [];
  private lateBeats = 0;
  private skippedBeats = 0;
  private worstLate = 0;
  private lost = 0;
  private everBehind = false;

  constructor(limits: KeepingTimeLimits = DEFAULT_KEEPING_TIME_LIMITS) {
    this.limits = { ...limits };
  }

  setLimits(limits: KeepingTimeLimits): void {
    this.limits = { ...limits };
  }

  getLimits(): KeepingTimeLimits {
    return this.limits;
  }

  /** A new run: the audio clock (s) and the wall clock (ms) at the start. */
  start(audioSec: number, wallMs: number): void {
    this.audio0 = audioSec;
    this.wall0 = wallMs;
    this.events = [];
    this.lateBeats = 0;
    this.skippedBeats = 0;
    this.worstLate = 0;
    this.lost = 0;
    this.everBehind = false;
  }

  /**
   * One scheduler pass that was late: the oldest beat it owed was `lagSec` late, `late`
   * beats went out late and `skipped` were dropped. Called only when it was late.
   */
  late(wallMs: number, lagSec: number, late: number, skipped: number): void {
    if (lagSec <= LATE_TOLERANCE_SEC && skipped === 0) return;
    const lag = Math.max(0, lagSec);
    this.lateBeats += late;
    this.skippedBeats += skipped;
    this.worstLate = Math.max(this.worstLate, lag);
    this.lost += lag;
    this.events.push({ atMs: wallMs, lagSec: lag });
    // Only the window is kept: a long run never piles up history.
    const from = wallMs - LATE_WINDOW_SEC * 1000;
    while (this.events.length > 0 && this.events[0].atMs < from) this.events.shift();
    if (this.lostSince(wallMs, -Infinity) >= this.limits.behindSec) this.everBehind = true;
  }

  /** Sound lost to stalls in the window up to `wallMs`, counting only from `sinceMs`. */
  lostSince(wallMs: number, sinceMs: number): number {
    const from = Math.max(sinceMs, wallMs - LATE_WINDOW_SEC * 1000);
    let sum = 0;
    for (const e of this.events) if (e.atMs >= from && e.atMs <= wallMs) sum += e.lagSec;
    return sum;
  }

  /** Falling behind, counting only lateness from `sinceMs` on (the valve's last step). */
  behindSince(wallMs: number, sinceMs: number): boolean {
    return this.lostSince(wallMs, sinceMs) >= this.limits.behindSec;
  }

  report(audioSec: number, wallMs: number): KeepingTimeReport {
    const runSec = Math.max(0, (wallMs - this.wall0) / 1000);
    const driftSec = runSec - (audioSec - this.audio0);
    const recent = this.lostSince(wallMs, -Infinity);
    return {
      runSec,
      driftSec,
      driftRate: runSec > 0 ? driftSec / runSec : 0,
      lateBeats: this.lateBeats,
      skippedBeats: this.skippedBeats,
      worstLateSec: this.worstLate,
      lostSec: this.lost,
      recentLostSec: recent,
      behind: recent >= this.limits.behindSec,
      everBehind: this.everBehind,
      drifting: driftSec >= this.limits.driftSec,
    };
  }
}

/** What the safety valve drops, heaviest first. */
export type ValveStep = 'magenta' | 'fill' | 'evolve';
export const VALVE_ORDER: readonly ValveStep[] = ['magenta', 'fill', 'evolve'];

/**
 * The valve's next step, or null. It steps only while the sound is falling behind (its
 * lateness counted since its last step, so each step gets the chance to work), only when
 * switched on, and only over what is actually playing.
 */
export function nextValveStep(s: {
  behind: boolean;
  enabled: boolean;
  taken: readonly ValveStep[];
  inUse: Readonly<Record<ValveStep, boolean>>;
}): ValveStep | null {
  if (!s.behind || !s.enabled) return null;
  return VALVE_ORDER.find((step) => !s.taken.includes(step) && s.inUse[step]) ?? null;
}

/** What each step is called on the laptop, and in the log. */
export const VALVE_WORDS: Record<ValveStep, string> = {
  magenta: 'Magenta paused: Extra notes use the simple rules, to keep the sound in time.',
  fill: 'Extra notes paused to keep the sound in time.',
  evolve: 'Sounds change paused to keep the sound in time.',
};

/** What each step drops, in a list ("Paused …: Magenta, Extra notes"). */
export const VALVE_NAMES: Record<ValveStep, string> = { magenta: 'Magenta', fill: 'Extra notes', evolve: 'Sounds change' };

const BEHIND_WORDS = 'The sound is falling behind.';
const DRIFT_WORDS = 'The sound’s clock is running slow: check the sound output.';

/** What the laptop has already said this run: each problem is said once. */
export interface TimeSeen { behind: boolean; drifting: boolean; steps: number }
export const TIME_SEEN_NONE: TimeSeen = { behind: false, drifting: false, steps: 0 };

type TimeState = Pick<KeepingTimeReport, 'behind' | 'everBehind' | 'drifting'>;

/** What is new to say on the laptop (announced once each), and what has now been said. */
export function keepingTimeNews(seen: TimeSeen, r: TimeState, steps: readonly ValveStep[]): { say: string[]; seen: TimeSeen } {
  const say: string[] = [];
  if (r.behind && !seen.behind) say.push(BEHIND_WORDS);
  for (const s of steps.slice(seen.steps)) say.push(VALVE_WORDS[s]);
  if (r.drifting && !seen.drifting) say.push(DRIFT_WORDS);
  return {
    say,
    seen: { behind: seen.behind || r.behind, drifting: seen.drifting || r.drifting, steps: Math.max(seen.steps, steps.length) },
  };
}

/**
 * The quiet indicator on the laptop: nothing while all is well; once there has been a
 * problem it stays for the run, with what the valve paused (and the way to undo it).
 */
export function keepingTimeIndicator(r: TimeState, steps: readonly ValveStep[]): { lines: string[]; canRestore: boolean } | null {
  const lines: string[] = [];
  if (r.behind) lines.push(BEHIND_WORDS);
  else if (r.everBehind || steps.length > 0) lines.push('The sound fell behind earlier in this run.');
  if (steps.length > 0) lines.push(`Paused to keep the sound in time: ${steps.map((s) => VALVE_NAMES[s]).join(', ')}.`);
  if (r.drifting) lines.push(DRIFT_WORDS);
  return lines.length === 0 ? null : { lines, canRestore: steps.length > 0 };
}
