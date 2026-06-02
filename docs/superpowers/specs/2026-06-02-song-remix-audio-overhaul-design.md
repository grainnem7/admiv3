# Song Present & Remix — Audio Quality Overhaul

**Date:** 2026-06-02
**Status:** Design — awaiting user review
**Author:** Grainne + Claude

## Goal

Make the **Song Present** (`src/songs/`) and **Remix** (`src/remix/`) modes sound
competitive with market music apps. The current sound is described by the user as
**thin/weak/quiet, harsh/brittle/digital, cheap synth timbres, and dry/lifeless**.
This overhaul is **additive, not a rewrite** — the transport, recording, calibration,
and tracking logic in both modes is mature and tested, and must not be destabilized.

Scope, in priority order:
1. **Sound quality** (this spec) — master-bus processing, space/depth, and real
   multi-velocity samples.
2. **Bug sweep** (Phase 3, deferred) — clicks/pops, song-switch races, record/playback
   edge cases.

Out of scope: interaction/calibration redesign, new feature capabilities, the
Performance-mode `SoundEngine.ts` (the two focus modes do not depend on it).

## Decisions (from brainstorming)

- **Approach A** — a *shared* audio-quality layer reused by both engines, plus targeted
  timbre upgrades. Not a per-mode bespoke rebuild, not mix-only.
- **Bundle samples locally** rather than depend on the CDN (which 404s) or pure synthesis.
- **Go big on realism** — multi-velocity sample layers and round-robin drums for the
  headline instruments (piano, drums, bass, a few string/key timbres).

## Constraints (from `ADMIv3/CLAUDE.md`)

- **Latency < 20 ms** gesture-to-sound. The glue compressor runs with **zero lookahead**;
  the limiter lookahead is kept to ~1–2 ms and is tunable. Net added latency stays well
  inside budget.
- **Tolerance over precision** — the limiter guarantees loud-but-never-clipping regardless
  of how many voices stack.
- **Every user-facing threshold calibratable** — all new numbers live in `audioConfig.ts`.
- **Visual feedback for all audio events** — unchanged; this work touches sound only.
- **TypeScript strict, no `any`. Tone.js only via managers. Tests in Vitest with
  `vi.mock` for Tone/MediaPipe.**

## Current state (verified)

- Song Present ends at `masterGainNode.connect(ctx.destination)`
  ([SongPresetEngine.ts:865](../../../src/songs/SongPresetEngine.ts#L865)); it has a single
  `Tone.Reverb` send and mixes Tone nodes into native Web Audio.
- Remix ends at `master.connect(ctx.destination)`
  ([RemixEngine.ts:89](../../../src/remix/RemixEngine.ts#L89)); it has **no reverb** (bone dry).
- Neither has any master EQ / compression / limiting.
- Remix `DrumKit` loads one-shots from `samples/drums/<kitId>/<name>.wav`, but those named
  files **do not exist** yet ([DrumKit.ts:5](../../../src/remix/layers/DrumKit.ts#L5)) — Remix
  drums are likely silent.
- Song Present streams instruments from CDN (Salamander piano CC-BY, nbrosowsky
  CC-BY-SA 3.0) via `SamplerPlayer.ts`.
- `public/samples/drums/default/` holds 83 WAVs (Chroma one-shots + tempo loops); none are
  wired as a named kit.

## Architecture — shared `src/audio/` studio layer

New framework-agnostic module (pure Tone.js, no React), instantiated **once per engine**
(separate signal nodes, shared code + tuning):

| File | Responsibility |
|------|----------------|
| `src/audio/MasterChain.ts` | EQ3 → glue compressor → soft saturation → brickwall limiter. Exposes `.input` (Tone node), connects to `destination`, disposes cleanly. |
| `src/audio/SpaceReverb.ts` | Send-style reverb for depth. Exposes a `.send` input; wet routes into `MasterChain.input` so space is glued too. |
| `src/audio/instruments/VelocitySampler.ts` | Wraps N `Tone.Sampler`s across velocity ranges; routes each `noteOn(note, vel)` to the matching layer. |
| `src/audio/instruments/RoundRobinDrumKit.ts` | Holds several samples per drum; rotates per hit. Replaces/augments the current `DrumKit`. |
| `src/audio/instruments/registry.ts` | Maps instrument/drum names → **local** sample URLs (+ velocity layers, round-robin sets), with optional CDN fallback. |
| `src/audio/audioConfig.ts` | All tunables: EQ curve, comp threshold/ratio, saturation amount, reverb decay/wet/pre-delay, limiter ceiling/lookahead, velocity split-points. |

## Signal chain (per engine)

```
stems / loops / voices ──► engine masterGain ──► MasterChain.input
                                                      │
   EQ3 (low-shelf body + tame 3–6 kHz harshness)
        │
   Glue Compressor (~2:1, slow, NO lookahead → 0 ms added latency)
        │
   Soft saturation (subtle waveshaper → warmth, removes digital edge)
        │
   Brickwall Limiter (ceiling ≈ −0.3 dB → loud + clip-proof)
        │
        ▼  destination

reverb send:  buses ──► SpaceReverb ──► (wet) ──► MasterChain.input
```

Maps to the four complaints: **thin** → low-shelf + limiter loudness; **harsh** → EQ
de-harsh + saturation + pre-nonlinear anti-alias lowpass; **cheap** → saturation glue +
real samples; **dry** → the space send.

## Sample bundling (go-big)

Curated, headline instruments only, sourced from CC0/CC libraries during implementation,
committed under `public/samples/` with `ATTRIBUTION.md`:

- **Piano:** keep Salamander (CC-BY), host locally; multiple velocity layers.
- **Drums:** punchy CC0 one-shot kit at `public/samples/drums/studio-kit/` with correctly
  named `kick/snare/clap/hihat(/crash/tom).wav` **plus round-robin alternates**. Lights up
  both Remix `DrumKit` and Song Present `HeadBopKit`.
- **Bass:** CC0 sampled electric/upright bass (weak spot today), velocity-layered.
- **Strings/keys:** a few VCSL (CC0) timbres, replacing the middling nbrosowsky set;
  velocity-layered where the source provides it.
- `SamplerPlayer` baseUrls switch CDN → local, with CDN retained as runtime fallback so
  nothing regresses before a given instrument is bundled.

Bundle size is curated hard; **actual added MB reported as each instrument lands** so it
never balloons silently.

## Per-mode timbre upgrades (surgical)

**Song Present**
- `HeadBopKit` drums → local round-robin samples.
- Warm up default parameter-mode synth voices (better envelopes + anti-alias lowpass before
  any nonlinear stage). Leave Instrument/Harmony sampler modes as-is apart from local URLs.
- Fold existing `Tone.Reverb` into shared `SpaceReverb`.

**Remix**
- Fix `DrumKit` so one-shots actually load (point at `studio-kit`, round-robin).
- Reduce GrainPlayer "graininess": tune grain size/overlap; use a plain `Tone.Player` when
  `playbackRate ≈ 1` so unstretched loops aren't granulated.
- Add the `SpaceReverb` send so stems aren't bone-dry; master chain adds body + loudness.

Untouched: transport sync, recording/arranger, calibration, color/face tracking.

## Error handling

- Sample load failure → graceful fallback to the prior synth voice (or CDN), logged once;
  the app keeps running. Local bundling makes failures rare.
- `MasterChain` / `SpaceReverb` construction guarded; if Tone is unavailable the path is a
  transparent pass-through.
- `VelocitySampler` with a single layer degrades to a plain `Sampler`.

## Testing

- Vitest unit tests (`vi.mock` Tone per convention) for `MasterChain`, `SpaceReverb`,
  `VelocitySampler` (velocity→layer routing), `RoundRobinDrumKit` (rotation), and the
  registry (correct local URLs + CDN fallback): construct, valid param ranges, clean dispose.
- Full existing suite (33 files) must still pass — no transport/recording/calibration regression.
- Manual A/B verification: run the app, compare before/after per mode (via `run`/`verify` skills),
  and confirm `Tone.context.lookAhead` + measured gesture-to-sound stays < 20 ms.

## Build sequence (each phase independently shippable)

0. **Shared studio layer.** Build `src/audio/` (MasterChain, SpaceReverb, audioConfig) +
   tests; wire into both engines. Biggest instant win (thin/harsh/dry), zero asset work.
1. **Drums.** Bundle round-robin studio kit; fix Remix `DrumKit`; swap Song Present
   `HeadBopKit` to samples. Adds `RoundRobinDrumKit`.
2. **Melodic timbres.** Bundle velocity-layered piano/bass/strings/keys; add `VelocitySampler`;
   switch `SamplerPlayer` to local + fallback; warm up Song Present synth voices; tune Remix
   loop graininess.
3. **Bug sweep (deferred).** Clicks/pops, song-switch races, record/playback edge cases —
   on top of the now-solid audio path.

Audible improvement lands after **Phase 0 alone**; later phases stack without destabilizing
earlier ones.

## Open questions

- None blocking. Exact CC0 sample sources chosen during Phase 1/2 and recorded in
  `ATTRIBUTION.md`; bundle-size budget confirmed with the user as instruments land.
