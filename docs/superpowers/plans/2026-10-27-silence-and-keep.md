# Silence and Keep (loops stage 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tim composes a loop from silence, the owner keeps and names it, a kept loop replays with the sounds it was made with, Stop silences everything, and there is one way to make a loop.

**Architecture:** A pure `newLoopSession` module (src/songs/performance/newLoop.ts) holds the New loop state machine (waiting for an empty board, composing, auditioning with band / Extra notes / one other loop). The screen enters it from a **New loop** button in the Loops step, which clears every wanted loop and holds band, Extra notes and Sounds change at off until Keep or Leave. A kept loop stores each counter's **job and sound** (`StoredLoopCell.job`, `.sound`); when a loop is launched, its cells are given to the engine under **loop colours** (`loop:<job>:<sound>`), synthetic `ColourChannel`s added to the engine's channel list, so the engine's existing per-colour voices and jobs play it as kept, whatever the colours are today. The red fallback becomes "today's colour with that sound, else grey". Stop clears wanted loops. The old ways to make a loop (Capture, Overwrite, Loop bank, "Plays a loop") are hidden, not deleted, in this stage.

**Tech Stack:** React 19, TypeScript strict, Zustand not needed (screen state as today), Vitest + jsdom, Playwright.

**Spec:** docs/superpowers/specs/2026-10-27-loops-and-piece-flow-design.md (Principles 1, 2, 5, 6, 7; Stage 1; C; D "loop made with different colours"; F stage 1).

## Global Constraints

- Plain words on screen; the words are *loop*, *Keep*, *New loop*, *Hear it with…*. Nothing else is called a loop.
- Nothing sounds until a counter is down; the player's counters are the foreground.
- A loop never changes because of today's colours: it replays as kept.
- Stop means silence: no loop is left "ready · starts with Play".
- Old saved loops (colour ids only) keep working as today.
- Every threshold calibratable: the "seen empty" settle uses the existing `settleWindowMs`.

## Review Focus

1. New loop with counters still on the board: silence until the board has been seen empty once (or **Start with these**); then counters sound as placed, nothing else.
2. A loop kept with green = violin replays as violin after green is changed to piano, and after green is deleted and fresh colours added; it draws in today's violin colour, else grey, never red.
3. Stop while a loop is launched: the loop is not wanted afterwards and does not come back on Play.
4. Keep with an empty board is impossible; Keep with counters records job + sound for every counter and leaves the counters sounding.
5. Leaving New loop (Leave, or Keep) restores band, Extra notes and Sounds change to the player's own settings, exactly.

---

### Task 1: A kept loop remembers what each counter played

**Files:**
- Modify: `src/profiles/BoardSequencerConfig.ts` (`StoredLoopCell`, `sanitizeLoopSlots`), `src/ui/screens/BoardSequencerScreen.tsx` (`saveBoardToSlot` ~2736)
- Create: `src/songs/performance/loopSounds.ts`
- Test: `src/__tests__/loopSounds.test.ts`, `src/__tests__/BoardSequencerConfig.test.ts`

**Interfaces:**
- Produces:
  - `StoredLoopCell` gains `job?: 'melody' | 'bass' | 'chord' | 'drums'` and `sound?: string` (the colour's `instrument` for melodic jobs, `drum` for drums; `''` = default).
  - `keepCells(cells: readonly ActiveCell[], channels: readonly ColourChannel[]): StoredLoopCell[]` — only sequenced colours; each cell gets `job` and `sound` from its colour; box detail and `conditional` kept.
  - `loopColourId(job, sound): string` = `` `loop:${job}:${sound}` ``.
  - `loopChannelsFor(cells: readonly StoredLoopCell[], today: readonly ColourChannel[]): { cells: ActiveCell[]; channels: ColourChannel[] }` — cells with `job` are re-coloured to `loopColourId`; one synthetic `ColourChannel` per distinct (job, sound) with `kind: 'hue'`, `swatch` = today's colour with that job and sound if any, else `'#9a9a9a'`, `instrument`/`drum` = sound, `changes: false`, `plays: 'note'` unless today's matching colour says `'tune'`; cells without `job` (old loops) pass through unchanged with no channel.
  - `loopSwatch(cell, today): string` for drawing: as above, never red.
- [ ] Tests (loopSounds.test.ts): `keepCells` records `{job:'melody', sound:'violin'}` for a green melody/violin cell and drops a control colour; `loopChannelsFor` re-colours to `loop:melody:violin`, builds one channel with `instrument:'violin'` and today's violin colour's swatch, and uses `'#9a9a9a'` when no colour plays violin today; an old cell (no `job`) is passed through untouched; two cells with the same job+sound share one channel. BoardSequencerConfig.test.ts: `sanitizeLoopSlots` keeps `job` and `sound` and drops an unknown job.
- [ ] Watch them fail; implement; `saveBoardToSlot` uses `keepCells`; run the two test files and `npm run lint`.
- [ ] Commit: `feat(loops): a kept loop remembers each counter's job and sound`.

### Task 2: The engine plays loop colours

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts` (`setChannels` ~923; voice creation factored out of `init` ~469–501), `src/ui/screens/BoardSequencerScreen.tsx` (`pushLaunch` ~2706, and wherever `engine.setLaunchedLoops` / `setChannels` are called: ~2099, useBoardRuntime.ts:152), `src/ui/screens/boardSequencer/useBoardRuntime.ts`
- Test: `src/__tests__/BoardSequencerEngine.loopColours.test.ts` (new, in the style of BoardSequencerEngine.firedNotes.test.ts)

**Interfaces:**
- Consumes: Task 1's `loopChannelsFor`.
- Produces: `BoardSequencerEngine.setChannels` creates a voice for a melodic colour it has no voice for (extract `private buildVoice(ch)` from `init`); `setLaunchedLoops(slots, loops, extraChannels: ColourChannel[] = [])` merges `extraChannels` into the channel list it plays with (`this.cfg.channels` for lookup only; the player's saved channels are untouched).
- [ ] Tests: launching a loop whose cells are `loop:melody:violin` with its channel fires notes with `colour: 'loop:melody:violin'`, `role` melody, `source: 'loop'`, even though the player's channels have no such colour; a cell whose job is drums on `loop:drums:snare` fires a snare; changing the player's green to piano does not change the loop's voice (voiceSpec stays violin) — check through the fired notes' `colour`/`drum` and a spy on `BoardSequencerVoice` construction (vi.mock as the other engine tests do).
- [ ] Watch them fail; implement; `pushLaunch` passes `loopChannelsFor(...)` output; run the engine tests, `npm run test:run`, lint.
- [ ] Commit: `feat(loops): a launched loop plays through its own loop colours, as kept`.

### Task 3: Drawn in the right colour, never red

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx:3749, 4294, 4928` (`swatchFor`), `src/ui/screens/boardSequencer/play/PieceSteps.tsx` (`LoopThumb` callers)
- Test: `src/__tests__/loopSounds.test.ts` (`loopSwatch`), `src/__tests__/boardViewModel.test.ts` or a small render test of `LoopThumb`
- [ ] Test: `loopSwatch({colour:'loop:melody:violin'}, today)` is today's violin colour, grey if none; a plain unknown colour id (old loop, colour gone) is `'#9a9a9a'`, not `'#e23'`; a known colour id is its swatch.
- [ ] Implement one `swatchFor` built from `loopSwatch` and use it in all three places; delete the `'#e23'` fallback.
- [ ] Run tests, lint. Commit: `fix(loops): loop and Extra notes never draw red; grey when no colour plays that sound`.

### Task 4: Stop stops everything

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (`stop` ~1925: clear `wantedRef`, `counterWantedRef` stays as detection decides, push launch, `setWantedSlots([])`), `src/ui/screens/boardSequencer/play/PieceSteps.tsx` (remove "■ Stop all loops" and the "More: fades, stop all" toggle; keep the fade control visible), `src/ui/screens/boardSequencer/play/PieceSteps.tsx` `loopStateText` (no "ready · starts with Play" state)
- Test: `e2e/sound.e2e.ts` new test; `src/__tests__/launcher.test.ts` if `loopStateText` is pure there (check) else a PieceSteps render test
- [ ] e2e test `'Stop silences a launched loop; it does not come back on Play'`: laptop board, save a loop, ▶ Play it, press Stop, expect its row to read "stopped" (not "ready"), press ▶ Play, expect no notes from the loop within 3 s (`notesPlayed` stays at the player's own count, or 0 with an empty board).
- [ ] Watch it fail; implement; run it, the unit suite, lint.
- [ ] Commit: `feat(loops): Stop stops every loop; no loop waits to start with Play`.

### Task 5: New loop, Keep, Hear it with…

**Files:**
- Create: `src/songs/performance/newLoop.ts` (pure state), `src/ui/screens/boardSequencer/play/NewLoopPanel.tsx`
- Modify: `src/ui/screens/boardSequencer/play/PieceSteps.tsx` (Loops step: a **New loop** primary button above the list; the list rows lose "Save the board here", "Overwrite with board" and "✎ Edit notes" from the row — Edit moves under a ⋯ menu as "Fix a note"; "Capture" stays only where the design keeps it later: remove it from the Now/Next strip, Show and the iPad pad list for now), `src/ui/screens/BoardSequencerScreen.tsx` (enter/leave New loop; hold band/fill/evolve off via the engine while in it, restoring the player's own values on leave; Keep = `saveBoardToSlot(first free slot)` + focus the name), `src/ui/screens/boardSequencer/play/NowNextStrip.tsx`, iPad pad list ~3286
- Test: `src/__tests__/newLoop.test.ts`, `src/__tests__/NewLoopPanel.test.tsx`, `e2e/sound.e2e.ts`

**Interfaces:**
- Produces (newLoop.ts):
  ```ts
  export type NewLoopPhase = 'waitEmpty' | 'composing';
  export interface NewLoopState { phase: NewLoopPhase; leftover: number; with: { band: boolean; fill: boolean; loop: number | null } }
  export function startNewLoop(countersOnBoard: number): NewLoopState            // >0 → waitEmpty with leftover, else composing
  export function boardSeen(s: NewLoopState, countersOnBoard: number): NewLoopState // waitEmpty→composing once 0
  export function startWithThese(s: NewLoopState): NewLoopState                    // composing at once
  export function hearWith(s: NewLoopState, what: Partial<NewLoopState['with']>): NewLoopState
  export function engineSettingsFor(s: NewLoopState | null, own: { band: BandLevel; fillAmount: number; evolveAmount: number }): { band: BandLevel; fillAmount: number; evolveAmount: number; loops: number[] }
  // null → own; waitEmpty → all off, loops []; composing → band 'gentle' only if with.band, fill 0.3 only if with.fill, evolve 0, loops [with.loop] or []
  ```
- [ ] Tests (newLoop.test.ts): the transitions above; `engineSettingsFor(null, own)` is `own` with `loops: []`; waitEmpty gives everything off; composing with `with.band` gives band gentle and fill 0.
- [ ] Panel render test: header "New loop · silent"; in waitEmpty "Lift the 3 counters to start from silence" and a **Start with these** button; in composing the chips Band · Extra notes · Hear with loop (a select of kept loops) and **Keep** (disabled with "Nothing to keep yet" when 0 counters) and **Leave**; after Keep the name box is focused with quick names Bed · Pulse · Beat · Shine as buttons.
- [ ] e2e `'New loop starts from silence, Keep names it, Leave restores the player's settings'`: laptop board, launch a loop, set band Gentle, press New loop → loop row reads stopped and no notes play for 2 s; place two counters → notes play; Keep → a new loop row with the name box focused; type "Bed" → row shows Bed; Leave → band is Gentle again (read the Sound tab).
- [ ] Watch them fail; implement; `useBoardRuntime` applies `engineSettingsFor` whenever the New loop state or the player's settings change (same place it applies band/fill/evolve today, ~line 160–175); run the e2e, unit suite, lint.
- [ ] Commit: `feat(loops): New loop from silence, Keep with a name, Hear it with…`.

### Task 6: One way to make a loop

**Files:**
- Modify: `src/ui/components/board/BoardHelp.tsx` (the loop glossary and "how to" text), `src/ui/screens/BoardSequencerScreen.tsx` (hide the Loop bank view and the "Plays a loop" role from the role lists unless a saved profile already uses them: `LoopBankView` ~3918, role option lists), `src/tracking/boardColours.ts` (`ROLE_LABELS` unchanged; a `HIDDEN_ROLES` export used by the pickers), `docs/board-sequencer-cheat-sheet.md`, `docs/board-sequencer-guide.html`
- Test: `src/__tests__/ColourTable.test.tsx` (the Plays list has no "Plays a loop" unless the colour already has it), e2e `openLaptopBoard` still works
- [ ] Tests first; implement; run `npm run test:run`, `npm run lint`, `npx playwright test e2e/sound.e2e.ts e2e/performance.e2e.ts`, `npm run build`.
- [ ] Commit: `feat(loops): one way to make a loop — the old ways are hidden`.
