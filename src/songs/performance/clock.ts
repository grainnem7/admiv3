/**
 * The performance clock: a piece of a set length, cues as the end comes near, and a
 * chosen way to end. Pure; the screen keeps the time and the engine does the fade.
 *
 * The clock is a guide, not a guillotine. Three endings:
 *  - 'fade': the sound fades over a number of passes so that it is gone at the end time;
 *  - 'stop': it stops at the end of the pass the end time falls in;
 *  - 'cue':  nothing happens by itself — the countdown and the cues say where things are,
 *            and the ending (the fade) is pressed when the player and the room are ready.
 * "End now" applies the chosen ending at once, whatever the clock says.
 */

export type EndingMode = 'fade' | 'stop' | 'cue';

export interface PerformanceSettings {
  /** The piece's length in seconds. */
  lengthSec: number;
  ending: EndingMode;
  /** For 'fade': how many passes the fade takes. */
  fadePasses: number;
  /** Start the clock when Play is pressed, or only when Start clock is pressed. */
  startOn: 'play' | 'manual';
}

export const DEFAULT_PERFORMANCE: PerformanceSettings = { lengthSec: 7 * 60, ending: 'cue', fadePasses: 2, startOn: 'play' };

/** The moments before the end at which a cue is given, in seconds, largest first. */
export const CUE_SECONDS = [60, 30, 10] as const;

export type ClockPhase = 'idle' | 'running' | 'lastMinute' | 'lastMoments' | 'ending' | 'over';

export interface ClockView {
  phase: ClockPhase;
  /** Seconds left, never below zero. */
  remainingSec: number;
  elapsedSec: number;
  /** "6:42" — or "-0:15" once past the end. */
  text: string;
}

export function formatClock(sec: number): string {
  const neg = sec < 0;
  const s = Math.round(Math.abs(sec));
  const m = Math.floor(s / 60);
  return `${neg ? '-' : ''}${m}:${String(s % 60).padStart(2, '0')}`;
}

/** What the clock shows, given when it started (null = not running). */
export function clockView(
  startedAtMs: number | null, nowMs: number, lengthSec: number, ending: boolean,
): ClockView {
  if (startedAtMs === null) return { phase: 'idle', remainingSec: lengthSec, elapsedSec: 0, text: formatClock(lengthSec) };
  const elapsed = Math.max(0, (nowMs - startedAtMs) / 1000);
  const remaining = lengthSec - elapsed;
  const phase: ClockPhase = ending ? 'ending'
    : remaining <= 0 ? 'over'
      : remaining <= 30 ? 'lastMoments'
        : remaining <= 60 ? 'lastMinute'
          : 'running';
  return { phase, remainingSec: Math.max(0, remaining), elapsedSec: elapsed, text: formatClock(remaining) };
}

/** The cues crossed between two readings of the clock ("1 minute left"), largest first. */
export function cuesCrossed(prevRemainingSec: number, remainingSec: number): number[] {
  return CUE_SECONDS.filter((c) => prevRemainingSec > c && remainingSec <= c);
}

/** What a cue says. */
export function cueText(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)} minute${sec >= 120 ? 's' : ''} left` : `${sec} seconds left`;
}

/**
 * For an automatic ending: how many seconds before the end time the ending has to begin
 * so that it is finished AT the end time. A fade takes its passes; a stop happens at the
 * end of a pass, so it begins at the start of the last whole pass.
 */
export function endingLeadSec(settings: PerformanceSettings, passSec: number): number {
  if (settings.ending === 'fade') return settings.fadePasses * passSec;
  if (settings.ending === 'stop') return 0;
  return Number.POSITIVE_INFINITY; // 'cue': never by itself
}

/**
 * Whether the automatic ending should be triggered now: the clock has reached the lead
 * time and it has not been triggered yet. Pure; the caller remembers that it has.
 */
export function endingDue(settings: PerformanceSettings, remainingSec: number, passSec: number): boolean {
  if (settings.ending === 'cue') return false;
  return remainingSec <= endingLeadSec(settings, passSec);
}

/** The scheduled scenes whose time was crossed between two readings of the clock, in order. */
export function scenesDue<T extends { at?: number | null }>(prevElapsedSec: number, elapsedSec: number, scenes: readonly T[]): number[] {
  const due: { i: number; at: number }[] = [];
  scenes.forEach((s, i) => {
    if (typeof s.at === 'number' && s.at > prevElapsedSec && s.at <= elapsedSec) due.push({ i, at: s.at });
  });
  return due.sort((a, b) => a.at - b.at).map((d) => d.i);
}

/** "2:30" or "150" → seconds; blank or nonsense → null. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const m = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function sanitizePerformance(v: unknown): PerformanceSettings {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_PERFORMANCE;
  return {
    lengthSec: isNum(o.lengthSec) ? Math.max(30, Math.min(60 * 60, Math.round(o.lengthSec))) : d.lengthSec,
    ending: o.ending === 'fade' || o.ending === 'stop' || o.ending === 'cue' ? o.ending : d.ending,
    fadePasses: isNum(o.fadePasses) && [1, 2, 4].includes(o.fadePasses) ? o.fadePasses : d.fadePasses,
    startOn: o.startOn === 'manual' ? 'manual' : 'play',
  };
}
