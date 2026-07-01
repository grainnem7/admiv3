# Board Sequencer — Loop Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tangible loop-station on the board: with "Loop bank" on, the bottom row becomes save/recall slots — drop a counter on an empty slot to capture the current pattern, remove it to pause, re-place to resume — and active slots layer on top of the live pattern, all in sync.

**Architecture:** All the capture/pause/recall logic lives in one pure, unit-tested state machine (`loopBank.ts`). The engine gains `setActiveLoops` and concatenates active loop cells into its per-step play path (pitch is per-row-absolute, so layering is a safe concat). Config persists the saved slots + an enable flag. The screen partitions each frame's settled cells into pattern (above the bottom row) and bank presence (bottom row), runs the state machine, feeds the engine, and draws bank-slot states + on-screen mini-views.

**Tech Stack:** React 19 + TypeScript (strict) + Vite + Tone.js. Tests: Vitest. Typecheck: `npm run lint` (= `tsc --noEmit`).

## Global Constraints

- TypeScript strict mode — **no `any` types**.
- All Tone.js access stays inside the engine; never instantiate Tone in components.
- Latency budget: per-frame work stays O(cells); no allocation-heavy work beyond the small per-slot arrays.
- Off by default: `loopBankEnabled` defaults to `false`; with the bank off, behaviour is exactly as today (bottom row is a normal pattern row).
- **Bank cells never sound** — when the bank is on, cells in the bottom row (`row === rows-1`) are triggers, excluded from the pattern fed to the engine.
- **Empty slot vs saved-empty loop are distinct:** a slot is `null` (never saved, can capture) or an array (saved — possibly `[]` for an empty capture — recalls, cannot re-capture without Clear). Persistence must preserve `null`.
- Capture fires only on a **rising edge** (absent→present) of an **empty** slot; a counter on a full slot recalls, removal pauses (snapshot kept).
- Saved loops carry each cell's slice-1 `conditional` flag and **ride the shared playhead** (they inherit ping-pong + the variation gate); no independent per-loop tempo/length.
- Single-page only (`numPages = 1`) — Pages interaction deferred.

**Spec:** `docs/superpowers/specs/2026-06-30-board-sequencer-loop-bank-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/songs/loopBank.ts` | Pure capture/recall/layer state machine | **Create** |
| `src/profiles/BoardSequencerConfig.ts` | Persisted config | Modify: `StoredLoopCell`, `loopBankEnabled`, `loopSlots`, `sanitizeLoopSlots` |
| `src/songs/BoardSequencerEngine.ts` | Audio engine | Modify: `activeLoops` + `setActiveLoops` + `fireStep` concat |
| `src/ui/screens/BoardSequencerScreen.tsx` | Camera loop, overlay, controls | Modify: partition + state machine + engine feed + toggle (Task 4); bank overlay + mini-views + Clear (Task 5) |
| `src/ui/components/board/LoopBankView.tsx` | On-screen slot mini-views + Clear | **Create** (Task 5) |
| `src/__tests__/loopBank.test.ts` | — | **Create** |
| `src/__tests__/BoardSequencerConfig.test.ts` | — | Add loop-bank persistence tests |

Task order by dependency: 1 (state machine) → 2 (config) → 3 (engine) → 4 (screen behaviour) → 5 (screen visuals).

**Test-runner note (whole plan):** the sandbox's default vitest multi-worker pool can crash (`spawn UNKNOWN` / OOM — environment, not code). If `npm run test:run` crashes, run `npx vitest run --pool=forks --poolOptions.forks.singleFork=true` and report that. A focused `npx vitest run <file>` is fine for single-file TDD.

---

### Task 1: Pure loop-bank state machine

**Files:**
- Create: `src/songs/loopBank.ts`
- Test: `src/__tests__/loopBank.test.ts`

**Interfaces:**
- Consumes: `ActiveCell` type from `../tracking/BoardSequencerMode` (`{ row, col, colour, conditional? }`).
- Produces:
  - `interface LoopBankState { saved: (ActiveCell[] | null)[]; present: boolean[]; }`
  - `interface LoopBankStep { state: LoopBankState; active: ActiveCell[][]; captured: number[]; }`
  - `emptyLoopBank(slotCount: number): LoopBankState`
  - `stepLoopBank(prev: LoopBankState, present: boolean[], patternCells: ActiveCell[], slotCount: number): LoopBankStep`
  - `clearLoopSlot(state: LoopBankState, slot: number): LoopBankState`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/loopBank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyLoopBank, stepLoopBank, clearLoopSlot } from '../songs/loopBank';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const pat = (col: number): ActiveCell[] => [{ row: 0, col, colour: 'red' }];

describe('loopBank', () => {
  it('emptyLoopBank: N empty slots, none present', () => {
    const s = emptyLoopBank(3);
    expect(s.saved).toEqual([null, null, null]);
    expect(s.present).toEqual([false, false, false]);
  });

  it('captures the pattern on a rising edge of an empty slot', () => {
    const r = stepLoopBank(emptyLoopBank(2), [true, false], pat(2), 2);
    expect(r.captured).toEqual([0]);
    expect(r.state.saved[0]).toEqual(pat(2));
    expect(r.active).toEqual([pat(2)]);
  });

  it('does not re-capture while a counter stays on a full slot (recall only)', () => {
    const s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    const r = stepLoopBank(s, [true], pat(5), 1); // still present, different board
    expect(r.captured).toEqual([]);
    expect(r.state.saved[0]).toEqual(pat(2)); // unchanged
    expect(r.active).toEqual([pat(2)]);
  });

  it('pauses on removal (snapshot kept, not active)', () => {
    const s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    const r = stepLoopBank(s, [false], [], 1);
    expect(r.active).toEqual([]);
    expect(r.state.saved[0]).toEqual(pat(2));
  });

  it('resumes on re-place without re-recording', () => {
    let s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    s = stepLoopBank(s, [false], [], 1).state; // pause
    const r = stepLoopBank(s, [true], pat(9), 1); // re-place, new board pattern
    expect(r.captured).toEqual([]);
    expect(r.active).toEqual([pat(2)]); // resumes the ORIGINAL
  });

  it('clearLoopSlot empties a slot; re-record needs a fresh rising edge', () => {
    let s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    s = clearLoopSlot(s, 0);
    expect(s.saved[0]).toBeNull();
    const r = stepLoopBank(s, [true], pat(7), 1); // counter still present (no rising edge)
    expect(r.captured).toEqual([]); // does NOT re-capture until lifted + replaced
  });

  it('captures the conditional flag with the pattern', () => {
    const cells: ActiveCell[] = [{ row: 1, col: 3, colour: 'red', conditional: true }];
    const r = stepLoopBank(emptyLoopBank(1), [true], cells, 1);
    expect(r.state.saved[0]?.[0].conditional).toBe(true);
  });

  it('slots are independent', () => {
    const s = stepLoopBank(emptyLoopBank(2), [true, false], pat(1), 2).state;
    const r = stepLoopBank(s, [true, true], pat(4), 2); // slot 1 rising → capture
    expect(r.captured).toEqual([1]);
    expect(r.active).toEqual([pat(1), pat(4)]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/loopBank.test.ts`
Expected: FAIL — module `../songs/loopBank` does not exist (import error).

- [ ] **Step 3: Implement the state machine**

Create `src/songs/loopBank.ts`:

```ts
/**
 * Loop bank — the pure state machine behind the tangible save/recall/layer feature.
 * No audio, no DOM. The screen partitions each frame's settled cells into the live
 * pattern and the bottom-row "bank" slots, then calls stepLoopBank.
 *
 * A slot is EMPTY (`saved[i] === null`) or FULL (an array, possibly `[]`). Placing a
 * counter on an empty slot (rising edge of presence) CAPTURES the current pattern; a
 * counter on a full slot plays it (recall); removing the counter pauses it (snapshot
 * kept). clearLoopSlot empties a slot. Only slots with a counter present AND a saved
 * loop are "active" (layered).
 */

import type { ActiveCell } from '../tracking/BoardSequencerMode';

export interface LoopBankState {
  /** Saved loop per slot; null = empty (never saved). Index = slot (bottom-row column). */
  saved: (ActiveCell[] | null)[];
  /** Whether a counter was on each slot last frame (for rising-edge capture). */
  present: boolean[];
}

export interface LoopBankStep {
  state: LoopBankState;
  /** Snapshots of currently active (present + full) slots, to layer. */
  active: ActiveCell[][];
  /** Slot indices that captured this frame (rising edge on an empty slot). */
  captured: number[];
}

/** A fresh, all-empty bank for `slotCount` slots. */
export function emptyLoopBank(slotCount: number): LoopBankState {
  const n = Math.max(0, Math.floor(slotCount));
  return { saved: Array(n).fill(null), present: Array(n).fill(false) };
}

/**
 * Advance the bank one frame. `present[i]` = a settled counter sits on slot i now;
 * `patternCells` = the current settled pattern (already excluding the bank row).
 * Capture fires only on a rising edge (absent→present) of an EMPTY slot.
 */
export function stepLoopBank(
  prev: LoopBankState,
  present: boolean[],
  patternCells: ActiveCell[],
  slotCount: number,
): LoopBankStep {
  const n = Math.max(0, Math.floor(slotCount));
  const saved: (ActiveCell[] | null)[] = [];
  const nextPresent: boolean[] = [];
  const active: ActiveCell[][] = [];
  const captured: number[] = [];
  for (let i = 0; i < n; i++) {
    const here = present[i] === true;
    const was = prev.present[i] === true;
    let slot = prev.saved[i] ?? null;
    if (here && !was && slot === null) {
      slot = patternCells.map((c) => ({ ...c })); // capture a copy
      captured.push(i);
    }
    saved[i] = slot;
    nextPresent[i] = here;
    if (here && slot !== null) active.push(slot);
  }
  return { state: { saved, present: nextPresent }, active, captured };
}

/** Empty a slot (the screen Clear button); returns a new state (present unchanged). */
export function clearLoopSlot(state: LoopBankState, slot: number): LoopBankState {
  if (slot < 0 || slot >= state.saved.length) return state;
  const saved = state.saved.slice();
  saved[slot] = null;
  return { saved, present: state.present.slice() };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/loopBank.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/songs/loopBank.ts src/__tests__/loopBank.test.ts
git commit -m "feat(board-sequencer): pure loop-bank state machine (capture/pause/recall)"
```

---

### Task 2: Persist loop bank config

**Files:**
- Modify: `src/profiles/BoardSequencerConfig.ts`
- Test: `src/__tests__/BoardSequencerConfig.test.ts`

**Interfaces:**
- Produces: `StoredLoopCell` (`{ row: number; col: number; colour: ColourId; conditional?: boolean }`); `BoardSequencerStored.loopBankEnabled: boolean` (default `false`); `BoardSequencerStored.loopSlots: (StoredLoopCell[] | null)[]` (default `[]`).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('BoardSequencerConfig', ...)` block in `src/__tests__/BoardSequencerConfig.test.ts`:

```ts
  it('round-trips loop bank enabled + slots (null slot + conditional preserved)', () => {
    const cfg: BoardSequencerStored = {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      loopBankEnabled: true,
      loopSlots: [[{ row: 1, col: 2, colour: 'red', conditional: true }], null],
    };
    saveBoardSequencerConfig(cfg);
    const back = loadBoardSequencerConfig();
    expect(back?.loopBankEnabled).toBe(true);
    expect(back?.loopSlots[0]).toEqual([{ row: 1, col: 2, colour: 'red', conditional: true }]);
    expect(back?.loopSlots[1]).toBeNull();
  });

  it('defaults loop bank off / empty when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    const back = loadBoardSequencerConfig();
    expect(back?.loopBankEnabled).toBe(false);
    expect(back?.loopSlots).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: FAIL — `loopBankEnabled` / `loopSlots` are undefined (and TS flags the unknown props on the literal).

- [ ] **Step 3: Add the type, fields, default, and sanitiser**

In `src/profiles/BoardSequencerConfig.ts`:

Add the cell type right after the `StoredBoardCell` interface:

```ts
/** A single cell of a saved loop (StoredBoardCell + the slice-1 variation flag). */
export interface StoredLoopCell {
  row: number;
  col: number;
  colour: ColourId;
  conditional?: boolean;
}
```

Add to the `BoardSequencerStored` interface, right after the `pingPong: boolean;` line:

```ts
  /** Loop bank: the bottom row becomes save/recall slots for layered loops. */
  loopBankEnabled: boolean;
  /** Saved loops per slot (bottom-row column); null = empty slot. */
  loopSlots: (StoredLoopCell[] | null)[];
```

Add to `DEFAULT_BOARD_SEQUENCER_CONFIG`, right after the `pingPong: false,` line:

```ts
  loopBankEnabled: false,
  loopSlots: [],
```

Add this sanitiser next to `sanitizePages` (mirrors it, but keeps `null` slots and the `conditional` flag):

```ts
function sanitizeLoopSlots(v: unknown): (StoredLoopCell[] | null)[] {
  if (!Array.isArray(v)) return [];
  return v.map((slot) => {
    if (!Array.isArray(slot)) return null; // null = empty (never-saved) slot
    return slot.flatMap((c) => {
      const o = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
      if (!isNum(o.row) || !isNum(o.col) || typeof o.colour !== 'string' || !o.colour) return [];
      const cell: StoredLoopCell = { row: o.row, col: o.col, colour: o.colour };
      if (o.conditional === true) cell.conditional = true;
      return [cell];
    });
  });
}
```

Add to the object returned by `sanitize`, right after the `pingPong: o.pingPong === true,` line:

```ts
    loopBankEnabled: o.loopBankEnabled === true,
    loopSlots: sanitizeLoopSlots(o.loopSlots),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: PASS (new tests + existing).

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/profiles/BoardSequencerConfig.ts src/__tests__/BoardSequencerConfig.test.ts
git commit -m "feat(board-sequencer): persist loop bank slots + enable flag"
```

---

### Task 3: Engine layers active loops

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts` (field + `setActiveLoops` near `setActiveCells` ~L206; `fireStep` ~L510/515/527)

**Interfaces:**
- Consumes: `ActiveCell` (already imported in the engine).
- Produces: `BoardSequencerEngine.setActiveLoops(loops: ActiveCell[][]): void`.

**Note on testing:** the engine is audio-bound (Tone.js / AudioContext) with no unit-test harness. Layering is a concat of already-tested cell data; verify by `npm run lint` clean + the full suite green. Do NOT create an engine test file.

- [ ] **Step 1: Add the field + setter**

In `src/songs/BoardSequencerEngine.ts`, add a field alongside the other private state (near `private active: ActiveCell[] = [];`):

```ts
  // Layered loops from the loop bank; each plays on top of the live pattern.
  private activeLoops: ActiveCell[][] = [];
```

Add the setter immediately after `setActiveCells` (after its closing brace ~L209):

```ts
  /** Set the layered loops (from the loop bank) that play atop the live pattern. */
  setActiveLoops(loops: ActiveCell[][]): void {
    this.activeLoops = loops;
  }
```

- [ ] **Step 2: Concat active loops into the play set in `fireStep`**

In `fireStep`, immediately after the line:

```ts
    const cells = page === this.selectedPage ? this.active : (this.pages[page] ?? []);
```

add:

```ts
    // Loop bank: active saved loops layer on top of the live/page cells. Pitch is
    // per-row-absolute, so a plain concat never disturbs voicing.
    const playCells = this.activeLoops.length > 0 ? [...cells, ...this.activeLoops.flat()] : cells;
```

Then change the melodic filter from `cells.filter(` to `playCells.filter(`:

```ts
    const melodic = playCells.filter((c) => {
      const r = this.roleFor(c.colour);
      return (r === 'melody' || r === 'chord') && this.voiceByChannel.has(c.colour);
    });
```

And change the play loop header from `for (const cell of cells) {` to:

```ts
    for (const cell of playCells) {
```

(Leave every other line in `fireStep` unchanged — polyrhythm, variation gate, humanize, drums, bass, chord all operate per `cell` exactly as before.)

- [ ] **Step 3: Typecheck + full suite**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (if it crashes: `npx vitest run --pool=forks --poolOptions.forks.singleFork=true`)
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/songs/BoardSequencerEngine.ts
git commit -m "feat(board-sequencer): engine layers active loop-bank loops"
```

---

### Task 4: Screen — bank behaviour (partition, state machine, engine feed, toggle)

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (import; a `loopBankRef`; a `persistLoopSlots` callback; init on start; the rAF running block ~L442-451; the controls)

**Interfaces:**
- Consumes: `emptyLoopBank` / `stepLoopBank` + `LoopBankState` (Task 1); `cfg.loopBankEnabled` / `cfg.loopSlots` (Task 2); `engine.setActiveLoops` (Task 3).

**Note on testing:** React/canvas UI, no harness. Do NOT write a UI test. Verify by `npm run lint` clean + full suite green. Manual camera checklist is for the human.

- [ ] **Step 1: Imports + ref**

Add the import near the other `songs` imports:

```ts
import { emptyLoopBank, stepLoopBank, type LoopBankState } from '../../songs/loopBank';
```

Add a ref alongside the other refs (near `activeCellsRef`):

```ts
  const loopBankRef = useRef<LoopBankState>(emptyLoopBank(0));
```

- [ ] **Step 2: A persist callback for saved slots**

Add near the other `useCallback`s (e.g. beside `capturePage`):

```ts
  // Persist the loop bank's saved slots into config (called when a slot captures or clears).
  const persistLoopSlots = useCallback((saved: (ActiveCell[] | null)[]) => {
    setConfig((prev) => {
      const loopSlots = saved.map((s) => (s == null
        ? null
        : s.map((c) => (c.conditional
          ? { row: c.row, col: c.col, colour: c.colour, conditional: true as const }
          : { row: c.row, col: c.col, colour: c.colour }))));
      const next = { ...prev, loopSlots };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);
```

- [ ] **Step 3: Initialise the bank from saved slots on start**

In the start handler (where `modeRef.current = new BoardSequencerMode(...)` and the engine are created), after the engine is constructed, seed the bank from the saved config:

```ts
    loopBankRef.current = {
      saved: Array.from({ length: cfg.cols }, (_, i) => {
        const s = cfg.loopSlots[i];
        return s == null ? null : s.map((c) => ({ ...c }));
      }),
      present: Array(cfg.cols).fill(false),
    };
    engine.setActiveLoops([]);
```

(`cfg` is the local `configRef.current` already read in that handler; if the handler names it differently, use that name.)

- [ ] **Step 4: Partition + run the state machine in the rAF loop**

In the running block, replace the current body:

```ts
          if (runningRef.current && modeRef.current && engineRef.current) {
            const res = modeRef.current.step(readings, dt, now);
            engineRef.current.setActiveCells(res.activeCells);
            activeCellsRef.current = res.activeCells;
            if (res.justSettled.length > 0) engineRef.current.fireTick();
            activeArr = res.activeCells;
            for (const c of res.activeCells) activeMap.set(`${c.row},${c.col}`, c.colour);
            // Ask the engine for the live playhead so it follows a tempo fader.
            playCol = engineRef.current.getPlayheadCol(cfg.cols);
          }
```

with:

```ts
          if (runningRef.current && modeRef.current && engineRef.current) {
            const res = modeRef.current.step(readings, dt, now);
            if (cfg.loopBankEnabled) {
              // Bottom row = bank slots (triggers, not notes); rows above = pattern.
              const bankRow = cfg.rows - 1;
              const patternCells = res.activeCells.filter((c) => c.row < bankRow);
              const present = Array.from({ length: cfg.cols }, (_, i) =>
                res.activeCells.some((c) => c.row === bankRow && c.col === i));
              const stepped = stepLoopBank(loopBankRef.current, present, patternCells, cfg.cols);
              loopBankRef.current = stepped.state;
              if (stepped.captured.length > 0) persistLoopSlots(stepped.state.saved);
              engineRef.current.setActiveCells(patternCells);
              engineRef.current.setActiveLoops(stepped.active);
              activeCellsRef.current = patternCells;
              activeArr = patternCells;
              for (const c of patternCells) activeMap.set(`${c.row},${c.col}`, c.colour);
            } else {
              engineRef.current.setActiveCells(res.activeCells);
              engineRef.current.setActiveLoops([]);
              activeCellsRef.current = res.activeCells;
              activeArr = res.activeCells;
              for (const c of res.activeCells) activeMap.set(`${c.row},${c.col}`, c.colour);
            }
            if (res.justSettled.length > 0) engineRef.current.fireTick();
            // Ask the engine for the live playhead so it follows a tempo fader.
            playCol = engineRef.current.getPlayheadCol(cfg.cols);
          }
```

- [ ] **Step 5: Add the Loop bank toggle to the controls**

Near the Ping-pong / Variation toggles, add (matching the surrounding `config` + `update({...})` pattern):

```tsx
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox" checked={config.loopBankEnabled}
                onChange={(e) => update({ loopBankEnabled: e.target.checked })}
              />
              Loop bank (bottom row = save/recall slots)
            </label>
```

- [ ] **Step 6: Typecheck, full suite, manual verify**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (fallback single-fork as noted)
Expected: PASS (no regressions).

Manual (human, `npm run dev` → Board Sequencer, calibrate, start):
- [ ] With **Loop bank off**: unchanged — the bottom row plays as normal pattern.
- [ ] Turn **Loop bank on**. Lay a pattern above the bottom row; drop a counter on an empty bottom-row slot → the pattern is captured and keeps looping.
- [ ] Sweep the pattern away, lay a new one, save to another slot → both loops play layered.
- [ ] Remove a slot's counter → that loop pauses; replace it → it resumes (no re-record).
- [ ] Reload the page, start again → saved slots are still there (recall by placing a counter).

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): loop bank capture/pause/recall wired to the board"
```

---

### Task 5: Screen — bank overlay states + mini-views + Clear

**Files:**
- Create: `src/ui/components/board/LoopBankView.tsx`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (`drawOverlay` bank styling; a `bankSlots` computation; render `LoopBankView`; a Clear handler)

**Interfaces:**
- Consumes: `clearLoopSlot` (Task 1), `cfg.loopSlots` / `loopBankRef` (Task 4).
- Produces: `LoopBankView` React component.

**Note on testing:** UI, no harness. Do NOT write a UI test. Verify by `npm run lint` + full suite green + manual.

- [ ] **Step 1: Create the mini-view component**

Create `src/ui/components/board/LoopBankView.tsx`:

```tsx
import type { StoredLoopCell } from '../../../profiles/BoardSequencerConfig';

/** One slot's state for the mini-view. */
export interface LoopSlotView {
  /** Saved cells, or null if the slot is empty. */
  cells: StoredLoopCell[] | null;
  /** A counter is on the slot right now (playing). */
  active: boolean;
}

/**
 * On-screen mini-views of the loop bank: one thumbnail per slot showing its captured
 * pattern (coloured dots), bordered when active, dimmed when paused. Guarantees every
 * layer stays visible even though the physical grid only shows the live pattern.
 */
export default function LoopBankView({
  slots, rows, cols, swatchById, onClear,
}: {
  slots: LoopSlotView[];
  rows: number;
  cols: number;
  swatchById: Map<string, string>;
  onClear: (slot: number) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {slots.map((slot, i) => {
        const filled = slot.cells != null;
        const dot = new Map<string, string>();
        for (const c of slot.cells ?? []) dot.set(`${c.row},${c.col}`, swatchById.get(c.colour) ?? '#888');
        return (
          <div
            key={i}
            style={{
              display: 'flex', flexDirection: 'column', gap: 3, padding: 4, borderRadius: 4,
              border: `2px solid ${slot.active ? 'rgba(80,200,255,0.95)' : '#ffffff22'}`,
              opacity: filled ? (slot.active ? 1 : 0.55) : 0.3,
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.7 }}>Slot {i + 1}</span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 6px)`,
                gridTemplateRows: `repeat(${rows}, 6px)`,
                gap: 1,
              }}
            >
              {Array.from({ length: rows * cols }, (_, k) => {
                const r = Math.floor(k / cols);
                const c = k % cols;
                const hex = dot.get(`${r},${c}`);
                return (
                  <div key={k} style={{ width: 6, height: 6, background: hex ?? '#ffffff10', borderRadius: 1 }} />
                );
              })}
            </div>
            <button
              type="button" disabled={!filled} onClick={() => onClear(i)}
              style={{ fontSize: 10, opacity: filled ? 0.8 : 0.3 }}
            >
              Clear
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Bank-slot styling in `drawOverlay`**

Add a `bankSlots: (null | 'empty' | 'paused' | 'active')[] | null` parameter to the `drawOverlay` callback signature (after the existing `pingDir` param). Inside the per-cell loop, when `bankSlots` is non-null and this is the bottom row, override the cell's stroke/fill by slot state. Add this just before the existing `ctx.stroke();` that closes each cell:

```ts
          if (bankSlots && r === cfg.rows - 1) {
            const st = bankSlots[c];
            if (st === 'active') { ctx.fillStyle = 'rgba(80,200,255,0.5)'; ctx.fill(); }
            else if (st === 'paused') { ctx.fillStyle = 'rgba(80,200,255,0.18)'; ctx.fill(); }
            // 'empty' → leave as outline only
            ctx.strokeStyle = 'rgba(80,200,255,0.8)';
            ctx.lineWidth = 2;
          }
```

- [ ] **Step 3: Compute `bankSlots` and thread it into the draw call**

In the rAF loop, after the running block, compute the bank slot states from the live bank ref:

```ts
          const bankSlots = cfg.loopBankEnabled
            ? Array.from({ length: cfg.cols }, (_, i) => {
                const saved = loopBankRef.current.saved[i];
                if (saved == null) return 'empty' as const;
                return loopBankRef.current.present[i] ? ('active' as const) : ('paused' as const);
              })
            : null;
```

Then add `bankSlots` as the final argument to the existing `drawOverlay(...)` call.

- [ ] **Step 4: A Clear handler + render the mini-views**

Add a Clear handler near `persistLoopSlots`:

```ts
  const clearLoopSlotAt = useCallback((slot: number) => {
    loopBankRef.current = clearLoopSlot(loopBankRef.current, slot);
    persistLoopSlots(loopBankRef.current.saved);
  }, [persistLoopSlots]);
```

Add `clearLoopSlot` to the `../../songs/loopBank` import.

Render the mini-views inside the controls, only when the bank is enabled (map `config.loopSlots` to `LoopSlotView[]`, padding to `config.cols` slots so empty slots still show):

```tsx
            {config.loopBankEnabled && (
              <LoopBankView
                rows={config.rows}
                cols={config.cols}
                swatchById={new Map(config.channels.map((c) => [c.id, c.swatch]))}
                onClear={clearLoopSlotAt}
                slots={Array.from({ length: config.cols }, (_, i) => ({
                  cells: config.loopSlots[i] ?? null,
                  active: loopBankRef.current.present[i] === true && (config.loopSlots[i] ?? null) != null,
                }))}
              />
            )}
```

Add the import at the top:

```ts
import LoopBankView from '../components/board/LoopBankView';
```

- [ ] **Step 5: Typecheck, full suite, manual verify**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (fallback single-fork as noted)
Expected: PASS (no regressions).

Manual (human):
- [ ] With Loop bank on: the bottom-row slots show **outline** (empty), **dim fill** (saved but paused), **bright fill** (active) as you place/remove counters.
- [ ] The on-screen mini-views show each saved loop's dots, lit/bordered when active, dimmed when paused.
- [ ] **Clear** on a mini-view empties that slot; lifting + replacing the counter re-records it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/board/LoopBankView.tsx src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): loop bank overlay states + mini-views + clear"
```

---

## Self-Review

**Spec coverage:**
- Capture/pause/recall/clear semantics → Task 1 (state machine, all transitions tested). ✓
- Bottom-row bank, cells don't sound, pattern excludes bank row → Task 4 partition (`row < rows-1`). ✓
- Layered playback riding the shared playhead + variation → Task 3 concat (per-cell path unchanged, so `firesThisLapPaged`/ping-pong apply to loop cells). ✓
- Persistence incl. `conditional` + null slots, off by default → Task 2 (`sanitizeLoopSlots`, defaults). ✓
- Visual: bank overlay states + mini-views + Clear → Task 5. ✓
- Single-page guard → no page code touched; loops layer on the live/selected page only. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code + exact commands. ✓

**Type consistency:** `LoopBankState`/`stepLoopBank`/`clearLoopSlot`/`emptyLoopBank` identical across Task 1 (def), Task 4/5 (use). `ActiveCell[]` (state machine, engine) ↔ `StoredLoopCell[]` (config) are structurally compatible (`{row,col,colour,conditional?}`); the persist callback maps between them explicitly. `loopSlots: (StoredLoopCell[] | null)[]` consistent across Task 2/4/5. `setActiveLoops(ActiveCell[][])` defined Task 3, called Task 4. ✓

**Known v1 limitations (intentional):** single-page only; bank = bottom row (pattern loses its lowest row); loops ride the shared playhead (no independent length); Clear requires a fresh counter placement to re-record. All documented scope guards.
