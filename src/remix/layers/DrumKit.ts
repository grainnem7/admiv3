/**
 * DrumKit — loads one Tone.Player per drum from public/samples/drums/<kitId>/
 * and plays a named drum on demand. One-shots are per-sample Players (not a
 * pitched Sampler). High-quality CC0/CC-BY WAVs are placed by the human (see
 * public/samples/drums/SAMPLE_SOURCES.md); until present, players never load
 * and play() silently no-ops.
 */

import * as Tone from 'tone';
import type { HeadBopDrum } from '../../songs/voices/HeadBopKit';

/** The single-drum components the kit holds a Player for. */
type DrumName = 'kick' | 'snare' | 'hat' | 'crash';
const DRUM_NAMES: readonly DrumName[] = ['kick', 'snare', 'hat', 'crash'];

export class DrumKit {
  private players = new Map<DrumName, Tone.Player>();
  private loaded = 0;
  private ready = false;

  constructor(_ctx: AudioContext, kitId: string) {
    const base = `samples/drums/${kitId}/`;
    for (const name of DRUM_NAMES) {
      const player = new Tone.Player({
        url: `${base}${name}.wav`,
        onload: () => {
          this.loaded += 1;
          if (this.loaded >= DRUM_NAMES.length) this.ready = true;
        },
      });
      this.players.set(name, player);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  connect(dest: AudioNode): void {
    for (const p of this.players.values()) p.connect(dest);
  }

  /** Play a (possibly compound) drum at velocity 0–1. No-op until ready. */
  play(drum: HeadBopDrum, velocity: number): void {
    if (!this.ready) return;
    const v = Math.max(0, Math.min(1, velocity));
    const gainDb = velToDb(v);
    if (drum === 'kickCrash') {
      this.fire('kick', gainDb);
      this.fire('crash', gainDb);
      return;
    }
    this.fire(drum, gainDb);
  }

  dispose(): void {
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
    this.ready = false;
  }

  private fire(name: DrumName, gainDb: number): void {
    const p = this.players.get(name);
    if (!p) return;
    p.volume.value = gainDb;
    p.start();
  }
}

/** Map a 0–1 velocity to a dB gain (−24 dB … 0 dB) for Tone.Player.volume. */
function velToDb(v: number): number {
  return -24 + v * 24;
}
