# Remix Core — design

**Date:** 2026-05-15
**Author:** Grainne (with Claude)
**Status:** Draft — ready for plan

---

## Goal

Add a dedicated **Remix screen** to ADMIv3 where a user builds and shapes a 4-stem
remix of a song from silence, using accessible movement input. The user has two
hands (two batons); each baton is assigned to one stem and shapes it live. Setting
a baton down latches the stem at its last state so the mix accumulates — a
producer automating one track at a time.

Motivating context: this is **Remix core**, the first of three independent
subsystems decomposed from the original "remix mode" idea. It establishes the
transform vocabulary that the later **Looper / layering** and **Saved arrangement**
features will build on. Those two are out of scope here and each get their own
spec → plan → implementation cycle.

## Non-goals

- Looper / layering (capture sections into loops, stack them) — separate spec.
- Saved arrangement (author + persist a remix that plays back hands-free) — separate spec.
- Pitch-shift and time-stretch on stems — require a real-time phase vocoder; blows
  the <20 ms gesture-to-sound budget; already a project non-goal.
- Reverse — cut from core (corner triggers are too demanding for the target users;
  no accessible trigger fit the gesture budget). May return in a later iteration.
- Refactoring SongPresetEngine into a shared playback engine — only a single small
  `loadStemBuffers` helper is extracted; the broader consolidation is deferred
  until a third consumer exists.

## Interaction model (settled in brainstorming)

- **Separate Remix screen**, not tied to the 5-baton Song Preset model.
- **Input:** both camera (colour-tracked batons) and touch (iPad pad), mirroring
  the existing stem-mixer dual-input precedent.
- **Two batons** (the user's two hands). Each baton is **assigned to one stem** and
  cycles through the four stems in a fixed order.
- **Start state:** all four stems silent. The user builds the mix by construction.
- **Per-baton vocabulary — only two gestures plus one continuous axis:**
  - **Y position → that stem's filter + gain taper.** Top = open/bright, bottom =
    closed. The bottom of the range is a true-silence dead-zone, so sweeping Y to
    the floor *is* mute (no separate mute gesture). **Solo is emergent**, not a
    dedicated control: the user filters the other stems down. Remix core ships no
    discrete mute or solo button/gesture — the Y taper is the only volume path.
  - **Dwell (hold roughly still ~1.2 s) → cycle** the baton to the next stem. The
    current stem latches at its last filter value; the baton rebinds to the next
    stem in `vocals → drums → bass → other → vocals`.
  - **Fast shake (velocity spike) → one-shot stutter burst** on the assigned stem
    (beat-synced, fixed ~one-bar length, auto-stops).
- **Latch:** a baton that cycles away or leaves frame stops writing its stem; the
  stem holds its last filter/gain and keeps playing. "Latch" is simply absence of
  overwrite.
- **X axis is unassigned** — deliberately. Fewer required dimensions honours
  "tolerance over precision".

## Architecture

### File structure

```
src/remix/
  RemixEngine.ts        Stem playback: 4 decoded buffers, per-stem
                        GainNode → BiquadFilter → masterGain, Tone
                        transport, loop, beat grid. Build-from-silence.
                        Owns per-stem RemixStemState; renders state → audio.
  RemixBaton.ts         Per-baton state machine: stem assignment,
                        DwellDetector (cycle), ShakeDetector (stutter),
                        Y → filterNorm. Pure logic; no Web Audio.
  ShakeDetector.ts      Small velocity-spike detector with cooldown.
  StutterScheduler.ts   Beat-synced one-shot slice re-trigger for one
                        stem. Pure window math + node creation.
  loadStemBuffers.ts    Shared helper: fetch + decodeAudioData a
                        SongConfig's stems into AudioBuffers. Also
                        called by SongPresetEngine (small DRY extraction).
src/ui/screens/
  RemixScreen.tsx       Camera + touch input, mounts RemixEngine, feeds
                        2 baton positions, renders visual feedback.
src/__tests__/
  RemixBaton.test.ts
  StutterScheduler.test.ts
  RemixEngine.test.ts
```

Each `src/remix/` file has one responsibility and is testable in isolation.
`loadStemBuffers.ts` is the only shared extraction: SongPresetEngine's inline
fetch + `decodeAudioData` loop moves into it and SongPresetEngine calls the helper
too — a small, safe DRY win, not approach C's broader refactor.

### Wiring

- `'remix'` added to the `Screen` union in [src/state/types.ts:473](../../../src/state/types.ts#L473).
- `case 'remix': return <RemixScreen />;` in [src/ui/App.tsx](../../../src/ui/App.tsx)
  (import + `renderScreen` switch).
- A "Remix" navigation entry alongside Song Preset in whatever menu launches Song
  Preset (same launch surface).

### RemixEngine — stem playback model

Per stem (`vocals | drums | bass | other`), an independent chain:

```
AudioBufferSource → stemGain → stemFilter (lowpass) → masterGain → destination
```

All four sources start at transport position 0 and **loop with the song; they
always run**. Silence is `stemGain = 0`, never stopping the source — this keeps
all stems sample-aligned for the entire session (so stutter overlays and latched
stems never drift).

**Engine owns per-stem state.** `RemixStemState = { assigned: boolean;
filterNorm: number /* 0–1 */; gain: number; stuttering: boolean }`. A `RemixBaton`
writes `filterNorm` for its assigned stem each frame; the engine renders state →
audio nodes once per frame. Audio rendering lives in one place; baton logic stays
pure.

**Build-from-silence:** every stem starts `filterNorm = 0`, `gain = 0`.

**Y → filter + gain taper** (the key mechanic; `filterNorm` derived from Y where
0 = bottom of frame, 1 = top — matching the codebase's `1 - posY` convention):

| `filterNorm` | filter cutoff | stem gain |
|---|---|---|
| 0.00 – 0.08 | (n/a) | ramps 0 → 0 — **silent dead-zone** |
| 0.08 – 0.20 | 80 Hz → 250 Hz | ramps 0 → 1 |
| 0.20 – 1.00 | 250 Hz → 18 kHz (logarithmic) | 1.0 |

A bare 80 Hz lowpass still leaks bass, so the gain must also fall to reach true
silence — hence the combined taper. Sweeping Y to the floor mutes; lifting it
brings the stem back. Solo is emergent (the user lowers the other stems' Y); there
is no solo helper or button in core. All transitions smoothed via `setTargetAtTime`
(~50 ms time-constant) so jittery/imprecise Y never zippers.

**Latch:** when no baton is writing a stem (cycled away, or baton absent), the
engine leaves that stem's state untouched — it keeps its last `filterNorm`/`gain`
and plays on.

Reuse: `loadSongAnalysis` for `beats[]`/`downbeats[]`; `Tone.getTransport()` for
the clock + loop; `SONG_LIBRARY` for stem URLs; `loadStemBuffers` for decode.

### RemixBaton — per-baton state machine

One per tracked baton (max 2). Each owns:

- **`assignedStem`** — current stem; cycle order `vocals → drums → bass → other`,
  wrapping.
- **`DwellDetector`** (reused from [src/movement/DwellDetector.ts](../../../src/movement/DwellDetector.ts))
  — config `dwellRadius ≈ 0.05` (tolerant), `dwellTimeMs ≈ 1200`,
  `cooldownMs ≈ 600`. On trigger: latch the current stem, rebind to the next stem.
  Its `DwellResult.progress` drives the on-screen dwell ring.
- **`ShakeDetector`** (new) — smoothed velocity crossing a high threshold fires a
  one-shot stutter on the assigned stem via `StutterScheduler`. Has its own
  cooldown (~600 ms). Dwell (≈0 velocity) and shake (high velocity) occupy
  opposite ends of the velocity range and cannot both fire from one motion.
- **Y → `filterNorm`** for the assigned stem, every frame the baton is present.

**Two batons, independent.** Each tracks its own assignment + detectors. Both may
target different stems (shape two at once) or the same stem (last writer per frame
wins — documented, harmless, not prevented).

**Glide-takeover on cycle.** When a baton rebinds to a stem that already has a
latched `filterNorm`, the engine glides that stem from its latched value to the
live Y over ~250 ms (not an instant snap; not hidden pickup/catch logic). A 250 ms
filter glide reads as a musical sweep, never a click, and is predictable ("taking
a stem sweeps it to my hand"). Pickup/catch was rejected as confusing for the
target users.

**Presence.** Baton absent → detectors pause, it stops writing, the stem latches.
Reappearing resumes control of its last-assigned stem. Baton identity is keyed by
`ColorRole` so brief tracking dropouts don't reset assignment/detector state.

### StutterScheduler — beat-synced one-shot burst

The main per-stem source never stops; stutter is an **overlay**:

1. ShakeDetector fires → `trigger(stemId, now)`.
2. Compute the window: **start** = next beat boundary at/after `now` (reuse the
   `nextBeatAfter` helper exported from
   [src/songs/voices/InstrumentVoice.ts](../../../src/songs/voices/InstrumentVoice.ts));
   **slice** = half a beat (1/8-note feel at song tempo); **burst length** = one
   bar (downbeat-to-downbeat from `downbeats[]`; fallback 4 beats).
3. At burst start: duck the stem's `stemGain` to 0 and schedule a dedicated short
   `AudioBufferSource` reading the stem buffer with `loop = true` and
   `loopStart/loopEnd` framing one slice, for the burst duration. The slice's
   source offset = the buffer position at burst start (transport seconds → sample
   offset), so the stutter "freezes and repeats" the moment it fired.
4. At burst end: stop the overlay source, restore `stemGain` to the stem's latched
   value. The main source never stopped and is still sample-aligned, so playback
   resumes seamlessly with no re-sync.

All start/stop times scheduled on the `AudioContext` clock (ahead-of-time,
sample-accurate, well within the 20 ms budget). **One burst per stem at a time** —
a shake mid-burst is ignored (not queued); the ShakeDetector cooldown reinforces
this. Window/slice/burst math is pure and unit-tested; only node creation touches
Web Audio.

### Input & screen integration

`RemixScreen.tsx` mirrors `SongPresetScreen`'s plumbing:

- **Camera:** reuse `ColorTracker`. Track all calibrated colours; the up-to-2 found
  become the active hands. Each `ColorRole` keeps a persistent `RemixBaton` so
  assignment/detector state survives brief tracking loss. Reuse the existing
  colour-calibration UI path.
- **Touch:** one pointer = one baton (one hand-equivalent) via `usePadState`. Same
  vocabulary: vertical drag = filter, hold still = dwell-cycle, fast flick =
  stutter. Touch sessions remix one stem at a time — an accepted simplification
  matching the existing single-pad stem-mixer touch precedent.
- **Per frame:** screen builds `{ x, y, found }` per baton → `RemixBaton.update()`
  (detectors run, writes `filterNorm`, may fire stutter/cycle) → `RemixEngine`
  renders all stem state to audio.
- **Song picker + transport:** reuse `SONG_LIBRARY`; minimal play / pause /
  restart / loop controls (no chord/voice UI).

### Visual feedback (deaf/HoH requirement)

Every audio event has a visual. The screen shows **4 stem tiles**
(vocals/drums/bass/other), each rendering:

- **Audible level** — fill height/brightness tracks `filterNorm` (empty in the
  silent dead-zone, full when open).
- **Filter colour shift** — warmer/darker as the lowpass closes, brighter as it
  opens.
- **Assignment badge** — which baton colour controls this stem; the 2 baton
  markers draw on/over their assigned tile.
- **Dwell ring** — progress arc around the active baton fed by
  `DwellResult.progress`; flash + handoff animation on cycle trigger.
- **Stutter burst** — the stuttering tile strobes in sync with each slice for the
  burst, then settles.
- **Beat pulse** — global beat indicator from `beats[]`/`downbeats[]`, visible
  even with all stems silent (important on the silent start).
- **Latched vs live** — latched stem (playing, no baton) shown solid; a
  baton-controlled stem shows a "live" outline.

Colour/motion is never the only channel for a state (shape/level/text backups)
for colour-blind users.

## Testing

### Unit (Vitest, `vi.mock` for Tone.js per repo convention)

- **`RemixBaton.test.ts`** — dwell triggers cycle and advances stem in
  `vocals→drums→bass→other→vocals`; cycle latches the prior stem; shake fires
  stutter once then respects cooldown; dwell and shake never both fire from one
  motion; Y maps to `filterNorm` per the taper; absent baton stops writing.
- **`StutterScheduler.test.ts`** — pure window math: burst starts on next beat
  boundary; slice = half-beat; burst = one bar (downbeat, fallback 4 beats);
  second trigger mid-burst ignored; slice offset = transport position at trigger.
- **`RemixEngine.test.ts`** — Y-taper truth-table (dead-zone 0–0.08 → gain 0;
  fade band 0.08–0.20; full ≥0.20); build-from-silence (all gains 0 on load);
  latch (stem holds state when baton stops writing); smoothing applied (no
  instant jumps).

### Integration (`RemixEngine` + mocked audio graph)

Load a song → assign baton → raise Y → stem audible; cycle → prior stem latched,
new stem focused; glide-takeover ramps ~250 ms; dispose tears down all
sources/nodes cleanly.

### Manual (documented, not automated)

Each shipped song: build a 4-stem mix from silence with one baton via cycle;
filter-to-floor silences and lifts; stutter lands on beat and returns seamlessly;
two-baton independence; touch-mode single-baton parity; visual feedback matches
every audio event with all stems silent (beat pulse visible).

## Risks and open questions

- **Glide-takeover feel.** 250 ms is a starting value; may need tuning in session.
  Isolated as one constant so it is cheap to adjust.
- **Dwell vs. intentional stillness.** A user who naturally holds still while
  shaping a filter could trigger an unwanted cycle. Mitigation: `dwellTimeMs`
  ~1200 ms + `cooldownMs` and the visible dwell ring give warning; both are
  tunable. If sessions show false cycles, raising dwell time is the first lever.
- **Touch single-baton limit.** Touch can't easily express two independent hands;
  documented as an accepted simplification consistent with the existing
  stem-mixer touch pad. Two-hand remixing is a camera-mode capability.
- **Stutter slice musicality.** Half-beat slices may feel wrong on some songs
  (e.g. 12/8 "Can't Help Falling in Love"); slice fraction is a single constant,
  adjustable per the manual-verification pass.
- **All-silent start confusion.** The always-visible beat pulse and empty-tile
  affordances mitigate "is it working?"; flagged for the manual UX pass.
