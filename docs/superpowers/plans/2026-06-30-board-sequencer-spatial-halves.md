# Board Sequencer — Spatial Halves (slice 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Spatial halves" toggle that splits the board into a top band (bar 1) and bottom band (bar 2), played in sequence for a composed 16-step 2-bar loop, with each band getting its own full pitch range.

**Architecture:** Two pure helpers (`bandBounds`, `barIndexAt`) plus one insight — passing `band.end + 1` as the pitch `rows` makes each band's own bottom row the lowest note — let the engine restrict `fireStep` to the active bar's band and remap pitch per band with no new voicing code. Precedence over the other modes reuses existing guards (variation via `firesThisLapPaged(...,2)`, ping-pong bypass, screen skips loop-bank feeding).

**Tech Stack:** React 19 + TypeScript (strict) + Vite + Tone.js. Tests: Vitest. Typecheck: `npm run lint` (= `tsc --noEmit`).

## Global Constraints

- TypeScript strict mode — no `any` types.
- All Tone.js access stays inside the engine; never instantiate Tone in components.
- Off by default: `spatialHalves` defaults `false`; when off every changed expression reduces to today's behaviour (a true no-op).
- **Precedence when on:** ping-pong bypassed, loop-bank not fed, variation inert (via the existing `Pages > 1` guard reused as a `2`), `numPages` assumed 1.
- **Per-band pitch:** each band's own bottom row is the lowest note — achieved by using `pitchRows = band.end + 1` in place of `cfg.rows` for that band's cells.
- Top band = bar 1 (index 0), bottom band = bar 2 (index 1). Bottom band = `floor(rows/2)` rows; top band gets the remainder.
- Test-runner note: if `npm run test:run` crashes on the default pool (`spawn UNKNOWN`/OOM — sandbox), run `npx vitest run --pool=forks --poolOptions.forks.singleFork=true`.

**Spec:** `docs/superpowers/specs/2026-06-30-board-sequencer-spatial-halves-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/profiles/BoardSequencerConfig.ts` | Persisted config | Modify: add `spatialHalves` |
| `src/songs/boardSequencerScale.ts` | Pure helpers | Modify: add `Band`, `bandBounds`, `barIndexAt` |
| `src/songs/BoardSequencerEngine.ts` | Audio engine | Modify: `spatialHalves?` config, `setSpatialHalves`, `getCurrentBar`, `chordStack` rows param, per-band `fireStep` |
| `src/ui/screens/BoardSequencerScreen.tsx` | Screen | Modify: toggle + engine wiring + precedence (Task 4); divider/dim/Bar cue (Task 5) |
| `src/__tests__/boardSequencerScale.test.ts` | — | Add `bandBounds`/`barIndexAt` tests |
| `src/__tests__/BoardSequencerConfig.test.ts` | — | Add `spatialHalves` tests |

Task order by dependency: 1 (config) → 2 (helpers) → 3 (engine, needs 2) → 4 (screen behaviour, needs 1+3) → 5 (screen visuals, needs 3).

---

### Task 1: Persist the spatial-halves flag

**Files:**
- Modify: `src/profiles/BoardSequencerConfig.ts`
- Test: `src/__tests__/BoardSequencerConfig.test.ts`

**Interfaces:**
- Produces: `BoardSequencerStored.spatialHalves: boolean` (default `false`).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('BoardSequencerConfig', ...)` block:

```ts
  it('round-trips spatialHalves', () => {
    const cfg: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, spatialHalves: true };
    saveBoardSequencerConfig(cfg);
    expect(loadBoardSequencerConfig()?.spatialHalves).toBe(true);
  });

  it('defaults spatialHalves false when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    expect(loadBoardSequencerConfig()?.spatialHalves).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: FAIL — `spatialHalves` is undefined (and TS flags the unknown prop on the literal).

- [ ] **Step 3: Add the field, default, and sanitisation**

In `src/profiles/BoardSequencerConfig.ts`:

Add to the `BoardSequencerStored` interface, right after the `pingPong: boolean;` line:

```ts
  /** Spatial halves: split the board into two bands played as bar 1 (top) then bar 2 (bottom). */
  spatialHalves: boolean;
```

Add to `DEFAULT_BOARD_SEQUENCER_CONFIG`, right after the `pingPong: false,` line:

```ts
  spatialHalves: false,
```

Add to the object returned by `sanitize`, right after the `pingPong: o.pingPong === true,` line:

```ts
    spatialHalves: o.spatialHalves === true,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/profiles/BoardSequencerConfig.ts src/__tests__/BoardSequencerConfig.test.ts
git commit -m "feat(board-sequencer): persist spatial-halves flag"
```

---

### Task 2: Pure band helpers

**Files:**
- Modify: `src/songs/boardSequencerScale.ts` (append)
- Test: `src/__tests__/boardSequencerScale.test.ts`

**Interfaces:**
- Produces:
  - `interface Band { start: number; end: number; }` (inclusive row range)
  - `bandBounds(rows: number): [Band, Band]`
  - `barIndexAt(beat: number, cols: number): number`

- [ ] **Step 1: Write the failing tests**

Add `bandBounds, barIndexAt` (and `type Band` if you assert on it) to the variation-helpers import block in `src/__tests__/boardSequencerScale.test.ts`, then append:

```ts
describe('spatial halves helpers', () => {
  it('bandBounds: even rows split evenly (8 → 4/4, 6 → 3/3)', () => {
    expect(bandBounds(8)).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }]);
    expect(bandBounds(6)).toEqual([{ start: 0, end: 2 }, { start: 3, end: 5 }]);
  });
  it('bandBounds: odd rows → the top band gets the extra row', () => {
    expect(bandBounds(7)).toEqual([{ start: 0, end: 3 }, { start: 4, end: 6 }]);
  });
  it('bandBounds: bands are contiguous and cover 0..rows-1', () => {
    const [top, bottom] = bandBounds(8);
    expect(top.start).toBe(0);
    expect(bottom.start).toBe(top.end + 1);
    expect(bottom.end).toBe(7);
  });

  it('barIndexAt: bar 0 for the first sweep, bar 1 for the second, then wraps', () => {
    expect(barIndexAt(0, 8)).toBe(0);
    expect(barIndexAt(7, 8)).toBe(0);
    expect(barIndexAt(8, 8)).toBe(1);
    expect(barIndexAt(15, 8)).toBe(1);
    expect(barIndexAt(16, 8)).toBe(0);
  });
  it('barIndexAt: defensive on negative beats and cols<1', () => {
    expect(barIndexAt(-1, 8)).toBe(1); // floor(-1/8) = -1 → 1
    expect(barIndexAt(5, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: FAIL — `bandBounds`/`barIndexAt` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/songs/boardSequencerScale.ts`:

```ts
/** An inclusive row range for a spatial-halves band. */
export interface Band {
  start: number;
  end: number;
}

/**
 * Split `rows` into two bands: top = bar 1, bottom = bar 2. The bottom band gets
 * floor(rows/2) rows; the top band gets the remainder (the extra row when odd).
 */
export function bandBounds(rows: number): [Band, Band] {
  const r = Math.max(0, rows);
  const bottomRows = Math.floor(r / 2);
  const topRows = r - bottomRows;
  return [
    { start: 0, end: topRows - 1 },
    { start: topRows, end: r - 1 },
  ];
}

/**
 * Which bar a GLOBAL beat falls on when the board plays as two bars of `cols`
 * beats: 0 = top band (bar 1), 1 = bottom band (bar 2). Defensive on negatives.
 */
export function barIndexAt(beat: number, cols: number): number {
  if (cols < 1) return 0;
  const b = Math.floor(beat / cols);
  return ((b % 2) + 2) % 2;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/songs/boardSequencerScale.ts src/__tests__/boardSequencerScale.test.ts
git commit -m "feat(board-sequencer): pure spatial-halves band helpers"
```

---

### Task 3: Engine plays two bars with per-band pitch

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts` (import ~L16; `BoardEngineConfig`; setter/getter near `setPingPong`; `chordStack` ~L484-486; `fireStep` ~L520-573)

**Interfaces:**
- Consumes: `bandBounds`, `barIndexAt` (Task 2).
- Produces: `BoardEngineConfig.spatialHalves?: boolean`; `setSpatialHalves(on: boolean): void`; `getCurrentBar(cols: number): number`.

**Note on testing:** the engine is audio-bound (no harness). The band/bar logic is unit-tested in Task 2. Verify by `npm run lint` clean + the full suite green. Do NOT create an engine test file.

- [ ] **Step 1: Import the helpers**

Add `bandBounds` and `barIndexAt` to the existing import from `./boardSequencerScale`.

- [ ] **Step 2: Add the config field**

In `BoardEngineConfig`, add after the `pingPong?: boolean;` line (make it optional, so the screen constructor need not pass it until Task 4):

```ts
  /** Spatial halves: play the board as bar 1 (top band) then bar 2 (bottom band). */
  spatialHalves?: boolean;
```

- [ ] **Step 3: Add the live setter + current-bar getter**

Add next to `setPingPong` / `getPlayheadDirection`:

```ts
  /** Toggle spatial halves live (safe while running). */
  setSpatialHalves(on: boolean): void {
    this.cfg.spatialHalves = on;
  }

  /** Current bar for the overlay: 0 = top/bar 1, 1 = bottom/bar 2; 0 when spatial is off. */
  getCurrentBar(cols: number): number {
    if (!this.cfg.spatialHalves) return 0;
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return barIndexAt(beat, cols);
  }
```

- [ ] **Step 4: Let `chordStack` take a per-band row count**

Change the `chordStack` signature (currently `private chordStack(cell: ActiveCell, chord: BoardChord | null, axis: 'row' | 'col'): number[] {`) to add an optional `rows` param, and use it:

```ts
  private chordStack(
    cell: ActiveCell, chord: BoardChord | null, axis: 'row' | 'col', rows: number = this.cfg.rows,
  ): number[] {
    if (chord && chord.notes.length > 0) return chord.notes;
    const degree = axis === 'row' ? rows - 1 - cell.row : cell.col;
```

(Leave the rest of `chordStack` unchanged.)

- [ ] **Step 5: Per-band `fireStep`**

In `fireStep`, immediately AFTER the line:

```ts
    const playCells = this.activeLoops.length > 0 ? [...cells, ...this.activeLoops.flat()] : cells;
```

add:

```ts
    // Spatial halves: play only the active bar's band this beat, with per-band pitch
    // (the band's own bottom row = lowest note, via pitchRows = band.end + 1). A true
    // no-op when off (band = null → pitchRows = cfg.rows, barCells = playCells).
    const spatial = this.cfg.spatialHalves ?? false;
    const band = spatial ? bandBounds(this.cfg.rows)[barIndexAt(beat, this.cfg.cols)] : null;
    const pitchRows = band ? band.end + 1 : this.cfg.rows;
    const barCells = band
      ? playCells.filter((c) => c.row >= band.start && c.row <= band.end)
      : playCells;
```

Then make these substitutions in the rest of `fireStep`:
- The melodic filter `const melodic = playCells.filter(...)` → `const melodic = barCells.filter(...)`.
- `voicingForCells(melodic, ..., 'row', this.cfg.rows)` → `voicingForCells(melodic, ..., 'row', pitchRows)`.
- The play loop header `for (const cell of playCells) {` → `for (const cell of barCells) {`.
- The polyrhythm column check's ping-pong arg: `this.cfg.pingPong ?? false` → `spatial ? false : (this.cfg.pingPong ?? false)`.
- The variation gate's paging arg: `this.cfg.numPages` → `spatial ? 2 : this.cfg.numPages`.
- The drum: `drumForRow(cell.row, this.cfg.rows, DEFAULT_DRUM_ROWS)` → `drumForRow(cell.row, pitchRows, DEFAULT_DRUM_ROWS)`.
- The bass degree: `const degree = this.cfg.rows - 1 - cell.row;` → `const degree = pitchRows - 1 - cell.row;`.
- The chord stab: `this.chordStack(cell, chord, 'row')` → `this.chordStack(cell, chord, 'row', pitchRows)`.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (single-fork fallback if it crashes)
Expected: PASS (the band/bar logic is covered by Task 2; nothing else regressed).

- [ ] **Step 7: Commit**

```bash
git add src/songs/BoardSequencerEngine.ts
git commit -m "feat(board-sequencer): engine plays two bars with per-band pitch (spatial halves)"
```

---

### Task 4: Screen — toggle, engine wiring, precedence

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (engine construction; rAF live-push; loop-bank precedence; the toggle + hints)

**Interfaces:**
- Consumes: `cfg.spatialHalves` (Task 1); `engine.setSpatialHalves` (Task 3).

**Note on testing:** React/canvas UI, no harness. Do NOT write a UI test. Verify by `npm run lint` clean + full suite green.

- [ ] **Step 1: Pass `spatialHalves` into the engine construction**

In the `new BoardSequencerEngine({ ... })` object, add `spatialHalves: cfg.spatialHalves,` (near `pingPong: cfg.pingPong,`).

- [ ] **Step 2: Push it live each frame**

In the rAF loop, next to the existing `engineRef.current?.setPingPong(cfg.pingPong);`, add:

```ts
          engineRef.current?.setSpatialHalves(cfg.spatialHalves);
```

- [ ] **Step 3: Precedence over loop bank**

In the rAF running block, change the loop-bank guard so spatial halves takes precedence — replace:

```ts
            if (cfg.loopBankEnabled) {
```

with:

```ts
            if (cfg.loopBankEnabled && !cfg.spatialHalves) {
```

(When spatial is on, the loop-bank branch is skipped, so the `else` branch feeds `setActiveCells(res.activeCells)` + `setActiveLoops([])` — loop bank off. Ping-pong + variation precedence is handled engine-side in Task 3.)

- [ ] **Step 4: Add the toggle + hints**

Near the Ping-pong / Loop bank / Variation toggles, add:

```tsx
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox" checked={config.spatialHalves}
                onChange={(e) => update({ spatialHalves: e.target.checked })}
              />
              Spatial halves (top = bar 1, bottom = bar 2)
            </label>
            {config.spatialHalves && (config.loopBankEnabled || config.pingPong) && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Spatial halves is on — turn it off to use Loop bank / Ping-pong.
              </span>
            )}
            {config.spatialHalves && config.rows < 8 && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Works best with 8 rows (each bar gets {Math.ceil(config.rows / 2)} pitches now).
              </span>
            )}
```

- [ ] **Step 5: Typecheck, full suite, manual verify**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (single-fork fallback if it crashes)
Expected: PASS.

Manual (human, `npm run dev` → Board Sequencer, calibrate, start):
- [ ] With **Spatial halves off**: unchanged.
- [ ] Turn it **on**: bar 1 plays the top band for 8 beats, then bar 2 plays the bottom band for 8 beats, repeating.
- [ ] Both bars sit in the **same register** (each band's own bottom row is the lowest note).
- [ ] With Loop bank or Ping-pong also on, the hint appears and those modes don't take effect.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): spatial-halves toggle + engine wiring + precedence"
```

---

### Task 5: Screen — divider, dimmed band, Bar cue

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (`drawOverlay` signature + body; compute `spatialBar`; import `bandBounds`)

**Interfaces:**
- Consumes: `engine.getCurrentBar` (Task 3), `bandBounds` (Task 2), `cfg.spatialHalves` (Task 1).

**Note on testing:** UI, no harness. Do NOT write a UI test. Verify by `npm run lint` + full suite green + manual.

- [ ] **Step 1: Import `bandBounds`**

Add `bandBounds` to the existing `../../songs/boardSequencerScale` import in the screen.

- [ ] **Step 2: Compute the active bar and pass it to `drawOverlay`**

In the rAF loop, near where `pingDir` is computed, add:

```ts
          const spatialBar = runningRef.current && engineRef.current && cfg.spatialHalves
            ? engineRef.current.getCurrentBar(cfg.cols)
            : null;
```

Add a final `spatialBar: number | null` parameter to the `drawOverlay` callback signature (after the existing final param), and pass `spatialBar` as the last argument in the `drawOverlay(...)` call.

- [ ] **Step 3: Dim the inactive band + draw the divider (inside the per-cell loop and after it)**

Inside the per-cell loop, just before the shared `ctx.stroke()` that closes each cell, dim cells not in the active band:

```ts
          if (spatialBar !== null) {
            const bands = bandBounds(cfg.rows);
            const activeBand = bands[spatialBar];
            if (r < activeBand.start || r > activeBand.end) {
              ctx.save();
              ctx.fillStyle = 'rgba(0,0,0,0.35)';
              ctx.fill();
              ctx.restore();
            }
          }
```

After the row/col loops close (near where the A/B letter + arrow are drawn), draw the divider line + Bar label:

```ts
      if (spatialBar !== null) {
        const bands = bandBounds(cfg.rows);
        const yUnit = (bands[0].end + 1) / cfg.rows; // divider between the two bands
        const a = toPx(0, yUnit);
        const b = toPx(1, yUnit);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(`Bar ${spatialBar + 1}`, 12, 54);
        ctx.restore();
      }
```

(`toPx` is the existing unit→pixel helper used inside `drawOverlay`; the divider is drawn at the unit-y boundary between the bands. `drawOverlay`'s `useCallback` deps stay `[]`.)

- [ ] **Step 4: Typecheck, full suite, manual verify**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (single-fork fallback if it crashes)
Expected: PASS.

Manual (human):
- [ ] With Spatial halves on: a divider line splits the board; the active bar's band is bright and the other is dimmed, swapping each bar; a "Bar 1 / Bar 2" label tracks the current bar.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): spatial-halves overlay (divider, dimmed band, Bar cue)"
```

---

## Self-Review

**Spec coverage:**
- Two bands, top = bar 1 / bottom = bar 2, sequential 2×cols loop → Task 2 (`bandBounds`, `barIndexAt`) + Task 3 (`fireStep` bar/band filter). ✓
- Per-band full pitch range (band's bottom row = lowest) → Task 3 `pitchRows = band.end + 1` applied to voicing/bass/chord/drum. ✓
- Off = true no-op → Task 3 (`band = null` path) + Task 1 default false. ✓
- Precedence: ping-pong bypass + variation inert (`2`) engine-side; loop bank skipped screen-side → Tasks 3 + 4. ✓
- Visuals: divider, dimmed inactive band, Bar cue; hints (conflict + 8-rows) → Tasks 4 + 5. ✓
- Persistence, off by default → Task 1. ✓

**Placeholder scan:** No TBD/TODO; complete code + exact commands throughout. ✓

**Type consistency:** `bandBounds(rows): [Band, Band]` and `barIndexAt(beat, cols)` defined in Task 2, used in Task 3 + Task 5; `spatialHalves` consistent across `BoardSequencerStored` (T1), `BoardEngineConfig` (T3), screen (T4/T5); `setSpatialHalves`/`getCurrentBar` defined T3, called T4/T5; `chordStack`'s new optional `rows` matches its T3 call site. ✓

**Known v1 limitations (intentional):** exactly two bands; one structure mode at a time (precedence); both bars `cols` beats; variation-across-bars deferred — all documented scope guards.
