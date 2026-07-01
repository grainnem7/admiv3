# Board Sequencer — Ping-pong Playhead (slice 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a "Ping-pong" toggle is on, the board sequencer's playhead sweeps → then ← (repeat-edge turnaround), doubling an 8-step loop into a 16-step there-and-back phrase, composing for free with slice-1 variation (forward = plain pass, return = variation pass) and with polyrhythm.

**Architecture:** A pure `pingPongStep` triangle-wave helper (plus a `playheadStep` wrapper) in `boardSequencerScale.ts` holds all the logic and is fully unit-tested. The engine swaps its per-role column check and its visual-playhead calc to `playheadStep` and gains a `pingPong` config field + live setter. Config persists the flag; the screen adds the toggle and a direction arrow. Variation code is untouched — repeat-edge keeps each sweep `cols` beats, so the existing lap math yields forward=A / return=B automatically.

**Tech Stack:** React 19 + TypeScript (strict) + Vite + Tone.js. Tests: Vitest (`npm run test:run`). Typecheck: `npm run lint` (= `tsc --noEmit`).

## Global Constraints

- TypeScript strict mode — **no `any` types**.
- All Tone.js access stays inside the engine; never instantiate Tone in components.
- Latency budget: gesture-to-sound under 20 ms — per-frame additions stay O(cells), no allocation-heavy work.
- Off by default: `pingPong` defaults to `false`; existing setups play exactly as today until switched on.
- `playheadStep(beat, loopSteps, cols, false)` MUST be byte-identical to the existing `roleStep(beat, loopSteps, cols)` so "ping-pong off" is a guaranteed no-op.
- Variation code (`lapIndex`/`firesThisLap`/`firesThisLapPaged`) is NOT modified by this slice.
- Turnaround is fixed as **repeat-edge** (period `2·len`; each end column visited on two consecutive beats).

**Spec:** `docs/superpowers/specs/2026-06-30-board-sequencer-ping-pong-playhead-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/songs/boardSequencerScale.ts` | Pure pitch/scheduling helpers | Modify: add `pingPongStep`, `playheadStep` |
| `src/songs/BoardSequencerEngine.ts` | Audio engine + step scheduler | Modify: `pingPong` in `BoardEngineConfig`, `setPingPong` setter, `playheadStep` in `fireStep` + `getPlayheadCol`, `getPlayheadDirection` |
| `src/profiles/BoardSequencerConfig.ts` | Persisted config | Modify: add `pingPong` (type, default, sanitize) |
| `src/ui/screens/BoardSequencerScreen.tsx` | Camera loop, overlay, controls | Modify: engine wiring, toggle, direction arrow |
| `src/__tests__/boardSequencerScale.test.ts` | — | Add `pingPongStep` / `playheadStep` tests |
| `src/__tests__/BoardSequencerConfig.test.ts` | — | Add `pingPong` persistence tests |

Task order by dependency: 1 (pure helpers) → 2 (config) → 3 (engine) → 4 (screen).

---

### Task 1: Pure ping-pong helpers in boardSequencerScale

**Files:**
- Modify: `src/songs/boardSequencerScale.ts` (append after the existing `roleStep`)
- Test: `src/__tests__/boardSequencerScale.test.ts`

**Interfaces:**
- Consumes: existing `loopLen(loopSteps, cols)` from the same module.
- Produces:
  - `pingPongStep(beat: number, len: number): number`
  - `playheadStep(beat: number, loopSteps: number, cols: number, pingPong: boolean): number`

- [ ] **Step 1: Write the failing tests**

Add `pingPongStep, playheadStep` to the variation-helpers import block in `src/__tests__/boardSequencerScale.test.ts` (the block that currently imports `conditionalFromOffset, lapIndex, firesThisLap, firesThisLapPaged`), then append this describe block at the end of the file:

```ts
describe('ping-pong playhead', () => {
  it('pingPongStep: forward half is identity (len 8, beats 0..7)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((b) => pingPongStep(b, 8)))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('pingPongStep: return half walks back (len 8, beats 8..15)', () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((b) => pingPongStep(b, 8)))
      .toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });
  it('pingPongStep: repeat-edge at both ends (7 then 8 → 7; 15 then 16 → 0)', () => {
    expect(pingPongStep(7, 8)).toBe(7);
    expect(pingPongStep(8, 8)).toBe(7); // top edge visited twice
    expect(pingPongStep(15, 8)).toBe(0);
    expect(pingPongStep(16, 8)).toBe(0); // bottom edge visited twice (cycle restart)
  });
  it('pingPongStep: cycle length is 2*len', () => {
    expect(pingPongStep(16, 8)).toBe(pingPongStep(0, 8));
    expect(pingPongStep(21, 8)).toBe(pingPongStep(5, 8));
  });
  it('pingPongStep: defensive on negative beats', () => {
    expect(pingPongStep(-1, 8)).toBe(0); // -1 mod 16 = 15 → 0
    expect(pingPongStep(-8, 8)).toBe(7); // -8 mod 16 = 8 → 7
  });
  it('pingPongStep: len <= 1 → 0', () => {
    expect(pingPongStep(5, 1)).toBe(0);
    expect(pingPongStep(5, 0)).toBe(0);
  });

  it('playheadStep: pingPong off equals beat mod len (and matches roleStep)', () => {
    for (const b of [0, 3, 7, 8, 15, 100]) {
      expect(playheadStep(b, 0, 8, false)).toBe(roleStep(b, 0, 8));
      expect(playheadStep(b, 6, 8, false)).toBe(roleStep(b, 6, 8));
    }
  });
  it('playheadStep: pingPong on delegates to pingPongStep over the loop length', () => {
    // loopSteps 0 → full width (8); loopSteps 6 → bounces within 6
    expect(playheadStep(8, 0, 8, true)).toBe(pingPongStep(8, 8)); // 7
    expect(playheadStep(7, 6, 8, true)).toBe(pingPongStep(7, 6)); // len 6
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: FAIL — `pingPongStep` / `playheadStep` are not exported (import error).

- [ ] **Step 3: Implement the helpers**

Append to `src/songs/boardSequencerScale.ts` (after `roleStep`):

```ts
/**
 * Repeat-edge triangle wave: the column the playhead visits at `beat` when it
 * ping-pongs over a window of `len` steps. Period 2·len — forward 0…len-1, then
 * len-1…0 — so each end column is visited on two consecutive beats (turnaround
 * accent). Defensive on negative beats / len <= 1.
 */
export function pingPongStep(beat: number, len: number): number {
  if (len <= 1) return 0;
  const period = 2 * len;
  const p = ((beat % period) + period) % period; // 0..period-1
  return p < len ? p : period - 1 - p;
}

/**
 * The step (column within a loop length derived from `loopSteps`/`cols`) the
 * playhead visits at a GLOBAL beat. pingPong off → `beat mod len` (identical to
 * roleStep); pingPong on → the repeat-edge triangle. Used by both the audio
 * scheduler and the visual playhead so they always agree.
 */
export function playheadStep(beat: number, loopSteps: number, cols: number, pingPong: boolean): number {
  const len = loopLen(loopSteps, cols);
  return pingPong ? pingPongStep(beat, len) : (((beat % len) + len) % len);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: PASS (new ping-pong tests plus all existing scale tests).

- [ ] **Step 5: Commit**

```bash
git add src/songs/boardSequencerScale.ts src/__tests__/boardSequencerScale.test.ts
git commit -m "feat(board-sequencer): pure ping-pong playhead helpers"
```

---

### Task 2: Persist the ping-pong flag

**Files:**
- Modify: `src/profiles/BoardSequencerConfig.ts` (`BoardSequencerStored` interface; `DEFAULT_BOARD_SEQUENCER_CONFIG`; `sanitize`)
- Test: `src/__tests__/BoardSequencerConfig.test.ts`

**Interfaces:**
- Produces: `BoardSequencerStored.pingPong: boolean` (default `false`).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('BoardSequencerConfig', ...)` block in `src/__tests__/BoardSequencerConfig.test.ts`:

```ts
  it('round-trips the ping-pong flag', () => {
    const cfg: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, pingPong: true };
    saveBoardSequencerConfig(cfg);
    expect(loadBoardSequencerConfig()?.pingPong).toBe(true);
  });

  it('defaults pingPong to false when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    expect(loadBoardSequencerConfig()?.pingPong).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: FAIL — `pingPong` is `undefined` on the loaded config (and TypeScript flags the unknown property on the `BoardSequencerStored` literal).

- [ ] **Step 3: Add the field, default, and sanitisation**

In `src/profiles/BoardSequencerConfig.ts`:

Add to the `BoardSequencerStored` interface, right after the `variationOffsetThreshold: number;` line:

```ts
  /** Ping-pong playhead: sweep → then ← (repeat-edge) instead of always left→right. */
  pingPong: boolean;
```

Add to `DEFAULT_BOARD_SEQUENCER_CONFIG`, right after the `variationOffsetThreshold: 0.6,` line:

```ts
  pingPong: false,
```

Add to the object returned by `sanitize`, right after the `variationOffsetThreshold: num(o.variationOffsetThreshold, d.variationOffsetThreshold),` line:

```ts
    pingPong: o.pingPong === true,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: PASS (new tests plus all existing config tests).

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/profiles/BoardSequencerConfig.ts src/__tests__/BoardSequencerConfig.test.ts
git commit -m "feat(board-sequencer): persist ping-pong flag"
```

---

### Task 3: Wire ping-pong into the engine

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts` (import; `BoardEngineConfig`; `getPlayheadCol`; `fireStep` column check; add `setPingPong` + `getPlayheadDirection`)

**Interfaces:**
- Consumes: `playheadStep`, `pingPongStep`, `lapIndex` (Task 1 + existing), `BoardSequencerStored.pingPong` (Task 2).
- Produces:
  - `BoardEngineConfig.pingPong: boolean`
  - `BoardSequencerEngine.setPingPong(on: boolean): void`
  - `BoardSequencerEngine.getPlayheadDirection(): 1 | -1`

**Note on testing:** the engine is audio-bound (Tone.js / AudioContext) with no unit-test harness in this repo. The step logic is fully unit-tested in Task 1; this task only wires it. Verify by `npm run lint` clean + the full `npm run test:run` staying green. Do NOT create an engine test file.

- [ ] **Step 1: Import the helpers**

In `src/songs/BoardSequencerEngine.ts`, add `playheadStep` and `lapIndex` to the existing import from `./boardSequencerScale`. Note: Step 5 replaces the engine's ONLY use of `roleStep` with `playheadStep`. After that swap, if `roleStep` is no longer referenced anywhere in this file, **remove `roleStep` from the import** — an unused import fails `tsc --noEmit` under this project's strict settings. (Verify with a quick search of the file for `roleStep` after Step 5; the swap in Step 5 is expected to be its last use.)

- [ ] **Step 2: Add `pingPong` to `BoardEngineConfig`**

In the `BoardEngineConfig` interface, add after the `numPages: number;` line:

```ts
  /** Ping-pong playhead: sweep → then ← (repeat-edge) instead of always left→right. */
  pingPong: boolean;
```

- [ ] **Step 3: Add the live setter and the direction helper**

Add these methods next to the other live setters (e.g. after `setNumPages`):

```ts
  /** Toggle the ping-pong playhead live (safe while running). */
  setPingPong(on: boolean): void {
    this.cfg.pingPong = on;
  }

  /** Current sweep direction for the overlay arrow: +1 forward (→), -1 return (←). */
  getPlayheadDirection(): 1 | -1 {
    if (!this.cfg.pingPong) return 1;
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return lapIndex(beat, this.cfg.cols) % 2 === 0 ? 1 : -1;
  }
```

- [ ] **Step 4: Use `playheadStep` for the visual playhead**

Replace the body of `getPlayheadCol(cols: number)` so both branches route through `playheadStep` (loopSteps `0` → full width):

```ts
  /** The column the playhead is on right now (drives the visual playhead). */
  getPlayheadCol(cols: number): number {
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return playheadStep(beat, 0, cols, this.cfg.pingPong);
  }
```

- [ ] **Step 5: Use `playheadStep` for the per-role column check**

In `fireStep`, replace the polyrhythm column check:

```ts
      if (cell.col !== roleStep(beat, this.rawLoop(cat), this.cfg.cols)) continue;
```

with:

```ts
      if (cell.col !== playheadStep(beat, this.rawLoop(cat), this.cfg.cols, this.cfg.pingPong)) continue;
```

Then search the file for `roleStep`. If this was its last use (expected), remove `roleStep` from the `./boardSequencerScale` import (see Step 1) so the unused import does not fail `tsc`.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS (no regressions; the pure step logic is covered by Task 1).

- [ ] **Step 7: Commit**

```bash
git add src/songs/BoardSequencerEngine.ts
git commit -m "feat(board-sequencer): ping-pong playhead in the engine (fireStep + visual)"
```

---

### Task 4: Screen — toggle, engine wiring, direction arrow

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (engine construction; controls; overlay)

**Interfaces:**
- Consumes: `cfg.pingPong` (Task 2), `engine.setPingPong` / `engine.getPlayheadDirection` (Task 3).

**Note on testing:** React/canvas UI, no harness. Do NOT write a UI test. Verify by `npm run lint` clean + full `npm run test:run` green. The manual camera checklist is for the human.

- [ ] **Step 1: Pass `pingPong` into the engine at construction**

In `src/ui/screens/BoardSequencerScreen.tsx`, in the `new BoardSequencerEngine({ ... })` construction, add `pingPong: cfg.pingPong,` alongside the other fields (e.g. next to `numPages: cfg.numPages,`).

- [ ] **Step 2: Push the toggle live to the engine**

Find where other live config changes reach the engine (e.g. the `setPagesCount` / `setNumPages` wiring). Ensure a `pingPong` change calls the engine: in the loop or the update path, the simplest robust approach mirrors the existing per-frame config push — in the rAF loop where `cfg = configRef.current` is read, add:

```ts
          engineRef.current?.setPingPong(cfg.pingPong);
```

(Place it next to the existing `modeRef.current?.setVariation(...)` call so both live settings are pushed each frame.)

- [ ] **Step 3: Add the Ping-pong toggle to the controls**

Near the existing Pages / Min fill controls, add (matching the surrounding `update({...})` + `config` pattern):

```tsx
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox" checked={config.pingPong}
                onChange={(e) => update({ pingPong: e.target.checked })}
              />
              Ping-pong (sweep → then ←)
            </label>
```

- [ ] **Step 4: Draw the direction arrow in the overlay**

In the rAF loop, alongside where `isVarLap` is computed for the overlay, compute the direction and pass it to `drawOverlay`:

```ts
          const pingDir = runningRef.current && engineRef.current && cfg.pingPong
            ? engineRef.current.getPlayheadDirection()
            : 0; // 0 = don't draw an arrow
```

Add a `pingDir: number` parameter to the `drawOverlay` callback signature (after `isVarLap`), thread the new argument into the `drawOverlay(...)` call, and inside `drawOverlay`, after the A/B letter block, draw the arrow when `pingDir !== 0`:

```ts
      if (pingDir !== 0) {
        ctx.save();
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = 'rgba(80,200,255,0.9)';
        ctx.fillText(pingDir > 0 ? '→' : '←', 40, 30);
        ctx.restore();
      }
```

(`drawOverlay`'s `useCallback` dependency array stays as it is — it reads refs.)

- [ ] **Step 5: Typecheck, full suite, and manually verify**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS (all suites, no regressions).

Manual verification (human, `npm run dev` → Board Sequencer, calibrate a colour, press start):
- [ ] With **Ping-pong off** (default): playhead sweeps left→right only, exactly as before.
- [ ] Turn **Ping-pong on**: the highlighted playhead sweeps right, then walks back left, repeating; the **→ / ←** arrow flips at each turnaround.
- [ ] A piece in an edge column double-hits at the turnaround (audible accent).
- [ ] With **Variation** also on: off-centre pieces sound on the **return (←)** sweep; the A/B letter reads A on → and B on ←.
- [ ] Reload the page → the Ping-pong toggle persists.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): ping-pong toggle + direction arrow"
```

---

## Self-Review

**Spec coverage:**
- Repeat-edge triangle, `2·cols` cycle → Task 1 (`pingPongStep`). ✓
- Off-by-default no-op (`playheadStep(…, false) == roleStep`) → Task 1 test + Task 2 default. ✓
- Engine uses it for audio + visual; composes with polyrhythm (per-role `rawLoop` length) → Task 3. ✓
- Variation composes for free (no variation code changed) → guaranteed by leaving `lapIndex`/`firesThisLap` untouched; forward=A/return=B follows from `cols`-beat sweeps. ✓
- Toggle + persistence + direction arrow → Tasks 2 + 4. ✓
- Pages interaction left as-is → no page code touched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code and exact commands. ✓

**Type consistency:** `pingPongStep(beat, len)` → `playheadStep(beat, loopSteps, cols, pingPong)` used identically in engine `fireStep` and `getPlayheadCol`; `pingPong: boolean` consistent across `BoardSequencerStored` (Task 2), `BoardEngineConfig` (Task 3), and the screen (Task 4); `setPingPong(on)` / `getPlayheadDirection()` defined in Task 3, called in Task 4. ✓

**Known v1 limitation (intentional):** ping-pong is board-wide, turnaround is fixed repeat-edge, and interaction with `numPages > 1` is unchanged (page advances per sweep) — all documented scope guards in the spec.
