/**
 * HeadBopKit — small synthesised drum kit for the Song Preset head-bop
 * channel.  Composed entirely of Tone primitives (no asset loading or
 * licensing concerns) so it loads instantly and survives offline use.
 *
 * Pieces:
 *   kick   → MembraneSynth, low-frequency thump.  Default sound; lands
 *            on downbeats and "strong" beats.
 *   snare  → NoiseSynth band-passed, short decay.  Lands on the
 *            backbeats (beats 2 & 4 in 4/4) to anchor the groove.
 *   hat    → NoiseSynth, high-passed, very short decay.  Light filler
 *            sound — not used by the default 4/4 pattern but exposed
 *            so other patterns can pick it.
 *   crash  → MetalSynth, longer ring.  Played alongside the kick on
 *            the first beat of each bar to mark bar boundaries.
 *
 * All four pieces are lazily constructed on first use so callers that
 * never trigger a snare/crash don't pay the construction cost.
 *
 * Output routes to a destination provided via {@link HeadBopKit.connect}
 * (e.g. the engine's master gain node so head-bop drums respect Mute and
 * pick up the master glue), falling back to the main output when no
 * destination has been supplied.
 *
 * @see pickHeadBopDrum for the beat-position-aware pattern that
 *      chooses which piece to play.
 */

import * as Tone from 'tone';

/**
 * The drum-sound selector returned by {@link pickHeadBopDrum} and
 * accepted by {@link HeadBopKit.play}.  Two compound sounds
 * (kickCrash, kickSnare) bundle simultaneous hits for the cases where
 * a single beat warrants two simultaneous drum voices — most notably
 * a kick + crash on the first beat of a bar.
 */
export type HeadBopDrum =
  | 'kick'
  | 'snare'
  | 'hat'
  | 'crash'
  | 'kickCrash';

/**
 * Velocity-scaled drum kit using only Tone primitives.  Velocity input
 * is 0–1; each piece interprets it via its own velocity range so the
 * dynamic feel matches each sound's natural envelope.
 */
export class HeadBopKit {
  private kickSynth: Tone.MembraneSynth | null = null;
  private snareSynth: Tone.NoiseSynth | null = null;
  private hatSynth: Tone.NoiseSynth | null = null;
  private crashSynth: Tone.MetalSynth | null = null;
  private dest: AudioNode | null = null;

  /** Route this kit's output to `dest` (e.g. the engine master). Call before play(). */
  connect(dest: AudioNode): void {
    this.dest = dest;
  }

  /**
   * Play a drum sound at the given velocity (0–1).  Builds the synth
   * for that piece on first use.  Compound sounds (kickCrash) fan out
   * to their components.
   */
  play(sound: HeadBopDrum, velocity: number): void {
    const v = clamp01(velocity);
    switch (sound) {
      case 'kick':
        this.ensureKick();
        this.kickSynth!.triggerAttackRelease('C2', '8n', undefined, scaleVelocity(v, 0.5, 1.0));
        break;
      case 'snare':
        this.ensureSnare();
        this.snareSynth!.triggerAttackRelease('16n', undefined, scaleVelocity(v, 0.4, 1.0));
        break;
      case 'hat':
        this.ensureHat();
        // Hats sit lower in the mix — scale a bit softer.
        this.hatSynth!.triggerAttackRelease('32n', undefined, scaleVelocity(v, 0.2, 0.7));
        break;
      case 'crash':
        this.ensureCrash();
        this.crashSynth!.triggerAttackRelease('C4', '4n', undefined, scaleVelocity(v, 0.3, 0.9));
        break;
      case 'kickCrash':
        this.ensureKick();
        this.ensureCrash();
        this.kickSynth!.triggerAttackRelease('C2', '8n', undefined, scaleVelocity(v, 0.5, 1.0));
        this.crashSynth!.triggerAttackRelease('C4', '4n', undefined, scaleVelocity(v, 0.3, 0.9));
        break;
    }
  }

  /** Tear down any built synths.  Safe to call without play() ever firing. */
  dispose(): void {
    this.kickSynth?.dispose();
    this.snareSynth?.dispose();
    this.hatSynth?.dispose();
    this.crashSynth?.dispose();
    this.kickSynth = null;
    this.snareSynth = null;
    this.hatSynth = null;
    this.crashSynth = null;
  }

  // ============================================
  // Lazy builders
  // ============================================

  private ensureKick(): void {
    if (this.kickSynth) return;
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4 },
    }).connect(this.dest ?? Tone.getDestination());
  }

  private ensureSnare(): void {
    if (this.snareSynth) return;
    // White noise band-passed via the synth's filter to a snare-ish
    // 2 kHz peak.  Tone.NoiseSynth doesn't expose a filter directly,
    // so we keep this simple — pure noise envelope reads as snare-y
    // when paired with the short decay.
    this.snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
    }).connect(this.dest ?? Tone.getDestination());
  }

  private ensureHat(): void {
    if (this.hatSynth) return;
    this.hatSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    }).connect(this.dest ?? Tone.getDestination());
  }

  private ensureCrash(): void {
    if (this.crashSynth) return;
    // MetalSynth gives a metallic shimmer that reads as a cymbal
    // splash — long enough to mark a bar boundary, short enough to
    // not muddy the next beat at typical song tempos.
    this.crashSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.6, release: 1.0 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(this.dest ?? Tone.getDestination());
  }
}

// ============================================
// Beat-position picker (pure)
// ============================================

/**
 * Pick a drum sound for a head-bop landing at `targetTime`, given the
 * song's beats and (optionally) downbeats.
 *
 * Pattern (4/4 and 12/8 read the same way at the bar level):
 *   • Beat 1 of a new bar (downbeat) → kickCrash (kick + crash splash)
 *   • Backbeats (beatInBar 1, 3 — i.e. "2 and 4")        → snare
 *   • Other beats                                         → kick
 *
 * When downbeats are missing, falls back to alternating kick/snare on
 * adjacent beats — still gives a sense of groove even without bar
 * information.  When beats are missing entirely, defaults to kick.
 *
 * Pure / side-effect-free so it can be unit-tested without any audio
 * infrastructure.
 */
export function pickHeadBopDrum(
  targetTime: number,
  beats: readonly number[] | null | undefined,
  downbeats: readonly number[] | null | undefined,
): HeadBopDrum {
  if (!beats || beats.length === 0) return 'kick';

  const beatIndex = nearestBeatIndex(beats, targetTime);
  if (beatIndex < 0) return 'kick';

  if (!downbeats || downbeats.length === 0) {
    // No bar info — alternate kick/snare so we still get a groove.
    return beatIndex % 2 === 0 ? 'kick' : 'snare';
  }

  // Find which downbeat starts this bar.  We look for the
  // most-recent downbeat at or before this beat's time, then count
  // beats from there.
  const beatTime = beats[beatIndex];
  const downbeatIndex = nearestDownbeatIndex(beats, downbeats, beatTime);
  if (downbeatIndex < 0) {
    return beatIndex % 2 === 0 ? 'kick' : 'snare';
  }

  const beatInBar = beatIndex - downbeatIndex;

  if (beatInBar === 0) return 'kickCrash';   // bar start
  if (beatInBar % 2 === 1) return 'snare';   // backbeats
  return 'kick';                             // other strong beats
}

/**
 * Return the index of the beat in `beats` closest to `targetTime`.
 * -1 if the array is empty.
 */
function nearestBeatIndex(beats: readonly number[], targetTime: number): number {
  if (beats.length === 0) return -1;
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < targetTime) lo = mid + 1;
    else hi = mid;
  }
  const after = lo;
  const before = lo > 0 ? lo - 1 : lo;
  return Math.abs(beats[after] - targetTime) <= Math.abs(beats[before] - targetTime)
    ? after
    : before;
}

/**
 * Return the index in `beats` of the most-recent downbeat at or
 * before `beatTime`.  Matches by timestamp equality (tolerance: half
 * the local beat interval) — downbeat timestamps are a subset of beat
 * timestamps in well-formed analyses, so they should match exactly,
 * but we allow a small slop for analysis noise.
 *
 * -1 if no downbeat fits.
 */
function nearestDownbeatIndex(
  beats: readonly number[],
  downbeats: readonly number[],
  beatTime: number,
): number {
  // Find the most-recent downbeat at or before this beat.
  let lo = 0, hi = downbeats.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (downbeats[mid] <= beatTime + 0.01) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate < 0) return -1;
  // Map that downbeat back to its index in the beats array.
  const downbeatTime = downbeats[candidate];
  const beatIdx = nearestBeatIndex(beats, downbeatTime);
  if (beatIdx < 0) return -1;
  // Sanity: the matched beat must actually be close to the downbeat.
  if (Math.abs(beats[beatIdx] - downbeatTime) > 0.05) return -1;
  return beatIdx;
}

// ============================================
// Helpers
// ============================================

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Map a 0–1 input to a target [min, max] range. */
function scaleVelocity(value: number, min: number, max: number): number {
  return min + value * (max - min);
}
