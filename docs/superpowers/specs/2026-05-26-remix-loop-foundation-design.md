# Remix Loop Foundation + Keyboard Test Mode — design

**Date:** 2026-05-26
**Author:** Grainne (with Claude)
**Status:** Draft — ready for plan

---

## Goal

Make the Remix screen actually playable and loop-able. Three things:

1. **Transport-as-clock foundation** — convert the stems from independent raw
   looping `AudioBufferSource`s to `Tone.Player`s synced to `Tone.Transport`, so
   the master clock is authoritative and the stems follow it sample-accurately.
   The current build runs the stems and the Transport as two separate clocks that
   drift apart after the first pass — which makes any loop untrustworthy.
2. **Bar-snapped loop region** — loop the whole mix over a chosen window measured
   in bars (`Off / 4 / 8 / 16`), with forward/back nudge to step the window
   through the song. This also serves the "move to different sections" need
   without any section metadata.
3. **Keyboard test mode** — drive the four stems directly from the keyboard so the
   screen is fully playable without a webcam and two batons.

This is **step 1 of the Remix loop-station roadmap** (see Roadmap below). It is the
bedrock the later steps rest on: looping is only as good as the clock under it, and
the later features can't be evaluated without keyboard testing.

## Roadmap context (committed; each step its own spec → plan → build)

1. **Loop foundation + keyboard test mode** ← this spec.
2. Sustained per-stem capture loops ("hold the groove").
3. Layer stack (stack/mute/clear multiple captured loops).
4. Record + overdub loop pedal.
5. Drum sequencer feeding the layer stack.

Steps 2–5 are explicitly **out of scope** here. This spec deliberately ships the
foundation that makes them tractable rather than a broad-but-thin pass at all of
them.

## Non-goals

- Per-stem capture loops, layer stack, overdub pedal, drum sequencer (roadmap 2–5).
- Named song sections (intro/verse/chorus) — `analysis.json` has no section data;
  bar-snapped nudge provides section-hopping without it.
- Camera/touch control of the loop window — loop controls are setup-style and live
  on the transport panel + keyboard, to protect the performer gesture budget.
- Changing the Remix Core gesture vocabulary (Y filter, dwell-cycle, fast-shake
  stutter), the taper, latch, glide, or the stem-tile/dwell/flash feedback — all
  preserved; only the clock beneath them changes.

## Architecture: Transport-as-clock

Per stem, the chain changes from a raw looping source to a synced `Tone.Player`:

```
Tone.Player(stemBuffer).sync().start(0) → stemGain → stemFilter → masterGain → dest
```

- `loadStemBuffers` is unchanged — it still returns `Map<string, AudioBuffer>`. Each
  buffer becomes `new Tone.Player(buffer)`. The Player connects into the existing
  raw `stemGain → stemFilter` graph via Tone→native connect (the same bridge
  SongPresetEngine already uses for Tone↔raw nodes).
- `.sync().start(0)` ties every stem to the Transport. The Transport becomes the
  single clock; looping, seeking, and pause/resume are Transport operations and the
  stems follow them sample-accurately. The beat dot and stutter read
  `Transport.seconds`, the same value that moves the audio — no drift.
- Lifecycle:
  - `play()` → `Transport.start()`
  - `stop()` → `Transport.stop()` + reset position to the loop window start
  - `togglePlay()` → `Transport.state === 'started' ? Transport.pause() : Transport.start()`
  - `dispose()` → stop Transport, dispose every `Tone.Player`, disconnect the
    stem gain/filter nodes and master (extends the current dispose).
- **Preserved unchanged:** build-from-silence (all stems start `filterNorm 0`,
  `gain 0`), the Y `remixTaper` filter+gain curve, latch (absence of write),
  glide-takeover (~250 ms), the duck-on-stutter overlay behaviour. Only the source
  node type and clock ownership change.

**Files touched:**
- `src/remix/RemixEngine.ts` — playback core (Player conversion), loop region API,
  keyboard-driven per-stem setters, stutter-overlay clock re-home.
- `src/remix/loopRegion.ts` (new) — pure bar-snap math (`computeLoopRegion`,
  `nudgeOrigin`).
- `src/remix/remixKeyMap.ts` (new) — pure `keyToRemixAction(key)` mapper.
- `src/ui/screens/RemixScreen.tsx` — loop controls panel, timeline/loop window,
  keyboard mode toggle + handler, focus indicator, transport position text.
- Tests under `src/__tests__/`.

`remixTaper`, `RemixBaton`, `ShakeDetector`, `StutterScheduler`, `loadStemBuffers`
keep their current public contracts.

## Loop region: bar-snapped nudge

A Transport-backed loop window measured in **bars**, where a "bar" is the span
between consecutive `downbeats[]`.

- **Loop length:** `Off · 4 · 8 · 16` bars.
  - `Off` → `Transport.loop = true`, `loopStart = 0`, `loopEnd = duration` (whole
    song repeats continuously).
  - N bars → `Transport.loop = true`, `loopStart`/`loopEnd` snapped to the
    downbeats spanning N bars from the current window **origin** downbeat.
- **Nudge forward / back:** steps the origin downbeat by N bars (the window's own
  length), clamped so the window stays within the song. This is the
  section-hopping mechanism.
- **Quantised takeover:** changing length or nudging re-aims the window; it takes
  effect at the **next downbeat** so playback never lurches mid-bar. If the current
  play position is outside the new window, playback jumps to the new window's start
  on that downbeat (the intentional "jump to that section" behaviour). Implemented
  by setting the new `Transport.loopStart/loopEnd` and, when a jump is needed,
  scheduling `Transport.seconds = newStart` at the next downbeat via
  `Transport.scheduleOnce`.
- **No downbeats:** loop length is forced to `Off` and the loop controls disable
  with a note. (All four shipped songs have downbeats; this is defensive.)

### Pure helper — `src/remix/loopRegion.ts`

```ts
export interface LoopRegion { startSec: number; endSec: number; }

/**
 * Bar = span between consecutive downbeats. Returns the loop window of
 * `lengthBars` bars starting at downbeat index `originBar`, clamped so the
 * window end never exceeds the last downbeat. Returns null when there is no
 * usable window (no downbeats, or lengthBars <= 0 meaning "Off").
 */
export function computeLoopRegion(
  downbeats: readonly number[],
  originBar: number,
  lengthBars: number,
): LoopRegion | null;

/**
 * Step the origin downbeat index by `dir * lengthBars`, clamped to
 * [0, lastValidOrigin] where lastValidOrigin keeps a full window in range.
 */
export function nudgeOrigin(
  originBar: number,
  dir: 1 | -1,
  lengthBars: number,
  barCount: number,
): number;
```

### Engine API (loop)

- `setLoopLengthBars(n: 0 | 4 | 8 | 16): void` — 0 = Off.
- `nudgeLoop(dir: 1 | -1): void`.
- `getLoopRegion(): { startSec: number; endSec: number; lengthBars: number; originBar: number } | null` — for the UI timeline.

These compute downbeat-snapped times via `loopRegion.ts` and set
`Transport.loopStart/loopEnd`.

## Stutter overlay under the new clock

The one-shot stutter is behaviourally identical (fast-shake → beat-synced one-bar
slice that ducks the main stem and owns the burst). Only its clock references move:

- `computeStutterWindow(playbackNow, beats, downbeats)` is now fed
  `Transport.seconds` (authoritative, within the active loop window). The slice's
  buffer offset is `Transport.seconds` directly — synced Players make that the true
  audio position, so the `% buffer.duration` guess is no longer needed.
- The overlay slice stays a short raw looping source ducking the stem gain, started
  at `ctx.currentTime`, torn down on burst end — unchanged.
- **Loop-boundary clamp:** clamp the burst end to `min(startSec + burstDurSec,
  loopEnd)` so a burst fired near `loopEnd` never bleeds past the loop seam.

`StutterScheduler`'s public API and window math are unchanged; this is which clock
value the engine passes plus the end-clamp inside the engine.

## Keyboard test mode

A toggle (mirroring Song Preset's `keyboardMode`), active only while enabled and
the screen is focused. It drives **stems directly** (not simulated batons), so all
four stems are reachable from the keyboard.

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Focus a stem (vocals / drums / bass / other) |
| `↑` / `↓` | Raise / lower the focused stem's filter (~0.1 per press; bottom = silent) |
| `S` | Stutter the focused stem |
| `←` / `→` | Nudge the loop window back / forward |
| `[` / `]` | Loop length down / up (`Off → 4 → 8 → 16`) |
| `Space` | Play / pause transport |

- Pure mapper `src/remix/remixKeyMap.ts`:

```ts
export type RemixKeyAction =
  | { kind: 'focusStem'; index: 0 | 1 | 2 | 3 }
  | { kind: 'filter'; dir: 1 | -1 }
  | { kind: 'stutter' }
  | { kind: 'nudgeLoop'; dir: 1 | -1 }
  | { kind: 'loopLen'; dir: 1 | -1 }
  | { kind: 'togglePlay' }
  | null;

/** Map a KeyboardEvent.key to a Remix action, or null if unhandled. */
export function keyToRemixAction(key: string): RemixKeyAction;
```

- New engine methods the handler (and the UI buttons) call:
  - `setStemFilterNorm(stem: StemId, value: number): void` — clamps to [0,1], writes
    that stem's `targetFilterNorm` directly (not gliding; immediate follow).
  - `triggerStutterFor(stem: StemId): void` — public wrapper over the existing
    private stutter trigger.
  - plus the loop methods and `togglePlay()` above.
- The keyboard handler is a thin switch over `keyToRemixAction`, tracking the
  focused-stem index in component state. Scoped to the screen, removed when
  keyboard mode is off; avoids the app's global keys (`m` mute, debug toggle), and
  calls `preventDefault()` on the arrows/space it consumes.
- The UI transport/loop buttons call the **same** engine methods, so there is one
  code path for both input routes.

Keyboard mode is independent of the camera/touch input mode (a separate toggle, as
in Song Preset); when on, its direct per-stem control coexists with whatever batons
are tracked.

## Visual feedback

Additions to RemixScreen, consistent with the existing tiles/beat-dot and the
deaf/HoH "never colour-only" rule:

- **Loop window bar:** a song timeline showing total duration, the loop window
  highlighted, and the playhead, with a numeric/text label (`Loop: bars 9–16 (8)`
  or `Loop: off`) so it is not colour-only. Window moves animate on nudge/length
  change.
- **Loop controls panel:** length selector (`Off / 4 / 8 / 16`, `aria-pressed`),
  ◀ / ▶ nudge buttons, play/pause — all wired to the same engine methods as the
  keyboard.
- **Keyboard focus indicator:** the focused stem tile gets a ring + a `▸`/text
  marker and `aria-label` "focused"; a key-hint legend shows while keyboard mode is
  on.
- **Transport position text:** `m:ss / m:ss` beside the beat dot (which now pulses
  from the authoritative clock).

The Remix Core stem-tile level bars, STUTTER strobe, dwell ring, cycle flash, and
assignment badges are unchanged — now driven by a non-drifting clock.

## Testing

### Unit (pure, Vitest)

- `loopRegion.test.ts` — `computeLoopRegion` truth-table (4/8/16-bar windows from
  various origins; clamp at song end; `Off`/lengthBars≤0 → null; no-downbeats →
  null). `nudgeOrigin` (step by length; clamp at both ends; never produces a window
  that exceeds the song).
- `remixKeyMap.test.ts` — every mapped key → correct action; unmapped keys → null;
  digits `1`–`4` → `focusStem` index 0–3; arrows/`[`/`]`/`S`/`Space` → their actions.

### Engine integration (mocked Tone)

`RemixEngine.test.ts` grows: `loadSong` creates a `Tone.Player` per stem and calls
`.sync().start(0)`; `setLoopLengthBars` sets `Transport.loop/loopStart/loopEnd`
from the downbeats; `nudgeLoop` steps + clamps the origin; `setStemFilterNorm`
writes the correct stem's `targetFilterNorm`; `triggerStutterFor` starts a burst;
`togglePlay` toggles the Transport; `dispose` disposes the Players. The Tone mock
grows a `Player` constructor (with `sync`, `start`, `dispose`, `connect`) and
Transport `loop/loopStart/loopEnd/seconds/scheduleOnce/state`. The existing
build-from-silence / latch / glide / stutter-duck / burst-restore tests must stay
green (their assertions are about stem state + gain, which the Player conversion
doesn't change).

### Manual (documented; not automated)

Per shipped song, in keyboard mode: confirm loops stay tight across many passes
(the drift fix), nudge hops sections on the downbeat, the length selector works,
stutter still lands and ducks, play/pause works, and the Remix Core tiles / dwell
ring / cycle flash are unregressed. Then confirm the same with camera/touch input
(batons still drive stems while the loop window is keyboard/button-controlled).

## Risks and open questions

- **Tone.Player ↔ raw-node bridge:** Players connect into the existing raw
  `stemGain`/`stemFilter`. SongPresetEngine already bridges Tone→raw, so the pattern
  is proven, but the manual-verification pass must confirm no clicks/gain
  discontinuities at the Player→gain boundary.
- **Quantised-jump feel:** "jump to a section on the next downbeat" could feel
  laggy if the user nudges mid-bar at slow tempo. The next-downbeat quantise is one
  scheduling call; if it feels sluggish in session, an "immediate jump" variant is a
  one-line change. Flag for the manual pass.
- **Stutter across the loop seam:** mitigated by the end-clamp; a burst fired
  exactly on `loopEnd` simply doesn't extend — acceptable.
- **Scope creep toward roadmap 2:** "hold the groove" sustained loops are tempting
  to add here. Held out deliberately — this spec only makes the clock loop-able;
  capturing/looping stem slices is the next spec, built on this foundation.
