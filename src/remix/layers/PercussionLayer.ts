/**
 * PercussionLayer — a RemixLayer of kind 'percussion'. Owns a RoundRobinDrumKit
 * and fires a beat-appropriate drum on hit(), chosen by pickHeadBopDrum from the
 * song's beat grid (kick on downbeats, snare on backbeats). Routed to by the
 * head-nod, shake, and keyboard-S gestures via the engine.
 */

import type { RemixLayer } from './RemixLayer';
import { RoundRobinDrumKit } from '../../audio/instruments/RoundRobinDrumKit';
import { pickHeadBopDrum } from '../../songs/voices/HeadBopKit';

export class PercussionLayer implements RemixLayer {
  readonly id = 'percussion';
  readonly kind = 'percussion' as const;

  private kit: RoundRobinDrumKit;
  private gain: GainNode;
  private enabled = false;
  private volume = 0.8;
  private beats: readonly number[] = [];
  private downbeats: readonly number[] = [];

  constructor(ctx: AudioContext, kitId: string) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0; // disabled → silent
    this.kit = new RoundRobinDrumKit(ctx, kitId);
    this.kit.connect(this.gain);
  }

  connect(dest: AudioNode): void {
    this.gain.connect(dest);
  }

  setBeatGrid(beats: readonly number[], downbeats: readonly number[]): void {
    this.beats = beats;
    this.downbeats = downbeats;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.gain.gain.value = on ? this.volume : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.enabled) this.gain.gain.value = this.volume;
  }

  isReady(): boolean {
    return this.kit.isReady();
  }

  /** Fire a beat-aware drum at the given playback time + velocity. */
  hit(timeSec: number, velocity: number): void {
    if (!this.enabled || !this.kit.isReady()) return;
    const drum = pickHeadBopDrum(timeSec, this.beats, this.downbeats);
    this.kit.play(drum, velocity);
  }

  dispose(): void {
    this.kit.dispose();
    this.gain.disconnect();
  }
}
