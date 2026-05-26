# Remix Added-Sound Layer Framework + Percussion (remove stutter) — design

**Date:** 2026-05-26
**Author:** Grainne (with Claude)
**Status:** Draft — ready for plan

---

## Goal

Step 1 of the **Remix Added-Sound Library** roadmap. Three things:

1. **Remove the stutter function** — the user dislikes it. Delete the stutter sound
   mechanism entirely; keep and repurpose the gestures that drove it.
2. **A layer framework** — a general "added sound" abstraction (`RemixLayer`) mixed
   alongside the 4 stems on its own bus, with its own enable + volume. The shared
   foundation for every later sound type.
3. **One-shot percussion** — the first concrete layer: high-quality sampled drum
   hits, fired by the now-freed head-nod (and shake) gestures, with the drum chosen
   by beat position (kick on downbeats, snare on backbeats).

Removing stutter orphans the head-nod and shake gestures (their only job was
stutter); percussion re-homes them, so Tim's head-nod stays meaningful — now a
sampled drum hit in time instead of a glitch.

## Roadmap context (committed; ordering delegated to the implementer)

Remix Added-Sound Library — each step its own spec → plan → build:
1. **Layer framework + one-shot percussion (+ remove stutter)** ← this spec.
2. Stem beat-gating ("a stem plays only on certain beats of the bar") + the
   stem-transform family (chop/retrigger, tape-stop, half-time, …).
3. Playable melodic/chordal instrument layer.
4. Tempo-synced loop layers + layer stack (merges with the loop-station roadmap).
5. Atmospheric pad / texture layer.
6. Sample-quality uplift (cross-cutting; this spec already sources a good drum kit).
7. Recording in sections + arrangement playback (largest — last).

The `RemixLayer` framework built here is the shared foundation for steps 2–5 **and**
the loop-station roadmap's layer stack, so we don't build two competing layer systems.

## Non-goals

- Beat-gating / stem transforms, instrument/loop/pad layers, sample-quality uplift
  beyond the drum kit, recording/sections (roadmap 2–7).
- A kit selector / multiple kits (one solid kit first; selector is a later nicety).
- Beat-snapping the drum trigger to the next beat (fire immediately, sound chosen by
  nearest beat; optional snap is a later refinement).
- Changing the stem playback, loop region, calibration, baton-touch cycle, or
  keyboard mode from the loop-foundation work — all preserved.

## Remove stutter

The stutter *sound* is deleted; the *gestures* are kept and repointed at percussion.

**Deleted:**
- `src/remix/StutterScheduler.ts` and `src/__tests__/StutterScheduler.test.ts`
  (including `computeStutterWindow`) — only stutter used them.
- In `src/remix/RemixEngine.ts`: `triggerStutter`, `triggerStutterFor`,
  `startOverlay`, `stopOverlay`; the `stutterSource` / `scheduler` / `pendingWindow`
  fields on the `StemNodes` interface; the `stuttering` field on `RemixStemState`;
  the loop-seam clamp + `WRAP_EPSILON` wrap-end block in `renderFrame`;
  `shakeStutterEnabled` + `setShakeStutterEnabled`; the `out.stutter` branch in
  `applyBaton`.
- In `src/ui/screens/RemixScreen.tsx`: the STUTTER strobe on the stem tiles and the
  shake-stutter toggle in the facilitator panel.
- The stutter-specific tests in `RemixEngine.test.ts` (duck, burst-restore,
  seam-clamp, wrap-end).

**Kept and repurposed (no orphaned gestures):**
- `RemixBaton`'s `ShakeDetector` and its trigger output stay. The output field
  `RemixBatonOutput.stutter` is **renamed `shake`** (a generic "a shake happened"
  signal). The screen routes a shake to the percussion layer instead of the engine
  stuttering. (Rename touches RemixBaton + its tests + RemixScreen's consumer.)
- The head-nod `FaceDetector` wiring in RemixScreen and
  `RemixEngine.processFaceLandmarks` stay — the nod now fires the percussion layer
  (see Percussion layer) rather than `triggerStutterFor`.

After removal, `RemixStemState` is `{ filterNorm, targetFilterNorm, gain }`; the
engine has no stutter/overlay code. Build-from-silence / latch / glide / loop tests
stay green.

## Layer framework

`src/remix/layers/RemixLayer.ts`:

```ts
export type RemixLayerKind = 'percussion' | 'instrument' | 'loop' | 'pad';

export interface RemixLayer {
  readonly id: string;
  readonly kind: RemixLayerKind;
  connect(dest: AudioNode): void;
  setEnabled(on: boolean): void;
  setVolume(v: number): void;   // 0–1
  isReady(): boolean;           // samples loaded
  dispose(): void;
}
```

Trigger-type layers (percussion) add their own trigger method; continuous layers
(instrument/pad, later) add theirs. The base interface is lifecycle + mix only.

**Layers bus in `RemixEngine`:**
- A `layersBus: GainNode → masterGain`, parallel to the stem path, so added sounds
  mix with the 4 stems but share their own collective level.
- `private layers = new Map<string, RemixLayer>()`; methods `addLayer(layer)`,
  `getLayer(id)`, `removeLayer(id)`; all disposed in `dispose()`.
- Layers are **independent of stems** — they never touch `RemixStemState` or the
  stem build-from-silence path. A layer's audibility is its own `enabled` + `volume`.
- Engine pass-throughs for the screen: `setLayerEnabled(id, on)`,
  `setLayerVolume(id, v)`. Triggering uses a typed method (below), not a
  stringly-typed generic, to keep types tight.

Deliberately minimal — percussion fits now; instrument/loop/pad and the loop-station
layer stack extend the interface when built (YAGNI: no speculative methods).

## DrumKit sampler + bundled samples

**Bundled samples:** a CC0/CC-BY drum kit at `public/samples/drums/<kitId>/`, one WAV
per drum: `kick.wav`, `snare.wav`, `hat.wav`, `crash.wav`. Source a genuinely good
openly-licensed kit; trim to one-shots, keep total size small (a few hundred KB);
record source + licence in `public/samples/drums/SAMPLE_SOURCES.md`. One kit to start.

**`src/remix/layers/DrumKit.ts`:**

```ts
class DrumKit {
  constructor(ctx: AudioContext, kitId: string);  // loads the 4 WAVs as Tone.Players
  isReady(): boolean;                              // all players loaded
  connect(dest: AudioNode): void;
  play(drum: HeadBopDrum, velocity: number): void; // kick|snare|hat|crash|kickCrash
  dispose(): void;
}
```
- One `Tone.Player` per drum, loaded from the kit folder. `play()` retriggers the
  matching player at the given velocity; `kickCrash` fires kick + crash together
  (the compound mapping `HeadBopKit` already uses).
- Reuses the existing `HeadBopDrum` type and the pure `pickHeadBopDrum(targetTime,
  beats, downbeats)` from `src/songs/voices/HeadBopKit.ts` (kept — only the synth
  `HeadBopKit` is superseded for Remix; Song Preset still uses it, so it's untouched).
- `play()` no-ops until `isReady()` (early triggers ignored, never throw).

## Percussion layer

`src/remix/layers/PercussionLayer.ts` implements `RemixLayer` (`kind:'percussion'`)
and owns a `DrumKit`:

- **Audio:** `DrumKit → layerGain → (connected to layersBus)`. `setVolume` → `layerGain`;
  `setEnabled(false)` mutes and ignores triggers; `isReady()` reflects kit load.
- **Beat data:** holds the song's `beats`/`downbeats` (set by the engine on load).
- **Trigger:** `hit(targetTimeSec, velocity)` → `drum = pickHeadBopDrum(targetTimeSec,
  beats, downbeats)`; `kit.play(drum, velocity)`. No-op when disabled or not ready.

**Routing the freed gestures:**
- **Head-nod:** `RemixEngine.processFaceLandmarks`, on a detected nod, calls
  `triggerPercussion(Transport.seconds, velocity)` where `velocity` is
  `HeadBopDetector.getLastBopAmplitude()` scaled into a musical range. Kick on
  downbeats, snare on backbeats — lands in time with Tim's nodding.
- **Shake:** the baton's `out.shake` → the screen calls `triggerPercussion(
  Transport.seconds, accentVelocity)` (a slightly higher accent velocity). Optional,
  independent of head-nod.
- **Keyboard `S`:** the loop-foundation keyboard mode currently binds `S` →
  `engine.triggerStutterFor(focusedStem)`. Since that method is being deleted, repoint
  `S` to percussion: the keyboard handler calls `engine.triggerPercussion(
  Transport.seconds, defaultVelocity)`. The `remixKeyMap` action `{ kind: 'stutter' }`
  is renamed `{ kind: 'percussion' }` (its `remixKeyMap.test.ts` case updated), and the
  RemixScreen key handler's `stutter` arm becomes the `percussion` arm. So `S` now
  fires a drum hit — the keyboard parallel to head-nod.
- Fired **immediately** on the gesture; the drum is chosen by the *nearest* beat to
  `Transport.seconds`. (Optional next-beat snap is a later refinement.)

**Engine method:** `triggerPercussion(timeSec, velocity)` routes to the percussion
layer if present and enabled; no-op otherwise.

**Controls (facilitator panel):** "Add percussion" enable toggle + a volume slider,
wired via `engine.setLayerEnabled('percussion', …)` / `setLayerVolume`. The existing
head-nod sensitivity sliders keep working (now tuning the drum trigger). Percussion
is **off by default** (opt-in, like head-nod was).

**Visual feedback:** a brief flash on a percussion indicator showing the drum name
(e.g. "KICK") when a hit fires — never colour-only — replacing the removed STUTTER
strobe. The beat dot already shows the grid.

## Integration & lifecycle

- **`loadSong`:** build the `layersBus`; construct a `PercussionLayer` (loading the
  bundled kit), `addLayer` it, hand it the song's `beats`/`downbeats`. Layer starts
  **disabled**. Reloading disposes the old layer and rebuilds.
- **Engine API added:** `setLayerEnabled(id, on)`, `setLayerVolume(id, v)`,
  `triggerPercussion(timeSec, velocity)`. `processFaceLandmarks` calls
  `triggerPercussion` on a nod; the screen calls it for a shake.
- **`dispose`:** dispose all layers + the layers bus alongside the existing teardown.
- **`RemixScreen`:** head-nod `FaceDetector` lifecycle unchanged — only its action
  changes (drum hit). Facilitator panel loses the shake-stutter toggle, gains
  "Add percussion" + percussion volume. `out.shake` routed to `triggerPercussion`
  when percussion is enabled.

## Testing

### Unit (Vitest, `vi.mock` for Tone)

- **`DrumKit.test.ts`** — constructs 4 `Tone.Player`s from a kit; `play('kick')` and
  `play('kickCrash')` trigger the right player(s); `play` no-ops before `isReady`;
  `dispose` tears down.
- **`PercussionLayer.test.ts`** — satisfies the `RemixLayer` surface; `setEnabled(false)`
  mutes + ignores `hit`; `setVolume` sets the gain; `hit(t, vel)` selects the
  beat-appropriate drum (assert via beats/downbeats fixtures) and calls `kit.play`
  with the velocity; not-ready → no-op.
- **`RemixEngine.test.ts`** (extend) — `loadSong` adds a **disabled** percussion
  layer; `setLayerEnabled('percussion', true)` then `triggerPercussion` fires;
  disabled → no fire; `processFaceLandmarks` nod → `triggerPercussion` only when
  enabled; layers disposed on `dispose`. **Remove** the deleted stutter tests; keep
  build-from-silence / latch / glide / loop tests green.
- **`RemixBaton.test.ts`** (adjust) — the renamed `out.shake` field; the shake
  detector still fires on a fast move (assertion updated from `stutter` to `shake`).
- **`remixKeyMap.test.ts`** (adjust) — the `S` key now maps to `{ kind: 'percussion' }`
  (renamed from `{ kind: 'stutter' }`); other key mappings unchanged.

### Manual (documented)

Load a song, enable percussion: head-nod fires beat-aware drum hits in time with
high-quality samples; shake adds accents; volume + enable work; the drum-name flash
shows. Confirm stutter is fully gone (no STUTTER strobe, no shake-stutter toggle) and
the loop / keyboard / calibration / baton-touch features are unregressed.

## Risks and open questions

- **Sample sourcing/licensing:** the implementer must pick a genuinely CC0/CC-BY kit
  and record attribution. If a high-quality openly-licensed kit can't be found at
  acceptable size, fall back to a smaller curated set and flag for the sample-quality
  uplift step. Repo grows by a few hundred KB.
- **Tone.Player one-shot retrigger latency:** retriggering a `Tone.Player` for rapid
  hits must restart cleanly (no clipped tail artefacts). Manual pass confirms; if a
  single Player can't retrigger fast enough, use a tiny voice pool per drum (defer
  unless needed).
- **`out.stutter` → `out.shake` rename churn:** touches RemixBaton, its tests, and
  RemixScreen. Mechanical but must be complete (TS strict will flag stragglers).
- **Gesture velocity mapping:** `getLastBopAmplitude` → musical velocity needs tuning
  in session; isolated as one mapping function so it's cheap to adjust.
- **FaceDetector + ColorTracker both running:** unchanged from the loop-foundation
  (already runs both); no new risk.
