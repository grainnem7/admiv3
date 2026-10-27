# Shorter set-up journey (stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A returning session reaches the first sound in about two clicks, and set-up shows only what a facilitator needs.

**Architecture:** Two pure routing rules in `boardSetupFlow.ts` decide whether "Who's playing?" opens and whether the screen opens on Play. A one-off silent board check on arriving at Play reuses Find board's detector and compares with the saved corners. Confirming the corners also learns the empty board. The Board and Camera steps put everything but the main path under one "More" each.

**Tech Stack:** React 19, TypeScript strict, Vitest + jsdom (createRoot/act component tests).

**Spec:** docs/superpowers/specs/2026-10-26-board-setup-and-sounds-design.md (stage 2; "The journey (decided)").

## Global Constraints

- The owner's decision (2026-10-27): **remember the last player**. "Play my board" opens Play with whoever played last; the header's player button ("Tim · switch") changes player. "Who's playing?" opens only on the very first run or when no player is remembered.
- Never move the player on its own once the screen is open (existing rule in `resolveEntry`); routing is decided once, at mount.
- "Set up the board again" on Welcome still opens set-up (`setupRequestedOnOpen`).
- A reload mid-piece still opens Play (`readPieceRunning() !== null`).
- Plain words, the word "Melody" kept, no jargon on screen (no "reference", "bands", "homography").
- Nothing a facilitator needs to fix a problem may be hidden: a warning (black-and-white picture, board not learnt, sizes that don't line up) is shown outside "More", and opens "More" when its fix is in there.

## Review Focus

1. A player whose saved config is incomplete (board not confirmed, or no colour with a job) must NOT be sent to Play: set-up as today.
2. Re-finding the board mid-play (nudge banner → Find board) with counters on it must not replace a good learnt board with one full of counters.
3. The arrival board check must never block Play: pressing ▶ Play while it runs cancels it; a camera that isn't running yet just waits; laptop boards never check.
4. Two or more players with a remembered active player: no chooser; the header names them. A remembered id whose profile was deleted: chooser opens.
5. Camera step on a black-and-white picture: the warning and the Picture size advice must be visible without opening anything.

---

### Task 1: Remember the last player

**Files:**
- Modify: `src/ui/screens/boardSequencer/boardSetupFlow.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx:~458` (`chooserOpen` initial state)
- Test: `src/__tests__/boardSetupFlow.test.ts`

**Interfaces:**
- Produces: `askWhoIsPlaying(playerIds: readonly string[], activeId: string | null): boolean`

- [ ] **Step 1: failing tests** in `boardSetupFlow.test.ts`, `describe('who is playing')`:
  - `askWhoIsPlaying([], null)` → `true` (first run: name and hand).
  - `askWhoIsPlaying(['tim'], 'tim')` → `false`.
  - `askWhoIsPlaying(['tim', 'alex'], 'alex')` → `false` (the decision: remember the last player).
  - `askWhoIsPlaying(['tim', 'alex'], null)` → `true`.
  - `askWhoIsPlaying(['tim'], 'gone')` → `true` (remembered profile deleted).
  - `askWhoIsPlaying(['tim'], null)` → `false` (one player: as today).
- [ ] **Step 2:** run `npx vitest run src/__tests__/boardSetupFlow.test.ts` → FAIL (not exported).
- [ ] **Step 3:** implement; in BSS replace `listBoardPlayers().length !== 1` with `askWhoIsPlaying(listBoardPlayers().map((p) => p.id), getActiveBoardPlayer()?.id ?? null)`. Update the comment above it to say the last player is remembered and the header's player button switches.
- [ ] **Step 4:** run the test → PASS; `npm run lint` clean.
- [ ] **Step 5:** commit `feat(board): remember the last player; Who's playing only when there is no one to remember`.

### Task 2: A ready returning session opens on Play

**Files:**
- Modify: `src/ui/screens/boardSequencer/boardSetupFlow.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx:~438` (`view` initial state)
- Modify: `src/ui/screens/WelcomeScreen.tsx` only if its labels need it (they already say "Play my board" / "Set up the board again")
- Test: `src/__tests__/boardSetupFlow.test.ts`

**Interfaces:**
- Produces: `openingView(stored: { boardSource?: 'camera' | 'laptop'; enabled: boolean; channels: { role: ColourRole }[] } | null, o: { setupRequested: boolean; pieceRunning: boolean }): 'play' | 'setup'`

- [ ] **Step 1: failing tests**, `describe('where the screen opens')`:
  - `null` stored → `'setup'`.
  - camera board, enabled, a channel with a job → `'play'`.
  - camera board, `enabled: false` → `'setup'`.
  - camera board, every channel `'off'` → `'setup'`.
  - any ready config with `setupRequested: true` → `'setup'`.
  - laptop board (enabled false, no jobs) → `'play'` (as today); with `setupRequested` → `'setup'`.
  - not ready but `pieceRunning: true` → `'play'` (a reload mid-piece, as today).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement; BSS `view` initial state calls `openingView(storedRef.current, { setupRequested: setupRequestedOnOpen(), pieceRunning: readPieceRunning() !== null })`. `step` initial state is unchanged (it is still where set-up opens if they go there).
- [ ] **Step 4:** run → PASS; lint.
- [ ] **Step 5:** commit `feat(board): Play my board opens on Play when the board and colours are set up`.

### Task 3: Checking the board on arrival

**Files:**
- Create: `src/tracking/boardDetect/boardStillThere.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (a `checkBoard` callback beside `findBoard`, an effect that runs it once, a status line on the Play screen)
- Test: `src/__tests__/boardStillThere.test.ts`

**Interfaces:**
- Consumes: `consensus(detections)` result `{ corners: [BoardPoint ×4] | null, … }` from `src/tracking/boardDetect/consensus.ts`; `runFrameBurst`, `detectBoard` as `findBoard` uses them.
- Produces: `boardStillThere(saved: readonly BoardPoint[], found: readonly BoardPoint[] | null, squares: number): 'found' | 'moved' | 'unsure'` and `const BOARD_MOVED_SQUARES = 0.5`.

- [ ] **Step 1: failing tests:**
  - found corners equal to saved → `'found'`.
  - every corner shifted by 0.3 of a square (board side / squares × 0.3) → `'found'`.
  - one corner shifted by 1 square → `'moved'`.
  - `found === null` → `'unsure'` (counters, a hand or poor light can hide it; never say "moved" without seeing it).
  - found corners in another order (the same quad rotated by one index) → judged on the best match of order, so `'found'`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement: square size = mean side length of `saved` / `squares`; for each of the 4 cyclic orders (and their reverses) the max corner distance; take the smallest; `≤ BOARD_MOVED_SQUARES × square` → `'found'`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** in BSS, `checkBoard()`: like `findBoard` but silent (no editor, no announce of its own reasons), its own AbortController, aborted by `start()` and on unmount. An effect runs it once per mount when `view === 'play'`, not laptop, `config.enabled`, the camera is `running` (or `fallback`), and the board is not running. Show the result as one status line at the top of the Play screen (where the nudge banner sits, `role="status"`):
  - `'found'` → "✓ Board found" (stays until Play is pressed);
  - `'moved'` → "The board seems to have moved." with a **Find board** button doing what the nudge banner's does (`stop(); setView('setup'); setStep('board')` then `findBoard()`);
  - `'unsure'` → "Couldn't see the whole board to check it. If counters play in the wrong places, Find board." with the same button.
  - Pressing ▶ Play clears the line.
- [ ] **Step 6:** `npm run lint`; full `npx vitest run`; commit `feat(board): a returning session checks the board is where it was`.

### Task 4: Confirming the corners learns the empty board

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (`learnBoard`, `handleCalibrated`)
- Create: `src/ui/screens/boardSequencer/learnGuard.ts`
- Test: `src/__tests__/learnGuard.test.ts`

**Interfaces:**
- Produces: `autoLearnAllowed(coveredSquares: number, totalSquares: number, hasLearnt: boolean): boolean` and `const AUTO_LEARN_MAX_COVERED = 0.12` (the 12% `learnBoard` already uses to warn).

- [ ] **Step 1: failing tests:** nothing learnt yet → `true` whatever is covered (something beats nothing; the existing warning says so); learnt already and covered ≤ 12% → `true`; learnt already and covered > 12% → `false` (counters on the board: keep the good one).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement.
- [ ] **Step 4:** `learnBoard(opts?: { corners?: BoardSequencerStored['corners']; auto?: boolean })`: with `corners`, use them instead of `configRef.current.corners` (pass to `boardModelNow(corners)` and `homographyForCorners`) and skip the `cfg.enabled` check; with `auto`, call `autoLearnAllowed` after the covered count and, when not allowed, set the message "Counters seem to be on the board, so the empty board you learnt before is kept." and return without updating. `handleCalibrated` calls `learnBoard({ corners, auto: true })` after its `setConfig`. On success the message is "✓ Board found and learnt" (the time kept: `✓ Board found and learnt at ${at}.`), and the manual button's message stays `Learnt at …`.
- [ ] **Step 5:** run tests; lint; commit `feat(board): Looks right also learns the empty board`.

### Task 5: The Board step, main path only

**Files:**
- Modify: `src/ui/screens/boardSequencer/setup/BoardStep.tsx`
- Test: `src/__tests__/BoardStep.test.tsx` (extend; it has `visibleText()`)

- [ ] **Step 1: failing tests:**
  - visible text (closed details excluded) contains "Find board" and the learnt status, and does NOT contain "Squares on your board", "Follow small nudges", "Learn it again".
  - a `<details>` whose summary is "More" contains "Squares on your board", "Learn it again", "Follow small nudges" and "For testing".
  - `boardLearnt: 0` → "Not learnt yet" and a visible **Learn the board** button (outside More: the fix must be reachable).
  - rows/cols that don't line up with the squares (`rows: 3`) → More starts open.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** restructure: main = fallback warning, Find board / Tap corners, find message, one line "✓ Board found and learnt" / "Not learnt yet" + learnMessage + the detection warning (with the Learn the board button when not learnt). One `<details>` "More": Learn it again (with the short explanation), Squares on your board, Rows/Steps, More sizes…, the two switches, and the nested "For testing". `open` when sizes don't line up.
- [ ] **Step 4:** run → PASS; lint; full suite; commit `feat(board): the Board step shows the main path; sizes and tools under More`.

### Task 6: A quieter Camera step

**Files:**
- Modify: `src/ui/screens/boardSequencer/setup/CameraStep.tsx`
- Test: `src/__tests__/CameraStep.test.tsx` (new, same createRoot/act pattern and a `visibleText()` helper)

- [ ] **Step 1: failing tests:**
  - a running camera with colour: visible text has the camera list and "Picture has colour", and not "Picture size", "Mirror the picture", "Turn the picture".
  - a `<details>` "More" holds Picture size, Turn, Mirror, Flip, Where to put the camera, Details.
  - `colourless: true` → the black-and-white warning is visible and More is open (its fix, Picture size, is inside).
  - `phase: 'error'` → "Try again" is visible.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** restructure: main = camera list, Try again (always) and Refresh the list, the status line, the lighting note; one `<details>` "More" with the rest, `open={colourless === true}`.
- [ ] **Step 4:** run → PASS; lint; full suite; commit `feat(board): a quieter Camera step`.

### Task 7: Check it in the app

- [ ] Build (`npm run build`) and run on a separate port with a scratch data dir (never the owner's 3001 server or `.admi-data`): `ADMI_DATA_DIR=<scratch> npx vite --port 3210 --strictPort`.
- [ ] With Playwright (scratchpad/tester): a laptop-board player opens on Play; Welcome → "Set up the board again" opens set-up; with two players saved and one active, no chooser; the header switches player. The camera path can't be driven headless (no real board): Tasks 3–6 rest on their unit tests, and the owner checks them on the rig.
- [ ] Run `npx playwright test e2e/sound.e2e.ts e2e/boardAbleton.e2e.ts` (they use `openLaptopBoard`, which creates a player; it must still work).
