# Board Sequencer — Auto-detect Board & Colours

- **Date:** 2026-09-15
- **Status:** Approved design (brainstorm, mockup `auto-detect.html`). Revised after an adversarial spec review. Awaiting user spec review.
- **Branch:** `feat/board-sequencer-mode`
- **Sub-project 2 of 2.** Depends on sub-project 1 (`2026-09-15-board-sequencer-redesign-design.md`), which provides:
  - the Set up flow and the **Find board** / **Find colours** buttons
  - `BoardCornerEditor` (tap / review / adjust modes, props)
  - `CameraSurface` (single video)
  - `orientation.ts`, `cornerEditor.ts` helpers
  - `classifyCounterKind`, `suggestRole`, `suggestReadSettings`
  - `boardSquares`, `readSettingsCustom`, the channel-id no-reuse rule
  - `playNudge`
  - "detection never runs while playing"
- **Supersedes** the "No auto-detection" non-goal in `2026-06-02-board-sequencer-mode.md` §3. That spec gets a one-line pointer here.

## Problem

Setting up means clicking four corners precisely, then clicking each counter, and the board moves a little every session.

Click calibration also builds colour bands that are **never checked against the board**. In research, the bands for red, orange and yellow counters lit **50–100% of empty cells** on walnut and maple boards.

## Goals
- **Find board.** Detect the playing-area corners and the square count (8 × 8 / 10 × 10) from an **empty** board in about 1 s, with a confidence level.
- **Find colours.** Detect each counter colour from "one of each counter on the board", with bands that **match none of the empty squares**.
- **Never surprise the user.**
  - Results are proposals the user confirms.
  - Low confidence falls back to the editor with a best guess.
  - The manual paths always remain.
  - Saved orientation and saved channel identities are preserved.
- **Code quality.** Pure, DOM-free, unit-tested modules with no heavy dependencies.

## Non-goals
- **Tooling:** OpenCV.js and ML models.
- **Boards:** occupied boards (e.g. draughts start positions) and non-checkered boards (printed grid mats, Scrabble). Manual corners stay the path for those.
- **Timing:** detection while playing.
- **Camera:** exposure lock, and Camo/iPhone.
- **Pieces:** tall chess pieces. Counters are assumed.

## Research summary (2026-09-15; synthetic prototypes, not in the repo)
- **OpenCV.js was rejected.**
  - The npm build doesn't export `findChessboardCorners`/`SB`.
  - It is 3.5 MB gzipped and would need a custom Emscripten build.
  - Its finder needs a light border and an empty board.
- **Grid: a custom TypeScript x-corner + lattice detector** (about 400 lines).
  - 280 synthetic frames across 14 conditions produced **0 high-confidence wrong answers**.
  - Clean or lightly loaded boards: 80–100% high-confidence and correct, with about 1 px corner error.
  - 10–17 ms per frame at a 320 × 240 working size.
  - It fails safely (low/none) with 24+ counters, an arm on the board, or a partly visible board.
- **Colours: square model → piece blobs → Lab clustering → board-checked band fitting.**
  - Auto bands lit **0 empty cells** in every scene they should handle.
  - Known failures are detectable and reported: white-on-white or black-on-black, a mostly covered board, and blue vs purple on a washed-out camera.
- **All thresholds come from synthetic frames.** Real frames from the user's USB webcam and board come first (**Phase 0**).

## Experience

### Capture burst (shared by Find board and Find colours)

`useFrameBurst` captures a frame about every 150 ms from the moment the button is pressed.
- **Per frame.**
  - It runs the detector callback (which may return a Promise, and is awaited) on every frame.
  - It tags each frame `still` when its stillness score ≤ `STILLNESS_MAX`. That is a named constant with an initial default, tuned in Phase 0.
  - Stillness is the mean absolute grey difference **inside the board quad plus a 0.5-square margin** once a stored or best-so-far lattice exists, and over the whole frame before that. Movement elsewhere in view doesn't block capture.
- **The burst ends at the first of:**
  - (a) **Find board:** ≥ 3 still frames agree within 0.2 square. **Find colours and the saved-colour check** (no per-frame detector): ≥ `COLOUR_BURST_STILL` (= 5, named constant) still frames captured;
  - (b) 10 frames captured;
  - (c) 4 s max wait;
  - (d) **Use this picture**, which captures and detects one more frame, then ends.
- **Cancel** is always visible (≥ `--bs-target`, keyboard and switch reachable). It stops the burst, returns to the step, and changes nothing.
- **UI while capturing.** A "Hold still" progress ring, with "Keep hands away from the board".
- **Refuses to run while the runtime is playing.**

### Find board (Set up → Board)
1. **Start.** Heading: "Put the board in view, empty. Keep hands away." The user presses **Find board**, and the burst runs `detectBoard` per frame.
2. **Consensus.** `consensus` runs over **all** captured frames.
   - ≥ 3 frames agreeing within 0.2 square with `high` status → `high`. Agreement is itself evidence of stillness.
   - Otherwise the best single detection, **capped at `low`**.
   - `partial` and `none` pass through.
3. **Keep the saved orientation.** When saved corners exist (`config.enabled`), the proposal is reordered with `matchSavedOrientation(detected, saved)`. Of the 8 turn/flip orders, it takes the one with the smallest total distance to the saved corners. `offscreenCorner` is remapped too.
   - With no saved corners, it uses picture order: image-top = high notes, image-left = start. The user fixes it once with Turn/Flip against the **start → / low** labels.
4. **Result** (announced; nothing is saved yet):
   - **Found** (`high`):
     - The editor opens in **review** with the accent outline, square grid and labels.
     - Message: "Found an 8 × 8 board. Does the grid sit on the squares?"
     - Buttons (the editor's own): **Looks right** · **Adjust** · **⟲ Turn** · **⇋ Flip** · **Tap corners again**.
     - The detected size is shown and pre-selected in Board size, but **not saved**. While the proposal is open, the Board size control edits the proposal's size, and the divisor options and hints follow it. Looks right saves it.
   - **Not sure** (`low`):
     - **review** with a dashed warning outline and the best guess.
     - Message: "I'm not sure this is right. Adjust the corners onto the outside corners of the squares (not the wooden edge)."
     - Tips: take the counters off, more even light.
     - Buttons: **Adjust corners** (primary) · **Try again**, plus the editor's own **Looks right** · **⟲ Turn** · **⇋ Flip** · **Tap corners again**.
     - After Adjust → Done, review keeps the warning outline and **Looks right** becomes primary.
   - **Part of the board is out of view** (`partial`):
     - **review** with the off-screen corner highlighted and **Looks right disabled** while any corner lies outside the picture. After Adjust brings it in, the review is normal (sub-project 1's editor rule).
     - Message: "The bottom-right corner is outside the camera picture. Move the camera back."
     - Buttons: **Try again** · **Adjust**.
   - **Couldn't find a board** (`none`):
     - The editor opens in **tap** mode (Cancel follows sub-project 1's rule).
     - Message: "Couldn't find the board. Try: take the counters off, more even light, whole board in view."
     - **Try again** stays available.
5. **Snap** (only when `latticeNodes` exist).
   - **Snap to squares** switch in adjust mode: on by default, session only.
   - `latticeNodes` are **every integer lattice point in the image**, including points extrapolated beyond the detected x-corners, so the board's outer corners can be reached.
   - **Drag:** the nearest node within 0.35 square is highlighted while dragging, and the handle snaps on release.
   - **Tap a handle, then tap a destination:** the destination snaps to the nearest node within 0.35 square.
   - **Arrow keys and on-screen nudges never snap.** A **Snap to nearest corner** button does it on demand.
   - Every snap is announced ("Snapped to board corner").
6. **Looks right.** A single config write via `handleCalibrated(corners, { boardSquares, squareModel? })` saves corners, `enabled: true`, `boardSquares`, any camera-fallback fields, and the square model:
   - **Built from the final corners.** The model is built from the burst's retained RGBA frames, warped with the **final confirmed** corners (after any Adjust, snap, Turn or Flip) and the confirmed `boardSquares`: `buildSquareModel(medianStack(frames.map(f => warpToBoard(f, H_confirmed, squares))), squares)`.
   - **When no model is stored.** No model is stored if it returns `board-too-covered`, after `none`, or if the confirmed corners have moved away from detection.
     - The movement check treats corners as an **unordered set**: every confirmed corner must be within 0.35 square of *some* detected corner.
     - Turn and Flip only reorder corners, so they never prevent a model.
   - **Frame retention.** Frames are kept in memory until the user leaves the Board step; they are never persisted.
   - **Try again / Cancel / leaving the step** keep the previous corners, `boardSquares` and model.

### Find colours (Set up → Colours)
1. **Start.** Heading: "Put one of each counter you want on the board. Hands away." The user presses **Find colours**.
2. **Capture and detect.**
   - The burst captures frames; the median stack uses still frames when there are ≥ 3, otherwise all frames.
   - `detectColours(frames, H, squares, { squareModel, signal })` is **async** and cancellable.
   - It uses the stored `squareModel` when present. Otherwise it builds one from this capture (counters allowed; outlier removal handles them), or returns `board-too-covered`.
3. **Clustering order.**
   - The first run merges similar colours (merge distance 16).
   - **Try again (one colour per counter)** re-clusters the already-captured blobs with `oneEach: true`.
4. **Results panel:**
   - **Cards.** One card per colour, **numbered 1…N**. Each shows its number badge, real swatch with contrast ring, name, "1 counter", "lights 1 square now", a **suggested job**, and a board-check badge ("Doesn't match the board ✓").
   - **Rings on the video.** Each found counter gets a ring labelled with its card's number; all counters of a colour share the number.
   - **Live preview.** Cells each colour would light on the current board are tinted **and** numbered, so it is never tint-only.
   - **Buttons:** **Use these colours** (primary) · **Try again** · **Tap a missing counter**. That last one is sub-project 1's tap and **Pick a square** flow, now board-checked; the added counter's job is `suggestRole(currentCards, added)`.
5. **Plain-language outcomes:**
   - **Unsafe colour.**
     - Trigger: it matches empty squares beyond `maxFp`, or fails the ±15% exposure drift test.
     - Message: "Black looks a lot like the dark squares, so it may be missed in dim light."
     - The job is pre-set to **Off**. **Leave off** keeps Off; **Use anyway** sets `suggestRole` of the other cards.
   - **Fewer colours than counters.**
     - Only when clusters < blobs: "I found 2 colours on 3 counters. Did you put out 3 different colours?"
     - Buttons: **Try again (one colour per counter)** · **Tap the missing counter** · **That's right**.
   - **Two colours too close.**
     - Only after a one-per-counter run, Lab distance < 16: "These two look the same to the camera."
     - **Treat as one** merges the core pixels, refits and re-validates.
     - **Keep separate** marks both cards "may be confused".
   - **Large object.**
     - "Something big is on the board (a hand?). Move it away."
     - It waits for stillness and retries **at most 2 more times** (3 attempts or about 10 s).
     - Then it stops with **Use this picture anyway** · **Try again** · **Tap a missing counter**.
   - **Board too covered.**
     - "Too much of the board is covered to tell squares from counters. Clear it and press Find board first."
   - **Small pieces for the grid.**
     - "Counters look small for a 4 × 4 grid."
     - **Use suggested** writes `pieceAreaSquares` (the measured median blob area, 0.12–1.6) and re-runs `suggestReadSettings(..., pieceAreaSquares)`.
     - It does **not** set `readSettingsCustom`, so later grid changes still re-suggest from the measured size.
6. **Saved colours.**
   - **On entering Colours with saved channels:**
     - Capture a short still burst of the **current** board.
     - Use the stored `squareModel`, or build one from that burst.
     - Run `validateChannel` on the fresh warp.
     - Result: "Your 3 colours look fine ✓", or "Red now matches the board. Find colours again?"
     - If there is no usable model (`board-too-covered`): "Clear some counters to check your saved colours", with no ✓.
   - **Use these colours** when saved channels exist asks first: "Replace your 3 saved colours? Blue isn't on the board and will be removed. Loops using Blue will go quiet."
   - **Matching.** `matchSavedChannels(saved, detected)` pairs saved and detected colours one-to-one:
     - Distance: Lab of `rgbToLab(swatch)` vs the cluster core Lab, pairs < 16.
     - Greedy, smallest distance first. Ties go to the lower saved index, then the lower detected index.
     - A matched colour **keeps the saved `id`, `role`, `instrument`/`drum` and mix**, and takes the new `kind`, band and `swatch`. Saved pages and loop slots keep working.
     - Unmatched detected colours get fresh ids (no-reuse rule) and `suggestRoles` jobs.
     - Unmatched saved channels are removed.
7. **⟳ Recalibrate and Tap a counter** also run the board check, with the same model sourcing and warnings. They never block saving: when the check can't run, the message is "Not checked against the board. Clear the board and press Find board."
8. **Read-settings changes.**
   - Whenever `minFilledFraction` changes (re-suggest, slider or accepted suggestion) and a model exists, re-check every non-off channel.
   - If `worstSquareFp > minFilledFraction / 3`, show on Board (next to Rows/Steps) and on Ready: "Red may light empty squares at this grid size. Use more steps, or Find colours again."
   - Nothing changes automatically.

### While playing
- Sub-project 1's `colour-matches-board` nudge keeps its signature and trigger.
- With auto-detect its message becomes "<Name> is matching the board. Find colours again?", and its button **Find colours again** (confirm stop → Set up → Colours, which runs the saved-colour check on entry).
- The `board-moved` nudge is unchanged. Detection never runs mid-play.

### Test pictures & privacy (Phase 0 and ongoing)
- **Gating.** **Save test picture** appears under Camera → Details only when the app runs with `?boardDebug=1` in the URL or `import.meta.env.DEV` is true. It is never shown by default.
- **Format.** Each capture downloads a `.json` fixture:
  - `version`
  - `frames`: 1 frame (empty board), or up to 5 (with counters). Each is the displayed-space RGB frame from `captureDisplayedFrame` at the **detection working width of 320 px** (the same width live detection uses), alpha dropped, deflated with `CompressionStream('deflate')`, base64-encoded.
  - `videoWidth`, `videoHeight`, `mirrorX`, `mirrorY`, camera label
  - `corners` plus `cornersSource: 'confirmed' | 'hand-labelled' | 'none'`
  - `captureId`, and for with-counters captures `pairId` (the `captureId` of the matching empty capture)
  - `boardSquares`, `rows`, `cols`, read settings
  - `counters`: cell and colour name for each counter present
  - `channels`: the saved channels at capture time
  - No greyscale or pre-warped images are stored. Tests derive them with production code.
- **Privacy rule** (the repository is public):
  - Only **people-free** frames of the developer's own board, counters and the **developer's own hand** may be committed.
  - They must contain no participants, faces, bodies or identifiable room details, and each is **checked by eye before commit**.
  - Frames captured in sessions with participants are **never committed**. They go in the git-ignored `src/__tests__/fixtures/board-frames-local/` (added to `.gitignore`), and only where the study's consent/ethics approval covers storing images.
  - Tests that use the local folder skip when it is absent.
- **Size budget.**
  - At 320 × 240 RGB, a frame is about 0.23 MB raw and roughly 0.2–0.3 MB deflated and base64-encoded.
  - Committed with-counters captures **keep their full burst** (up to 5 frames); empty captures have 1 frame.
  - Committed fixtures total **≤ 15 MB** (e.g. 10 empty + 10 with-counters captures). If over budget, trim with-counters bursts to 3 frames.
  - The local folder is only for participant-session frames.

## Architecture

### Frame capture
- `src/tracking/boardDetect/captureFrame.ts`: `captureDisplayedFrame(video, mirrorX, mirrorY, targetW = 320): ImageData`.
  - **320 px** is the single detection working width for Find board, Find colours, the saved-colour check and test pictures. The grid detector runs at it directly, and `warpToBoard` samples it at 24 px per square.
  - It is the mirrored draw extracted from `sampleAvgHsvAt` and `BoardReader.read`. Both are refactored to use it, with no behaviour change.
  - It reads `CameraSurface`'s single live element.
- `src/ui/screens/boardSequencer/useFrameBurst.ts`: the algorithm above.
  - Injectable frame source, clock and stillness function, for tests.
  - Takes an `AbortSignal`.

### Grid detector: `src/tracking/boardDetect/` (pure, typed arrays)
| Module | API |
|---|---|
| `gray.ts` | `toGrayDownscaled(rgba, w, h, targetW = 320)`, `gaussianBlur(img, sigma)` |
| `xCorners.ts` | `findXCorners(img, opts)`: −det(Hessian) saddle score, NMS, relative strength floor, sub-pixel refinement, ChESS-style ring check. Candidates capped at 200. |
| `lattice.ts` | `fitLattices(corners, img, opts)`: parallelogram seeds; growth within 0.2 lattice units; quadrant alternation check in the lattice frame; LS refit; top 3. `Lattice = { G: Mat3; nodes; score; rms }`. |
| `extent.ts` | `resolveExtent(img, lattice, sizes = [8, 10])`: near-corner median sampling; window parity × in-view − outside-ring agreement. Returns best/second, offset, `lightDark`, `partial`, `offscreenCorner`. |
| `detectBoard.ts` | `detectBoard(rgba, w, h, opts)` → `BoardDetection`. `opts.now` (default `performance.now`) and `opts.budgetMs` (default 150); over budget → `none` with a budget reason. |
| `consensus.ts` | `consensus(detections)` (rules above) |
| `orientation.ts` | Exists from sub-project 1 (`rotateCorners`, `flipCorners`). Adds `orderCornersByImage(pts)` and `matchSavedOrientation(detected, saved)`. |

```ts
type DetectStatus = 'high' | 'low' | 'partial' | 'none';
interface BoardDetection {
  status: DetectStatus;
  // Fractions of the full captured frame, displayed (mirrored) orientation — same space as BoardReader.
  // Image-space TL,TR,BR,BL = saved corners[0..3] by default (image-top = high notes, image-left = start).
  corners?: [BoardPoint, BoardPoint, BoardPoint, BoardPoint];
  squares?: 8 | 10;
  latticeNodes?: BoardPoint[];   // every integer lattice point inside the image, incl. extrapolated outer corners
  offscreenCorner?: 0 | 1 | 2 | 3;
  metrics: { coverage: number; agreement: number; margin: number; rms: number; ms: number };
  reasons: string[];             // plain-language hints
}
```
- **Initial confidence rule** (tuned in Phase 0): `high` iff not partial, coverage ≥ 0.45, margin ≥ 0.15, agreement ≥ 0.6.
- **`src/utils/homography.ts`:** add `fitHomographyLS(src, dst)` (Hartley-normalised least squares). `computeHomography` is unchanged.

### Colour detector: `src/tracking/boardColourDetect/` (pure)
| Module | API |
|---|---|
| `warp.ts` | `warpToBoard(frame, H, squares, pxPerSquare = 24)`, `medianStack(warps)` |
| `lab.ts` | `rgbToLab`, `labDistance(a, b) = hypot(0.5ΔL, Δa, Δb)` |
| `squareModel.ts` | `buildSquareModel(warped, squares)` → `SquareModel \| { error: 'board-too-covered' }`. Central-60% median Lab per square; per-parity 3×MAD outlier removal (twice); per-parity lighting plane; per-parity threshold max(10, 1.5·P97). Parity and plane are in the **confirmed** board orientation. |
| `blobs.ts` | `findPieceBlobs(warped, model)` → `PieceBlob[] \| { error: 'large-object' \| 'no-pieces' }`. Deviation mask with Lab shadow rejection; 3×3 open; connected components; area 0.12–1.6 squares; glare-trimmed core colour. |
| `cluster.ts` | `clusterPieceColours(blobs, { mergeDistance = 16, oneEach })`, `closePairs(clusters)` |
| `fitBand.ts` | `fitChannelBand(cluster, model, warped, others, { maxFp })`. **Kind comes from `classifyCounterKind`** (sub-project 1), from the core colour converted to HSV 0–100; it has no thresholds of its own. See the search below. |
| `validate.ts` | `validateChannel(channel, model, warped)` → `{ worstSquareFp, driftFp, safe }`. The model only identifies empty-square pixels and parity. The FP fractions (including ±15% value shifts) are **measured on the fresh `warped` pixels**, never estimated from stored medians. |
| `suggest.ts` | `suggestRoles(channels)`: unsafe → off; order the rest with the darkest achromatic first, then red-ish ahead of blue-ish; fold sub-project 1's `suggestRole` over that order. Also `matchSavedChannels(saved, detected)`. |
| `detectColours.ts` | `detectColours(frames, H, squares, opts): Promise<ColourDetection>`. Yields between clusters, honours `opts.signal`, and returns cards plus structured warnings. |

**Band search** (`fitChannelBand`):
- **Candidates.**
  - hue: h0 ± 12 in steps of 3; tolerance 6…min(30, P90 + 12); minS and minV from target percentiles and background + 1; minS ≥ 14
  - black: maxValue / maxSaturation
  - white: minValue / maxSaturation
- **Hard constraints.**
  - Worst single empty square matched ≤ `maxFp`, where `maxFp = minFilledFraction / 3`.
  - Other clusters matched ≤ 0.10.
  - Target matched ≥ 0.5.
- **Score** = TP + perturbed TP − cross − 2·FP − loosened FP.
- **Unsafe** if drift FP > 0.10.
- **Band fields.** Existing `TrackedColor` fields. Optional hue-band `maxValue`/`maxSaturation` only if Phase 0 requires it.

**Runtime path unchanged.** `BoardReader`, `sampleRegion` and `ColourRecognizer` stay as they are; detected channels are ordinary `ColourChannel`s.

**Main thread.**
- Grid detection is budgeted at 150 ms per frame, with the UI yielding between frames.
- `detectColours` is async from the start, so moving it to a Vite module worker in Phase 5 changes no API. Workers must be confirmed to build for GitHub Pages.

### Config additions (sanitised; no version bump)
- **`squareModel?: CompactSquareModel`.** Per-parity Lab medians, lighting plane and thresholds. It is used only to separate empty squares from counters in a **fresh** capture (saved-colour check, ⟳, tap-to-add); it never replaces a current frame.
  - **Written** only by Looks right, in the same write as the corners.
  - **Cleared** by any config write that changes corners, `boardSquares`, `mirrorX`/`mirrorY` or camera **and does not carry a new `squareModel` in the same write**. Examples: the Board size control, `changeView`, Tap corners myself, manual Adjust with no burst frames, a re-Find ending in tap mode. A Looks right that also changes `boardSquares` or adopts the fallback camera keeps the model it writes.
  - **Survives** Skip, board hasn't moved. It is never re-oriented, only rebuilt.
- **`pieceAreaSquares?: number`** (0.12–1.6). Set by accepting "Use suggested".
  - **Cleared** only when colours are replaced, or `boardSquares` or the camera changes. It is **not** cleared by re-finding corners, since piece size in squares doesn't depend on board position.
  - When it is cleared and `readSettingsCustom` is false, `suggestReadSettings` is re-applied in the same write.
- **`boardSquares`** (sub-project 1): saved only on confirmation.

### UI wiring (in sub-project 1's views)
- **`BoardStep`.** **Find board** → `useFrameBurst(detectBoard)` → `consensus` → `matchSavedOrientation` → `BoardCornerEditor` with `proposal`, `latticeNodes`, `status`, `offscreenCorner`.
- **`ColoursStep`.** **Find colours** → `useFrameBurst` → `detectColours` → results panel. The saved-colour check runs on entry.
- **`CameraStep`.** The gated **Save test picture**.
- **`playNudge`.** New message and button text for `colour-matches-board`.
- **Test setup.** `src/__tests__/setup.ts` wraps its `window`/`navigator` mocks in `if (typeof window !== 'undefined')`, so node-environment detector tests can load it. The rAF shims stay unguarded. Existing jsdom suites must still pass.

## Phasing
0. **Real-frame capture (prerequisite).** Record every with-counters capture straight after an empty capture, in the same session, lighting and board position, without moving the board or camera. Link the two with `pairId`.
   - Build the gated Save test picture.
   - Record 15–25 **people-free** captures of the developer's board with the USB webcam: empty; one of each counter; a normal pattern; daylight and lamp; slight angles; the developer's hand in view.
   - Hand-label playing-square corners for every capture.
   - Check each by eye, then commit under `src/__tests__/fixtures/board-frames/`. Add `loadBoardFixture` (inflate with `node:zlib`).
1. **Grid detector.** The `setup.ts` environment guard; the synthetic renderer helper; the grid modules plus tests; tuning on fixtures.
2. **Find board UX.** Burst, consensus, orientation match, confidence states, snap, Looks right with the model.
3. **Colour detector.** Modules, synthetic scenes and tests; tuning on fixtures.
4. **Find colours UX.** Results, outcomes, saved-colour check, matching and replace, board-checked ⟳/tap, read-settings re-check, nudge text.
5. **Profile on the target laptop.** Add a worker only if needed.

## Testing
- **Synthetic renderer** `src/__tests__/helpers/syntheticBoard.ts` (seeded).
  - Parameters: N, palette, frame, counters, arm, glare, noise, steepness, out-of-frame shift, distractor.
  - Detector tests may use `// @vitest-environment node` once the `setup.ts` guard lands.
- **Grid:**
  - **Accuracy.** Corner error < 0.15 square and correct N for clean / 12 counters / glare / steep / 10 × 10.
  - **Never high and wrong.** `none` or `low` (never `high`) for no board, distractor only, or half out of frame. `partial` with the correct `offscreenCorner`.
  - **Mirroring.** Mirrored input gives mirrored corners.
  - **Lattice.** `latticeNodes` contain each true outer corner within 0.15 square.
  - **Consensus.** 1 frame → never `high`; 3 agreeing non-still frames → `high`; 10 disagreeing → `low`/`none`.
  - **`matchSavedOrientation`.** After one Turn, and after a Flip, a proposal shifted ≤ 0.3 square and rotated ≤ 10° keeps the saved orientation. No saved corners → picture order.
  - **Helpers.** `fitHomographyLS` recovers a known H with noise. The budget uses an injected fake clock → `none` with a reason.
  - **`useFrameBurst`** (fake timers, injected frames): ends early on ≥ 3 agreeing still frames; 4 s max wait; Use this picture; Cancel.
  - **Snap.** Within the radius → snaps; outside, disabled, or no nodes → stays. Nudging a snapped corner moves it off the node and it stays there.
- **Colour:**
  - **Clean scenes.** 0 false-positive cells for walnut/maple (6 colours), red + orange + blue on walnut, cream/green vinyl, a washed-out camera, and a lighting gradient with a passing hand.
  - **Failure modes.**
    - Black-on-black → unsafe.
    - A covered board → `board-too-covered`.
    - A resting arm → `large-object` on every attempt, with orchestration stopping after 3.
    - Clusters < blobs → the message.
    - A one-per-counter run on blue/purple → `closePairs`.
    - Treat as one → a single refitted, validated channel.
  - **Square model.**
    - A model built after `rotateCorners(c, 1)` or `flipCorners` and then used for `findPieceBlobs` on an empty board → no pieces.
    - Turn/Flip → Looks right → Find colours → 0 FP cells.
    - `handleCalibrated` without a model clears `squareModel`.
    - Turn → Looks right stores a model.
    - Looks right that changes `boardSquares` on the camera-fallback path keeps its new model.
    - Changing `boardSquares` or `changeView` clears it.
  - **Validation.** Validating a fresh darkened or brightened warp against a model stored from a brighter capture flags the now-unsafe channel.
  - **Kind consistency.** For the same HSV, the kind from `fitChannelBand` equals `calibrationFromHsv`'s.
  - **Roles and matching.**
    - `suggestRoles` ordering; batch and tap give the same jobs.
    - `matchSavedChannels`: one-to-one when two detected colours are near one saved channel; tie-breaks; ids kept; unmatched saved channels listed.
  - **Regression.** The old click-calibrated yellow band over maple → unsafe.
  - **Read settings.** A channel fitted at min-fill 0.10 is flagged after a grid change drops min-fill to 0.045.
- **Fixtures (real frames).**
  - **Grid.** `detectBoard` (and `consensus` where a capture has several frames) on each empty capture: corner error < 0.15 square against the hand labels, **or** a non-`high` status.
  - **Colours.**
    - `detectColours(frames, H_labels, squares)` on each counters capture.
    - Run the proposed safe channels through `sampleRegion` + `ColourRecognizer`, using a sampler that mimics `BoardReader`'s downscale, on the matching empty capture (looked up by `pairId`, using its hand-labelled corners).
    - Expect **0 cells occupied**, and `validateChannel(...).safe` must agree.
- `npm run lint` and `npm run test:run` must pass.

## Risks & open questions
- **Synthetic-to-real gap.** Mitigated by Phase 0 fixtures before tuning, and by the confirm-first UX.
- **Auto exposure/white balance** shifting between captures. Mitigated by validation on fresh frames, the ±15% drift margin and the runtime nudge.
- **Board symmetry.** "start" can't be inferred on first run, so Turn/Flip is needed once; after that, the saved orientation is kept.
- **Low-end devices** (3–5× slower). Mitigated by budgets, yielding, async colour detection and an optional worker.
- **Fixture privacy.** Enforced by the rule above; committed fixtures must be reviewed by eye.
