# Board Sequencer — Help + Cheat Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app "How to play" section to the board sequencer controls rail and a printable facilitator cheat sheet, both documenting the new features (detection, Variation, Ping-pong, Loop bank) with shared wording.

**Architecture:** A new static presentational component `BoardHelp.tsx` holds the help text and is rendered inside a collapsed-by-default `<Section title="How to play">` placed first in the rail. A one-page markdown cheat sheet mirrors the same wording.

**Tech Stack:** React 19 + TypeScript (strict). Typecheck: `npm run lint` (= `tsc --noEmit`). Tests: Vitest.

## Global Constraints

- TypeScript strict mode — no `any` types.
- Presentational only — `BoardHelp` has no state, no props, no Tone.js, no logic.
- Wording must match between `BoardHelp.tsx` and the cheat sheet (both authored from the spec's "Content source" list).
- Help section is **collapsed by default** and **placed first** in the controls rail.
- Test-runner note: if `npm run test:run` crashes on the default pool (`spawn UNKNOWN`/OOM — sandbox environment), run `npx vitest run --pool=forks --poolOptions.forks.singleFork=true`.

**Spec:** `docs/superpowers/specs/2026-06-30-board-sequencer-help-cheatsheet-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/ui/components/board/BoardHelp.tsx` | Static "How to play" content | **Create** |
| `src/ui/screens/BoardSequencerScreen.tsx` | Controls rail | Modify: import + one `<Section>` first in the rail |
| `docs/board-sequencer-cheat-sheet.md` | Printable facilitator reference | **Create** |

---

### Task 1: In-app "How to play" section

**Files:**
- Create: `src/ui/components/board/BoardHelp.tsx`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (import; new `<Section>` before the "Camera & board" section ~L872)

**Interfaces:**
- Produces: `BoardHelp` — a default-exported React component taking no props.

**Note on testing:** static JSX with no branching/logic — no unit test. Verify by `npm run lint` clean + the full suite staying green (no regressions).

- [ ] **Step 1: Create the component**

Create `src/ui/components/board/BoardHelp.tsx`:

```tsx
/**
 * BoardHelp — static "How to play" reference shown in the board sequencer controls
 * rail. Facilitator-facing; shows all features regardless of which toggles are on.
 * Presentational only (no props, no state, no audio).
 */

interface HelpEntry {
  title: string;
  body: string;
}

const HELP: HelpEntry[] = [
  {
    title: 'Basics',
    body: 'Line up the four board corners, click a piece to add its colour, then press '
      + 'Start. A playhead sweeps left→right; a piece sounds when the playhead reaches '
      + 'its column. Higher rows = higher notes.',
  },
  {
    title: 'Pieces not detected?',
    body: "Lower 'Min fill' in Colours & detection — a piece no longer has to sit "
      + 'dead-centre.',
  },
  {
    title: 'Variation',
    body: 'Shove a piece firmly to the edge of its square → it plays every OTHER time '
      + 'round (dashed ring). The A/B letter shows the current lap.',
  },
  {
    title: 'Ping-pong',
    body: 'Turn on Ping-pong: the playhead runs → then ← for a longer, there-and-back '
      + 'phrase. The → / ← arrow shows direction. Edge-shoved pieces play on the way back.',
  },
  {
    title: 'Loop bank',
    body: 'Turn on Loop bank: the bottom row becomes save slots. Drop a counter on an '
      + 'empty slot to SAVE the pattern above; it keeps looping. Remove to PAUSE, replace '
      + 'to RESUME. Loops layer. Clear (on a mini-view) empties a slot to re-record. The '
      + 'bottom row is slots, not notes, while this is on.',
  },
];

export default function BoardHelp(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {HELP.map((e) => (
        <div key={e.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{e.title}</span>
          <span style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>{e.body}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Import it in the screen**

In `src/ui/screens/BoardSequencerScreen.tsx`, add near the other board-component imports (e.g. beside `import LoopBankView from '../components/board/LoopBankView';`):

```ts
import BoardHelp from '../components/board/BoardHelp';
```

- [ ] **Step 3: Render the section first in the rail**

Immediately BEFORE the existing `<Section title="Camera & board" ...>` (around line 872), add:

```tsx
          <Section
            title="How to play"
            open={!!openSection.help} onToggle={() => toggleSection('help')}
          >
            <BoardHelp />
          </Section>
```

(`openSection` has no `help` key initially, so the section is collapsed by default; `toggleSection` is the existing handler. No new state.)

- [ ] **Step 4: Typecheck + full suite**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run` (fallback single-fork if it crashes, per the note above)
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/board/BoardHelp.tsx src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): in-app 'How to play' help section"
```

---

### Task 2: Facilitator cheat sheet

**Files:**
- Create: `docs/board-sequencer-cheat-sheet.md`

**Interfaces:** none (pure documentation).

**Note on testing:** documentation only — no test. Verify the file renders as readable markdown.

- [ ] **Step 1: Create the cheat sheet**

Create `docs/board-sequencer-cheat-sheet.md` (wording mirrors `BoardHelp.tsx`):

```markdown
# Board Sequencer — Facilitator Cheat Sheet

*One page to keep by the board. The three feature toggles are independent and OFF by default — turn on only what you want. Everything saves automatically.*

## Setup
- Line up the four **board corners** (calibrate).
- **Add a colour:** click a piece in the camera view — that colour becomes an instrument.
- Press **Start.** A playhead sweeps **left → right**; a piece sounds when the playhead reaches its column. **Higher rows = higher notes.**

## Pieces not being detected?
- Lower **"Min fill"** (Colours & detection). A piece no longer has to sit dead-centre.

## Variation — "every other time round"
- Turn on **Variation.**
- **Shove a piece to the edge of its square** → it plays every OTHER pass (it gets a **dashed ring**).
- The **A / B** letter shows the current lap: dashed-ring pieces are silent on **A**, play on **B**.
- **"Shove needed"** slider sets how big a push counts (bigger for shaky aim).

## Ping-pong — a longer, there-and-back phrase
- Turn on **Ping-pong.**
- The playhead runs **→ then ←** (watch the **→ / ←** arrow), doubling the phrase.
- With Variation on too, edge-shoved pieces play on the **return (←)** sweep.

## Loop bank — save, layer, bring back
- Turn on **Loop bank.** The **bottom row** becomes **save slots** (not notes).
- **Save:** lay a pattern above, drop a counter on an **empty** bottom-row slot → it captures and loops.
- **Layer:** sweep the board, build another pattern, save to the next slot → both play together.
- **Pause / resume:** **remove** a slot's counter to pause; **replace** it to resume.
- **Clear** (on a slot's on-screen mini-view) empties it so you can re-record — then lift and re-place the counter.
- Loops stay in sync, inherit Ping-pong + Variation, and are **saved across sessions.**

## Good to know
- Loop bank is **single-page** for now (doesn't combine with the sequential "Pages" feature).
- **Variation** switches off when **Pages > 1.**
```

- [ ] **Step 2: Commit**

```bash
git add docs/board-sequencer-cheat-sheet.md
git commit -m "docs(board-sequencer): facilitator cheat sheet"
```

---

## Self-Review

**Spec coverage:**
- On-screen "How to play" section, collapsed + first, in a new `BoardHelp.tsx` → Task 1. ✓
- Content groups (Basics, detection, Variation, Ping-pong, Loop bank) with the spec's exact wording → Task 1 `HELP` + Task 2 cheat sheet. ✓
- Printable facilitator cheat sheet mirroring the wording → Task 2. ✓
- Presentational only, no state/props/logic → `BoardHelp` takes no props, renders a static list. ✓

**Placeholder scan:** No TBD/TODO; complete component + doc content shown. ✓

**Type consistency:** `BoardHelp` default export, no props, used as `<BoardHelp />`; `openSection.help` / `toggleSection('help')` match the existing `Record<string, boolean>` + handler. ✓

**Scope:** No context-sensitivity, no modal, no i18n — all matching the spec's scope guards. ✓
