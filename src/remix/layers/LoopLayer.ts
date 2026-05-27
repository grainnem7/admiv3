/**
 * LoopLayer — a RemixLayer of kind 'loop'. Owns one Tone.GrainPlayer per
 * curated loop, each pitch-preservingly time-stretched to the song BPM
 * (playbackRate = songBpm / loopBpm) and looping its whole-bar buffer.
 * All players sync().start(0) so they stay phase-locked with the stems;
 * exactly one loop is audible at a time via per-loop sub-gains. Loop
 * audio is placed by the human (git-ignored, see SAMPLE_SOURCES.md);
 * until loaded, the layer no-ops gracefully.
 */

import * as Tone from 'tone';
import type { SyncedRemixLayer } from './RemixLayer';
import type { LoopDef } from './loopManifest';

const SWITCH_TC = 0.03; // ~30ms crossfade when switching loops

interface LoopVoice {
  player: Tone.GrainPlayer;
  sub: GainNode;
}

export class LoopLayer implements SyncedRemixLayer {
  readonly id = 'loop';
  readonly kind = 'loop' as const;

  private ctx: AudioContext;
  private layerGain: GainNode;
  private voices: LoopVoice[] = [];
  private defs: LoopDef[];
  private enabled = false;
  private volume = 0.8;
  private activeIndex = 0;
  private loaded = 0;
  private ready = false;

  constructor(ctx: AudioContext, loops: LoopDef[], songBpm: number) {
    this.ctx = ctx;
    this.defs = loops;
    this.layerGain = ctx.createGain();
    this.layerGain.gain.value = 0; // disabled → silent

    loops.forEach((def, i) => {
      const sub = ctx.createGain();
      sub.gain.value = i === 0 ? 1 : 0; // first loop active by default
      sub.connect(this.layerGain);
      const player = new Tone.GrainPlayer({
        url: `samples/drums/loops/${def.file}`,
        loop: true,
        onload: () => {
          this.loaded += 1;
          if (this.loaded >= loops.length) this.ready = true;
        },
      });
      player.playbackRate = songBpm / def.bpm; // GrainPlayer preserves pitch
      player.connect(sub);
      this.voices.push({ player, sub });
    });

    if (loops.length === 0) this.ready = true; // empty layer is trivially "ready"
  }

  connect(dest: AudioNode): void {
    this.layerGain.connect(dest);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layerGain.gain.value = on ? this.volume : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.enabled) this.layerGain.gain.value = this.volume;
  }

  isReady(): boolean {
    return this.ready;
  }

  getLoopCount(): number {
    return this.defs.length;
  }

  getLoopName(i: number): string {
    return this.defs[i]?.name ?? '';
  }

  getActiveLoopIndex(): number {
    return this.activeIndex;
  }

  /** Make loop `i` the single audible loop (short crossfade). No-op if out of range. */
  selectLoop(i: number): void {
    if (i < 0 || i >= this.voices.length || i === this.activeIndex) return;
    const now = this.ctx.currentTime;
    this.voices.forEach((v, idx) => {
      v.sub.gain.setTargetAtTime(idx === i ? 1 : 0, now, SWITCH_TC);
    });
    this.activeIndex = i;
  }

  syncStart(): void {
    for (const v of this.voices) {
      v.player.loop = true;
      v.player.unsync().sync().start(0);
    }
  }

  syncStop(): void {
    for (const v of this.voices) {
      try { v.player.unsync().stop(); } catch { /* not started */ }
    }
  }

  dispose(): void {
    for (const v of this.voices) {
      v.player.dispose();
      v.sub.disconnect();
    }
    this.voices = [];
    this.layerGain.disconnect();
    this.ready = false;
    this.loaded = 0;
  }
}
