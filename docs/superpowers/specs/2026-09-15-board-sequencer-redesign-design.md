# Board Sequencer — Setup & Play Redesign (Calm theme)

- **Date:** 2026-09-15
- **Status:** Approved design (brainstorm + visual mockups), revised after an adversarial spec review and approved by the user. **Amended 2026-09-15 (second brainstorm):** added player profiles, handedness and seat edge, timing fixes, safe control counters, hand-guard logic fixes and detection clean-ups (see [Foundations added in the second brainstorm](#foundations-added-in-the-second-brainstorm)).
- **Branch:** `feat/board-sequencer-mode`
- **Roadmap.** This is **project 1**. Later projects, each with its own spec → plan, in this order:
  - **A** Hand and knock guard
  - **B** Zones and loop pads (per player)
  - **C** Auto-detect (`2026-09-15-board-sequencer-auto-detect-design.md`), which plugs into the **Find board** / **Find colours** buttons created here
  - **D** Board tracking
  - **E** Box detail and two counters
- **Manual paths.** This spec ships the *manual* setup paths only.
- **Mockups** (git-ignored, for reference): `.superpowers/brainstorm/38-1789501876/content/`: `layout-approaches.html` (A), `visual-style-all.html` (Calm), `setup-flow-calm-v2.html`, `play-screen.html`, `auto-detect.html`. Where this spec and a mockup differ, **the spec wins**:
  - Drums have no mixer.
  - Prompts say "outside corners of the squares".
  - Cards show number badges.

## Problem

The Board Sequencer (`src/ui/screens/BoardSequencerScreen.tsx`, 1557 lines) is hard to set up. The 2026-09-15 audit found:

- **Layout.** About 40 controls sit in 8 equal collapsible sections, in a fixed 248 px rail. Everything is styled inline. Fonts are 10–12 px and targets 16–24 px. Design tokens and Large-UI mode are ignored.
- **Setup order.** Required steps are buried or unordered. Rows/Steps are in the 5th collapsed section. Mirror has to be set before corners, but nothing says so. The Start button scrolls out of view.
- **Mixed purposes.** Setup, performance and advanced tuning share sections; "Colours & detection" also holds Ping-pong, Loop bank and Variation. Half the workspace is a warped grid that shows nothing until Start.
- **Calibration.** Corner calibration has no undo, drag, cancel or keyboard path. Colour pick has no confirm or cancel. The overlays can be focused but can't be operated.
- **State bugs.**
  - `calibrated = storedRef.current !== null` (L194). Touching any control before corners makes the next visit "calibrated".
  - The Tempo slider does nothing while playing.
  - The global Space shortcut and `MuteButton` don't control this screen's audio.
  - Recalibrating a colour drops its instrument and mix.
- **Detection bugs.**
  - Black counters are almost always classified as a random *hue*.
  - A 4 × 4 grid over an 8 × 8 board with the default 5 × 5 samples and 10% min-fill can miss every counter.

## Users & context

- **Who sets up.** Sometimes a facilitator, sometimes the musician alone. So every setup action needs large targets and a non-drag, non-precise alternative.
- **Between sessions.** Same board and counters, but packed away, so the board position shifts slightly each session. Colours are remembered; the board is re-found each session. The board can start empty.
- **Features in use.** Loop bank, variation, ping-pong, pages, control pieces, tempo/key/scale, instrument per colour, feel (swing/humanize/polyrhythm), per-colour mixer. The backing song is not used but is kept.
- **Devices.** Laptop with mouse or trackpad, touchscreen, big screen or projector, keyboard or switch access. All must work.

## Decisions locked

1. **Structure A.** A guided **Set up** flow (Camera → Board → Colours → Ready) and a separate **Play** screen. Every step is remembered, so a normal session is *Find board → Play*.
2. **Visual style: Calm, dark and light.** Slate backgrounds, muted pastel UI accents, extra-rounded shapes, no glow. Counters and swatches always show their **real** sampled colours.
3. **Token-driven, swappable theme.** Swiss minimal may replace Calm later as a token-block swap.
4. **Every feature stays.** The backing song moves behind "More".
5. **Build order.** This redesign first, delivered as **four implementation plans** (see [Delivery](#delivery-four-plans)). Then projects A–E.
6. **Settle behaviour is unchanged for notes.** `BoardSequencerMode` exists only while playing. Set up and stopped views show *detected* pieces (raw per-frame occupancy). Settling, settle flash, note pops and settled counts exist only while playing. Pieces already on the board need `settleWindowMs` after Play before they sound, as today. **Exception:** control-role counters read raw readings with a short stillness debounce (see [Safe control counters](#safe-control-counters)).
7. **The grid defaults to the most recent setup.** Rows and steps are remembered and reused every session. They never change on their own: not on re-finding the board, changing camera or mirror, or switching Board size. Only a brand-new config (nothing saved yet) gets a **square** default of **4 × 4**, which divides an 8 × 8 board. The mockup's 4 × 8 example grid is superseded.
8. **Player profiles.** Settings are split into **per player** and **per board + camera** ("rig"). See [Player profiles](#player-profiles).
9. **Handedness and seat edge are per player.** The current player (Tim) is left-handed. A left-handed layout mirrors the *screen* (panels, transport and nudge controls on the left). It never flips the camera, the board, slider direction or focus order.
10. **Foundations first.** The timing fixes, safe control counters, hand-guard logic fixes and detection clean-ups found in research are built into this project, before the new features that depend on them.

## Experience

### Screen frame

- **Header** (shared `BoardHeader`, used on Set up and Play):
  - **← Exit** leaves the Board Sequencer. If playing, it stops playback first.
  - Title: "Board Sequencer · Set up" or "Board Sequencer".
  - **☾/☀** dark/light.
  - **Aa** Large UI, using store `uiSize`.
  - **?** help, which opens `BoardHelp` at the section for the current view.
  - On **Set up** only: the `StepIndicator`.
  - On **Play** only: the status pill, **⚙ Set up** and **⤢ Big board**.
- **Camera status** is always visible. A single `role="status"` region under the header shows the camera fallback/error notice on every step and on Play ("Using the browser's default camera, not <name>", with a **Change camera** link to the Camera step).
- **Coordinate space.** Board corners, taps, handles, the tap-a-counter picker and the camera overlay are all fractions (0–1) of the **full camera frame** in displayed (mirrored) orientation, the same space `BoardReader` samples. Every camera surface takes its aspect ratio from the live stream (`aspect-ratio: videoWidth / videoHeight`, updated on `loadedmetadata`/`resize`), with no `object-fit` crop or letterbox. Pure helpers `videoContentRect` / `boxToFrame` / `frameToBox` in `cornerEditor.ts` are used for all pointer mapping.

### Player profiles

- **Who's playing?** When the screen opens and more than one player profile exists, a full-screen chooser appears first:
  - One large card per player, showing the profile name (initials or a code are suggested, since names are personal data) and handedness.
  - Plus **New player**.
  - With exactly one profile, it is used silently.
  - The header gains a **Player: <name>** button, disabled while playing, to switch.
- **New player.** Asks for a name, **Handedness** (Left · Right) and **Seat** (which board edge they sit at, set on the Board step). Every other player setting starts from defaults. The rig (board, camera, counter colours) is shared, so a new player on the same board goes straight to Colours → jobs, then Ready.
- **What is per player vs per rig:**

| Per player (`BoardPlayerProfile`) | Per rig (`BoardRigConfig`, this device's board + camera) |
|---|---|
| name, handedness, seat edge | camera choice, mirror/flip |
| grid (rows, cols), read settings (`minFilledFraction`, `samplesPerAxis`, `readSettingsCustom`), settle and hand settings | corners, `enabled`, `boardSquares` |
| per-colour **job, instrument/drum, mix** (keyed by channel id) | counter **colours**: channel `id`, `kind`, `swatch`, bands |
| key, scale, tempo, swing, humanize, note length, loop lengths, octave, volume, tick | (sub-project C) `squareModel` |
| pages, loop slots, variation / ping-pong / loop-bank flags, fader direction and control ranges | |
| theme mode, `boardNudgesEnabled` | |

- **Colours shared by players.** A channel that one player hasn't given a job yet is shown as **Off** for that player until they choose one. Removing a colour removes it from the rig for every player, and the confirmation says so.
- **Large UI** stays app-wide (store `uiSize`).

### Entry routing and camera status

- `CameraStatus = { phase: 'starting' | 'running' | 'fallback' | 'error'; colourless: boolean | null }` comes from `useBoardRuntime`.
  - `fallback` = `CameraManager.start` returned `fellBack`.
  - `colourless` stays `null` until the first reading.
- `resolveEntry(config, hasStoredConfig)` is pure and config-only. It runs **once at mount**:
  - no stored config → **Set up → Camera**
  - stored config with `!config.enabled` → **Set up → Board**
  - `enabled` but no non-`off` channel → **Set up → Colours**
  - valid setup → **Set up → Board** (Camera ✓, Colours ✓, Ready ✓): the "board moved slightly" case
- **Routing never moves the user on its own, with one exception.** If `phase` becomes `fallback` or `error` while the user is still on the entry step and hasn't interacted, the flow switches to **Camera** and announces why.

### Set up: 4 steps

**Step indicator** (`<ol>`, `aria-current="step"`). Each item is done ✓ / current / to-do.
- `stepStatus` is **cumulative**:
  - Camera is done when `phase` is `'running'` or `'fallback'`. Fallback shows a warning tick, not a plain ✓.
  - `'starting'` counts as **pending**. It shows "Starting…" on the Camera item and disables Continue on the Camera step itself. It does **not** block later steps, so a returning user routed to Board isn't held up while the camera starts.
  - Board is to-do while Camera is `error` (or `starting` with no stored config) or `!config.enabled`.
  - Colours is to-do while `!config.enabled`.
  - Ready is to-do unless `enabled` and at least one non-`off` channel.
- A step can be opened from the indicator only if every earlier step is done. `canContinue` uses the same rule.

**Step footer** (always the same order): **← Back** (hidden on step 1), **Skip** where it applies, then the primary **Continue**.
- On entering a step, focus moves to the step heading and `announce()` reads "Step 2 of 4: Board".
- **Space never starts playback in Set up.**

**1 · Camera**
- **Camera picker.** A large list of camera names, with "Browser default" first. It uses the existing `CameraManager` picker, fallback and **Try again**.
- **Live preview.**
- **Mirror** and **Flip** switches.
  - Changing them resets corners (`enabled: false`) and **clears `squareModel`** (project C (auto-detect)).
  - Colours are kept. The corner editor is **not** opened automatically; Board becomes to-do.
- **Plain-language camera check.** "Picture has colour ✓" or the black-and-white warning. Camera name and resolution appear as secondary text. HSV numbers are in a collapsed **Details** disclosure.
- **Continue.**
  - Enabled when `phase` is `running` or `fallback`.
  - If `colourless === true`, it reads **Continue anyway** and the warning stays visible on Board and Colours.
  - Disabled while `starting` or `error`, with a reason.

**2 · Board**
- **Heading:** "Put the board in view, empty." Helper text: "Corners are the **outside corners of the squares**, not the wooden edge." A small inline diagram shows a framed board with the correct corners marked.
- **Board size.** Segmented: 8 × 8 · 10 × 10. With no open proposal it persists to `boardSquares` at once. Project C (auto-detect): while a detection proposal is open, it edits the proposal's size (unsaved), and the divisor options and hints follow it.
- **Find board** (primary).
  - In this sub-project it opens the corner editor in **tap** mode.
  - Project C (auto-detect) replaces its action with detection.
  - **Tap corners myself** (secondary).
- **Corner editor.** See [Corner editor](#corner-editor). A returning user with saved corners enters Board in **review** mode.
- **Rows** and **Steps.** Segmented controls offering only sizes that divide the board (8 × 8: 2 · 4 · 8; 10 × 10: 2 · 5 · 10).
  - **More sizes…** offers the full lists: Rows 2–8 on 8 × 8 and 2–10 on 10 × 10; Steps 2–8, 10, 12, 16. It carries the hint "Cells won't line up with the squares; detection may be less reliable."
  - If the current value isn't a divisor (for example a saved 6 × 6, or 4 × 4 after switching to a 10 × 10 board), **More sizes…** starts open with that value selected, and one line offers **Use 4 × 4 to match the squares** (the nearest divisor ≤ current for each of rows and steps; a square grid stays square; one tap). Rows/cols never change unless the user picks.
  - Changing Board size never changes rows/cols; only the options and hints update.
  - Disabled while playing.
- **Live grid preview** on the video, with orientation labels **start →** (along step 1) and **low** (beside the bottom row).
- **Seat.** "Where does <player> sit?" Four large edge buttons are drawn on the live grid preview (the side with the start →, end, low and high labels), defaulting to the low-notes edge. The choice is saved to the player profile. It tells later features (zones, project B) which way is the player's left. Keyboard/switch: a radiogroup.
- **"Show 'Board moved?' hint"** switch (`boardNudgesEnabled`, default on), under a Details disclosure.
- **Skip, board hasn't moved.**
  - Enabled only when `config.enabled`.
  - Disabled with a reason while `phase` is `fallback` or `error`.
  - Goes to Ready.
- If `phase === 'fallback'`, the step says, before **Looks right**, that confirming corners will make the stand-in camera the saved choice (existing `handleCalibrated` behaviour).

**3 · Colours**
- **Heading:** "Put one of each counter on the board."
- **Find colours** (primary). In this sub-project it arms tap-a-counter; project C (auto-detect) replaces it. **Tap a counter** (secondary).
- **Tap a counter.**
  - A banner "Tap a counter to add its colour" with **Cancel**.
  - After a tap, a pending card shows the sampled swatch, its name and **Add** / **Try again**. Nothing is saved without **Add**.
- **Pick a square** (no pointer). While the banner is showing, a highlighted **board square** is drawn on the video, starting at the centre.
  - Arrow keys and on-screen ◀ ▲ ▼ ▶ move it one square.
  - **Sample this square** (Enter) samples that square's centre via the saved homography (`squareCentreToImage(corners, squares, r, c)`) and opens the same pending card.
  - Its position is announced ("Row 3, column 5").
  - The same picker is used for ⟳ Recalibrate.
- **Colour cards**, one per channel, numbered **1…N in card order**:
  - **Content.** Number badge, large real swatch (with a contrast ring), name, and a live text count ("2 on board").
  - **Numbered tags on the video.** Detected counters of that colour carry the same number on the video. The card's accessible name is "1, Red, 2 on board".
  - **Job chips:** Melody · Bass · Drums · Chords · **Off (not used)** · **Control…**. Exactly one is always selected. Control… opens the fader/toggle roles, and the chip then shows the choice, for example "Control: Reverb".
  - **⟳ Recalibrate** (tap or pick-a-square, confirm). It replaces only `kind`, `swatch` and the band fields, and **keeps `id`, `role`, `instrument`, `drum`, `volume`, `tone`, `reverbSend`, `delaySend`**.
  - **Remove** asks "Remove Red?" If saved pages or loops use that colour, it adds "Saved loops and pages that use Red will go quiet."
- **Clear all** confirms, with the same pages/loops note.
- **Suggested job** for each confirmed Add: `suggestRole(existing, added)`.
  - If `added.kind === 'black'` and Drums is free, Drums.
  - Otherwise the first free of Melody, Bass, Drums, Chords.
  - Otherwise Off.
  - The user can always change it. Project C (auto-detect) reuses this function.
- **Detection sensitivity** disclosure:
  - **Piece coverage** (min fill, plain label). Moving it sets `readSettingsCustom = true`. **Reset to suggested** clears it and re-applies the suggestion.
  - **Black darkness** per black channel.
  - **Settle time** (`settleWindowMs`, "its effect shows once playing").
- Instruments are not here; they are in Play → Sound.

**4 · Ready**
- **Live check.** The board view with every **detected** piece drawn, plus a plain-language list ("Red · row 2 · step 3") and per-colour detected counts.
- **Colour-matching-board warning**, using the same rule as the Play nudge: "<Name> is matching the board itself", with a **Recalibrate <Name>** button.
- **▶ Play.** Enabled only when `enabled` and at least one non-`off` channel and `phase !== 'error'`. It starts the engine and switches to Play.

### Play screen

- **Layout.**
  - **Side by side (≥ 1024 px):** the board stage (about 60%) and a side panel (about 40%). The transport sits at the top of the side panel, and only the tab panel below it scrolls.
  - **Stacked (< 1024 px) or Large UI:** the transport is a sticky bar pinned to the bottom of the viewport. The scroll container gets `scroll-padding-bottom` equal to the bar height plus the focus offset, so a focused control is never hidden (WCAG 2.4.11).
- **Status pill:** "Playing · 96 BPM · step 3", plus lap A/B when Variation is on, plus a beat dot that pulses each beat.
  - While playing, the BPM comes from `engine.getBpm()`, read in rAF and throttled. When stopped, it is `config.bpm`.
- **Nudge slot.** A fixed-height slot is always reserved above the board stage (empty and `aria-hidden` when unused), so a nudge never moves the board, legend, tabs or transport. See [Nudges](#nudges).
- **Board stage.**
  - The [board view](#board-view).
  - The **camera picture-in-picture** sits inside the stage over the canvas only, never overlapping a focusable control. Its hide button meets `--bs-target`. Hiding it is visual only (see [Camera element ownership](#camera-element-ownership)).
  - **Legend** under the board: numbered colour chips with job name and live count ("3 playing"), and control pieces with their live value ("Reverb 40%").
  - A visual **"Now:"** line, listing the notes whose fired-note records are currently sounding (`audioTime ≤ audibleNow() < audioTime + durSec`). These are the same records that drive the pop; the line is never derived from the playhead column.
  - **Describe board** button.
- **Transport.** Big **▶ Play / ■ Stop** plus **Mute** (engine `setMuted`).
- **Tabs** (`role="tablist"`, roving tabindex, arrows/Home/End):
  - **Groove.**
    - **Tempo** (live; see Engine).
    - **Key** (segmented), **Scale** (select), **Octave** (−2…+2), **Swing**.
    - **More feel ▸:** Humanize, Note length, Loop length per job (labelled by job: Melody/Drums/Bass), Backing song.
  - **Sound.** Main volume, then one card per colour by job:
    - **Melody / Chords / Bass:** instrument select plus a mini mixer (Volume · Tone · Reverb · Echo), applied live via `setChannel*`.
    - **Drums:** drum select only, plus the note "Drums use the main volume". The engine routes all drums through one kit (`BoardSequencerEngine.ts:169-173`); a per-drum mixer is out of scope.
    - **Control colours:** role and live value; no instrument or mixer.
    - **Off:** name and job only.
    - After the cards: **Tick when a piece settles**; **Fader direction** (only when control pieces exist).
  - **Loops.**
    - **Back and forth** (ping-pong).
    - **Variation** plus **Push needed**.
    - **Loop bank** plus slot thumbnails with **Clear** (confirmation).
    - **Pages** (1 · 2 · 4), page buttons A–D with the live page marked, and **Capture board to page X**.
    - Incompatible combinations are **disabled with a one-line reason**, for example "Variation works with 1 page" and "Loop bank works with 1 page".
- **While playing** (explicit classification):
  - **Live:** tempo, key, scale, octave, swing, humanize, note length, loop lengths, main volume, melody/chord/bass mixer, ping-pong, tick, loop bank on/off, variation on/off and Push needed, page select, Clear loop slot.
  - **Disabled with a reason:** instrument/drum and job ("Stop to change the instrument"), rows/steps, pages count, fader direction, backing song, camera, mirror/flip.
  - **Play only:** Capture board to page, which is disabled while stopped ("Press Play to capture").
- **⚙ Set up while playing** asks "Stop playing to change the setup?", then stops and opens Set up. Calibration never runs while playing (20 ms latency rule).
- **Big board.**
  - **Layout.** ⤢ sets `view = 'bigBoard'` and then calls `requestFullscreen()` on its root if available. If refused or unavailable, it still fills the viewport. The header controls, tabs and camera are hidden (camera visually only).
  - **Always-visible controls,** each ≥ `--bs-target`: **▶/■**, **Mute**, **Exit big board**.
  - **Focus.** On entry, focus moves to the board container (`tabIndex=-1`) so Space works at once.
  - **Leaving.** Big board follows `fullscreenchange`: when `document.fullscreenElement` becomes null while in `bigBoard`, the view returns to Play, whether via browser Esc, F11, the exit button or the OS. The exit button and the Esc keydown (used only when not fullscreen) call `exitFullscreen()` or set the view back directly.
  - **After exit,** focus returns to ⤢.

### Nudges

`playNudge.ts` (pure, stateful by value):

```ts
type NudgeSignal = { kind: 'board-moved' } | { kind: 'colour-matches-board'; channelId: ColourId };
interface KindState { active: boolean; since: number | null; clearSince: number | null; dismissed: boolean; }
interface NudgeState { boardMoved: KindState; colourMatches: KindState & { channelId: ColourId | null }; }
// Each kind has its own hold/clear timers and dismissal; a change of channelId restarts colourMatches' timer.
// Precedence (colour wins) is applied only when choosing the returned `signal`.
function stepNudge(prev: NudgeState, readings: CellReading[], ctx: NudgeContext, now: number): { state: NudgeState; signal: NudgeSignal | null };
// ctx = { boardSquares, rows, cols, variationEnabled, variationOffsetThreshold, enabled: boardNudgesEnabled }
```

- **board-moved.** A **shared shift**, not scattered off-centre pieces.
  - For each occupied reading with a centroid, compute the **signed** displacement of the centroid from the nearest **physical square** centre, in square units: `frac(x·boardSquares) − 0.5` per axis.
  - When `variationEnabled`, pieces with `offset ≥ variationOffsetThreshold` are ignored.
  - It fires when **≥ 4** pieces remain, the median displacement on one axis is **≥ 0.3 square**, and **≥ 70%** of pieces are displaced the same way on that axis.
  - It is **off** when rows or cols don't divide `boardSquares` ("More sizes").
  - Message: "Some pieces aren't lining up with the grid. Has the board moved?" Button: **Find board** (confirm stop, then Set up → Board).
- **colour-matches-board.**
  - A channel is the matched colour in **> 60% of cells** and in **≥ 8 cells**, and in those cells its median matched fraction (`fractions[id]`) is **≥ 0.5**.
  - A counter fills only part of a cell, so a musician filling a small grid never triggers it.
  - It is off when rows × cols < 16.
  - Message: "<Name> is matching the board itself." Button: **Recalibrate <Name>** (confirm stop, then Set up → Colours with that card's ⟳ armed).
- **Common rules.**
  - Each kind must hold **> 2 s** to appear and must stay clear **> 1 s** to go away (hysteresis).
  - If both fire, colour-matches-board wins.
  - **Not now** hides that kind until its condition clears and returns.
  - Announced once via `announce()`; never takes focus; never changes anything on its own.
  - All thresholds are named, exported constants, marked for tuning on real frames.
  - The whole feature can be switched off (`boardNudgesEnabled`).

### Board view

`BoardView` is one canvas component that replaces `WarpedBoardView`. It is drawn in the rAF loop.

- **Grid.**
  - Rounded cells (`rows × cols`), row labels (pitch numbers) and a step-number row.
  - The current step is highlighted while playing.
  - Variation lap A/B is shown in the status pill, not on the canvas.
- **Pieces.**
  - **Stopped / Set up:** every detected piece is a solid swatch.
  - **Playing:** detected-but-unsettled pieces are a **dotted ring with a soft fill**; settled pieces are a **solid fill with a solid ring**.
  - **Variation (conditional) pieces:** a **long-dash ring** in `--bs-warn`.
  - **Contrast.** Every real-colour swatch, in `BoardView`, legend, cards, pending card and `LoopBankView`, gets a **two-tone contrast ring** from `swatchRingFor(hex, surfaceHex)` → `{ inner, outer }`:
    - a 2 px **inner** ring, `--bs-swatch-ring-light` or `-dark`, chosen to be ≥ 3:1 against the swatch;
    - a 1.5 px **outer** ring, `--bs-swatch-ring-light` or `-dark`, chosen to be ≥ 3:1 against the surface.
    - The real colour itself is never altered.
- **Note pop.**
  - Driven **only** by the engine's fired-note log (`drainFiredNotes()`), never by the playhead column plus active cells.
  - A `source: 'live'` note pops its cell (scale 1.06 plus outline) from `audibleNow() ≥ audioTime` until `audioTime + max(durSec, 0.12)`. A pop never appears before its sound.
  - `page` notes pulse the page label; `loop` notes flash that loop-bank slot.
  - **Reduced motion:** a static outline for the note's duration instead of scale and pulse.
- **Playhead.** A column band while playing, with a direction arrow when ping-pong is on.
- **Loop bank row.** Slot states carry glyphs, not only fill: empty = outline, paused = ‖, active = ▶ plus a thick ring.
- **Pages.** "Page A · live" label when there is more than 1 page.
- **Theme.** Tokens are re-read on theme/mode change and on `prefers-contrast` / `prefers-color-scheme` change events.
- **Accessibility.**
  - The dynamic accessible name is throttled ("8 by 4 board, step 3 of 8, 5 pieces").
  - The "Now:" line is visual only (`aria-live="off"`).
  - **Describe board** announces the full layout on request.
- **Camera overlay.** The overlay on the camera (`drawOverlay`) stays on the single camera surface (Set up video or PiP), restyled with tokens and without text labels.

### Corner editor

`BoardCornerEditor` replaces `BoardCalibrationOverlay`. It mounts inside the camera surface on the Board step.

**Corner convention.**
- Saved `config.corners` keep the existing `UNIT_SQUARE` order (`homography.ts:21-26`):
  - `corners[0]` = start + high notes (step 1, top row)
  - `[1]` = end + high
  - `[2]` = end + low
  - `[3]` = start + low
- Pitch is "bottom = low" (`BoardSequencerEngine.ts:566`); column 0 is step 1.
- Corners are the **outside corners of the playing squares**, and the quad spans `boardSquares × boardSquares` squares.

**Modes** (`CornerEditorMode = 'tap' | 'review' | 'adjust'`):
- **tap** — prompted sequence:
  1. "Tap the outside corner of the squares where the loop **starts**, on the **low-notes** side" → `corners[3]`
  2. "…starts, **high-notes** side" → `[0]`
  3. "…**ends**, high-notes side" → `[1]`
  4. "…ends, low-notes side" → `[2]`
  - Each tap drops a numbered handle. **Undo last**, **Cancel**, and **Place corners for me** are available.
  - **Place corners for me** seeds `defaultInsetCorners(0.1)` and goes to **adjust**. This is the no-pointer path.
  - `cornerOrderForTaps(taps)` returns `[taps[1], taps[2], taps[3], taps[0]]`, or `null` if the quad is crossed or non-convex. In that case: "Those corners cross over. Tap them again in order." The taps are kept for Undo.
  - After 4 valid taps → **review**.
  - **Cancel** goes back to **review** with saved corners if they exist; otherwise it closes. Nothing is saved.
- **review** — outline, grid preview and **start → / low** labels; handles are not draggable.
  - Buttons: **Looks right** (primary; `handleCalibrated(corners)`), **Adjust**, **⟲ Turn**, **⇋ Flip**, **Tap corners again**.
- **adjust** — handles are draggable, tap-then-tap and nudgeable.
  - Buttons: **Done** (→ review with edits), **Cancel** (→ review with the pre-Adjust corners).
  - Looks right is offered only in **review**.

**Input methods** (WCAG 2.2 SC 2.5.7):
- **Drag** with pointer capture (mouse, touch, pen).
- **Tap a handle, then tap the destination.**
- **Keyboard.**
  - Tab to a handle; Enter/Space selects or drops it.
  - Arrows nudge by the current step; Shift+arrow uses Coarse.
  - Esc = Cancel. **Enter never saves.**
- **On-screen controls** for the selected handle, each ≥ `--bs-target`:
  - ◀ ▲ ▼ ▶
  - a **Fine / Coarse** segmented control (default **Coarse**, remembered for the session)
  - **Next corner** (switch users reach all 4 without Tab)
  - One activation = one step; nothing needs hold or auto-repeat.
- **Nudge unit.** Normalised frame units: **Fine = 0.0025**, **Coarse = 0.02**, clamped to [0, 1]. `nudgeCorner(corners, index, dx, dy, step)`.
- **Handles.** ≥ `--bs-target` hit area, labelled 1 "Start · high", 2 "End · high", 3 "End · low", 4 "Start · low".

**Orientation.**
- ⟲ Turn = `rotateCorners(c, 1)` → `[c[3], c[0], c[1], c[2]]` (start moves to the next edge).
- ⇋ Flip = `flipCorners(c)` → `[c[1], c[0], c[3], c[2]]` (swap start and end, keep the low side).
- Both live in `src/tracking/boardDetect/orientation.ts` (created here; project C (auto-detect) adds to it).

**Props:**

```ts
{ corners?: Corners; mode: CornerEditorMode; rows; cols; boardSquares; mirrorX; mirrorY; onConfirm(corners): void; onCancel(): void }
```

Project C (auto-detect) adds `proposal`, `latticeNodes`, `status`, `offscreenCorner`.

The editor owns its own buttons (Looks right, Adjust, Turn, Flip, Tap corners again, Done, Cancel, nudges). `BoardStep` owns Find board, **Try again**, Tap corners myself, Skip and Continue, and renders them next to the editor.

Project C (auto-detect)'s `status` and `offscreenCorner` props apply **only to the first review of a proposal**:
- **After Adjust → Done, Turn or Flip,** the editor shows a normal review: the warning outline stays while status was `low`, and **Looks right** is enabled.
- **Partial proposals:** Looks right stays disabled only while any corner lies outside [0, 1].
- **`low`:** Looks right is shown as a secondary button on the first review.

## Theme system

`src/ui/screens/boardSequencer/theme/`:
- **`boardTokens.ts`** is the single source of the token values. It generates or mirrors `boardTheme.css`, and a Vitest test checks the contrast contract.
- **`boardTheme.css`:**
  - Colour tokens are declared on `.bs-root[data-bs-style="calm"][data-bs-mode="dark|light"]`: `--bs-bg`, `--bs-raised`, `--bs-elev`, `--bs-hi`, `--bs-warn-tint`, `--bs-border`, `--bs-border-control`, `--bs-fg`, `--bs-fg2`, `--bs-fg3`, `--bs-accent`, `--bs-accent-fg`, `--bs-accent-muted`, `--bs-ok`, `--bs-ok-muted`, `--bs-warn`, `--bs-warn-fg`, `--bs-danger`, `--bs-danger-fg`, `--bs-focus`, `--bs-shadow`, `--bs-swatch-ring-light`, `--bs-swatch-ring-dark`.
  - Non-colour tokens are declared on plain `.bs-root`: `--bs-radius-sm/md/lg/xl`, `--bs-font`, `--bs-target: 44px`.
  - The Large UI override is `[data-ui-size="large"] .bs-root { --bs-target: 52px }`.
  - A Swiss block may later override radius and font via `.bs-root[data-bs-style="swiss"]`.
- **Calm values.** Starting values; every pair below has been computed to pass.

| Token | Dark | Light |
|---|---|---|
| bg / raised / elev / hi | `#1f2430` / `#262c39` / `#2f3645` / `#353d4e` | `#eef0f3` / `#ffffff` / `#e6eaf0` / `#dce1e8` |
| warn-tint | `#343536` | `#f5efdf` |
| fg / fg2 / fg3 | `#e7e9ee` / `#c3c8d3` / `#a3aab8` | `#232833` / `#434a58` / `#555c6b` |
| accent / accent-fg / accent-muted | `#9fd8c4` / `#14201c` / `rgba(159,216,196,.14)` | `#23675a` / `#ffffff` / `rgba(35,103,90,.10)` |
| ok / ok-muted | `#9fd8c4` / `rgba(159,216,196,.16)` | `#23675a` / `rgba(35,103,90,.12)` |
| warn / warn-fg | `#e9cf8f` / `#2a2413` | `#6e5410` / `#ffffff` |
| danger / danger-fg | `#f0a598` / `#2a1512` | `#a4231b` / `#ffffff` |
| border / border-control / focus | `#343c4d` / `#7a8497` / `#9fd8c4` | `#e1e5eb` / `#7b8494` / `#23675a` |
| swatch-ring light / dark | `#e7e9ee` / `#14171f` | `#ffffff` / `#232833` |

- **Contrast contract.** It applies to both modes and every future style block, and is checked by the unit test:
  - (a) `fg`, `fg2`, `fg3`, `accent` (as text), `warn` and `danger` are ≥ 4.5:1 on `bg`, `raised`, `elev`, `hi` and `warn-tint`. Computed minimums: dark fg3 4.67, light accent 5.06.
  - (b) `accent-fg`/`accent`, `warn-fg`/`warn` and `danger-fg`/`danger` are ≥ 4.5:1.
  - (c) `border-control`, `focus` and `accent` (as a state indicator) are ≥ 3:1 against `bg`, `raised` and `elev`.
  - (d) A difference in surface colour alone never marks a control's boundary or state.
  - The plan may tune the hex values but may not add token names without updating this spec.
- **Mode.** `themeMode: 'dark' | 'light'` in the board config, default `'dark'`.
- **Preference media queries.** `prefers-contrast: more` strengthens borders. `prefers-reduced-motion` replaces motion with static cues.
- **Focus.** Every interactive element has a visible 2 px `--bs-focus` outline with an offset.

## Architecture

The code moves into `src/ui/screens/boardSequencer/`. `src/ui/screens/BoardSequencerScreen.tsx` becomes a one-line re-export, so `App.tsx` doesn't change.

| Unit | Responsibility |
|---|---|
| `BoardSequencerScreen.tsx` | Container: config state and persistence, view routing (setup / play / bigBoard), `.bs-root` theme attributes, mounts `CameraSurface` once |
| `useBoardRuntime.ts` | Camera lifecycle and `CameraStatus`, camera check, `BoardReader`, rAF loop, homography, `BoardSequencerMode` created on Play and discarded on Stop (unchanged), engine start/stop, nudge state ref. Throttled React state for counts and status. |
| `boardFrame.ts` (pure) | `stepBoardFrame(readings, cfg, modeResult \| null, loopBankState)` → `{ patternCells, activeLoops, activeMap, conditional, byColour, bankSlots, captured, fireTick }`, extracted from today's rAF loop (L562-627) |
| `boardSetupFlow.ts` (pure) | `SetupStep`, `resolveEntry`, `stepStatus(config, camera)`, `canContinue`, `nextStep`/`prevStep` |
| `gridOptions.ts` (pure) | `gridSizeOptions(boardSquares, current)` → `{ divisors, more, currentIsMore, nearestDivisor }`; `suggestReadSettings(boardSquares, rows, cols, pieceAreaSquares = 0.45)` |
| `roles.ts` (pure) | `suggestRole(existing, added)` |
| `playNudge.ts` (pure) | [Nudges](#nudges) |
| `CameraSurface.tsx` | The single `<video>` plus overlay canvas, and slots for editor / picker / rings |
| `BoardHeader.tsx`, `setup/SetupFlow.tsx`, `setup/CameraStep.tsx`, `BoardStep.tsx`, `ColoursStep.tsx`, `ReadyStep.tsx` | Set up |
| `play/PlayView.tsx`, `GrooveTab.tsx`, `SoundTab.tsx`, `LoopsTab.tsx`, `BigBoard.tsx` | Play |
| `components/BoardView.tsx` | Canvas board view |
| `components/BoardCornerEditor.tsx` + `cornerEditor.ts` (pure) | `nudgeCorner`, `hitTestHandle`, `cornerOrderForTaps`, `defaultInsetCorners`, `videoContentRect`, `boxToFrame`, `frameToBox`, `squareCentreToImage` |
| `src/tracking/boardDetect/orientation.ts` (pure) | `rotateCorners`, `flipCorners` |
| `ui/` primitives (scoped, token-styled) | `Button`, `SegmentedControl` (radiogroup), `Switch` (`role="switch"`), `LabeledSlider` (`htmlFor`), `Tabs`, `StepIndicator`, `SwatchChip`, `ConfirmDialog` (focus trap and restore), `Disclosure` |

`LoopBankView` and `BoardHelp` are restyled with tokens. `BoardHelp` and `docs/board-sequencer-cheat-sheet.md` are rewritten for the new flow.

### Foundations added in the second brainstorm

#### Handedness layout
- **What it changes.** `data-bs-hand="left|right"` on `.bs-root`, from the active player. A pure `layoutFor(hand, width, uiSize)` returns the CSS grid areas, switched with `grid-template-areas`. **Never `dir="rtl"`.**

| Surface | Right-handed | Left-handed |
|---|---|---|
| Play, side by side (≥ 1024 px) | stage left, panel right | **panel (with transport at top) left**, stage right |
| Play, stacked / Large UI | sticky transport bar at the bottom | same bar, with **▶/■ and Mute at its left end** |
| Big board always-visible controls | clustered on the right edge | clustered on the **left** edge |
| Set up: camera vs step panel | camera left, panel right | **panel left**, camera right |
| Step footer | Back · Skip · Continue, with Continue at the right | same DOM and focus order, **all left-aligned** |
| Corner editor nudge pad, pick-a-square arrows | right of the camera surface | **left** of the camera surface |
| Nudge banner button | right end | left end |
| Camera PiP | bottom-left of the stage | **bottom-right** (away from the left-hand controls) |

- **What it never changes:** the camera mirror/flip, board grid, start/low labels, playhead direction, slider direction (minimum stays left), text alignment, tab order or keyboard shortcuts.

#### Timing: visuals follow the sound
- **Audible time.** The engine adds `audibleNow()`:
  - Base value: `rawContext.getOutputTimestamp()` → `contextTime + (performance.now() − performanceTime)/1000`.
  - Fallback when unavailable: `rawContext.currentTime − outputLatency`.
  - Unlike `Tone.now()`, this excludes Tone's 0.1 s look-ahead. The look-ahead itself stays untouched.
- **What uses it:**
  - playhead (`getPlayheadCol`)
  - beat dot, Variation lap, note pop and the "Now:" line (`audioTime ≤ audibleNow() < audioTime + durSec`)
  - `fireTick` and fader ramps start at `Tone.immediate()` instead of `Tone.now()`
- **Supersedes** every `Tone.now()` comparison elsewhere in this spec. A pop never appears before its sound.

#### Detection runs on camera frames
- **Frame callback.** `useBoardRuntime` runs `BoardReader.read`, the settle step and control reads **once per new camera frame** via `video.requestVideoFrameCallback`, with `dt` from `metadata.mediaTime`.
- **Fallback:** skip rAF ticks when `getVideoPlaybackQuality().totalVideoFrames` hasn't changed.
- **Drawing** stays on rAF.
- **Smoothing becomes time constants:**
  - `blendFractions` alpha and the mode's velocity EMA use `alpha = 1 − exp(−dt/τ)`.
  - τ is chosen to match today's behaviour at 30 fps.
  - Effect: settings mean the same on a 60 Hz laptop, a 120 Hz screen or a projector.
- **Loop tidy-up:**
  - matchers and the recogniser are rebuilt only when channels or read settings change
  - the reader canvas is resized only when the video size changes
  - per-cell sample positions are precomputed once per homography

#### Safe control counters
Applies to today's colour-role controls. Project B later moves them into zones.
- **Hold last value.** A missing fader piece keeps its last value, as tempo already does. A per-control option is **Hold** (default), **Drop to zero** or **Return to default after N s**.
- **Raw readings, not settled.**
  - Control-role cells are read from raw readings with a stillness debounce, `controlStillMs` (default 150 ms, calibratable), instead of the 600 ms settle.
  - Changes glide via `setTargetAtTime` with `controlGlideSec` (default 0.3 s for volume).
- **Continuous values.**
  - A fader's value comes from its counter's **board position along the fader axis** (per-colour centroid, below), not the cell index.
  - Snap end zones: the outermost 0.3 square reads exactly 0 or 1.
  - Hysteresis ±0.05.
  - On a 4 × 4 grid this gives about 20–30 levels instead of 4.
- **Ranges per control, calibratable:**
  - tempo 60–160 BPM (was 80–300)
  - volume 0.2–1.0
  - reverb and delay amount 0–0.6
  - tone 0–1
  - toggle amount (was a hard-coded 0.35)
- **One writer per parameter.**
  - While a control counter owns a parameter, the matching on-screen control is disabled with a reason, e.g. "Volume is set by the volume counter".
  - Reverb/delay faders and toggles drive an **effect amount** that multiplies the per-channel sends, never the raw bus gain from two places.
  - The tone fader scales, not overwrites, each channel's Tone.
- **Legend.** Shows each control's live value, with a ‖ glyph while it is held.

#### Hand-guard logic fixes (project A adds the camera "board watcher" on top)
1. **Colour hold.** A settled cell does not change `colour` or `conditional` while its reading shows a different colour. The new colour must persist for `settleWindowMs`; then the cell goes lost → re-settle.
2. **Conditional latched at settle.** `conditional` is fixed from the median offset over the settle window, not recomputed every frame while settled.
3. **Loop-bank capture guard.**
   - Capture only when the pattern above has been unchanged for `captureQuietMs` (default 500 ms, calibratable).
   - Capture only cells whose role is sequenced (never control or Off colours).
   - A slot is triggered only by non-control colours.
   - Clear stays the undo.
4. **Settle tick** fires only for genuinely new placements, not for re-settles after a hold or a colour hold.

#### Detection clean-ups
1. **Per-colour centroids.** `sampleRegion` returns a centroid for **every** colour it matched, not only the dominant one (the sums already exist). `CellReading` gains `centroids`. `offset` and Variation are measured on the **played** colour's centroid.
2. **One counter, one box.**
   - Rule: when adjacent cells both see colour *c* and the fused centroid of the two readings falls inside one of them, the other cell's reading of *c* is a spill and is cleared.
   - Exception: the pair's combined coverage is ≥ 1.7 × a single counter's expected coverage, i.e. two real counters.
   - Fixes: a counter on a line plays twice on 8 × 8 and zero or one times on 4 × 4.
   - Pure `suppressSpill(readings, ctx)` in `boardFrame`.
3. **Variation measured from the square.** On grids where rows and cols divide `boardSquares`, `offset` for Variation is the distance from the **nearest physical square centre**, in square units (0 = centre, 1 = edge). Otherwise it is from the cell centre, as today. Naturally placed counters on a 4 × 4 grid no longer read as shoved (research measured 28% false triggers).
4. **Drum volume at play time.** `RoundRobinDrumKit.fire` sets volume with `setValueAtTime(gainDb, time)`, not immediately.
5. **Nudges.** `board-moved` ignores control-role pieces.

### Camera element ownership
- **One element, always mounted.** The screen owns exactly **one `<video>` and one overlay canvas**, rendered by `CameraSurface`. The container keeps it mounted for the screen's whole life: every Set up step, Play and Big board.
- **Placement.** Views never render their own `<video>`. Each view provides a slot that `CameraSurface` is placed into, via a React portal or CSS placement.
- **Step layers.** Step-specific layers (corner editor, pick-a-square, colour rings) mount inside `CameraSurface`.
- **Hiding.** "Hide PiP" and Big board are **visual only**: the element stays in the document with its stream attached, using `opacity: 0` / `aria-hidden` or an off-layout 1 × 1 placement, never unmounted and never `display: none`. The overlay stops drawing while hidden.
- **Live element.** `BoardReader.read`, the homography build and the camera check always read the live attached element.

### Config (`src/profiles/BoardSequencerConfig.ts`)
All additions are sanitised. There is no `CONFIG_VERSION` bump.
- **Storage split (player profiles).**
  - **Keys:**
    - `admi-board-rig`: `BoardRigConfig`
    - `admi-board-players`: `BoardPlayerProfile[]`, each with an `id`
    - `admi-board-active-player`: the active player's id
  - **Loading.** A pure `resolveBoardConfig(rig, player)` merges them into the `BoardSequencerStored` shape that the runtime already uses, so the engine and reader don't change. Writes are routed back to rig or player by field (the table in [Player profiles](#player-profiles)).
  - **Per-channel player data** lives in `player.channelSettings[channelId] = { role, instrument, drum, volume, tone, reverbSend, delaySend }`. Missing entries mean role `off`.
  - **Migration, one-time and tested.**
    - If `admi-board-sequencer` exists and the new keys don't, split it into a rig plus one player named "Player 1", with handedness `right` and seat `low`. The user then sets Tim's handedness to Left.
    - The old key is left in place, read-only, for one release as a backup.
  - **Channel ids stay rig-wide.** The no-reuse rule checks pages/loop slots in **every** player profile.
  - **Out of scope.** Export/import of profiles.
  - **Relation to other code.** `InputProfileManager` / `UserProfile` are not reused; they model other screens.
- **Player fields added here:** `handedness: 'left' | 'right'`, `seatEdge: 'start' | 'end' | 'low' | 'high'`, `controlStillMs`, `controlGlideSec`, `controlRanges`, `controlRemoval` per control role, `captureQuietMs`.
- **New fields.**
  - `boardSquares: 8 | 10`, default 8
  - `themeMode: 'dark' | 'light'`, default `'dark'`
  - `samplesPerAxis`, clamped 3–15; now passed to `BoardReader.read`
  - `readSettingsCustom: boolean`
  - `boardNudgesEnabled: boolean`, default true
- **Clamping.** `rows` clamped 2–10, `cols` clamped 2–16. The rows cap rises to 10 for 10 × 10 boards. The plan checks the engine's scale-degree and drum-per-row mapping for rows > 8; if drums-by-row can't pass 8, extra rows reuse the top kit piece.
- **Default grid.**
  - **Brand-new configs:** `DEFAULT_BOARD_SEQUENCER_CONFIG` becomes `rows: 4, cols: 4` (square), with `minFilledFraction` and `samplesPerAxis` = `suggestReadSettings(8, 4, 4)` (0.045, 9). Update `BoardSequencerConfig.test.ts` accordingly.
  - **Stored configs:** saved `rows`/`cols` are always loaded as the most recent setup and are never replaced by the default. No flow resets them: not `changeView`, not camera change, not Find board, not a Board size change, not Clear all colours.
- **`suggestReadSettings(boardSquares, rows, cols, pieceAreaSquares = 0.45)`:**
  - `sqX = boardSquares / cols`, `sqY = boardSquares / rows` (fractional for non-divisor grids)
  - `samplesPerAxis = clamp(round(4.5 · max(sqX, sqY)), 3, 15)`
  - `minFilledFraction = clamp(0.4 · pieceAreaSquares / (sqX · sqY), 0.04, 0.10)`. The 0.10 upper clamp keeps one-square cells no stricter than today until real-frame tuning.

  Test table:

  | Board | Grid (rows × cols) | samples | minFill |
  |---|---|---|---|
  | 8 | 8 × 8 | 5 | 0.10 |
  | 8 | 4 × 4 | 9 | 0.045 |
  | 8 | 2 × 2 | 15 | 0.04 |
  | 8 | 4 × 8 | 9 | 0.09 |
  | 8 | 6 × 8 | 6 | 0.10 |
  | 10 | 10 × 10 | 5 | 0.10 |
  | 10 | 5 × 5 | 9 | 0.045 |
  | 10 | 2 × 2 | 15 | 0.04 |

- **When suggestions re-apply.** On rows/cols/boardSquares change, unless `readSettingsCustom`, which freezes both values.
- **Migration** (in `sanitize`, pure, tested):
  - If there is no stored `readSettingsCustom`: `true` when a stored `minFilledFraction` exists and ≠ 0.1, else `false`.
  - If there is no stored `samplesPerAxis` (a pre-redesign config): set it from `suggestReadSettings`. If `readSettingsCustom` is false, also set `minFilledFraction`. So existing 4 × 4 boards get the coverage fix without touching the grid.
  - Saved rows/cols are kept as they are.
- **Channel ids are never reused while referenced.** `freshChannelId` avoids ids in current channels **and** in `pages` / `loopSlots` cells. Remove and Clear all leave stored cells alone; unknown ids stay silent (`roleFor` → off) and draw as empty.

### Engine (`src/songs/BoardSequencerEngine.ts`)
- **Tempo.** Make the existing private clock-rebasing `setTempo` (L257-269) public as `setBpm(bpm)`, and add `getBpm()` (the tempo in effect). Precedence:
  - (a) While a backing-song sync source is attached, `setBpm` is a no-op. The Tempo slider is disabled: "Tempo follows the backing song".
  - (b) While a `tempo`-role channel has a piece detected, the fader sets tempo every frame. The slider is disabled: "Tempo is set by the tempo piece". When the piece leaves, the last fader tempo stays (existing behaviour).
  - (c) Otherwise the slider calls `setBpm` live and saves `config.bpm`.
- **Tick.** Always create the tick synth in `init()`. Add `setTickEnabled(on)`; `fireTick` checks the flag.
- **Fired-note log.** `fireStep` records every note it actually schedules, after the per-role loop-length, variation-lap, humanize and mute checks, including page and loop-bank cells:
  - record: `{ row, col, colour, role, audioTime, durSec, source: 'live' | 'page' | 'loop' }`
  - kept in a ring buffer of 256, cleared on start/stop
  - read by `drainFiredNotes(): FiredNote[]` (pull, polled from rAF)

### Bug fixes included
1. **`calibrated`** is derived from `config.enabled`. Step completion comes from `boardSetupFlow`.
2. **One kind classifier.** `classifyCounterKind(hsv)` in `boardColours.ts`:
   - black if `(s ≤ 12 && v ≤ 38) || (v ≤ 32 && s ≤ 45)`
   - white if `s ≤ 12 && v ≥ 72`
   - else hue
   - `calibrationFromHsv` uses it, and project C (auto-detect) uses it too.
   - `counterColourFromRegion` seeds from the **median** pixel when the central disc's median `v ≤ 32`.
   - Edge tests: s 12/13 at v 90; v 38/39 at s 10; v 32/33 at s 45; s 45/46 at v 30. Plus a noisy near-black patch → black.
3. **Detection coverage.** `suggestReadSettings` plus migration, and `samplesPerAxis` passed to `BoardReader`.
4. **Tempo live,** with the precedence above.
5. **Space and MuteButton.**
   - `App.tsx`'s global handler: the **Space** case returns early (no `preventDefault`, no `toggleMute`) when `screen === 'boardSequencer'`. Other keys, including `D`, and every other screen are unchanged.
   - The Board Sequencer registers its own `keydown` listener while mounted. Space = play/stop **only in Play and Big board**, only when `e.target` isn't inside `button, select, input, textarea, [role=switch], [role=tab], [role=radio], [role=slider], [contenteditable]` or a corner handle. It calls `preventDefault` and ignores `e.repeat`.
   - `MuteButton` is hidden on `boardSequencer` (Play and Big board have their own Mute).
6. **Recalibrate keeps sound and mix fields.** Regression test.
7. **One camera interaction mode at a time:** corner editor, or pick/tap a counter. Enforced by the flow state.

### Accessibility acceptance criteria
- **Targets.** Every interactive target is ≥ `--bs-target` (44/52 px), including Big board controls, the PiP hide button, nudge buttons and on-screen nudges.
- **Text.** Body text ≥ 13 px; minimum 12 px.
- **Contrast.** The contrast contract holds for Calm dark and Calm light.
- **Pointer alternatives.** Every drag has a non-drag alternative. **Full keyboard operation**, including placing corners (Place corners for me plus nudges) and adding or recalibrating colours (Pick a square), with no pointer.
- **Focus.**
  - Tabs have arrow keys; dialogs trap and restore focus; focus moves to the step heading.
  - Focus is never hidden (2.4.11) by the sticky transport or the PiP.
- **Stable layout.** No layout shift under the pointer: nudges and disabled-reason text use reserved space.
- **Never colour alone.** Colour is never the only signal: swatches carry names, numbers, counts and contrast rings; piece states differ by shape; loop slots have glyphs.
- **Visual feedback for every audio event:** note pop (from fired notes), playhead, beat pulse, settle flash while playing, page and loop-slot pulses.
- **Announcements.** Live regions announce step changes, nudges and results once; there is no per-step chatter.
- **Confirmations.** Destructive or disruptive actions confirm: Remove colour, Clear all, Clear loop slot, and leaving Play for Set up.
- **Everywhere.** Large UI, theme and help are reachable from every Set up step and from Play.
- **User preferences.** Reduced motion and high contrast are honoured.

## Delivery: four plans

Each plan ends with a working screen that passes lint and tests.
1. **Plan 1a — Foundations, no visible change.**
   - **Refactor.** Characterisation tests, then extract `stepBoardFrame`. Move camera/rAF/engine into `useBoardRuntime` behind the old screen.
   - **Timing.** Detection runs on camera frames (`requestVideoFrameCallback`, time-constant smoothing); the loop tidy-up.
   - **Config.** Config fields and migration, `suggestReadSettings`, `samplesPerAxis`. **Player-profile storage split** (rig vs player) with migration; the old screen reads through `resolveBoardConfig` and still shows one player.
   - **Bug fixes** 1, 2, 3, 6, and the **first part of 5**: the global Space early-return and hiding `MuteButton` on this screen.
     - During 1a–1c, Space does nothing on the Board Sequencer. That is not an audio regression: the global mute never controlled board audio.
     - The Board Sequencer's own Space handler (play/stop in Play and Big board) lands in **Plan 1d**, with its component test.
   - **Engine.** `setBpm`/`getBpm`, `setTickEnabled`, fired-note log, `audibleNow()` and `Tone.immediate()` for tick and ramps.
   - **Pure modules with tests.** `orientation.ts`, `cornerEditor.ts`, `boardSetupFlow.ts`, `playNudge.ts`, `roles.ts`, `gridOptions.ts`, `layoutFor`.
2. **Plan 1b — Robustness: controls, hand-guard logic, detection clean-ups.** No new screens.
   - Safe control counters: hold, raw-reading debounce, glide, continuous values, ranges, one writer.
   - Colour hold, conditional latched at settle, loop-bank capture guard, settle tick for new placements only.
   - Per-colour centroids, `suppressSpill`, Variation measured from the square, the drum-volume timing fix.
   - The old screen's rail temporarily shows the new control ranges and removal options so they can be tried on the real board.
3. **Plan 1c — Theme, primitives and Set up.**
   - Tokens with the contrast test, `ui/` primitives with component tests, `BoardHeader`, `CameraSurface`.
   - **Who's playing?** chooser and **New player**.
   - The 4 steps (including Seat), the corner editor, pick-a-square, colour cards.
   - The handedness layout for Set up.
   - Set up replaces the old rail for setup tasks.
4. **Plan 1d — Play.**
   - `BoardView`, PlayView and its tabs, nudges, Big board, with the handedness layout.
   - The Board Sequencer Space handler.
   - Remove the old rail and `WarpedBoardView`; help and cheat sheet.

## Testing

- **Pure units (Vitest):**
  - `boardFrame` characterisation: loop bank on/off, variation with pages ≤ 1 vs > 1, counts
  - `boardSetupFlow`: a `resolveEntry` table; `stepStatus` / `canContinue` × every camera phase × colourless true/false/null; after a Mirror change, Colours and Ready are unreachable and Play is disabled
  - `gridOptions` (table above; a non-divisor current value; nearest divisor)
  - `cornerEditor`: tap mapping; crossed and non-convex quads; Fine/Coarse nudge and clamping; `defaultInsetCorners`; letterbox `boxToFrame` round-trips; a tap in the bars is rejected
  - `orientation`: `rotateCorners(c, 4) = c`, `flip∘flip = id`, and taps in prompt order give a homography with the start + low cell in the right corner
  - `playNudge`: Variation pushes in mixed directions → none; a 4 × 4 grid over 8 × 8 with centred counters → none; a uniform 0.35-square shift for > 2 s → board-moved; < 2 s → none; fewer than 4 pieces → none; 3 counters on 2 × 2 → none; a channel in 12 of 16 cells at fraction ≥ 0.5 → colour-matches-board; the same count at fraction 0.1 → none; both → colour wins; dismiss and re-arm; hysteresis
  - `roles.suggestRole`: black first; Drums already taken; 5th colour → off; reassigned jobs
  - config: migration branches, clamping, id no-reuse after Clear all; the brand-new default is 4 × 4; saved rows/cols survive `changeView`, a camera change, a Board size change and Clear all
  - `classifyCounterKind` edges, and dark seeding
  - engine (Tone mock): `setBpm`/`getBpm` with beat continuity; no-op while synced; the tempo piece overrides; `setTickEnabled`; fired notes → humanize-skipped notes aren't recorded, a polyrhythm column is correct, the page source is set, nothing is recorded while muted, `audioTime` equals the scheduled time, the cap holds, cleared on start/stop
  - recalibrate keeps fields
  - `swatchRingFor`: black and white swatches on **both** dark and light `raised`; inner ≥ 3:1 vs swatch, outer ≥ 3:1 vs surface
  - contrast contract over `boardTokens`
  - **Player profiles:**
    - `resolveBoardConfig` merge
    - field routing (rig vs player)
    - migration from `admi-board-sequencer` (one player, values preserved, old key untouched)
    - a new player on an existing rig: all channels Off, grid 4 × 4
    - channel-id no-reuse across players' pages and loops
  - **`layoutFor`:** left vs right at ≥ 1024 px, < 1024 px, and Large UI; focus/DOM order is identical for both hands
  - **`audibleNow`** (fake context and clock): excludes look-ahead; fallback path; a pop is never shown before `audioTime`
  - **Frame-driven detection:**
    - duplicate frames are skipped
    - time-constant smoothing gives the same result at 60 and 144 Hz display rates for the same 30 fps input
    - movement confirmation no longer depends on display rate (pins the research simulation)
  - **Safe controls:**
    - hold / zero / return-to-default on removal
    - 150 ms debounce instead of settle
    - continuous value with end snaps and hysteresis
    - ranges applied
    - screen control disabled while a counter owns the parameter
    - reverb fader and toggle don't fight
  - **Mode:** colour hold (a sleeve over a settled cell doesn't change its colour; a genuinely new colour takes over after `settleWindowMs`); conditional latched at settle; settle tick only for new placements
  - **Loop bank:** no capture until the pattern is quiet for `captureQuietMs`; control and Off colours are never captured and never trigger a slot
  - **`suppressSpill`:** a counter on a line gives exactly one cell on 8 × 8 and on 4 × 4; two real counters are kept
  - **Variation from the square:** centred counters on a 4 × 4 grid are not conditional; a real shove is
  - **Drum kit:** volume is scheduled at play time (two quick hits keep their own volumes)
- **Component tests** (jsdom, `react-dom/client` + `act`; no new dependencies):
  - `Tabs` (arrows/Home/End, roving tabindex)
  - `SegmentedControl` (radiogroup arrows)
  - `ConfirmDialog` (focus in, trap, Esc, restore)
  - `SetupFlow` (focus moves to the heading on step change)
  - Space handling (on the board screen with focus on body → toggles once and the store `isMuted` is unchanged; Space on a focused button → the button activates and play doesn't toggle)
  - If rendering proves impractical, key handling moves into pure helpers that are tested instead.
- **Manual checklist** (real USB webcam and board):
  - **Runs.** First-run keyboard-only setup, Camera → Play. Returning session.
  - **Corner editor.** Each input method. Move a corner about 10% of the frame with on-screen buttons only in ≤ 8 activations.
  - **Camera.** A 16:9 camera: handles and grid sit on the board. Camera → Board → Colours → Ready → Play → Big board → Play → Set up: the preview is never black and the camera never restarts. While playing, hide the PiP and enter Big board, then move a counter: it lights and plays.
  - **Big board.** Exit via browser Esc, the exit button and F11 → Play layout with focus on ⤢.
  - **Detection.** With the suggested settings, an empty board lights 0 cells for 5 s at 8 × 8, 4 × 4 and 2 × 2 (otherwise raise the lower clamp before shipping).
  - **Visibility and layout.**
    - Black and white counters are clearly visible in both modes.
    - Large UI from Set up (52 px handles).
    - Below 1024 px and in Large UI, Tab through all tabs and nothing focused is hidden.
    - Force a nudge on and off while playing and nothing moves.
  - **Space.** Space with nothing focused in Play and in Big board toggles once. Space in Set up never plays. On Performance, Space still mutes.
  - **Players and handedness.**
    - Create Tim (Left) and a second player (Right) on the same board: switching needs no Find board or Find colours.
    - Left layout puts panel, transport and nudge pad on the left in Set up, Play and Big board.
  - **Timing.** With a visible playhead and a clicky drum, the pop and playhead line up with the sound (no visible lead).
  - **Controls.** Lift the volume counter: the volume holds. Slide it: the value follows within about 0.3 s with no silence.
  - **Accessibility passes.** A muted run (every sound has a visual cue). A screen reader pass (NVDA or Narrator). Reduced motion and high contrast on. A touchscreen pass of the whole flow.
- `npm run lint` and `npm run test:run` must pass.

## Out of scope
- **Later projects (own specs):**
  - **A** Hand and knock guard: board watcher mask, held cells, optional MediaPipe hand finder, Hold board, knock guard and Bring it back, ✋ indicator.
  - **B** Zones and loop pads: per-player layouts (Classic / Loop row / Side-car), fader lanes, loop pads with Record/Play-only, Gate/Toggle and timing modes, printable side-car card.
  - **C** Auto-detect (existing spec).
  - **D** Board tracking: follow small nudges silently, "Board moved?" for big moves.
  - **E** Box detail and two counters: Late/Accent per job (off by default), multiple colours per box, same-colour count meanings.
- **Considered and declined for now:** hear-on-placement, count-in, recording, research log, MIDI out, facilitator window/clicker, player lock, shape symbols, moods, ghost patterns.
- **Profile export/import.**
- Swiss minimal theme (only the token seam).
- Wiring `useSwitchAccess` / `useDwellClick` (the UI is fully keyboard-operable so they can drive it later).
- Per-drum mixer; camera exposure lock; Camo/iPhone.
- Letting Space press focused buttons on **other** screens (a separate, approved change if wanted).
- **Spatial halves (slice 2b).** Its approved plan (`docs/superpowers/plans/2026-06-30-board-sequencer-spatial-halves.md`) is **partly superseded** by this redesign.
  - Tasks 1–3 (config flag, `bandBounds`/`barIndexAt`, engine `fireStep`) still apply.
  - Tasks 4–5 must be re-planned after this redesign, as follows.
  - The toggle and hints go in `LoopsTab`. While on, Back and forth, Loop bank and Variation are disabled with "Turn off Spatial halves to use this".
  - Engine wiring and loop-bank precedence go in `useBoardRuntime` / `boardFrame`.
  - The divider and dimmed band go in `BoardView`.
  - "Bar 1 / Bar 2" goes in the status pill.

## Risks
- **Large refactor.** Mitigated by Plan 1a: characterisation tests and pure extraction before any view work, with each plan ending in a working screen.
- **Grid options that follow the board** may surprise existing 6 × 8 users. Saved values are kept, "More sizes…" opens pre-selected, and a one-tap suggestion is offered.
- **The migration re-suggests read settings** for untuned configs. That is the intended fix for 4 × 4 misses, checked on real frames via the manual checklist.
- **Synthetic-derived thresholds** (read settings, nudges) are named constants, flagged for tuning in project C (auto-detect)'s Phase 0.
