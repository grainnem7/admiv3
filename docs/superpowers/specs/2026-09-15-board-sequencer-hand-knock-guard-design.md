# Board Sequencer — Hand & Knock Guard (project A)

- **Date:** 2026-09-15
- **Status:** Approved design (brainstorm). Awaiting spec review.
- **Branch:** `feat/board-sequencer-mode`
- **Roadmap:** project **A**, built right after project 1 (`2026-09-15-board-sequencer-redesign-design.md`). Then B zones and loop pads, C auto-detect, D board tracking, E box detail.
- **Depends on project 1:**
  - **Plan 1a:** `useBoardRuntime`, detection once per camera frame with time-constant smoothing, `stepBoardFrame`, `playNudge`, player profiles
  - **Plan 1b:** colour hold, conditional latched at settle, loop-bank capture guard, settle tick only for new placements, safe control counters (hold last value)
  - **Plan 1d:** `BoardView` piece states, nudge slot, status pill, handedness layout

## Problem

While counters are placed, the camera reacts to the player's hand and arm. In a real session the user saw three things:
1. **The hand or arm triggers notes.** Skin or sleeve is read as a coloured counter.
2. **Counters drop out.** A counter hidden under the hand disappears and the music changes, then it comes back.
3. **The grid flickers.** A passing arm makes detection flicker across many cells.

**Root causes** (research, 2026-09-15; code plus a scratch simulation that drives the real reader, recogniser and settle mode):
- **A slow arm counts as still.** Today only fast movement is rejected. Velocity comes from the centroid of the matched pixels *inside one cell*. That centroid is clamped to the cell, so an arm bigger than a cell sits "still" at the cell centre. Anything slower than about 4.8 squares per second also counts as still.
- **Hidden counters drop out and re-settle.** A hidden counter drops out after 150 ms and needs another 600 ms to come back.
- **Settled cells take on the hand's colour** instantly.
- **Resting or pausing arms settle and play.** They can also save an unwanted loop.
- **Simulated totals.** Across 9 placing and resting scenarios on 8 × 8, today's code gave 14 false settles, 10 dropouts, 13.4 s of swapped colour, and 10.7 s with the volume at zero. On 4 × 4 it gave 3 false settles, 13 dropouts and 19.9 s swapped.
- **Project 1's logic fixes help but aren't enough.** Colour hold, fader hold and the capture guard remove the swaps and the silent volume. They don't stop sleeves settling or hidden counters dropping out.

The player also sometimes knocks the board or sweeps an arm across it. Today a knock silences the pattern and **forgets** it within 150 ms.

## Decisions locked
1. **A board watcher, on by default.** It is cheap image logic with no downloads. The MediaPipe hand finder is **not** included for now; revisit if real sessions need it.
2. **Covered counters keep playing.** Only cells under the hand are held, never the whole board.
3. **No "Hold board" control.** The automatic guard is enough.
4. **Knock guard holds until someone chooses.** A knocked pattern keeps playing as ghosts until **Let go** or **Save as loop** is pressed, or the counters come back.
5. **The old skin-colour rule is not turned back on.** Wood looks like skin, and the rule does nothing for sleeves or hidden counters.

## Experience

### Hand guard (while playing, and in Set up → Ready)
- **Holding.** When an arm or hand reaches over the board, the cells under it plus a small margin are **held**:
  - a counter under the hand keeps playing
  - a sleeve can't add a note
  - nothing flickers
- **Releasing.** When the arm leaves, held cells go back to normal after **0.25 s** (`handReleaseMs`).
- **Faster settling.** While the guard is working, a newly placed counter settles in **about 0.3 s** (`settleAfterHandMs`) instead of 0.6 s. The hand is no longer mistaken for a counter.
- **Something resting.** If something stays over the same cells for **more than 4 s** (`restNudgeMs`), a nudge appears: "Something is resting on the board — pieces under it are on hold."
  - It has **Not now**.
  - It stays held and is never absorbed into the board background.
- **Whole-picture change.** A camera bump, the board being moved, or a big lighting change makes most of the edge ring change at once. The guard does **not** hold the whole board. It resets its background once the picture is still, and raises the existing `board-moved` nudge. Project D later handles this automatically.
- **Warming up.** The watcher needs a view of the board with no hands over it.
  - It learns this at **Ready** and at **Play**, from a short still moment (≥ 5 still frames).
  - Until then the status says "Hand guard: waiting for a clear view of the board".
  - The board works as it does without the guard.
- **Feedback (never colour alone):**
  - **Status pill:** "✋ holding 3" while cells are held.
  - **`BoardView`:** held cells get a **hatched** overlay (diagonal lines), distinct from the unsettled dotted ring, the Variation long-dash ring and knock ghosts.
  - **Camera surface:** the arm mask is drawn as a soft outline (Set up video and PiP).
  - **Ready live check:** held cells are hatched and left out of the detected counts, so waving a hand doesn't change the numbers.
  - **No per-event announcements.** Only the resting nudge is announced (once).
- **Check my hand** (Set up → Colours → Detection sensitivity → Hands; also a button on Ready).
  - The user holds a hand (with their usual sleeve) over the board for 2 s.
  - The app shows the held cells, and reports any colour band that lights up under the hand: "Orange lights up under your hand — the hand guard will hold those cells, but a sleeve that isn't a counter colour helps."
  - This is information only; nothing changes automatically.
- **Setup tips** on the Camera step, as a Details disclosure:
  - Put the camera high and **opposite the player**, never over the shoulder. For a left-handed player, front-right.
  - Light should come from near the camera.
  - Use plain sleeves that aren't a counter colour.

### Knock guard (while playing)
- **Trigger.**
  - Within **300 ms** (`knockWindowMs`), at least **3** settled note counters (`knockMinCount`) that make up at least **40%** of the settled note counters (`knockMinFraction`) are lost.
  - At the moment they are lost, those cells are **not held by the hand guard**. A covering hand is a hold, not a knock.
  - Counters with control or Off roles and the loop-bank slot row are ignored.
- **Ghosts.**
  - The lost cells become **ghosts**. They keep sounding exactly as before: the same colour, conditional flag, page and loop behaviour.
  - Drawing: a hollow disc with a double thin outline and a small **↺** glyph.
  - A second knock while ghosts exist adds its cells to the ghosts.
- **The message** goes in the nudge slot, takes priority over other nudges, and is announced once without taking focus.
  - Text: "Pieces were knocked — the pattern is still playing."
  - Buttons, each ≥ `--bs-target`, placed on the player's side via `layoutFor`:
    - **Let go:** clears all ghosts.
    - **Save as loop:** only when the loop bank is on and has an empty slot. It saves ghosts plus live note cells into the first empty slot as a *paused* loop, then clears the ghosts. Confirmation text: "Saved to slot 3 — put a counter on slot 3 to play it."
  - There is **no Not now**. The message stays until one of these happens:
    - a button is pressed
    - every ghost has been replaced
    - Play stops
- **Returning counters.** When a counter settles in a ghost's cell, that ghost is removed and the live counter takes over, whatever its colour. The message disappears when no ghosts remain.
- **New counters** placed elsewhere play on top of the ghosts.
- **Stop** clears all ghosts.
- **Switch.** Knock guard is on by default: "Keep the pattern if pieces get knocked", under Detection sensitivity → Hands.

### Settings (per player; sanitised; plain labels in the Hands group)

| Setting | Default | Range | Label |
|---|---|---|---|
| `handGuardEnabled` | true | on/off | Ignore hands |
| `handMarginSquares` | 0.75 | 0.25–2 | Space around a hand |
| `handReleaseMs` | 250 | 100–1000 | Wait after hand leaves |
| `settleAfterHandMs` | 300 | 150–1000 | Settle time with hand guard |
| `intruderSensitivity` | 18 (/255) | 8–40 | Hand sensitivity |
| `restNudgeMs` | 4000 | 2000–15000 | *(Details)* Resting-hand message after |
| `knockGuardEnabled` | true | on/off | Keep the pattern if pieces get knocked |
| `knockMinCount` | 3 | 2–8 | *(Details)* Pieces knocked at once |
| `knockMinFraction` | 0.4 | 0.2–0.8 | *(Details)* Share of pattern knocked |
| `knockWindowMs` | 300 | 150–1000 | *(Details)* Knock time window |
| `captureQuietMs` (from project 1) | 500 | 0–2000 | Save loop only when hands are away |

All thresholds are named, exported constants, marked for tuning on real frames.

## Architecture

### `src/tracking/handGuard/intruderMask.ts` (pure)

```ts
interface WatchGrid { w: 48; h: 48; ringFrac: number; imgIdx: Int32Array; offImage: Uint8Array; inSquares: Uint8Array; cellOf: Int16Array }
function buildWatchGrid(H: Mat3, imgW: number, imgH: number, rows: number, cols: number, ringFrac = 0.12): WatchGrid;
// Board-space 48×48 grid covering the playing squares plus a ring of ringFrac board widths on every side,
// projected once per homography/grid change (image index per point, -1 when off-image).

interface WatchState { bg: Float32Array /* rgb per point */; ready: boolean; stillFrames: number;
  global: { since: number | null }; maskSince: Map<number /*cell*/, number>; heldUntil: Map<number, number> }

function stepWatcher(prev: WatchState, grid: WatchGrid, rgba: Uint8ClampedArray, now: number, opts: WatcherOpts):
  { state: WatchState; mask: Uint8Array; heldCells: Set<number>; resting: boolean; global: boolean; ready: boolean };
```

- **Input.** The ÷4 RGBA frame `BoardReader.read` has already drawn. `BoardReader` exposes its last `ImageData`; no second `getImageData`.
- **Deviation.** Per grid point: the maximum channel difference between the pixel and the background, after **gain compensation**. The compensation is the median ratio of current to background over the still, non-deviating ring points, and it fixes exposure dips. A point deviates when the difference exceeds `intruderSensitivity`.
- **Seeds.** Deviating points **outside the playing squares** (the ring), plus deviating points next to off-image points (a cropped ring). Counters never cross the board edge; arms always do.
- **Mask.** A 4-connected flood fill from the seeds through deviating points, then dilated by `handMarginSquares`. A cell is covered if any mask point falls in it.
- **Held cells.** Covered cells, plus cells uncovered less than `handReleaseMs` ago.
- **Background.**
  - Initialised when ≥ 5 consecutive frames are still: mean grey difference below `STILL_MAX`, with no deviating ring points.
  - Updated at time constant `bgTauSec` (default 2 s), only for points that are outside the mask **and** not deviating from the previous frame. New counters are absorbed within a few seconds.
  - Frozen entirely while any mask exists.
- **Global change.** More than 50% of ring points deviating for more than 1 s sets `global`. There is no holding while global. The background resets after the next still moment, and `board-moved` is signalled.
- **Resting.** Any cell continuously covered for more than `restNudgeMs` sets `resting`.
- **Cost.** About 0.1 ms per frame in the research benchmark (Core Ultra 7), versus 0.12–0.15 ms for today's sampling. It runs in `useBoardRuntime` on each camera frame, right after `BoardReader.read`. No worker.

### `src/tracking/handGuard/knockGuard.ts` (pure)

```ts
interface KnockState { recentLost: { cell: string; at: number }[]; ghosts: Map<string /*row,col*/, ActiveCell> }
function stepKnock(prev: KnockState, settledBefore: ActiveCell[], settledNow: ActiveCell[], held: Set<string>, now: number, opts: KnockOpts):
  { state: KnockState; knocked: boolean };
function releaseGhostsAt(state: KnockState, settledNow: ActiveCell[]): KnockState; // live counter replaces ghost
function letGo(state: KnockState): KnockState;
function ghostsForSave(state: KnockState, liveNotes: ActiveCell[]): ActiveCell[];
```

### Integration (project 1 modules)
- **`useBoardRuntime`** keeps `WatchState` and `KnockState` in refs, and rebuilds `WatchGrid` when the homography, rows or cols change. Per camera frame:
  1. `BoardReader.read`
  2. `stepWatcher`
  3. Remove held cells' readings before `mode.step`. Held cells keep their state untouched, because `step` only updates cells present in `readings`.
  4. On release, `mode.restartSettle(cells)` restarts the settle clock for idle or settling cells. It does **not** touch settled cells.
  5. `stepKnock`, then `stepBoardFrame(..., { held, ghosts })`.
- **`BoardSequencerMode`**
  - gains `restartSettle(cells)`
  - gains `setSettleWindow(ms)`; while the watcher is ready and not global, the runtime uses `settleAfterHandMs`, otherwise `settleWindowMs`
- **`stepBoardFrame`**
  - The engine's active cells = live settled note cells ∪ ghosts, with live winning per cell.
  - Control cells: hold-last-value (project 1b) covers held cells.
  - Loop-bank capture also requires no mask during the last `captureQuietMs`.
- **`playNudge`**
  - New kind `something-resting` (from `resting`), with the standard hysteresis and **Not now**.
  - New kind `knocked` (from non-empty ghosts), with no Not now.
  - Priority: `knocked` > `colour-matches-board` > `something-resting` > `board-moved`.
  - While `global`, `board-moved` fires without its usual minimum-piece rule.
- **`BoardView`** adds two piece and cell states: `held` (hatched) and `ghost` (double outline plus ↺). The legend's count text says "3 playing (2 held)".
- **Status pill** shows ✋ plus the count of held cells when greater than 0.
- **Player profile** stores the settings above.

## Testing
- **Synthetic scenes** (`src/__tests__/helpers/syntheticHands.ts`), ported from the research simulation (`handsim.ts`, scratch). An angled board with counters, and a moving or resting hand, forearm, sleeve and cast shadow, at 320 × 240. It uses the real `sampleRegion` → `blendFractions` → `ColourRecognizer` → `BoardSequencerMode` path.
- **Hand guard:**
  - Across the 9 research scenarios (reach and place, hover, pause, rest 5 s, sleeve over dark squares, cross-board sweep, place near a settled counter, hand under a volume counter, shadow only), on 8 × 8 and 4 × 4 with the guard on: **0 false settles, 0 dropouts, 0 colour swaps, 0 s volume-at-zero**. Every placed counter settles after release, at 657–783 ms in the research simulation.
  - An interior counter never seeds the mask; an arm crossing the edge always does.
  - Gain compensation: a 20% exposure dip gives no mask.
  - A camera bump sets `global`, holds nothing, and resets after stillness.
  - A new counter placed with hands away is absorbed into the background within `bgTauSec`·3.
  - Resting for more than `restNudgeMs` sets `resting`.
  - `handReleaseMs` is respected.
  - `restartSettle` doesn't un-settle settled cells.
  - `buildWatchGrid` off-image handling.
- **Knock guard:**
  - Trigger at 3 cells and 40% within 300 ms; no trigger for 2 cells, or spread over 1 s.
  - Cells held by the watcher never count as knocked.
  - Control, Off and bank-row cells are ignored.
  - Ghosts keep sounding in the engine's active cells.
  - A returning counter (any colour) replaces its ghost.
  - A second knock adds to the ghosts.
  - Let go clears them; Stop clears them.
  - Save as loop writes ghosts plus live cells to the first empty slot as paused, and is unavailable when there is no empty slot or the loop bank is off.
- **`playNudge`:** the priority order; `knocked` has no dismiss; `something-resting` hysteresis and Not now.
- **Performance:** `stepWatcher` on a 320 × 240 frame stays under 1 ms per frame in a benchmark test (reported, not asserted against wall clock in CI).
- **Manual (real board, USB webcam):**
  - Tim places counters with his left hand: no stray notes, no dropouts, no flicker.
  - A resting arm shows the resting nudge after about 4 s.
  - Sweeping an arm across the board keeps the pattern playing as ghosts until Let go.
  - Knocking the board: ghosts, then the counters come back and the message clears.
  - A dark sleeve over walnut: note whether the watcher misses it, as evidence for the MediaPipe decision.
  - Check my hand reports colours lighting under the hand.
- **Real-frame fixtures** follow the auto-detect privacy rule: only the developer's own hand, checked by eye, never participants.
- `npm run lint` and `npm run test:run` pass.

## Out of scope
- MediaPipe hand finder, and a Hold board control (declined for now).
- Board tracking (project D) consumes `global` later.
- Zones and pads (project B). A future Hold/Freeze pad could reuse the `held` path.

## Risks
- **Low contrast:** a dark sleeve over walnut may not deviate enough. Tunable `intruderSensitivity`; revisit MediaPipe if real sessions show misses.
- **Camera directly overhead and very close:** a hand could appear over the board without crossing the ring in the image. The ring width (`ringFrac`) and the setup tips mitigate this; the manual checklist checks it.
- **Auto exposure and white balance drift:** handled by gain compensation and slow background adaptation; checked on real frames.
- **Knock guard can mask a deliberate clear:** Let go is always one large tap away, and the guard can be switched off.
