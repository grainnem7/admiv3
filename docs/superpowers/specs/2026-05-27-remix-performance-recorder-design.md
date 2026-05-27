# Remix performance recorder design (sub-project 1)

**Date:** 2026-05-27
**Status:** Approved (design)
**Roadmap step:** 7 ("recording-in-sections"), part 1 of 2. Part 2 = audio bounce/export (separate spec).

## Goal

Let a user build a remix by recording their live control performance over the song,
section by section, with stacked overdub layers, then play the whole arrangement
back. The "remix" is the song plus the recorded performance (control automation) —
not yet a standalone audio file (that is sub-project 2).

## Decisions (locked)

- **What is recorded:** control automation (gestures), not audio. Audio bounce is sub-project 2.
- **Sections = loop regions.** Reuse the existing loop machinery (`loopOriginBar`,
  `loopLengthBars`, `computeLoopRegion`). A section is a bar-aligned region; "next
  section" nudges the loop forward and starts a fresh section there.
- **Layering = overdub passes that stack.** The section loops continuously; each armed
  cycle captures a new `RemixTake`. All non-muted takes in a section play together.
- **Transport while recording:** the section loops continuously (looper-style). Each
  loop wrap commits the current take and re-arms an empty one.
- **Compositing rule:** discrete events (percussion) from all non-muted takes all fire;
  continuous params (stem filter, loop volume, loop selection, loop enable) use
  **last-non-muted-take-wins**. A take records only the params the user actually
  touched, so untouched params pass through from earlier takes / the song default.
- **Playback:** the arrangement plays over the original song stems/layers. Remix =
  performance-on-song.
- **Persistence:** one named arrangement per song, saved to `localStorage`.

## Data model (pure, serializable)

```ts
type RemixEvent =
  | { t: number; kind: 'stemFilter'; stem: StemId; value: number }
  | { t: number; kind: 'percussion'; velocity: number }
  | { t: number; kind: 'loopSelect'; index: number }
  | { t: number; kind: 'loopEnable'; on: boolean }
  | { t: number; kind: 'loopVolume'; value: number };

interface RemixTake { id: string; muted: boolean; events: RemixEvent[] }      // one overdub pass
interface RemixSection { originBar: number; lengthBars: number; layers: RemixTake[] }
interface RemixArrangement { songId: string; sections: RemixSection[] }
```

`t` is seconds relative to the section start, in `[0, sectionLengthSec)`.

## Components

1. **`RemixRecorder`** (`src/remix/recording/RemixRecorder.ts`) — pure-ish capture buffer.
   `arm()`, `disarm()`, `isArmed()`, `capture(event omitting t, transportSec)` (computes
   `t = (transportSec − sectionStartSec)`, wrapped into `[0, lengthSec)`), and
   `commitTake()` → returns the buffered events as a `RemixTake` (new id, `muted:false`)
   and clears the buffer. No audio, no Tone — fully unit-testable.

2. **`RemixArranger`** (`src/remix/recording/RemixArranger.ts`) — owns the
   `RemixArrangement`. Manages sections (find-or-create by `originBar`+`lengthBars`,
   append take, mute/delete take). Provides a pure `composite(section, t)` →
   `{ filters: Partial<Record<StemId,number>>; loop?: {...}; }` for continuous params
   (last-non-muted-take-wins) and a pure `discreteEventsInWindow(section, fromT, toT)`
   → percussion events to fire. Serialize/deserialize to/from `RemixArrangement` JSON.

3. **Engine integration** (`RemixEngine`) — engine owns a `RemixRecorder` + `RemixArranger`.
   - Capture: existing control methods (`setStemFilterNorm`, `triggerPercussion`,
     `applyLoopBaton`→`loopEnable/loopSelect/loopVolume`, `selectLoop`) call
     `recorder.capture(...)` when armed.
   - Loop-wrap detection (transportSec wrapped past section end since last tick) drives
     `commitTake()` + append to the current section, then re-arm.
   - New API: `armRecording()`, `disarmRecording()`, `isRecording()`,
     `advanceSection()` (commit current, `nudgeLoop(1)`, start fresh section),
     `getArrangement()`, `playArrangement()`, `stopArrangement()`, `isPlayingArrangement()`,
     `muteTake(sectionIdx, takeId, muted)`, `deleteTake(sectionIdx, takeId)`,
     `loadArrangement(a)`, plus serialize via `getArrangement()`.
   - Playback: a per-frame tick (in or beside `renderFrame`) reads the current section
     from transport position, applies composited continuous params via the existing
     smoothed setters, and fires discrete percussion events crossed since the last tick.

4. **Persistence** (`src/remix/recording/arrangementStore.ts`) — `saveArrangement(name, a)`
   / `loadArrangement(songId, name)` / `listArrangements(songId)` over `localStorage`
   (key namespaced by songId). Pure wrappers; no UI.

5. **UI** (`RemixScreen.tsx`) — a "Remix recorder" panel: ● Arm/Disarm (armed = pulsing
   indicator), the current section's take list with mute toggle + ✕ delete, "Next
   section →", "▶ Play remix" / "■ Stop", and Save / Load. Visual feedback for all
   states (armed, take count, current section, playing) — deaf/HoH consistent with the
   existing facilitator panel. Recording uses the live baton/keyboard input already wired.

## Testing

Vitest:
- `RemixRecorder`: `t` computed relative to section start + wrapped; `commitTake` returns
  buffered events and clears; disarmed capture is a no-op.
- `RemixArranger`: composite continuous = last-non-muted-take-wins; muted take excluded;
  discrete events from all non-muted takes returned; find-or-create section;
  serialize→deserialize round-trip.
- `arrangementStore`: save/load/list round-trip (jsdom localStorage); missing key → null.
- `RemixEngine`: arm→capture appends events; loop wrap commits a take; playback applies
  composited filter + fires percussion; mute/delete take.
- UI: lint + full suite (no dedicated component test).

## Out of scope (deferred)

- Audio bounce/export (sub-project 2).
- Editing individual events / quantize.
- Multiple named arrangements UI beyond simple save/load.
- Per-take volume/solo (only mute + delete).
