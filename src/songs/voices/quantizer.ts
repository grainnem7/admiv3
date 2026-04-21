/**
 * quantizer.ts — Beat-aligned quantization clock for Song Preset mode.
 *
 * When real beat timestamps are available (from audio analysis), snaps
 * events to the nearest detected beat. Otherwise falls back to the
 * original calculated grid (8th-note at 60 / bpm / 3).
 */

// ============================================
// EighthNoteQuantizer
// ============================================

export class EighthNoteQuantizer {
  /** Duration of one 8th note in seconds (fallback grid) */
  eighthDuration: number;

  /** Real beat timestamps from audio analysis, or null for calculated grid. */
  private beatTimestamps: number[] | null = null;

  constructor(bpm: number) {
    // In 12/8 time, one beat = dotted quarter = 3 eighth notes.
    // Beat duration = 60 / bpm. Eighth = beat / 3.
    this.eighthDuration = 60 / bpm / 3;
  }

  /** Update BPM (recalculates fallback grid spacing). */
  setBpm(bpm: number): void {
    this.eighthDuration = 60 / bpm / 3;
  }

  /**
   * Set real beat timestamps from audio analysis.
   * When set, quantization snaps to actual beats instead of calculated grid.
   * Pass null to revert to calculated grid.
   */
  setBeatTimestamps(beats: number[] | null): void {
    this.beatTimestamps = beats;
  }

  /**
   * Returns the next grid time at or after `playbackTime`.
   * Uses real beat timestamps when available, otherwise calculated grid.
   */
  nextQuantizedTime(playbackTime: number, referenceTime: number = 0): number {
    if (this.beatTimestamps && this.beatTimestamps.length > 0) {
      return this.nextRealBeat(playbackTime);
    }
    return this.nextCalculatedTime(playbackTime, referenceTime);
  }

  /**
   * Returns the most recent grid time at or before `playbackTime`.
   */
  currentGridTime(playbackTime: number, referenceTime: number = 0): number {
    if (this.beatTimestamps && this.beatTimestamps.length > 0) {
      return this.currentRealBeat(playbackTime);
    }
    return this.currentCalculatedTime(playbackTime, referenceTime);
  }

  // ---- Real beat timestamp methods ----

  /** Find the next beat timestamp after playbackTime (binary search). */
  private nextRealBeat(playbackTime: number): number {
    const beats = this.beatTimestamps!;
    let lo = 0;
    let hi = beats.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (beats[mid] <= playbackTime + 0.001) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // If past all beats, extrapolate one beat interval beyond the last
    if (lo >= beats.length) {
      const lastInterval = beats.length >= 2
        ? beats[beats.length - 1] - beats[beats.length - 2]
        : this.eighthDuration * 3;
      return beats[beats.length - 1] + lastInterval;
    }

    return beats[lo];
  }

  /** Find the most recent beat timestamp at or before playbackTime (binary search). */
  private currentRealBeat(playbackTime: number): number {
    const beats = this.beatTimestamps!;
    let lo = 0;
    let hi = beats.length - 1;
    let result = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (beats[mid] <= playbackTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return beats[result];
  }

  // ---- Calculated grid methods (original logic) ----

  private nextCalculatedTime(playbackTime: number, referenceTime: number): number {
    const elapsed = playbackTime - referenceTime;
    const beats = elapsed / this.eighthDuration;
    const nextBeat = Math.ceil(beats + 0.001);
    return referenceTime + nextBeat * this.eighthDuration;
  }

  private currentCalculatedTime(playbackTime: number, referenceTime: number): number {
    const elapsed = playbackTime - referenceTime;
    const beats = elapsed / this.eighthDuration;
    const currentBeat = Math.floor(beats);
    return referenceTime + currentBeat * this.eighthDuration;
  }
}
