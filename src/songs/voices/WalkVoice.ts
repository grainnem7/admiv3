/**
 * WalkVoice.ts — Baton in 'walk' mode.
 *
 * Generates an up-down arpeggio over the active chord's voicing notes,
 * triggering on each new beat while the baton's smoothed velocity is
 * above the stillness threshold. The horizontal axis is intentionally
 * ignored — this is the accessibility win for users whose horizontal
 * movement range is narrower than the camera frame.
 *
 *   • Note pitch  = next note in the up-down walk over chord.notes
 *                   (sorted ascending). X position is ignored entirely.
 *   • Trigger     = a new beat in `beats[]` has arrived since the last
 *                   triggered note AND `velocity > triggerThreshold`.
 *   • Y position  = note dynamics. Top of frame = loud, bottom = soft.
 *
 * The walk-step counter persists across chord changes — new tones, same
 * cycle position. Cycle length is `max(1, 2 * (k - 1))` for a k-note
 * voicing, giving ascend-then-descend without repeating the top/bottom.
 *
 * @see WalkVoice.test.ts for the pattern truth-table.
 */

import type { ChordEntry } from './chordLookup';
import { ToneVoiceBase } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import {
  getInstrumentEntry,
  type InstrumentPaletteEntry,
} from './presets/instrumentPalette';

/**
 * Velocity below which a beat arrival does NOT trigger a note.
 * Re-uses the engine's stillness-gate threshold convention so the
 * facilitator's existing sensitivity control covers walk mode too.
 */
const DEFAULT_TRIGGER_THRESHOLD = 0.04;

export class WalkVoice extends ToneVoiceBase {
  private entry: InstrumentPaletteEntry;
  private player: Player;

  private currentChord: ChordEntry | null = null;
  private walkStep = 0;
  private lastTriggeredBeatIndex = -1;
  private beats: readonly number[] | null = null;
  private triggerThreshold = DEFAULT_TRIGGER_THRESHOLD;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    this.entry = getInstrumentEntry(instrumentKey);
    this.player = this.createPlayer(this.entry);
  }

  /** Supply the song's beat-timestamp grid. Pass null to clear. */
  setBeatTimestamps(beats: readonly number[] | null): void {
    this.beats = beats;
  }

  /** Override the velocity threshold above which a beat triggers a note. */
  setTriggerThreshold(threshold: number): void {
    this.triggerThreshold = Math.max(0, threshold);
  }

  override setPreset(key: string): void {
    const next = getInstrumentEntry(key);
    if (next.key === this.entry.key) return;
    this.entry = next;
    this.player.dispose();
    this.player = this.createPlayer(next);
  }

  getInstrumentKey(): string {
    return this.entry.key;
  }

  private createPlayer(entry: InstrumentPaletteEntry): Player {
    return new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    // Real logic in Task 3 — stub no-ops so the type checker is happy.
    void this.currentChord;
    void this.walkStep;
    void this.lastTriggeredBeatIndex;
    void this.beats;
    void this.triggerThreshold;
  }

  onTransportStart(): void {
    this.lastTriggeredBeatIndex = -1;
  }

  onTransportStop(): void {
    this.player.releaseAll();
    this.lastTriggeredBeatIndex = -1;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }
}

/**
 * Compute the next walk-step note for a sorted ascending voicing.
 *
 * For a 4-note voicing the cycle is `n0 n1 n2 n3 n2 n1` (6 steps),
 * looping back to n0 at step 6. The pattern reaches the top, then
 * descends through the inner notes back to the bottom — without
 * repeating either endpoint, which keeps the cycle musical.
 *
 * Cycle length for a k-note voicing is `max(1, 2 * (k - 1))`. The
 * formula degrades correctly:
 *   k = 1: cycle length 1, always returns the single note.
 *   k = 2: cycle length 2, alternates n0/n1.
 *   k = 3: cycle length 4, walks `n0 n1 n2 n1`.
 *   k = 4: cycle length 6, walks `n0 n1 n2 n3 n2 n1`.
 *
 * Pure function — exported so unit tests can exercise it without a
 * WalkVoice instance.
 */
export function walkStepNote(voicing: readonly number[], step: number): number | null {
  if (voicing.length === 0) return null;
  if (voicing.length === 1) return voicing[0];
  const cycleLength = 2 * (voicing.length - 1);
  const phase = ((step % cycleLength) + cycleLength) % cycleLength;
  const index =
    phase < voicing.length ? phase : voicing.length - 2 - (phase - voicing.length);
  return voicing[index];
}

/**
 * Binary-search the highest beat index ≤ targetTime. Returns -1 if
 * targetTime is before all beats or the array is empty. Used by
 * WalkVoice to detect "a new beat has arrived since the last trigger".
 */
export function latestBeatIndexAtOrBefore(
  beats: readonly number[] | null | undefined,
  targetTime: number,
): number {
  if (!beats || beats.length === 0) return -1;
  let lo = 0, hi = beats.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= targetTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
