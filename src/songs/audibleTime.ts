/**
 * The audio-context time of the sound being HEARD right now. Unlike Tone.now()
 * (currentTime + look-ahead, ~0.1 s ahead) this lines visuals up with the sound:
 * a playhead/pop driven by it never appears before its note is audible.
 */
export interface AudibleClockSource {
  currentTime: number;
  outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

export function audibleTime(ctx: AudibleClockSource, perfNowMs: number): number {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number' && ts.performanceTime > 0) {
    return ts.contextTime + (perfNowMs - ts.performanceTime) / 1000;
  }
  return ctx.currentTime - (ctx.outputLatency ?? 0);
}
