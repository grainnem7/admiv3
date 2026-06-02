/**
 * Beat-snap timing for surface presses.
 *
 * Reuses the song's beat grid + the existing nextBeatAfter helper so a
 * press can be deferred to the next beat (Beat-Bopping parity with
 * InstrumentVoice). A press released before its target beat is cancelled
 * via PendingPressQueue.cancel — so it never sounds.
 */

import { nextBeatAfter } from './voices/InstrumentVoice';

/**
 * Resolve the time a press should actually sound.
 * - beat-snap off, or no beat data → fire immediately (currentTime).
 * - beat-snap on with beats → the next beat strictly after currentTime.
 */
export function resolvePressTime(
  beats: readonly number[] | null | undefined,
  currentTime: number,
  beatSnap: boolean,
): number {
  if (!beatSnap || !beats || beats.length === 0) return currentTime;
  return nextBeatAfter(beats, currentTime);
}

interface PendingPress {
  midi: number;
  velocity: number;
  targetTime: number;
}

export interface DuePress {
  buttonId: string;
  midi: number;
  velocity: number;
}

/**
 * Holds beat-snapped presses awaiting their target beat. One pending
 * press per button — a newer schedule overwrites the older (the last
 * aim before the beat is what plays), matching InstrumentVoice.
 */
export class PendingPressQueue {
  private pending = new Map<string, PendingPress>();

  schedule(buttonId: string, midi: number, velocity: number, targetTime: number): void {
    this.pending.set(buttonId, { midi, velocity, targetTime });
  }

  cancel(buttonId: string): void {
    this.pending.delete(buttonId);
  }

  /** Return and remove every pending press whose target time has arrived. */
  flushDue(currentTime: number): DuePress[] {
    const due: DuePress[] = [];
    for (const [buttonId, p] of this.pending) {
      if (currentTime >= p.targetTime) {
        due.push({ buttonId, midi: p.midi, velocity: p.velocity });
      }
    }
    for (const d of due) this.pending.delete(d.buttonId);
    return due;
  }

  clear(): void {
    this.pending.clear();
  }
}
