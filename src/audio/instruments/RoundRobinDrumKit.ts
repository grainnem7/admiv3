// src/audio/instruments/RoundRobinDrumKit.ts
import * as Tone from 'tone';
import type { HeadBopDrum } from '../../songs/voices/HeadBopKit';

/** Canonical single-drum names the kit holds samples for. */
type DrumName = 'kick' | 'snare' | 'hat' | 'crash';
const DRUM_NAMES: readonly DrumName[] = ['kick', 'snare', 'hat', 'crash'];

type KitManifest = Partial<Record<DrumName, string[]>>;

/**
 * RoundRobinDrumKit — loads several one-shot WAVs per drum from
 * `samples/drums/<kitId>/` (listed in that folder's `kit.json`) and rotates
 * through a drum's samples on successive hits for natural variation.
 *
 * Loading is async (fetch manifest → build a Tone.Player per sample). Until
 * ready, play() silently no-ops, so a build without the samples (or offline)
 * degrades gracefully rather than throwing.
 */
export class RoundRobinDrumKit {
  private samples = new Map<DrumName, Tone.Player[]>();
  private rrIndex = new Map<DrumName, number>();
  private ready = false;
  private readonly loadedPromise: Promise<void>;
  private dest: AudioNode | null = null;

  constructor(_ctx: AudioContext, kitId: string) {
    // Players own their audio nodes; _ctx is kept for signature parity with DrumKit.
    this.loadedPromise = this.load(kitId);
  }

  /** Resolves once the manifest + all players have settled (ready or failed). */
  whenReady(): Promise<void> {
    return this.loadedPromise;
  }

  isReady(): boolean {
    return this.ready;
  }

  connect(dest: AudioNode): void {
    this.dest = dest;
    for (const players of this.samples.values()) {
      for (const p of players) p.connect(dest);
    }
  }

  /** Play a (possibly compound) drum at velocity 0–1. No-op until ready. */
  play(drum: HeadBopDrum, velocity: number): void {
    if (!this.ready) return;
    const gainDb = velToDb(Math.max(0, Math.min(1, velocity)));
    if (drum === 'kickCrash') {
      this.fire('kick', gainDb);
      this.fire('crash', gainDb);
      return;
    }
    this.fire(drum, gainDb);
  }

  dispose(): void {
    for (const players of this.samples.values()) {
      for (const p of players) p.dispose();
    }
    this.samples.clear();
    this.rrIndex.clear();
    this.ready = false;
  }

  private async load(kitId: string): Promise<void> {
    const base = `samples/drums/${kitId}/`;
    let manifest: KitManifest;
    try {
      const res = await fetch(`${base}kit.json`);
      if (!res.ok) return;
      manifest = (await res.json()) as KitManifest;
    } catch {
      return; // offline / missing manifest → stay not-ready, play() no-ops
    }

    // Load each sample independently: resolve on EITHER onload or onerror so a
    // single 404 can't wedge the whole kit. After all settle, keep only the
    // players that actually loaded (Tone.Player.loaded), dropping any failures.
    const loads: Promise<void>[] = [];
    for (const name of DRUM_NAMES) {
      const files = manifest[name];
      if (!files || files.length === 0) continue;
      const players: Tone.Player[] = [];
      for (const file of files) {
        const done = new Promise<void>((resolve) => {
          const p = new Tone.Player({
            url: `${base}${file}`,
            onload: () => resolve(),
            onerror: () => resolve(),
          });
          if (this.dest) p.connect(this.dest);
          players.push(p);
        });
        loads.push(done);
      }
      this.samples.set(name, players);
      this.rrIndex.set(name, 0);
    }

    await Promise.all(loads);
    // Prune samples that failed to load; drop drums left with none.
    for (const [name, players] of [...this.samples]) {
      const loaded = players.filter((p) => p.loaded !== false);
      if (loaded.length === 0) {
        this.samples.delete(name);
        this.rrIndex.delete(name);
      } else {
        this.samples.set(name, loaded);
      }
    }
    this.ready = this.samples.size > 0;
  }

  private fire(name: DrumName, gainDb: number): void {
    // Fall back to the kick if the requested drum didn't load (e.g. its sample
    // 404'd), so every hit makes a sound instead of an intermittent silence.
    let key = name;
    let players = this.samples.get(key);
    if ((!players || players.length === 0) && name !== 'kick') {
      key = 'kick';
      players = this.samples.get(key);
    }
    if (!players || players.length === 0) return;
    const i = this.rrIndex.get(key) ?? 0;
    const p = players[i];
    this.rrIndex.set(key, (i + 1) % players.length);
    p.volume.value = gainDb;
    p.start();
  }
}

/** Map a 0–1 velocity to a dB gain (−24 dB … 0 dB) for Tone.Player.volume. */
function velToDb(v: number): number {
  return -24 + v * 24;
}
