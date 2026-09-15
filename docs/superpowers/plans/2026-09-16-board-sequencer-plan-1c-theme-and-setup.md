# Plan 1c — Theme, primitives and Set up

Spec: `docs/superpowers/specs/2026-09-15-board-sequencer-redesign-design.md`
(sections "Screen frame", "Player profiles", "Entry routing", "Set up: 4 steps",
"Corner editor", "Theme system", "Architecture").

Everything lands under `src/ui/screens/boardSequencer/`. `BoardSequencerScreen.tsx` keeps its
path so `App.tsx` doesn't change. Each task ends with `npm run lint && npm run test:run` and a commit.

Component tests use `react-dom/client` + `act` in jsdom (no new dependencies); a shared
`src/__tests__/helpers/render.tsx` mounts into a container and returns `{ root, container, act }`.

## Task 1 — Theme tokens, contrast test, CSS

- `theme/boardTokens.ts`: `BOARD_TOKENS = { calm: { dark: {...}, light: {...} } }` with the spec's
  hex values, plus `contrastRatio(a, b)` and `swatchRingFor(swatch, surface)`.
- `theme/boardTheme.css`: colour tokens on `.bs-root[data-bs-style="calm"][data-bs-mode="dark|light"]`,
  non-colour tokens on `.bs-root`, `[data-ui-size="large"] .bs-root { --bs-target: 52px }`,
  `prefers-contrast: more` and `prefers-reduced-motion` blocks, and a focus-visible rule.
- Test `boardTokens.test.ts`: the contract (a)–(c) over both modes, and `swatchRingFor` on black and
  white swatches on `raised` in both modes (inner ≥ 3:1 vs swatch, outer ≥ 3:1 vs surface).

## Task 2 — `ui/` primitives

`ui/Button.tsx`, `SegmentedControl.tsx` (radiogroup + arrows), `Switch.tsx` (`role="switch"`),
`LabeledSlider.tsx` (`htmlFor`), `Tabs.tsx` (roving tabindex, arrows/Home/End), `StepIndicator.tsx`
(`<ol>`, `aria-current="step"`), `SwatchChip.tsx`, `ConfirmDialog.tsx` (focus trap, Esc, restore),
`Disclosure.tsx`.

Component tests: Tabs keys, SegmentedControl keys, ConfirmDialog focus in/trap/Esc/restore, Switch toggles.

## Task 3 — `CameraSurface` and `BoardHeader`

- `CameraSurface.tsx`: the single `<video>` + overlay canvas, aspect ratio from the live stream, and a
  `layer` slot for step-specific overlays. Hiding is `opacity: 0` + `aria-hidden`, never unmount.
- `BoardHeader.tsx`: Exit, title, ☾/☀, Aa, ?, plus a `right` slot (step indicator or Play controls) and
  the always-visible `role="status"` camera notice.

## Task 4 — `BoardCornerEditor`

Modes `tap | review | adjust` exactly as the spec's corner-editor section: prompted taps, Undo last,
Place corners for me, Turn/Flip, drag + tap-then-tap + keyboard + on-screen nudge pad with a
Fine/Coarse segmented control. All maths from the existing pure `cornerEditor.ts` / `orientation.ts`.

## Task 5 — Set up steps

`setup/SetupFlow.tsx` (step routing, footer, focus to heading, `announce`), `CameraStep`, `BoardStep`,
`ColoursStep` (tap-a-counter, pick-a-square, colour cards, job chips, sensitivity disclosure),
`ReadyStep`. Gating comes from the pure `boardSetupFlow.ts`; grid options from `boardGrid.ts`.

## Task 6 — Who's playing

`PlayerChooser.tsx` (cards + New player) and the header's **Player: <name>** button, on
`BoardProfiles` from Plan 1a. One profile is used silently.

## Task 7 — Container wiring

`BoardSequencerScreen.tsx` becomes the container: config state, `.bs-root` theme attributes, view
routing (`setup` / `play`), one `CameraSurface`. The old rail stays for the Play-side settings until
Plan 1d replaces it.

## Final verification

`npm run lint && npm run test:run`, plus the spec's Set up manual checklist.
