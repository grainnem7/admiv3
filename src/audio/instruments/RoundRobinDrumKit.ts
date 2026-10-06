// src/audio/instruments/RoundRobinDrumKit.ts
import * as Tone from 'tone';

/** Canonical single-drum names the kit holds samples for. */
type DrumName = 'kick' | 'snare' | 'hat' | 'crash' | 'tom' | 'clap' | 'rim';
const DRUM_NAMES: readonly DrumName[] = ['kick', 'snare', 'hat', 'crash', 'tom', 'clap', 'rim'];

/** Every drum the kit can be asked to play (single pieces + compounds). */
export type KitDrum = DrumName | 'kickCrash';

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
  /**
   * Stereo position per piece. Null until a caller asks for placement, so kits that never
   * pan (Song, Remix) keep their direct player → destination wiring and build no panners.
   */
  private pans: Partial<Record<DrumName, number>> | null = null;
  private panners = new Map<DrumName, Tone.Panner>();
  /** When set, every hit of a piece uses this sample (wrapped to how many it has). */
  private fixedVariant: number | null = null;

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
    for (const [name, players] of this.samples) {
      const out = this.outFor(name);
      if (out) for (const p of players) p.connect(out);
    }
  }

  /**
   * Place pieces across the stereo field (-1 left … 1 right); unlisted pieces are centred.
   * Call before connect() to opt in. Afterwards it moves the existing placement live, and
   * an empty map puts everything back in the centre.
   */
  setPans(pans: Partial<Record<DrumName, number>>): void {
    this.pans = { ...pans };
    for (const [name, panner] of this.panners) panner.pan.value = this.pans[name] ?? 0;
  }

  /**
   * Play one particular sample of each piece instead of rotating through them — a
   * different kick and snare for a while (Evolve's scenes). null = round robin again.
   */
  setFixedVariant(variant: number | null): void {
    this.fixedVariant = variant === null ? null : Math.max(0, Math.floor(variant));
  }

  /** Where a piece's players connect: its panner when placement is on, else the destination. */
  private outFor(name: DrumName): AudioNode | Tone.Panner | null {
    if (!this.dest) return null;
    if (this.pans === null) return this.dest;
    let panner = this.panners.get(name);
    if (!panner) {
      panner = new Tone.Panner(this.pans[name] ?? 0);
      panner.connect(this.dest);
      this.panners.set(name, panner);
    }
    return panner;
  }

  /**
   * Play a (possibly compound) drum at velocity 0–1. No-op until ready.
   * @param drum   The drum voice to trigger (may be a compound like 'kickCrash').
   * @param velocity  Linear gain 0–1.
   * @param time   Optional audio-context time (seconds) at which to schedule the
   *               hit. When omitted (or undefined) the hit plays immediately —
   *               identical behaviour to the pre-scheduling API. Callers that do
   *               not pass `time` are entirely unaffected.
   */
  play(drum: KitDrum, velocity: number, time?: number): void {
    if (!this.ready) return;
    const gainDb = velToDb(Math.max(0, Math.min(1, velocity)));
    if (drum === 'kickCrash') {
      this.fire('kick', gainDb, time);
      this.fire('crash', gainDb, time);
      return;
    }
    this.fire(drum, gainDb, time);
  }

  dispose(): void {
    for (const players of this.samples.values()) {
      for (const p of players) p.dispose();
    }
    this.samples.clear();
    this.rrIndex.clear();
    for (const panner of this.panners.values()) panner.dispose();
    this.panners.clear();
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
          const out = this.outFor(name);
          if (out) p.connect(out);
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

  private fire(name: DrumName, gainDb: number, time?: number): void {
    // Fall back to the kick if the requested drum didn't load (e.g. its sample
    // 404'd), so every hit makes a sound instead of an intermittent silence.
    let key = name;
    let players = this.samples.get(key);
    if ((!players || players.length === 0) && name !== 'kick') {
      key = 'kick';
      players = this.samples.get(key);
    }
    if (!players || players.length === 0) return;
    let p: Tone.Player;
    if (this.fixedVariant !== null) {
      p = players[this.fixedVariant % players.length];
    } else {
      const i = this.rrIndex.get(key) ?? 0;
      p = players[i];
      this.rrIndex.set(key, (i + 1) % players.length);
    }
    // Schedule the volume AT the hit's own time. Writing `.value` applies immediately, so
    // two hits scheduled inside the look-ahead window both ended up at the later one's
    // volume — a quiet ghost note next to an accent made both loud.
    if (time !== undefined) p.volume.setValueAtTime(gainDb, time);
    else p.volume.value = gainDb;
    p.start(time); // start(undefined) === start-now in Tone.js; safe for existing callers
  }
}

/** Map a 0–1 velocity to a dB gain (−24 dB … 0 dB) for Tone.Player.volume. */
export function velToDb(v: number): number {
  return -24 + v * 24;
}
