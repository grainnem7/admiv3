# Board Sequencer — Ping-pong Playhead (slice 2a)

- **Date:** 2026-06-30
- **Status:** Approved design, ready for implementation plan
- **Branch:** `feat/board-sequencer-mode`
- **Roadmap:** "More time" is slice 2 of the loop-lengthening roadmap. It is split into
  **2a — ping-pong playhead (this spec)** and **2b — spatial halves (composed 2-bar
  loop; also solves variation-across-bars)**. 2a ships first: it is small, independent,
  and composes with the slice-1 variation feature with no changes to it.

## Problem

The board sequencer's phrase is one left-to-right playhead sweep = `cols` beats
(default 8, ~5 s at 90 BPM), then it repeats. Slice 1 (variation primitives) made the
loop *less repetitive*; slice 2 makes it *longer*. Ping-pong is the cheapest longer-phrase
mechanism: it doubles the phrase with no pitch-range cost, stays entirely on the same
board (no captured/hidden state), and — because of how it turns around — the slice-1
variation behaviour rides along for free.

## Goal of this slice

When enabled, the playhead sweeps **→ then ←** forever (columns `1…8`, then `8…7…1`),
turning an 8-step loop into a 16-step there-and-back phrase. The board is read live every
frame, so the return sweep plays whatever is currently on the board, reversed in time.
Off by default.

### Decisions locked during brainstorming

- **Repeat-the-edge turnaround.** The edge column plays twice as the playhead reverses
  (`…7 8 | 8 7…`): a natural turnaround accent, and it keeps **each sweep exactly `cols`
  beats** so the full cycle is `2·cols` beats. This is what lets variation compose for free.
- **Variation rides the return sweep — no variation code changes.** Because each sweep is
  `cols` beats, the existing lap math (`lapIndex(beat, cols) = floor(beat/cols)`) makes the
  forward sweep an even lap (A, plain) and the return sweep an odd lap (B, variation). So a
  slice-1 off-centre piece fires on the way back. `firesThisLap` / `firesThisLapPaged` are
  untouched.
- **Composes with polyrhythm.** A role with its own shorter loop length ping-pongs *within
  its own length*, preserving the drift-against-each-other behaviour.
- **Screen toggle, off by default.** Ping-pong is a session/structural setting (like Pages,
  BPM), so a screen toggle fits; a counter-driven version is a possible future, out of scope.
- **Pages interaction left as-is.** With `numPages > 1` the page still advances per sweep
  (unchanged, documented). The tangible-recall rework of pages is slice 3.

## Experience

- Playhead sweeps → then ←, repeating; an 8-column loop becomes a 16-step phrase.
- The edge column double-hits at each turnaround (an accent).
- Live board: the return sweep plays the current board reversed — nothing is captured.
- Forward sweep = the plain "A" pass; return sweep = the variation "B" pass (slice-1 off-centre
  pieces enter on the way back).
- Polyrhythm roles bounce within their own loop length.

## Controls & visual feedback

- **"Ping-pong" toggle** in the board controls (near Pages / Min fill), persisted, **off by
  default** — existing setups are unchanged until switched on.
- **The visual playhead reverses.** The existing highlighted-column cue reads the engine's
  playhead, so it visibly sweeps right then walks back left once the engine computes the
  bounce — itself the "ping-pong is on" indicator.
- **Direction arrow (→ / ←)** shown near the slice-1 A/B cue while ping-pong is on, so the
  current direction (and the turnaround) is unmistakable. It agrees with the A/B cue:
  **A→ forward, B← return.**

## Architecture

Small and additive. The real work is one pure helper; the engine swaps a step function.

### 1. Pure helpers — `boardSequencerScale.ts` ([src/songs/boardSequencerScale.ts](../../../src/songs/boardSequencerScale.ts))

```ts
/**
 * Repeat-edge triangle wave: the column the playhead visits at `beat` when it
 * ping-pongs over a window of `len` steps. Period 2·len: forward 0…len-1, then
 * len-1…0, so each end column is visited on two consecutive beats (turnaround
 * accent). Defensive on negative beats / len <= 1.
 */
export function pingPongStep(beat: number, len: number): number {
  if (len <= 1) return 0;
  const period = 2 * len;
  const p = ((beat % period) + period) % period; // 0..period-1
  return p < len ? p : period - 1 - p;
}

/**
 * The step (column within a loop of length derived from `loopSteps`/`cols`) the
 * playhead visits at a GLOBAL beat. pingPong off → the current `beat mod len`
 * (identical to roleStep); pingPong on → the repeat-edge triangle. Used by both
 * the audio scheduler and the visual playhead so they always agree.
 */
export function playheadStep(beat: number, loopSteps: number, cols: number, pingPong: boolean): number {
  const len = loopLen(loopSteps, cols);
  return pingPong ? pingPongStep(beat, len) : (((beat % len) + len) % len);
}
```

Note: `playheadStep(beat, loopSteps, cols, false)` is byte-identical to the existing
`roleStep(beat, loopSteps, cols)` (same `loopLen` + same `((beat % len) + len) % len`), so
turning ping-pong off is a guaranteed no-op.

### 2. Engine — `BoardSequencerEngine.ts` ([src/songs/BoardSequencerEngine.ts](../../../src/songs/BoardSequencerEngine.ts))

- Add `pingPong: boolean` to `BoardEngineConfig`; add a live `setPingPong(on: boolean)`
  setter (mirrors `setNumPages`).
- In `fireStep`, replace the polyrhythm column check
  `if (cell.col !== roleStep(beat, this.rawLoop(cat), this.cfg.cols)) continue;`
  with
  `if (cell.col !== playheadStep(beat, this.rawLoop(cat), this.cfg.cols, this.cfg.pingPong)) continue;`
- In `getPlayheadCol(cols)`, replace `beat mod cols` (both the synced and internal branch's
  final step) with `playheadStep(beat, 0, cols, this.cfg.pingPong)` (`loopSteps = 0` →
  `loopLen = cols`).
- Optional: `getPlayheadDirection(): 1 | -1` (forward when `lapIndex(beat, cols)` is even)
  for the overlay arrow — or the screen derives it from lap parity directly.
- **Variation untouched:** `lapIndex`/`firesThisLap`/`firesThisLapPaged` are unchanged;
  forward=A / return=B falls out of the `cols`-beat sweeps.

### 3. Config — `BoardSequencerConfig.ts` ([src/profiles/BoardSequencerConfig.ts](../../../src/profiles/BoardSequencerConfig.ts))

Add `pingPong: boolean` (default **`false`**) to `BoardSequencerStored`,
`DEFAULT_BOARD_SEQUENCER_CONFIG`, and `sanitize` (`o.pingPong === true`). No
`CONFIG_VERSION` bump (older configs default it off).

### 4. Screen — `BoardSequencerScreen.tsx` ([src/ui/screens/BoardSequencerScreen.tsx](../../../src/ui/screens/BoardSequencerScreen.tsx))

- Add the **"Ping-pong" toggle** (checkbox via the existing `update({...})` pattern) and
  pass `pingPong` into the engine construction; call `setPingPong` live on change.
- Draw the **direction arrow** near the A/B cue while ping-pong is on (forward = →,
  return = ←), derived from the same lap parity used for the A/B letter.

## Testing (Vitest)

- **`boardSequencerScale.test.ts`** — `pingPongStep`: forward positions (`0…len-1`),
  backward positions, both edge-repeats (e.g. len 8: beat 7 and 8 both → 7; beat 15 and 16
  both → 0), negative-beat defensiveness, `len <= 1` → 0. `playheadStep`: `pingPong=false`
  equals `beat mod len` for a few beats (and matches `roleStep`); `pingPong=true` delegates
  to `pingPongStep`.
- **`BoardSequencerConfig.test.ts`** — `pingPong` round-trips; defaults to `false` when
  absent.
- **Engine / screen** — no unit harness; verified by `npm run lint` (`tsc --noEmit`) + the
  full `npm run test:run` staying green, as in slice 1.

## Scope guards / out of scope (this slice)

- **Spatial halves (2b) is separate** — the composed 2-bar loop and the variation-across-bars
  problem are slice 2b, not here.
- **Pages (`numPages > 1`)** — page still advances per sweep, unchanged. Not guarded/redesigned
  here (slice 3 reworks pages tangibly).
- **Turnaround is fixed** (repeat-edge). No configurable turnaround mode.
- **Ping-pong is board-wide** — no per-role or per-region ping-pong.

## Future / next slice

- **2b spatial halves:** split the board into bands played as consecutive bars → a composed
  longer phrase; requires defining variation across multiple bars (the interaction slice 1
  deferred). Ping-pong's `playheadStep` abstraction may or may not extend to it; decide in 2b.
