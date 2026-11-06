/**
 * A recorded song's stems (vocals, drums, bass, the rest) played on the board's own audio
 * clock (spec 2026-11-06, song sections). Started at an exact audio time from any point of
 * the song, each stem at its own level; faded out at an audio time. Every start is a fresh
 * set of buffer sources (a source plays once), so a section can start, stop and start again.
 *
 * Raw Web Audio on the engine's context: the engine owns where it is connected.
 */

import { STEM_NAMES, type StemLevels, type StemName } from '../songs/song/songSection';

/** What the engine needs of the stems (a fake stands in for it in tests). */
export interface StemsPlayer {
  ready(): boolean;
  start(at: number, offsetSec: number, levels: StemLevels): void;
  setLevels(levels: StemLevels, at: number, rampSec: number): void;
  stop(at: number, fadeSec: number): void;
  dispose(): void;
}

/** A level change glides this long, so a stem never clicks in or out. */
export const STEM_GLIDE_SEC = 0.05;

export class SongStems implements StemsPlayer {
  private buffers = new Map<StemName, AudioBuffer>();
  private gains = new Map<StemName, GainNode>();
  private sources: AudioBufferSourceNode[] = [];
  private loaded = false;

  constructor(private readonly ctx: BaseAudioContext, output: AudioNode) {
    for (const name of STEM_NAMES) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(output);
      this.gains.set(name, g);
    }
  }

  /** Fetch and decode every stem; resolves when all are in (a missing one is left out). */
  async load(urls: Partial<Record<StemName, string>>): Promise<void> {
    await Promise.all(STEM_NAMES.map(async (name) => {
      const url = urls[name];
      if (!url) return;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx.decodeAudioData(data));
      } catch (err) {
        console.warn(`[SongStems] could not load ${name}:`, err);
      }
    }));
    this.loaded = this.buffers.size > 0;
  }

  ready(): boolean {
    return this.loaded;
  }

  start(at: number, offsetSec: number, levels: StemLevels): void {
    this.stop(at, 0.01);
    this.sources = [];
    for (const name of STEM_NAMES) {
      const buf = this.buffers.get(name);
      const g = this.gains.get(name);
      if (!buf || !g) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(levels[name], at);
      src.start(at, Math.max(0, Math.min(buf.duration - 0.01, offsetSec)));
      this.sources.push(src);
    }
  }

  setLevels(levels: StemLevels, at: number, rampSec: number): void {
    for (const name of STEM_NAMES) {
      const g = this.gains.get(name);
      if (!g) continue;
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(levels[name], at, Math.max(0.005, rampSec / 3));
    }
  }

  stop(at: number, fadeSec: number): void {
    for (const g of this.gains.values()) {
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, Math.max(0.005, fadeSec / 4));
    }
    for (const s of this.sources) {
      try { s.stop(at + fadeSec + 0.05); } catch { /* already stopped */ }
    }
    this.sources = [];
  }

  dispose(): void {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
    for (const g of this.gains.values()) g.disconnect();
    this.buffers.clear();
  }
}
