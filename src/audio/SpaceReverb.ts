// src/audio/SpaceReverb.ts
import * as Tone from 'tone';
import { DEFAULT_SPACE_REVERB, type ReverbConfig } from './audioConfig';

/**
 * Send-style reverb for depth/space.
 *
 *   send (raw GainNode) ─► Tone.Reverb (wet=1) ─► output
 *
 * Callers route their mix into `send` (native `.connect()`); the wet signal
 * is summed into `output` (typically a MasterChain's `input`) so reverb gets
 * glued by the master chain. Degrades to an unconnected (silent) send if Tone
 * is unavailable.
 */
export class SpaceReverb {
  /** Route mix into here. Always a raw Web Audio node. */
  readonly send: GainNode;

  private reverb: { dispose: () => void } | null = null;

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    cfg: ReverbConfig = DEFAULT_SPACE_REVERB,
  ) {
    this.send = ctx.createGain();
    this.send.gain.value = cfg.sendLevel;
    try {
      const reverb = new Tone.Reverb({ decay: cfg.decay, preDelay: cfg.preDelay });
      reverb.wet.value = 1;
      Tone.connect(this.send, reverb);   // raw → Tone
      Tone.connect(reverb, output);      // Tone → raw output
      this.reverb = reverb;
    } catch {
      // No reverb in this environment; send stays unconnected (silent).
    }
  }

  setSendLevel(level: number): void {
    this.send.gain.value = level;
  }

  dispose(): void {
    try {
      this.reverb?.dispose();
    } catch {
      /* ignore */
    }
    this.reverb = null;
    try {
      this.send.disconnect();
    } catch {
      /* already gone */
    }
  }
}
