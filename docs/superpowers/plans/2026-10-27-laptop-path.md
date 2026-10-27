# Laptop-board path (stage 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playing without a camera is a clear choice from the Welcome screen, and its set-up shows only what the laptop board uses: the colours (the table) and Ready.

**Architecture:** A per-board step list in `boardSetupFlow.ts` drives the step indicator and Back/Continue. `ColoursStep` gets a laptop mode that swaps the camera tools for "Add four colours / Add a colour". The Welcome screen gets a "Play on the laptop" button that asks the board screen (the same one-shot request pattern as "Set up the board again") to open on the laptop board.

**Tech Stack:** React 19, TypeScript strict, Vitest + jsdom, Playwright.

**Spec:** docs/superpowers/specs/2026-10-26-board-setup-and-sounds-design.md ("No camera", stage 3).

## Global Constraints

- The camera board's journey is unchanged.
- Switching board (the header's 💻/📷 group) keeps working as now.
- The e2e helper `openLaptopBoard` (e2e/app.ts) keeps working.
- Plain words; "Melody" kept.

## Review Focus

1. A laptop player pressing ⚙ Set up must never land on a camera step (Back from Colours included).
2. "Play on the laptop" on a first run (no players): Who's playing still asks name and hand, then the laptop board.
3. A camera player who presses "Play on the laptop" is switched to the laptop board (as the header switch does), not left on the camera.
4. Laptop Colours step with no colours: a clear way to add them.

---

### Task 1: Steps per board
- `setupSteps(laptop: boolean): SetupStep[]` → laptop `['colours', 'ready']`, camera `SETUP_STEPS`; `nextStep(step, laptop = false)`, `prevStep(step, laptop = false)` walk that list.
- Tests (boardSetupFlow.test.ts): laptop steps; `prevStep('colours', true)` → null; `nextStep('colours', true)` → 'ready'; camera unchanged.
- SetupFlow takes a `laptop` prop (step count, Back/Continue); BSS passes it and maps the indicator over `setupSteps(laptop)`.

### Task 2: The Colours step on the laptop board
- `ColoursStep` prop `laptop?: { onAddColours(): void; onAddColour: (() => void) | null }`. When set: no learn-the-board prompt, no Find colours / Tap a counter (nor their found/arming/pending panels), no "N down", no ⟳ Recalibrate or Black darkness in More (× Remove stays), no Detection sensitivity or Hands. Shows **Add four colours** (when there are none) and **Add a colour** (when `onAddColour` is not null); empty text "No colours yet. Add four to start: each gets a job and a sound in the table."
- Component test (ColoursStep.test.tsx, `visibleText` style): laptop mode shows Add four colours and none of "Find colours", "Learn the empty board", "Detection sensitivity", "Hands"; camera mode still shows Find colours.

### Task 3: "Play on the laptop" from Welcome
- `requestLaptopOnOpen()` / `laptopRequestedOnOpen()` beside the set-up request (cleared by `clearSetupRequest`).
- `openingView(..., o.laptopRequested?)` → `'play'` when requested (unless set-up was asked for).
- BSS at mount: when requested and the stored source isn't laptop, switch to the laptop board (`update({ boardSource: 'laptop' })`).
- Welcome: a button "💻 Play on the laptop" with sub-label "No camera or board needed". When the camera check says unavailable and there is no saved board, it comes first and is the primary button.
- Tests: openingView with `laptopRequested`; e2e (sound.e2e.ts): Welcome → Play on the laptop → the laptop board's grid is shown; ⚙ Set up shows "step 1 of 2" and no "Find colours".

### Task 4: Check
- Full unit suite, lint, `npx playwright test e2e/sound.e2e.ts e2e/boardAbleton.e2e.ts`.
