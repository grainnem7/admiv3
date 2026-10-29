/**
 * What the offline loudness measurement (src/dev/loudnessHarness.ts, used only by
 * e2e/loudness.e2e.ts) is asked and answers. No imports, so the e2e test can use it without
 * pulling the app into its own type check.
 */

export interface LoudnessRequest {
  world: 'none' | 'warm' | 'lofi' | 'ambient' | 'electronic';
  band: 'off' | 'gentle' | 'full';
  /** 'default' = pads, bass, drums (a new player's); 'all' = all four (Open, in the plan). */
  jobs: 'default' | 'all';
  energy: number;
  fill: number;
  evolve: number;
  /** Passes rendered; the first (before the band joins) is not measured. */
  passes: number;
}

export interface LoudnessResult {
  /** K-weighted loudness of the mix over the measured passes (LUFS, ungated). */
  lufs: number;
  /** The mix's sample peak (dBFS). */
  peakDb: number;
  /** The sample peak at the studio limiter's input (dBFS): its ceiling is -0.3 dBFS. */
  limiterInPeakDb: number;
  /** How many notes the engine played, as a check that it played at all. */
  notes: number;
  /** The low-pass over the whole mix while it played (the world's, under a scene's Energy). */
  mixToneHz: number;
  /** How many of those notes were the band's, and the extra notes'. */
  bandNotes: number;
  extraNotes: number;
}
