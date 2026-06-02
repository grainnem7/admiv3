// src/audio/MasterChain.ts
import * as Tone from 'tone';
import { DEFAULT_MASTER_CHAIN, type MasterChainConfig } from './audioConfig';

/**
 * Shared master-bus processing reused by each engine.
 *
 *   input (raw GainNode) ─► EQ3 ─► Compressor ─► WaveShaper(sat) ─► Limiter ─► destination
 *
 * `input` is always a plain Web Audio GainNode, so callers connect into it
 * with native `.connect()`. The processing nodes are Tone.js. If Tone is
 * unavailable (e.g. a minimal test mock), the constructor degrades to a dry
 * pass-through (input → destination) instead of throwing.
 */
export class MasterChain {
  /** Connect engine output(s) here. Always a raw Web Audio node. */
  readonly input: GainNode;

  private toneNodes: { dispose: () => void }[] = [];
  private passthrough = false;

  constructor(
    private readonly ctx: AudioContext,
    cfg: MasterChainConfig = DEFAULT_MASTER_CHAIN,
  ) {
    this.input = ctx.createGain();
    try {
      const eq = new Tone.EQ3(cfg.eq);
      const comp = new Tone.Compressor(cfg.comp);
      const drive = Math.max(0.0001, cfg.saturation.drive);
      const norm = Math.tanh(drive);
      const shaper = new Tone.WaveShaper((x: number) => Math.tanh(drive * x) / norm);
      const limiter = new Tone.Limiter(cfg.limiter.ceilingDb);

      // raw input → first Tone node (bridge), then series, then to speakers.
      Tone.connect(this.input, eq);
      eq.chain(comp, shaper, limiter);
      limiter.toDestination();

      this.toneNodes = [eq, comp, shaper, limiter];
    } catch {
      // Tone not fully available — wire a transparent dry path so audio
      // still reaches the speakers and tests don't crash.
      this.passthrough = true;
      this.input.connect(this.ctx.destination);
    }
  }

  dispose(): void {
    for (const n of this.toneNodes) {
      try {
        n.dispose();
      } catch {
        /* ignore */
      }
    }
    this.toneNodes = [];
    try {
      this.input.disconnect();
    } catch {
      /* already gone */
    }
  }

  /**
   * True when Tone was unavailable and the chain degraded to a dry
   * input → destination pass-through (no EQ/comp/sat/limiter processing).
   * Exposes the internal `passthrough` state for later phases / diagnostics.
   */
  get isPassthrough(): boolean {
    return this.passthrough;
  }
}
