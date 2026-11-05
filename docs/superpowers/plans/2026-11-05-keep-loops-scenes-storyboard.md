# Keep: loops, scenes and the storyboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One visible move, Keep, makes loops (on the Board) and scenes (in Make a piece); the piece is a storyboard of scene cards with a way in (fade / overlap / cut) between them; Tim's iPad silences his counters one colour at a time.

**Architecture:** The screen (`BoardSequencerScreen.tsx`) keeps every handler it has; the panel's transport row gains a `keep` slot that shows Keep as loop (Board) or Keep as scene (Make a piece). The loop rail hides its empty places. Make a piece's three-step panel is replaced by a full-width `Storyboard` under the board plus a `SceneEditor` in the panel; pure helpers in `src/songs/performance/storyboard.ts`. A scene gains `wayIn`; the engine's pending launch carries a per-launch way. The iPad protocol gains `colourSound`, `silentColours` and `colours`.

**Tech Stack:** React 19, TypeScript strict (no `any`), Vite, Tone.js (engine only), Vitest (`src/__tests__`, jsdom where noted), Playwright (`e2e/`, port 3105, temp `ADMI_DATA_DIR`, `--mute-audio`).

**Spec:** `docs/superpowers/specs/2026-11-05-keep-loops-scenes-storyboard-design.md`

## Global Constraints

- Never use port 3001, never touch `.admi-data`; Playwright's config already uses 3105 and a temporary folder.
- Ask the owner before committing (CLAUDE.md). Each task's commit step is "ask, then commit"; batch the asks per batch (K1…K4) if the owner prefers.
- Never commit `.claude/settings.local.json`, `public/rootCA.pem`, `e2e/repro-fade.e2e.ts` or `docs/research/`.
- Subagents: Opus or Sonnet only.
- Plain words everywhere the owner reads. Words kept: Loop, scene, piece, Keep, Show, Make my plan, Jump here now, Next scene, End piece, Energy (six levels: Off, Calm, Steady, Lively, Driving, Big), Check. One rename: "Rehearse from here" → "Hear from here".
- Rules kept: F1 one way to make a loop (New loop from silence under "… more" is the one exception); F2 the piece and a new loop never together; B13 ▶ Play never starts the piece; A3 nothing moves the board; A9 a control's name starts with its visible words; 44 px targets (`var(--bs-target)`); 14 px minimum text; state never by colour alone.
- Every state the iPad sets is "the state wanted, not a toggle".
- Tests run with `npx vitest run <file>` and `npx playwright test <file> -g "<name>"`; `npm run lint` is `tsc` over app and e2e and must stay clean at every commit.

## Review Focus

1. A saved piece from before `wayIn` existed, with the player's Loop fade at 0 or 2: it must sound at the show as it did (cut / fade 2), never "fade 1" by default. Test in Task 10.
2. A saved scene with no time (`at` undefined) in a piece that is full to the end: it must get no time, stay out of the clock, and Check must say so, never throw or land on another scene's time. Test in Task 5.
3. Keep as loop on the camera board (counters cannot vanish): the button must announce "Lift the counters and it plays on" and the handover must still fire; the laptop path must not run. Test in Task 2.
4. A hand press on the rail during the pass in which a scene's cut is pending: the cut must still be a cut (the way is inherited), not the player's fade. Test in Task 11.
5. Drums silenced on the iPad and a drum colour's pad pressed: Drums must come back everywhere and the colour sound; a second press must silence only that colour. Test in Task 14.

---

## K1 · Keep as loop

### Task 1: The rail shows only kept loops, plus one dashed place

**Files:**
- Modify: `src/ui/screens/boardSequencer/play/LoopRail.tsx`
- Test: `src/__tests__/LoopRail.test.tsx`

**Interfaces:**
- Consumes: `PieceLoop` (PieceSteps.tsx), `slotForKeep` (the screen passes its result).
- Produces: `LoopRailProps` gains `keepSlot: number | null` (the place the next Keep fills, from `slotForKeep`; null = every place full) and loses `newLoopReason`/`onNewLoop` as a button (both stay as props; New loop moves into the menu). Exports `railPlaces(loops: PieceLoop[], keepSlot: number | null): { kept: PieceLoop[]; dashed: PieceLoop | null }`: `kept` = loops whose `state !== 'empty'` in slot order; `dashed` = the loop at `keepSlot`, or null when `keepSlot` is null.

- [ ] **Step 1: Write the failing tests** (replace the first test and add three) in `LoopRail.test.tsx`:

```tsx
it('shows only the kept loops, in slot order, then one dashed place that keeps the board', () => {
  view = render(<LoopRail {...props({ keepSlot: 2 })} />);
  const ps = places();
  expect(ps.map((b) => b.textContent)).toEqual(['Bed■', 'Loop 2▶', '+ Keep as loop']);
  expect(ps[2].getAttribute('aria-label')).toBe('Keep as loop: keep the board as loop 3');
  expect(ps[0].getAttribute('aria-label')).toBe('Bed: loop 1, 5 notes, playing');
});
it('with no loops kept: the dashed place alone, and where loops come from', () => {
  view = render(<LoopRail {...props({ loops: loops().map((l) => ({ ...l, state: 'empty', cells: [] })), keepSlot: 0 })} />);
  expect(places().length).toBe(1);
  expect(view!.container.textContent).toContain('Loops you keep appear here.');
});
it('every place full: no dashed place; "… more" still opens with New loop from silence', () => {
  const p = props({ loops: loops().map((l) => ({ ...l, state: 'stopped', cells: [{ row: 1, col: 1, colour: 'c1' }] })), keepSlot: null });
  view = render(<LoopRail {...p} />);
  expect(places().length).toBe(8);
  act(() => (view!.get('button[aria-label^="More"]') as HTMLButtonElement).click());
  act(() => (view!.get('button[aria-label="New loop: from silence"]') as HTMLButtonElement).click());
  expect(p.onNewLoop).toHaveBeenCalled();
});
it('"… more" is never disabled for want of a loop: with none kept it holds New loop from silence only', () => {
  const p = props({ loops: loops().map((l) => ({ ...l, state: 'empty', cells: [] })), keepSlot: 0 });
  view = render(<LoopRail {...p} />);
  const more = view!.get('button[aria-label^="More"]') as HTMLButtonElement;
  expect(more.disabled).toBe(false);
  act(() => more.click());
  expect(view!.all('[role="group"][aria-label$=": more"] button').map((b) => b.textContent)).toEqual(['New loop']);
});
```
Update `props()` to include `keepSlot: 2`, and the existing keyboard test so arrows move over 3 places (2 kept + dashed), Home/End likewise. The test "an empty place keeps the board there" presses `places()[2]` (the dashed place) and expects `onKeep(2)`.

- [ ] **Step 2: Run to verify they fail**: `npx vitest run src/__tests__/LoopRail.test.tsx` — Expected: FAIL (8 places rendered; no "+ Keep as loop"; "… more" disabled).

- [ ] **Step 3: Implement** in `LoopRail.tsx`:
  - `export function railPlaces(...)` as in Interfaces.
  - Render `kept` tiles as now, each followed by a glyph span `■` (playing or starting) / `▶` (stopped or stopping), `aria-hidden`, so `textContent` reads "Bed■"; the aria-label is unchanged (`placeLabel`).
  - The dashed place: `data-loop-place={keepSlot}`, `aria-label={`Keep as loop: keep the board as loop ${keepSlot + 1}`}`, text "+ Keep as loop", `aria-disabled` and `title` from `locked ?? keepReason`; it calls `onKeep(keepSlot)`.
  - With `kept.length === 0`: the caption line "Loops you keep appear here." under the dashed place (14 px, `var(--bs-fg2)`).
  - Keyboard: `move()` runs over the rendered places (kept then dashed), not `p.loops.length`.
  - The "…" button: `disabled={p.locked !== null}` only; its label "More for <name>" when the focused place is kept, else "More: new loop from silence". The menu's last item: `<Button tone="quiet" onClick={() => { setMenuFor(null); p.onNewLoop(); }} aria-label="New loop: from silence" reason={p.newLoopReason}>New loop</Button>`; with no kept loop focused the menu holds only that line. The standalone New loop button is removed.
  - `placeLabel` unchanged.

- [ ] **Step 4: Run the file**: `npx vitest run src/__tests__/LoopRail.test.tsx` — Expected: PASS. Then `npm run lint` — Expected: errors only in `BoardSequencerScreen.tsx` (missing `keepSlot`), fixed in Task 2.

- [ ] **Step 5: Commit (after asking)**: `git add src/ui/screens/boardSequencer/play/LoopRail.tsx src/__tests__/LoopRail.test.tsx && git commit -m "feat(loops): the rail shows the kept loops and one dashed Keep as loop place; New loop from silence under … more"`

### Task 2: Keep as loop beside ▶ Play

**Files:**
- Modify: `src/ui/screens/boardSequencer/play/PlayPanel.tsx` (the `transport` block, lines ~81–114)
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (`keepAsLoop` ~5055, `keepAsLoopAt` ~5072, the `<LoopRail>` site ~5119, the `<PlayPanel>` site ~6909)
- Test: `e2e/access.e2e.ts` (test P2, line 377), new test in `e2e/performance.e2e.ts`

**Interfaces:**
- Consumes: `railPlaces`/`keepSlot` from Task 1; `keepAsLoopAt(slot)`, `keepReasonForPlace`, `keepSlotNow`, `pieceOnNow` (existing on the screen).
- Produces: `PlayPanelProps.keep?: ReactNode` rendered after Mute (before `simplify`) in the transport's button row, stacked or not. On the screen, `const keepButton = <Button tone="primary" onClick={() => keepAsLoopAt(keepSlotNow ?? -1)} reason={keepReasonForPlace ?? (keepSlotNow === null ? 'Every loop is full: clear one first.' : null)} aria-label="Keep as loop: keep the counters on the board as the next loop">Keep as loop</Button>` passed as `keep={workspace === 'piece' ? keepSceneButton : keepButton}` (`keepSceneButton` arrives in Task 8; until then pass `keepButton` in both). The old `keepAsLoop` handler and `onKeepAsLoop`/`keepReason` props to PieceSteps are deleted in Task 3; `keepAsLoopAt` guards `slot < 0` by announcing the full reason.

- [ ] **Step 1: Write the failing e2e** in `e2e/performance.e2e.ts` (replace the existing "Keep in the rail hands over…" test at line 100 with a version that presses the button, and keep a second that presses the dashed place):

```ts
test('Keep as loop beside Play: three loops in three presses while the board plays, the board clear each time, Undo puts the last back', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Yellow');
  await place(page, [[4, 1]]);
  await page.getByRole('button', { name: '▶ Play the board' }).click();
  const keep = page.getByRole('button', { name: /^Keep as loop/ });
  await keep.click();
  await expect(page.getByText('Kept as Loop 1: it plays on, and the board is clear.')).toBeVisible();
  await expect(page.locator('[data-loop-place="0"]')).toHaveAttribute('aria-label', /^Loop 1: 1 note, (playing|starting)/);
  await place(page, [[2, 3]]);
  await keep.click();
  await place(page, [[1, 5]]);
  await keep.click();
  await expect(page.locator('[data-loop-place]')).toHaveCount(4); // three kept, one dashed
  await expect(page.locator('[data-loop-place="3"]')).toHaveText('+ Keep as loop');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-loop-place]')).toHaveCount(3);
  await expect(page.getByText('1 on the board')).toBeVisible();
});
test('Keep as loop with nothing on the board says why and keeps nothing', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Keep as loop/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Put counters down first.' })).toBeVisible();
  await expect(page.locator('[data-loop-place]')).toHaveCount(1);
});
```
Also in `e2e/access.e2e.ts` P2 (line 377): press `getByRole('button', { name: /^Keep as loop/ })` on the Board view instead of inside Make a piece; its expectations on the rail stay.

- [ ] **Step 2: Run to verify they fail**: `npx playwright test e2e/performance.e2e.ts -g "Keep as loop"` — Expected: FAIL, no button named "Keep as loop" on the Board view.

- [ ] **Step 3: Implement** the `keep` slot in `PlayPanel.tsx` and the button on the screen as in Interfaces; pass `keepSlot={keepSlotNow}` to `<LoopRail>`; on the camera board the existing `handoverRef` path announces "Kept as …. Lift the counters and it plays on." unchanged. Add a unit test in `src/__tests__/PieceSteps.test.tsx`'s neighbour, a new `src/__tests__/PlayPanelKeep.test.tsx`, that renders `PlayPanel` with `keep={<button>Keep as loop</button>}` and asserts it sits after Mute in the same button row (`view.all('button').map(textContent)` starts `['▶ Play the board', 'Mute', 'Keep as loop']`).

- [ ] **Step 4: Run**: `npx vitest run src/__tests__/PlayPanelKeep.test.tsx src/__tests__/LoopRail.test.tsx` and `npx playwright test e2e/performance.e2e.ts -g "Keep as loop" e2e/access.e2e.ts -g "P2"` — Expected: PASS. `npm run lint` — Expected: clean.

- [ ] **Step 5: Commit (after asking)**: `git add -A src/ui/screens/boardSequencer/play/PlayPanel.tsx src/ui/screens/BoardSequencerScreen.tsx src/__tests__/PlayPanelKeep.test.tsx e2e/performance.e2e.ts e2e/access.e2e.ts && git commit -m "feat(loops): Keep as loop beside Play, in one press, on the Board and in Make a piece"`

### Task 3: The Loops section of Make a piece goes; Loop fade moves to Timing

**Files:**
- Modify: `src/ui/screens/boardSequencer/play/PieceSteps.tsx` (delete `LoopsStep` ~lines 380–530 and its props; keep the New loop panel: render `p.newLoop` where `LoopsStep` was rendered, under the scenes)
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (the `grooveTab` ~3160: add the Loop fade control; the `<PieceSteps>` site: drop the removed props)
- Modify: `src/ui/screens/boardSequencer/words.ts` (`keepBoardAsLoop` becomes retired: add `{ old: /\bKeep the board as this loop\b|\bOther ways to make a loop\b/, use: 'Keep as loop' }` to `RETIRED_WORDS`; delete `WORDS.keepBoardAsLoop`)
- Modify: `e2e/app.ts` (`saveBoardHere` → `keepAsLoop(page)`: presses the panel's Keep as loop button; every caller renamed), `e2e/performance.e2e.ts` (lines 236–275 "clearing a loop that scenes use…": the empty place is now the dashed place; 1071, 1090 "there is no other way…": assert no "Other ways" button), `e2e/stageLook.e2e.ts:116`, `e2e/access.e2e.ts:283`, `e2e/focus.e2e.ts:162,185`, `e2e/sound.e2e.ts` callers.
- Test: `src/__tests__/PieceSteps.test.tsx` (delete the describes "Loops: one way to make a loop", "U1", "U5", "U6"; add one), `src/__tests__/setupScreens.test.tsx` and `src/__tests__/boardBackup.test.ts` only if they name `loopFadePasses` through PieceSteps (grep first).

**Interfaces:**
- Consumes: Task 2's button.
- Produces: `PieceStepsProps` without `canSaveBoard`, `loopsFull`, `onKeepAsLoop`, `keepReason`, `onSaveBoardToLoop`, `onDrawLoop`, `onClearLoop`, `onRenameLoop`, `onLoopFade`, `namingSlot`, `onNewLoop`; keeps `newLoop`, `loops`, `loopFadePasses` (read by the editor's state words). `grooveTab` gains `<SegmentedControl<number> label="Loops started or stopped by hand fade over" showLabel value={config.loopFadePasses} onChange={(loopFadePasses) => update({ loopFadePasses })} options={[{ value: 0, label: 'At once' }, { value: 0.5, label: 'Half a pass' }, { value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }]} />` under the speed sliders.

- [ ] **Step 1: Write the failing tests**: in `PieceSteps.test.tsx` add
```tsx
describe('K1: loops are kept from the panel, not here', () => {
  it('Make a piece has no Loops section, no Keep as loop, no Other ways, no fade control', () => {
    view = render(<PieceSteps {...props()} />);
    expect(view!.container.textContent).not.toContain('Other ways to make a loop');
    expect(view!.container.textContent).not.toContain('More: fades');
    expect(view!.all('button').map((b) => b.textContent)).not.toContain('Keep as loop');
  });
});
```
and in a new `src/__tests__/timingTabFade.test.tsx` (jsdom, the screen is heavy: test the pure fact instead): assert `RETIRED_WORDS` matches "Keep the board as this loop" and "Other ways to make a loop" via `retiredWordsIn`. In `e2e/performance.e2e.ts` test at line 1071 add `await expect(page.getByRole('button', { name: /Other ways/ })).toHaveCount(0);` and a new short test "the Timing tab sets how hand-started loops fade" that opens the Timing tab, picks "2 passes", reloads, and expects it still chosen.

- [ ] **Step 2: Run to verify they fail**: `npx vitest run src/__tests__/PieceSteps.test.tsx src/__tests__/timingTabFade.test.tsx` — Expected: FAIL (the section is still rendered; the words are not retired).

- [ ] **Step 3: Implement**: delete `LoopsStep` and the props; render `{onPiece && p.newLoop}` after `ScenesStep`; add the Timing control; rewrite `saveBoardHere` as `keepAsLoop` in `e2e/app.ts`:
```ts
/** Keep what is on the board as the next loop: the panel's one button (K1). */
export async function keepAsLoop(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Keep as loop/ }).click();
}
```
Note for callers that relied on the board keeping its counters after the old Keep: on the laptop board the new Keep clears the board, so a test that kept then expected counters still down must re-place them (performance.e2e.ts `saveTwoLoops` already clears; adjust `sound.e2e.ts:63` "the loop edit window…" and `sound.e2e.ts:227` "after saving the board as a loop, its name is ready to type" → the name is typed through "… more → Rename").

- [ ] **Step 4: Run**: `npx vitest run src/__tests__/PieceSteps.test.tsx src/__tests__/timingTabFade.test.tsx src/__tests__/words.test.ts*`, `npm run lint`, then `npx playwright test e2e/performance.e2e.ts e2e/sound.e2e.ts e2e/focus.e2e.ts e2e/access.e2e.ts e2e/stageLook.e2e.ts` — Expected: all PASS. (If a test fails only on a busy laptop, rerun it alone; the Vite dev server can also serve a stale module after quick writes: rewrite the file unchanged and rerun.)

- [ ] **Step 5: Commit (after asking)**: `git add -A src e2e && git commit -m "feat(loops): Make a piece loses its Loops section; the hand fade lives on the Timing tab; the old ways are gone (F1)"`

### Task 4: Help and the cheat sheet for K1

**Files:**
- Modify: `src/ui/components/board/BoardHelp.tsx` (the loops paragraph of Make a piece: "Keep as loop beside ▶ Play keeps the counters on the board as the next loop and clears the board; the rail beside the board shows the loops you have; … more holds Rename, Edit notes, Clear and New loop from silence.")
- Modify: `docs/board-sequencer-cheat-sheet.md` lines 15–18 (Make a piece line and "1 · Loops" line → "**Loops:** counters down → **Keep as loop** (beside ▶ Play). The rail shows them; **… more** renames, edits, clears, or starts one from silence.")
- Test: `e2e/access.e2e.ts` A8 (Help opens; unchanged), `src/__tests__/boardHelp*.test.tsx` if one asserts the old words (grep "Other ways" in `src/__tests__`).

- [ ] **Step 1: Write the failing test**: in the Help unit test (or a new `src/__tests__/helpWords.test.tsx` rendering `BoardHelp`), assert the text contains "Keep as loop beside ▶ Play" and not "Other ways to make a loop".
- [ ] **Step 2: Run**: `npx vitest run src/__tests__/helpWords.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Edit Help and the cheat sheet.**
- [ ] **Step 4: Run**: `npx vitest run src/__tests__/helpWords.test.tsx` and `npx playwright test e2e/access.e2e.ts -g "A8"` — Expected: PASS.
- [ ] **Step 5: Commit (after asking)**: `git commit -am "docs(loops): Help and the cheat sheet say Keep as loop"`

---

## K2 · The storyboard and the scene editor

### Task 5: Pure helpers for the storyboard

**Files:**
- Create: `src/songs/performance/storyboard.ts`
- Modify: `src/songs/performance/sceneTools.ts` (`duplicateScene` gains a time), `src/profiles/BoardSequencerConfig.ts` (~line 942: give times on load)
- Test: `src/__tests__/storyboard.test.ts`, `src/__tests__/sceneTools.test.ts`

**Interfaces:**
- Consumes: `Scene`, `MAX_SCENES` (launcher.ts), `nextSceneTime`, `SCENE_TIME_STEP_SEC` (piece.ts), `MAX_PIECE_SEC`, `pieceLengthProblem` (clock.ts), `sceneLengthSec`, `copyName` (sceneTools.ts).
- Produces, in `storyboard.ts`:
  - `export interface SceneCard { index: number; id: string; name: string; at: number; lengthSec: number; loops: number[]; energy: SceneEnergy; current: boolean }`
  - `export function sceneCards(scenes: readonly Scene[], lengthSec: number, currentScene: number | null): SceneCard[]` — only timed scenes, in time order (scenes are already sorted), `lengthSec` from `sceneLengthSec`.
  - `export function giveTimes(scenes: readonly Scene[], lengthSec: number): Scene[]` — every scene without a time gets `nextSceneTime(timedSoFar, lengthSec, null)`; one that gets null stays untimed; the result is re-sorted by time (untimed last).
  - `export function withLength(scenes: readonly Scene[], i: number, newLengthSec: number, pieceLengthSec: number, minSec: number): { scenes: Scene[]; lengthSec: number; said: string | null }` — scene `i` timed; `newLengthSec` snapped to `SCENE_TIME_STEP_SEC` and at least `minSec`; later scenes shift by the difference; none moves past `pieceLengthSec - minSec` (clamped, `said` = "Home is now 0:52" naming the last one clamped); for the last scene, `lengthSec` becomes `at + newLengthSec` when `pieceLengthProblem` allows, else unchanged with `said` = that problem.
  - `export function moveCard(i: number, key: string, count: number): number | null` — ArrowLeft/Right, Home, End; null for other keys.
  - `export function cardWords(card: SceneCard, worldLabel: string, extra: string[]): string` — "Lively · Warm" plus `extra` joined with " · ".
- In `sceneTools.ts`: `duplicateScene(scenes, i, id, lengthSec: number, minSec: number): Scene[] | null` — the copy gets `at = original.at + floor(originalLength / 2 / STEP) * STEP`; null when the original is untimed, under `2 * minSec` long, or the piece is full.
- In `BoardSequencerConfig.ts` after `performance` is sanitised (line ~943): `const scenes = giveTimes(sanitizeScenes(o.scenes, sceneDefaults), performance.lengthSec);` and in `src/songs/performance/pieces.ts` `sanitizePieces` (line 132): `scenes: giveTimes(sanitizeScenes(o.scenes, defaults), sanitizePerformance(o.performance).lengthSec)` (sanitise the performance once into a local first). Task 10's `withWayIn` wraps both calls the same way, reading `o.loopFadePasses` through the same `[0, 0.5, 1, 2]` check the config uses at line ~1011 (pass the sanitised value in; `sanitizePieces` gains a `loopFadePasses: number` parameter).

- [ ] **Step 1: Write the failing tests** in `src/__tests__/storyboard.test.ts`:
```ts
const sc = (id: string, at: number | undefined, loops: number[] = []): Scene => ({ id, name: id, loops, settings: DEFAULTS, ...(at === undefined ? {} : { at }) });
it('cards: one per timed scene with its length to the next or the end', () => {
  const cards = sceneCards([sc('a', 0, [0]), sc('b', 90), sc('c', undefined)], 420, 1);
  expect(cards.map((c) => [c.name, c.at, c.lengthSec, c.current])).toEqual([['a', 0, 90, false], ['b', 90, 330, true]]);
});
it('giveTimes: an untimed scene lands after the last by the same gap; with no room it stays untimed and Check can say so', () => {
  expect(giveTimes([sc('a', 0), sc('b', 60), sc('c', undefined)], 420).map((s) => s.at)).toEqual([0, 60, 120]);
  expect(giveTimes([sc('a', 0), sc('b', 415), sc('c', undefined)], 420).map((s) => s.at)).toEqual([0, 415, undefined]);
});
it('withLength: later scenes move by the difference, never past the end; the last scene sets the piece length', () => {
  const r = withLength([sc('a', 0), sc('b', 90), sc('c', 210)], 0, 120, 420, 10);
  expect(r.scenes.map((s) => s.at)).toEqual([0, 120, 240]);
  expect(r.lengthSec).toBe(420);
  const last = withLength([sc('a', 0), sc('b', 90)], 1, 400, 420, 10);
  expect(last.lengthSec).toBe(490 > MAX_PIECE_SEC ? 420 : 490);
  const clamp = withLength([sc('a', 0), sc('b', 90), sc('c', 400)], 0, 300, 420, 10);
  expect(clamp.scenes[2].at).toBe(410);
  expect(clamp.said).toBe('c is now 0:10');
});
it('moveCard: arrows, Home and End; nothing else', () => {
  expect(moveCard(1, 'ArrowRight', 3)).toBe(2); expect(moveCard(2, 'ArrowRight', 3)).toBe(2);
  expect(moveCard(0, 'ArrowLeft', 3)).toBe(0); expect(moveCard(2, 'Home', 3)).toBe(0); expect(moveCard(0, 'End', 3)).toBe(2);
  expect(moveCard(0, 'Enter', 3)).toBeNull();
});
```
and in `sceneTools.test.ts`: "Duplicate puts the copy halfway through the original, at a 5 s step, and refuses under two passes" (`duplicateScene([sc('a',0), sc('b',120)], 0, 'x', 420, 10)` → ats `[0, 60, 120]`; `duplicateScene([sc('a',0), sc('b',15)], 0, 'x', 420, 10)` → null).

- [ ] **Step 2: Run to verify they fail**: `npx vitest run src/__tests__/storyboard.test.ts src/__tests__/sceneTools.test.ts` — Expected: FAIL (module not found; duplicate ignores the time).
- [ ] **Step 3: Implement** the helpers as signed above; `giveTimes` in the config sanitiser.
- [ ] **Step 4: Run**: the two files, then `npx vitest run src/__tests__/piece.test.ts src/__tests__/pieces.test.ts src/__tests__/boardBackup.test.ts` — Expected: PASS (a backup test that saved an untimed scene now gets a time: update its expectation and say so in the commit).
- [ ] **Step 5: Commit (after asking)**: `git add -A src && git commit -m "feat(piece): storyboard helpers; every scene has a time; Duplicate halves the original"`

### Task 6: `Storyboard.tsx`

**Files:**
- Create: `src/ui/screens/boardSequencer/play/Storyboard.tsx`
- Test: `src/__tests__/Storyboard.test.tsx` (jsdom, `./helpers/render`)

**Interfaces:**
- Consumes: `sceneCards`, `moveCard`, `cardWords` (Task 5); `LoopThumb`, `PieceLoop` (PieceSteps.tsx); `formatClock`, `describeEnding` (clock.ts); `ENERGY_NAMES` (words.ts); `Button`.
- Produces:
```ts
export interface StoryboardProps {
  scenes: Scene[]; loops: PieceLoop[]; lengthSec: number; performance: PerformanceSettings; currentScene: number | null;
  running: boolean; elapsedSec: number | null; selected: string | null;
  pieceName: string; pieceMenu: ReactNode;            // the ▾ fold's content, rendered under the heading while open
  worldLabel(w: SoundWorldChoice): string; rows: number; cols: number; swatchFor(colour: string): string;
  /** Why nothing can be changed now (the piece plays from Show), or null. */
  locked: string | null;
  onSelect(id: string | null): void; onKeepScene(): void; keepSceneReason: string | null;
  onMakePlan(): void; onCheck(): void; onJoinPress(i: number): void;
}
export function Storyboard(p: StoryboardProps): JSX.Element
```
  - Heading row: `<span>THE PIECE · {pieceName} ▾ · {formatClock(lengthSec)} · {describeEnding(performance)}</span>` (the ▾ is a button `aria-expanded`, label "Piece: {name}", toggling `pieceMenu`), `Check ›` button at the right (`aria-label="Check: the length, the ending and the ready check"`).
  - The row: `role="listbox"` `aria-label="The piece: its scenes in order"`, one `role="option"` per card (`data-scene-card={id}`, `aria-selected`, `aria-label={`Scene ${index + 1}: ${name}, ${formatClock(at)}, ${lengthSec} long, loops ${names}`}`), each ≥ 44 px tall, name 16 px 700; loop thumbs (`LoopThumb width={28}`) in slot order, `opacity: 0.3` when not in the scene, `data-in-scene`; words line `cardWords`; the current card `data-on-now` with the lit token `var(--bs-raised)` and a 3 px top edge in `var(--bs-fg)`; between cards a `.join` `<button aria-label={`Into ${nextName}: ${joinWords}`}>` (Task 12 fills `joinWords`; until then "→"); last the dashed card button "+ Keep what's playing as a scene" (`reason={keepSceneReason}`); then `✦ Make my plan` (`tone="quiet"`, or `tone="primary"` when `scenes.length === 0`).
  - Empty: the dashed card and one line "Play some loops together, then press Keep as scene. Or press Make my plan for a four-scene start."
  - Ruler: `<div aria-hidden>` with each card's `formatClock(at)` at `at / lengthSec * 100%` and the end; the playhead at `elapsedSec / lengthSec` while `elapsedSec !== null`.
  - One tab stop: `tabIndex={0}` on the selected (or first) card, `-1` on the rest; `onKeyDown` uses `moveCard`, Enter selects.
  - The row scrolls sideways in its own box (`overflowX: 'auto'`), nothing else does.
  - `locked` greys the row (`opacity: 0.6`) and every button but the cards gets `reason={locked}`.

- [ ] **Step 1: Write the failing tests** in `Storyboard.test.tsx`:
```tsx
it('one card per timed scene, in order, with its number, time, name, loops lit or dim, and words', () => { … expect(cards().map(c => c.getAttribute('aria-label'))).toEqual(['Scene 1: Arrival, 0:00, 1:30 long, loops Bed', 'Scene 2: Build, 1:30, 5:30 long, loops Bed, Pulse']); expect(thumbsIn(cards()[0]).map(t => t.dataset.inScene)).toEqual(['true', 'false']); });
it('a press selects the card; arrows, Home and End move; Enter selects; one tab stop', …);
it('with no scenes: the dashed card, Make my plan as the big button, and the one line', …);
it('the card on now is marked, and the ruler shows the playhead while it plays', …);
it('locked: Keep, Make my plan and the joins say why; a card can still be selected', …);
```
- [ ] **Step 2: Run**: `npx vitest run src/__tests__/Storyboard.test.tsx` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `Storyboard.tsx` as specified.
- [ ] **Step 4: Run**: `npx vitest run src/__tests__/Storyboard.test.tsx` — Expected: PASS; `npm run lint` clean.
- [ ] **Step 5: Commit (after asking)**: `git add -A src && git commit -m "feat(piece): the storyboard: scene cards in a row, joins, the dashed Keep card, Make my plan, the ruler"`

### Task 7: `SceneEditor.tsx`

**Files:**
- Create: `src/ui/screens/boardSequencer/play/SceneEditor.tsx` (moved and reshaped from `SceneRow` in PieceSteps.tsx ~lines 960–1213; delete `SceneRow` there)
- Test: `src/__tests__/SceneEditor.test.tsx`; move the `SceneRow`-dependent describes of `PieceSteps.test.tsx` ("typed times" → length, "player alone", "empty loop", "Update from now", "reach this speed", "chords", "Energy", "band parts and lead-in") to it, adapted.

**Interfaces:**
- Consumes: `withLength` (Task 5), `ScenePatch`, `editedScene`, `ENERGY_NAMES`, `ChordChoice`, `BandJobsChoice`, `LEAD_INS`, `useSessionFold`.
- Produces:
```ts
export interface SceneEditorProps {
  number: number; scene: Scene; current: boolean; running: boolean; lengthSec: number; passSec: number;
  loops: PieceLoop[]; worldOptions: { value: SoundWorldChoice; label: string }[]; playerName: string | null; loopFadePasses: number;
  locked: string | null;
  onEdit(patch: ScenePatch): void; onLength(sec: number): void;
  onHear?(): void; onGo?(): void; onUpdateFromNow?(): void; onNewIdeas(): void; onDuplicate(): void; onDelete(pressed: HTMLElement): void; onCheck(): void;
}
export function SceneEditor(r: SceneEditorProps): JSX.Element
```
  - Heading: number and an inline name field (`aria-label="Scene name"`, saved on blur/Enter through `onEdit({ name })`), then "{formatClock(at)} → {formatClock(at + length)}".
  - "Loops in this scene": the existing pill buttons (`aria-pressed`), plus `LoopThumb` in each; empty-in-scene pills as before.
  - "Energy": the six names as a `SegmentedControl` (as today).
  - A words line "{world} · {chordWords} · {BAND_WORDS}" with a `change ▾` button (`aria-expanded`) that opens today's More block (world, band, parts, Extra notes, Sounds change, speed and glide, lead in, "Only {player} sounds" tick (was "alone"), Update from now, New ideas).
  - "Into this scene": left for Task 12 (render nothing yet).
  - "Length": a text field `aria-label={`How long ${name} lasts (minutes:seconds)`}`, parsed with `parseClock`; on a good value `onLength(sec)`; problems shown as today's `role="alert"`.
  - Buttons: `▶ Hear from here` (`onHear`, label `Hear from here: ${name}`), `Jump here now` (`onGo`), `Duplicate`, `Delete scene`, `Check ›`.

- [ ] **Step 1: Write the failing tests** (moved describes, plus): "the length field: 2:00 moves the next scene; the last scene's length sets the piece's; a bad value is refused beside the field"; "Hear from here is there while stopped, Jump here now while playing"; "change ▾ opens the finer settings, remembered for the session".
- [ ] **Step 2: Run**: `npx vitest run src/__tests__/SceneEditor.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `SceneEditor.tsx`; delete `SceneRow` and its props from PieceSteps.tsx.
- [ ] **Step 4: Run**: `npx vitest run src/__tests__/SceneEditor.test.tsx src/__tests__/PieceSteps.test.tsx` — Expected: PASS (PieceSteps may fail to compile until Task 8; if so, run the editor test alone and finish Task 8 before the commit).
- [ ] **Step 5: Commit (after asking)**, together with Task 8 if PieceSteps does not compile alone.

### Task 8: Make a piece becomes the editor; the storyboard sits under the board

**Files:**
- Modify: `src/ui/screens/boardSequencer/play/PieceSteps.tsx` — delete the `nav` tabs, `FirstPiece`, `ScenesStep` (timeline, `PieceGrid`, `EnergyGraph`, rows, the "same ideas" card, the strips switch, `ColourTimes` placement), keep `PiecePicker` (now rendered by the storyboard's ▾ through a prop), `EndingStep` (now `CheckPanel`: adds a section "The whole piece" holding `ColourTimes`, the "same ideas" card and the strips switch, and a "‹ Back to the scene" button).
- Delete: `src/ui/screens/boardSequencer/play/PieceGrid.tsx`, `src/songs/performance/pieceGrid.ts`, `src/__tests__/pieceGrid.test.ts`.
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` — render `<Storyboard>` under the board-and-rail row when `workspace === 'piece'` (full window width, `flexShrink: 0`); `pieceTab` renders `<PieceSteps>` which now shows either the `SceneEditor` of `selectedScene` (state lifted to the screen: `const [selectedScene, setSelectedScene] = useState<string | null>(null)`), the empty line "Press a scene below to change it" when none, or `CheckPanel` when `pieceStep === 'ending'`; `keepSceneButton` = `<Button tone="primary" onClick={() => saveScene('')} reason={keepSceneReason} aria-label="Keep as scene: keep what is playing now as the next scene">Keep as scene</Button>` where `keepSceneReason` = `pieceOnNow ? 'Stop the piece to change it.' : wantedRef.current.size === 0 && !running ? 'Play a loop first.' : nextSceneTime(config.scenes, config.performance.lengthSec, null) === null ? 'No room before the end: shorten a scene first.' : config.scenes.length >= MAX_SCENES ? 'Twelve scenes is the most. Delete one first.' : null`; `saveScene` always passes `null` as elapsed; the panel sticks (`position: 'sticky', top: 0`) when not stacked.
- Modify: `e2e/app.ts` (`pieceStep`: 'Loops'/'Scenes' just open Make a piece; 'Ending & check' presses "Check ›"; `makePlan` presses the storyboard's Make my plan), and the e2e tests that read the timeline chips, the grid, scene rows or "Comes in at": `performance.e2e.ts` 76, 143, 181 (now the length field), 189, 211, 276, 306, 1403, 1438, 1690, 1733, 2201, 2324; `focus.e2e.ts` 74; `stageLook.e2e.ts` 73; `access.e2e.ts` 17, 269; `sound.e2e.ts` callers of `makePlan`. Each selects a card with `page.getByRole('option', { name: /^Scene 2: Build/ }).click()` and edits in the panel.
- Test: `src/__tests__/PieceSteps.test.tsx` (the surviving describes: "Ending & check: the length", "fixing from the check", "focus never drops…" adapted, "L5 and G3 tabs" deleted, "U2" deleted), `src/__tests__/Storyboard.test.tsx` (unchanged), a new e2e in `performance.e2e.ts`:

```ts
test('Keep as scene: two loops playing become scene 1 as a card; a second press adds scene 2 after it; a card press opens its editor', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Yellow'); await place(page, [[4, 1]]);
  await page.getByRole('button', { name: '▶ Play the board' }).click();
  await keepAsLoop(page);
  await place(page, [[1, 3]]); await keepAsLoop(page);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('button', { name: /^Keep as scene/ }).click();
  await expect(page.getByRole('option', { name: /^Scene 1: Scene 1, 0:00/ })).toBeVisible();
  await page.locator('[data-loop-place="1"]').click(); // Loop 2 off
  await page.getByRole('button', { name: /^Keep as scene/ }).click();
  await expect(page.getByRole('option', { name: /^Scene 2: Scene 2, 1:00/ })).toBeVisible();
  await page.getByRole('option', { name: /^Scene 1:/ }).click();
  await expect(page.getByRole('group', { name: 'Loops in this scene' }).getByRole('button', { pressed: true })).toHaveCount(2);
});
```

- [ ] **Step 1: Write the failing e2e above and adapt the unit tests.**
- [ ] **Step 2: Run**: `npx playwright test e2e/performance.e2e.ts -g "Keep as scene"` — Expected: FAIL (no Keep as scene button).
- [ ] **Step 3: Implement** as in Files; keep `pieceStep` ids ('scenes' = the editor, 'ending' = Check) so `setPieceStep` callers work.
- [ ] **Step 4: Run**: `npm run lint`; `npx vitest run src/__tests__/PieceSteps.test.tsx src/__tests__/SceneEditor.test.tsx src/__tests__/Storyboard.test.tsx`; `npx playwright test e2e/performance.e2e.ts e2e/focus.e2e.ts e2e/access.e2e.ts e2e/stageLook.e2e.ts e2e/sound.e2e.ts e2e/showSafety.e2e.ts` — Expected: PASS.
- [ ] **Step 5: Commit (after asking)**: `git add -A src e2e && git commit -m "feat(piece): the storyboard under the board, the scene editor in the panel, Keep as scene; the steps, grid, timeline and rows go"`

### Task 9: Help and the cheat sheet for K2; Hear from here

**Files:**
- Modify: `BoardHelp.tsx` (the Make a piece section rewritten to the three lines of the spec's empty state plus one sentence each on cards, joins, the editor and Check), `docs/board-sequencer-cheat-sheet.md` lines 19–23.
- Modify: every "Rehearse from here" in `src/` and `e2e/` → "Hear from here" (grep; the screen's `rehearseFrom` handler keeps its name).
- Test: `src/__tests__/helpWords.test.tsx` (add: contains "Keep as scene", not "How scenes work"); e2e greps pass.

- [ ] Steps 1–5 as Task 4, commit message `docs(piece): Help and the cheat sheet describe the storyboard; Rehearse from here is Hear from here`.

---

## K3 · The way into a scene

### Task 10: `wayIn` on a scene, with its migration

**Files:**
- Modify: `src/songs/performance/launcher.ts` (`Scene.wayIn?: WayIn`; `sanitizeScenes` reads it), `src/profiles/BoardSequencerConfig.ts` (after scenes are sanitised: `withWayIn(scenes, loopFadePasses)`), `src/songs/performance/storyboard.ts` (`joinWords`, `waySteps`)
- Test: `src/__tests__/launcher.test.ts`, `src/__tests__/storyboard.test.ts`, `src/__tests__/boardBackup.test.ts`

**Interfaces:**
- Produces, in `launcher.ts`: `export type WayIn = { kind: 'fade'; passes: 1 | 2 } | { kind: 'overlap'; passes: 1 | 2 } | { kind: 'cut' }`; `export function sanitizeWayIn(v: unknown): WayIn | null`; `export function wayInFromFade(loopFadePasses: number): WayIn` (0 → cut; 0.5 or 1 → fade 1; 2 → fade 2); `export function withWayIn(scenes: readonly Scene[], loopFadePasses: number): Scene[]` (a scene without one gets `wayInFromFade`). In `storyboard.ts`: `export function joinWords(w: WayIn): string` ("fade 1", "fade 2", "overlap 1", "overlap 2", "cut"); `export function waySteps(w: WayIn, stepsPerPass: number): { fadeSteps: number; holdOutSteps: number }`.

- [ ] **Step 1: Failing tests**: launcher: "a stored wayIn survives; a bad one is dropped; a scene without one reads the player's fade: 0 cut, 0.5 fade 1, 1 fade 1, 2 fade 2" (Review Focus 1); storyboard: `joinWords` and `waySteps({kind:'overlap',passes:2}, 8)` → `{ fadeSteps: 0, holdOutSteps: 16 }`, fade 1 → `{ 8, 0 }`, cut → `{ 0, 0 }`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/launcher.test.ts src/__tests__/storyboard.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two files and `src/__tests__/boardBackup.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit (after asking)**: `git commit -am "feat(piece): a scene's way in (fade, overlap, cut), read from the player's fade for older pieces"`

### Task 11: The engine's per-launch way

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts` (`pendingLaunch` type ~369, `setLaunchedLoops` ~1804, `applyPendingLaunch` ~2029, `launchFactor` ~2080, `LaunchedLoop` ~262)
- Test: `src/__tests__/BoardSequencerEngine.launchWay.test.ts` (new; copy the Tone, effects, voice and drum-kit mocks and `baseCfg` from `src/__tests__/BoardSequencerEngine.loopColours.test.ts`)

**Interfaces:**
- Produces: `export interface LaunchWay { fadeSteps: number; holdOutSteps: number }`; `setLaunchedLoops(slots: number[], loops: ActiveCell[][], loopColours: ColourChannel[] = [], way?: LaunchWay): void` — the pending launch stores `way ?? this.pendingLaunch?.way ?? null` (inherit, Review Focus 4); `applyPendingLaunch` uses `way.fadeSteps` in place of `launchFadeBeats` when a way is set; with `holdOutSteps > 0` a leaving loop is kept with `fade: { dir: 'out', start: beat + holdOutSteps, beats: 1 }` and `launchFactor` returns 1 while `beat < fade.start` (clamp with `Math.min(1, …)`); the existing removal of finished fades (grep `fade.dir === 'out'` where `launched` is pruned) handles it.

- [ ] **Step 1: Failing tests**: "a way of fade 8 fades the leaving loop over 8 beats and the arriving one in"; "a way of overlap 16 keeps the leaving loop at full for 16 beats, then it stops"; "a cut stops at the boundary"; "a launch without a way while one is pending inherits it; with none pending it uses the player's fade" — asserting through `getLaunchedSlots()` and `launchFactor` via the engine's public beat readout (`drainFiredNotes` velocities, or expose `launchFactorFor(slot, beat)` as a test-only public method).
- [ ] **Step 2: Run** — Expected: FAIL (signature).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new file and `npx vitest run src/__tests__/*Engine*.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit (after asking)**: `git commit -am "feat(engine): a launch carries its way in: fade, overlap or cut, inherited by a hand press in the same pass"`

### Task 12: The way in on screen: the join chip, the editor line, Hear from here two passes early

**Files:**
- Modify: `BoardSequencerScreen.tsx` (`pushLaunch(extra?, nl?, way?: LaunchWay)` ~3351 passes `way` through; `goScene` ~3679 computes `waySteps(scene.wayIn ?? wayInFromFade(c.loopFadePasses), c.cols * Math.max(1, c.numPages))` and passes it; `rehearseFrom` callers from the editor: `rehearseFrom(Math.max(0, s.at - 2 * passSecNow))` when `i > 0`, else `s.at`)
- Modify: `Storyboard.tsx` (join chip text `joinWords(nextScene.wayIn)`, tooltip "Bed carries on" when a loop is in both), `SceneEditor.tsx` ("Into this scene" `SegmentedControl` with options Fade · 1 pass, Fade · 2 passes, Overlap · 1 pass, Overlap · 2 passes, Cut, `onEdit({ wayIn })`)
- Test: `src/__tests__/Storyboard.test.tsx`, `src/__tests__/SceneEditor.test.tsx`, `e2e/performance.e2e.ts`:

```ts
test('the way into a scene: set to Cut in the editor, shown on the join, kept after a reload; Hear from here starts two passes early', …);
```

- [ ] Steps 1–5 as above; commit `feat(piece): fade, overlap or cut between scenes, on the join and in the editor; Hear from here plays the way in`.

---

## K4 · Counters on the iPad

### Task 13: Protocol and words

**Files:**
- Modify: `src/remote/protocol.ts` (`SimpleRow` 'board' → 'counters' with `sanitizeSimpleRows` mapping 'board' to 'counters'; `RemoteState.silentColours?: string[]`, `RemoteState.colours?: RemoteColour[]` where `export interface RemoteColour { id: string; number: number; name: string; swatch: string; words: string }`; message `{ type: 'colourSound'; id: string; silent: boolean }`; sanitisers for all three)
- Modify: `src/ui/screens/boardSequencer/words.ts` (`SIMPLE_WORDS.counters: 'Counters'`, `rows.counters: 'Counters, one per colour'`, `countersSilenced(names: string[]): string` → "Red and Green silenced on the iPad", `drumsAreOff: 'Drums are off'`; `rows.board` removed)
- Test: `src/__tests__/protocol*.test.ts` (grep the file that tests `sanitizeRemoteMessage`), `src/__tests__/simplePage.test.ts`

- [ ] **Step 1: Failing tests**: "colourSound is kept with its id and silent; silentColours and colours survive sanitising; a saved row 'board' reads as 'counters'".
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit (after asking)**: `feat(ipad): the protocol carries the colours and which are silenced`.

### Task 14: The laptop silences one colour at a time

**Files:**
- Modify: `src/remote/simplePage.ts` (`silencedColourIds(channels, s: { board: boolean; drums: boolean; colours?: ReadonlySet<string> })`; `remoteColours(channels, describe: (ch) => string): RemoteColour[]` (note-playing colours only, numbered in board order); `readSilentColours(store): string[]` / `writeSilentColours(store, ids)` under key `admi-silent-colours`; `clearBoardSilent(store)`)
- Modify: `BoardSequencerScreen.tsx` (state `silentColours: Set<string>` with ref and tab-store effect; `outIds` and line ~4094 take `colours`; the state sent gains `silentColours` and `colours` (`describeChannel(ch)` for `words`); message `colourSound` → `setColourSilent(id, silent)`: when `!silent` and the colour's role is drums and `drumsSilent`, also `setDrumsSilent(false)` (Review Focus 5); Show's status row and the Board-view line use `SIMPLE_WORDS.countersSilenced(names)` with "Bring them back" clearing the set; on mount, if the Simple rows hold 'counters', `clearBoardSilent`)
- Modify: `src/ui/screens/boardSequencer/play/showStatus.ts` (`boardSilent?: boolean` → `silentColours?: string[]` names; item text from `countersSilenced`)
- Test: `src/__tests__/simplePage.test.ts`, `src/__tests__/showStatus.test.ts`

- [ ] **Step 1: Failing tests**: "a colour in the silent set is out, playing or stopped, a control colour never"; "the names line: one colour, two, three"; "Drums off and a drum colour brought back: both come back" (a pure helper `colourBack(id, role, drumsSilent): { drums: boolean }` in simplePage.ts, so it is testable).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/__tests__/simplePage.test.ts src/__tests__/showStatus.test.ts`, `npm run lint` — PASS. **Step 5: Commit (after asking)**: `feat(ipad): the laptop silences one colour's counters at a time, and says which`.

### Task 15: The Counters row on the iPad

**Files:**
- Modify: `src/ui/screens/IPadRemoteScreen.tsx` (the Board pad ~634 → the Counters row: a `role="group"` `aria-label={SIMPLE_WORDS.counters}`, two pads per row, one per `state.colours` entry: `aria-label={`${c.name}, ${c.words}: ${silent ? SIMPLE_WORDS.silent : SIMPLE_WORDS.playing}`}`, `aria-pressed={!silent}`, a filled circle in `c.swatch` with `c.number` inside (`aria-hidden`), the name 26 px 800, the words 16 px, `stateWords`; a drum colour while `drumsSilent` shows `SIMPLE_WORDS.drumsAreOff` as its words; press → `padTap(`colour-${id}`, { type: 'colourSound', id, silent: !silent })`; keep `boardSound` handling in the laptop for one release, nothing sends it)
- Modify: the laptop's row chooser (grep `SIMPLE_WORDS.rows` in `BoardSequencerScreen.tsx`/`SoundTab`/Connections) to offer Counters
- Test: `src/__tests__/IPadSimplePage.test.tsx` (replace the Board assertions: "Counters: one pad per colour with its number, name and instrument; silent is a dark outline with Silent; a press sends colourSound for that colour"; "a drum colour while Drums are off says Drums are off"), `e2e/ipadSimple.e2e.ts` 198 ("…the Board button still silences the counters" → "a colour's pad silences that colour's counters, said on the laptop, brought back from Show") and 229 (pictures: regenerate; check by eye that no face is in them: they are drawn pages, not camera frames)

- [ ] **Step 1: Failing tests** as named. **Step 2: Run** `npx vitest run src/__tests__/IPadSimplePage.test.tsx` — FAIL. **Step 3: Implement.** **Step 4: Run** the unit file, `npx playwright test e2e/ipadSimple.e2e.ts`, `npm run lint` — PASS. **Step 5: Commit (after asking)**: `feat(ipad): Counters, one pad per colour with its colour and instrument, in place of the Board pad`.

---

## After the four batches

- `npm run lint`, `npm run test:run`, `npm run test:e2e` all green; the keeping-time tests pass alone on a quiet laptop.
- The spec's Status section records each batch as built with its commit.
- Restart the owner's show server only when she says so (it runs on 3001).
