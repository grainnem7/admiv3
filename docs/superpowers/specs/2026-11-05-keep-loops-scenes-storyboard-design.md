# Keep: loops, scenes and the storyboard

5 Nov 2026, on the branch `instrument-look`. A design, not yet a build. Mock-ups the owner
approved: https://claude.ai/artifact/87uKC9XZ34e8mbVTPE92pk ("Yes that is better").

## Why

The owner, after the loop rail and the piece grid of 3 Nov (`2026-11-04-loops-and-piece-grid-
investigation.md`): "It's just really difficult to figure out how to make a loop and then also
how to make a scene." Looking at the screens as she sees them:

- On the Board, nothing says *Keep*. The rail is eight grey boxes "Loop 1 … Loop 8"; you would
  have to guess that pressing a grey "Loop 1" keeps the board. The one big button is ▶ Play.
- In Make a piece, the right-hand column is a wall of words (a notice, the piece fold, two tabs,
  three numbered lines, a heading, two paragraphs, two buttons, a fold) before anything that
  does something. A scene is never shown as a thing: after Make my plan it is a thin strip of
  chips, a one-row grid of dots, an energy graph and a list of rows.

The fix is one visible move for everything you make, **Keep**, and one picture of the piece
that a musician reads at a glance, a **storyboard** of scene cards.

## Who, and when

- **Before the show**, together at the board: Tim plays; the owner presses Keep. She builds the
  piece on the laptop; Tim decides by ear.
- **On the day**: the piece runs itself from Show. Tim improvises on top with counters. His iPad
  switches **his own counters** on and off, **one pad per colour**, each showing the colour and
  its instrument (owner, 5 Nov).

## Goals

1. From a playing board to a kept loop: one press, on a button that says what it does.
2. From loops playing together to a scene: one press, on the same button in the same place.
3. The whole piece visible at once as cards in time order, each showing what plays in it.
4. Any scene editable by pressing its card: its loops, how it sounds, how long it is, and how the
   piece gets into it (fade, overlap or cut).
5. Tim's iPad: one pad per colour, colour and instrument on it, silencing that colour's counters.

## Non-goals

- Making loops or scenes from the iPad (owner, 27 Oct and 4 Nov: the iPad is for playing live).
- A new engine for loops. Loops are kept, started and stopped as today.
- Changing Show, the audience screen, the hat, Ableton, or how saved loops and pieces are stored
  (they load as they are).

## Anti-goals

- A second way to do the same job beside the first. Keep as loop replaces the rail's empty
  places as *the* way; New loop from silence stays but under "… more".
- Prose that explains a control. If a control needs a sentence, the control is wrong.
- Colour as the only sign of state (deaf and colour-blind players; counter hues stay for
  counters).

## The design

### 1. The Board: Keep as loop

```
                                   [ ▶ Playing ]  [ Keep as loop ]      ← beside Play, big, filled
LOOPS · press to play or stop                      ● Playing · 90 BPM
┌ [picture] Bed    ■ ┐  ← playing: solid edge, ■
┌ [picture] Pulse  ▶ ┐  ← kept, stopped: ▶
┌ + Keep as loop     ┐  ← one dashed place, the only empty one
  … more
```

- **Keep as loop** is a large filled button beside ▶ Play the board (the panel's top row, where
  ▶ Play and Mute are). Pressing it does exactly what pressing an empty rail place does today
  (G6, 4 Nov): the counters on the board are kept as the next loop, the loop starts, the board
  is cleared (laptop board) or waits for the counters to lift (camera board), with the notice
  and its Undo. Disabled, with the reason in its tooltip and said once on press, when the board
  is empty ("Put counters down first"), when every place is full, and while the piece plays
  (F2: "Stop the piece to change the loops").
- **The rail shows only kept loops**, in slot order, each as today's tile (picture, name) plus a
  ▶ or ■ glyph at the end that says stopped or playing (never colour alone). After the last
  kept one, **one** dashed place "+ Keep as loop", which does the same as the button (so the
  rail still works for someone who learnt it). No "Loop 2 … Loop 8" empties. With no loops kept
  the rail is the dashed place alone and the words "Loops you keep appear here."
- **Slots keep their numbers.** Clearing Loop 2 of three leaves Bed (1) and Beat (3) and the
  dashed place; the next Keep fills slot 2. The iPad's Loops page (full layout) numbers the
  same slots, unchanged.
- **"… more"** under the rail opens today's menu for the place last pressed (Rename, Replace
  with the board, Edit notes, Clear) **and** "New loop from silence" as its last line. The
  rail's own New loop button goes. Right-click, Shift+Enter and the keyboard model stay.
- **Keep as loop under Loops in Make a piece** (the G3 button, which only saved into the first
  free place with no start, clear or Undo) goes; the panel's button is the one, and it behaves
  as the rail's place does (`keepAsLoopAt`), choosing its place with `slotForKeep` (which skips
  empty places a scene still names). "Other ways to make a loop" goes with it (F1: one way),
  "Keep the board as this loop" included; the e2e tests that used them are rewritten to Keep
  as loop in the same batch. The iPad's Capture pad (full layout) is untouched.
- **The "… more" button is never disabled for want of a loop**: with no loops kept it opens a
  menu holding only "New loop from silence". (Today LoopRail.tsx disables it when the focused
  place is empty.)
- **The player's Loop fade** (0, ½, 1 or 2 passes, for loops started and stopped by hand) moves
  from "More: fades" in the Loops section, which goes, to the **Timing** tab of the panel, under
  the speed controls, with the same words.

### 2. Make a piece: Keep as scene, and the storyboard

```
 ┌──────────────────────────────────────────┐   [ ▶ Playing ]  [ Keep as scene ]
 │ LOOPS            the board (as it is)    │   ● Playing · Bed + Pulse · Lively
 │ [Bed ■]                                  │
 │ [Pulse ■]                                │   Scene 2 · Build              1:30 → 3:30
 │ [Beat ▶]                                 │   LOOPS IN THIS SCENE  [Bed ✓] [Pulse ✓] [Beat  ]
 │ [+ Keep as loop]                         │   FEEL      Calm  Steady  *Lively*  Driving
 └──────────────────────────────────────────┘   WORLD · KEY · BAND   Warm · Same key · Band plays  change ▾
                                                INTO THIS SCENE   *Fade · 2 passes*  Overlap  Cut
 THE PIECE · Piece 1 ▾ · 7:00 · ends with a fade   LENGTH    2:00
 ┌ 1 · 0:00 ┐      ┌ 2 · 1:30 ┐     ┌ 3 · 3:30 ┐  [▶ Hear from here] Duplicate  Delete   Check ›
 │ Arrival  │ fade │ Build    │ cut │ Open     │ …  [+ Keep what's playing as a scene]
 │ ▪▪▫      │  2 → │ ▪▪▫      │  →  │ ▪▪▪      │
 │ Steady   │      │ Lively   │     │ Driving  │       ✦ Make my plan (a 4-scene start)
 └──────────┘      └──────────┘     └──────────┘
 0:00              1:30            3:30          6:00    7:00
```

**Layout.** Make a piece keeps the Board view's left half (colours, board, rail) exactly as the
Board view has it. Under the board-and-rail row, full width, is **the piece** as a storyboard.
The right-hand panel holds **Keep as scene** at the top (where Keep as loop is on the Board)
and, under it, **the editor of the selected scene**. The three numbered steps, the Piece/Check
tabs, the timeline strip, the grid of dots, the energy graph, the scene rows, "How scenes work"
and the teaching lines all go. Check stays, as a button "Check ›" at the end of the editor's
row that opens today's Check content in the panel, with "‹ Back to the scene".

**Keep as scene** does what "Keep what plays now as a scene" does today (G7): a new scene from
what is playing now (which loops, and the settings now), **always after the last scene**, at
`nextSceneTime`, selected, with its card at the end of the row. Its name is "Scene N" until
renamed in the editor. To put a scene in the middle, Duplicate the one before it and change the
copy. Disabled with the reason when nothing is playing and no loop is on ("Play a loop first"),
when `nextSceneTime` finds no room ("No room before the end: shorten a scene first"), and while
the piece plays from Show (as today's scene editing rules).

**Every scene has a time.** Scenes "by hand" with no time (`at` null) are no longer made:
Duplicate puts its copy straight after the original, **halving the original's length** between
the two (so nothing after them moves), and refuses with a reason when the original is under
two passes long. A saved scene without a time is given one when the piece loads, at
`nextSceneTime` after the last timed scene (and dropped from the clock, as today, if there is
no room: Check says so). The first scene is always at 0:00; its time cannot be edited. The
"Comes in at" field goes; Length replaces it (see the editor).

**The storyboard.** One card per scene, left to right in time order, in a row that scrolls
sideways in its own box when it must (the one place sideways scrolling is allowed). Each card:

- its number and time ("2 · 1:30"); its **name** large; its loops as the rail's pictures,
  **lit** for a loop that plays in it and **dim (30%)** for a kept loop that does not; a line of
  words for its feel and anything else it changes ("Lively · Warm", "Driving · Electronic · up a
  tone"). The pictures are in slot order, the same order as the rail.
- the selected card has a solid edge; while the piece plays, the card on now is lit as the grid's
  column was (same token) and the ruler under the row carries the playhead.
- between each pair of cards, a **join**: a small chip with the way into the next scene
  ("fade 2", "overlap 1", "cut") and an arrow. Pressing the chip selects the scene after it and
  focuses "Into this scene" in the editor.
- after the last card, a dashed card "+ Keep what's playing as a scene" (the same as the button).
- with no scenes: one dashed card, and one line under the row: "Play some loops together, then
  press Keep as scene. Or press Make my plan for a four-scene start." These are the whole Help
  for a first piece.
- **✦ Make my plan** sits at the row's right as a small button; it does what it does today
  (four scenes across the piece with the kept loops spread over them), replacing the row after
  the existing confirmation when scenes exist. With no scenes it is the only button beside the
  dashed card.
- the row's heading: "THE PIECE · <piece name> ▾ · 7:00 · ends with a fade", with **Check ›** at
  its right end (so Check is reachable with no scenes). The ▾ opens today's piece fold (Open,
  Duplicate, Delete, Rename, New) under the heading. Pieces stay named (3 Nov).
- a ruler under the cards: the scene times and the end, the playhead while it plays. Cards are
  equal width (a storyboard, not a timeline); the ruler carries the proportions.

**Height.** The board keeps its size and place (A3): the board-and-rail row is as it is on the
Board view, and the storyboard sits under it at the window's full width (under the panel too,
which ends above it). On a 1440 × 900 screen it all fits; on a shorter screen the page scrolls
and the panel stays in view (`position: sticky`), so pressing a card always shows its editor.

Keyboard and switch: the row is one tab stop (a listbox of cards): ← → move, Enter selects (so the
editor shows it), Home and End. Each card is at least 44 px tall and its name at least 16 px.

**The editor** (the right-hand panel, under Keep as scene) is today's open scene row, laid out
as a form, one scene at a time:

| Line | What | Today's control it is |
|---|---|---|
| Heading | "Scene 2 · Build", with the name editable in place; "1:30 → 3:30" | the name field and the time |
| Loops in this scene | the kept loops as tiles with the picture and name; pressed = plays in this scene | the scene row's loop toggles / the grid's cells |
| Energy | Off · Calm · Steady · Lively · Driving · Big, the six words as today | `sceneEnergy` |
| World · Key · Band | the current values as words, with "change ▾" opening today's More (world, band, parts, extra notes, sounds change, speed, lead in, ideas, "Only the player sounds" (the alone tick), Update from now, New ideas for this scene) | the scene row's More |
| Into this scene | Fade (1 or 2 passes) · Overlap (1 or 2 passes) · Cut | **new**, see 3 |
| Length | m:ss, typed. The next scene's time moves with it: every later scene moves by the difference, never past the end; the last scene's length runs to the piece's end, and typing it sets the piece's length (within today's limits) | the "Comes in at" field, shown as a length |
| Buttons | ▶ Hear from here · Duplicate · Delete · Check › | Rehearse from here, Duplicate, Delete |

The word stays **Energy** (the mock-up said Feel; Help, the tests and the iPad's Calm / Busy
already use those words, and Energy has six levels in use, Make my plan setting Big).

"Jump here now" (while the board plays) stays as a second button beside Hear from here, with
the same words as today. Everything a scene can set today it can still set; nothing is lost,
only folded under "change ▾".

**Check** (the panel, from "Check ›" in the editor or the storyboard heading, with "‹ Back") holds
what it holds today (the length, how it ends, Count in, the ready check, Back up / Restore) and,
under a heading "The whole piece", the controls that belong to no scene: "When each colour comes
in", "The same ideas each rehearsal" with Surprise me and New ideas, and "Scenes leave the
player's strips alone".

### 3. The way into a scene: fade, overlap, cut

A scene gets one new field, `wayIn`, how the piece gets **into it** from whatever played before:

| wayIn | What happens at the scene's time | Default |
|---|---|---|
| `{ kind: 'fade', passes: 1 \| 2 }` | loops leaving fade out while loops arriving fade in, over the passes; the band and Extra notes follow the scene's settings at the first beat | scenes saved before the field existed read the player's Loop fade when the piece loads, so they sound as they did: 0 → cut, ½ or 1 → fade 1, 2 → fade 2 |
| `{ kind: 'overlap', passes: 1 \| 2 }` | arriving loops start at full on the first beat; leaving loops carry on at full for the passes, then stop at a pass boundary | |
| `{ kind: 'cut' }` | leaving loops stop at the end of the pass before; arriving loops start on the first beat | |

A loop in both scenes carries on untouched whatever the way in (the 27 Oct design's "drums carry
on"); the join chip says so in its tooltip ("Bed carries on").

**Engine.** Today one fade length applies to every loop start and stop
(`engine.setLaunchFade(steps)`, from the player's `loopFadePasses`). The builder adds a per-launch
way: `setLaunchedLoops(slots, loops, colours, way?)` where `way` is
`{ fadeSteps: number; holdOutSteps: number }` (fade: `fadeSteps` = passes × steps per pass,
`holdOutSteps` 0; overlap: `fadeSteps` 0, `holdOutSteps` = passes × steps; cut: both 0). A
pending launch keeps its way until it lands; a launch without `way` that arrives while one is
pending (a counter in the loop zone, a rail press) **inherits the pending way**, so a scene's
change is never cut short by a hand press in the same pass. Without a pending launch, a call
without `way` uses the player's Loop fade as now, so starting and stopping loops by hand (the
rail, the iPad) is unchanged.

**Every way into a scene uses its way in**: the clock, Next scene (laptop and iPad), Jump here
now, ↶ Back and the iPad's scene message all go through `goScene`, which passes the scene's way.

**Hear this change** (27 Oct, step 3): ▶ Hear from here on a scene already plays from its time;
the builder starts it **two passes before** the scene's time when the scene has a previous one,
so the way in is heard. The button's words stay "Hear from here".

### 4. On the day: the iPad's counters

The Simple page (spec 2026-11-04) gets a **Counters** row in place of the Board row: one pad
per colour on the player's board, in board order. Each pad is **filled with the colour itself**
(owner, 5 Nov: "purely coloured buttons"), with the instrument as a **picture**, not words (a
keyboard, a guitar, a flute, a trumpet, a sax, strings, a bell, drums, or a note when nothing
closer fits; read from the laptop's instrument name), the colour's name ("Yellow") in ink that
reads on that colour, and ● Playing or ○ Silent. The instrument's words stay in the pad's
spoken name for a screen reader. Pressing a pad silences that
colour's counters (they stay on the board, drawn faded on the laptop as the Board button's
silence draws them today, through `fadedColours`; the audience screen is unchanged and marks
nothing, as today); pressing again brings them back. A pad that is
silent is dimmed, with a dashed edge and "○ Silent" (or "○ Drums are off" for a drum colour while
Drums are off); sounding, bright with a firm edge, a glow in its colour and "● Playing" (never
colour alone). The pads are round, the shape and size of the instrument buttons above them,
up to four to a row (eight make two rows); Drums is a band across the top, not a third of
the page (owner, 5 Nov: the thin pads were hard to press).

- Protocol: a message `{ type: 'colourSound', id: ColourId, silent: boolean }` (the state
  wanted, not a toggle, as `boardSound` is); a state field `silentColours: ColourId[]`; and a
  state field `colours: { id, number, name, swatch, words, picture }[]` (the colour's number, name,
  its swatch colour, the laptop's words for its job and instrument, and the picture for its pad;
  a colour sent without a picture gets its job's), which `RemoteState` does not
  have today (it carries only `melody`). `silencedColourIds` takes the set as a third input. The
  tab store keeps it as it keeps `admi-board-silent`, so Carry on after a reload sounds as
  before. A leftover `admi-board-silent` of true is cleared when the Counters row is in force.
- The Board pad and its `boardSound` message stay in the code for one release but are not
  shown; a saved `remoteSimpleRows` containing `'board'` shows `'counters'`
  (`sanitizeSimpleRows`). The laptop's row chooser offers Drums, Calm/Busy, Melody plays,
  Counters.
- **Drums off and a drum colour's pad**: the pad reads "OFF · Drums are off"; pressing it brings
  Drums back (everywhere, as the Drums pad would) and that colour with it, in one press, since a
  press on a colour means "I want this to sound".
- Show's status row says "Red and Green silenced on the iPad" with a "Bring them back" button, as
  it does for the Board today.
- A control colour (one that plays no notes) gets no pad.

### 5. Words

Keep as loop · Keep as scene · The piece · Scene · Into this scene: Fade, Overlap, Cut ·
Hear from here · Jump here now · Make my plan · Check · Counters. Help's Make a piece section is
rewritten to the storyboard (the three lines above are its first paragraph). The cheat sheet's
loop and scene steps are rewritten. No word a saved test or Help already uses is renamed except
"Rehearse from here" → "Hear from here" (the e2e helpers and tests follow in the same batch).

## Rules kept

F1 one way to make a loop (Keep as loop; New loop from silence under "… more" is the one
exception, as before). F2 the piece and a new loop never together. B13 ▶ Play never starts the
piece. A3 nothing moves the board. 44 px targets, 14 px minimum text, one tab stop per group,
state never by colour alone. The day is locked: the storyboard and the editor are greyed with
"Stop the piece to change it" while the piece plays from Show, except Jump here now.

## Edge cases

- **A loop in the piece is cleared** from the rail: its pictures leave every card; a card left
  with no loops and not marked "alone" gets an amber "no loops" word, and Check flags it, as
  today.
- **Length typed longer than the room to the next scene**: the next scenes move later by the
  difference, never past the end; the end is shortened last, and the editor says "Home is now
  0:52". Typed shorter: the next scenes move earlier.
- **Overlap with 2 passes where the next scene is under 2 passes long**: the hold is cut at the
  next scene's time; the builder clamps `holdOutSteps`.
- **The camera board**: Keep as loop waits for the counters to lift (G6); the button's words are
  the same; the notice says "Lift the counters and it starts."
- **No melody colour / no colours**: the Counters row is empty and not shown.

## Decisions taken for the owner (mark for her to check)

1. Cards are equal width; the ruler carries the time. (A proportional card for a 20 s scene
   would be unreadable.)
2. Overlap and Fade offer 1 or 2 passes only (27 Oct design).
3. Scenes saved before `wayIn` existed read the player's Loop fade on load (0 → cut, ½ or
   1 → fade 1, 2 → fade 2), so an existing piece sounds at the show as it does today.
4. The Counters row replaces the Board pad rather than sitting beside it: one press per
   colour covers "all counters" in eight presses, and eight pads plus a ninth is a crowded
   page. If she wants an all-counters pad back, it is one row in the chooser.
5. "Rehearse from here" becomes "Hear from here" (shorter, and it is the word she used).
6. Check keeps its content; it is reached from the editor and the storyboard heading, not a tab.
7. The word stays Energy, with its six levels, not Feel with four.
8. Keep as scene always adds at the end; Duplicate (halving the original) is how a scene goes
   in the middle. Every scene has a time; "by hand" scenes with no time are no longer made.
9. The board keeps its size in Make a piece; a short screen scrolls to the storyboard.
10. Pressing a drum colour's pad while Drums are off brings Drums back.

## Left to the builder

- The storyboard's exact card width (about 190 px at 1440), the join's width, and how the row
  scrolls at 1024 px (the show laptop) and 768 px.
- How `wayIn` is drawn in the join chip when the scene is the first (no join before it: its
  wayIn still applies when the piece starts from Show, as a fade in from silence; the chip is
  shown as a leading half-join).
- Where the editor's "change ▾" places the More block (inline under the line is fine).
- Test names; the e2e route A rewrite (`performance.e2e.ts`) to Keep as loop → Keep as scene →
  Show.

## Build order (each usable on its own; each with unit + e2e, lint, test:run, Help)

- **K1 Keep as loop.** The panel button; the rail shows kept loops plus one dashed place; "… more"
  with New loop from silence; the Make a piece Loops section and Other ways removed; tests and
  e2e helpers.
- **K2 The storyboard and the editor.** `Storyboard.tsx` (cards, joins, ruler, the dashed card,
  Make my plan, the piece heading), `SceneEditor.tsx` (from the open scene row), Keep as scene
  in the panel, Check as a button; the old steps, grid, timeline, energy graph and rows removed;
  Help and the cheat sheet.
- **K3 The way in.** `wayIn` on the scene (sanitised, migrated), the join chip, the editor line,
  the engine's per-launch way, Hear from here starting two passes early.
- **K4 Counters on the iPad.** The row, the message, `silentColours`, the row chooser, Show's
  status line, the hollow counters.

## Status
- Design written 5 Nov; builder check done the same day (nine code mismatches and seven
  questions, all settled above); approved by the owner ("Ok").
- **K1 built (5 Nov).** Keep as loop beside ▶ Play (the panel's `keep` slot); the rail shows
  the kept loops with ▶/■ and one dashed "+ Keep as loop" place; "… more" holds Rename, Replace,
  Edit notes, Clear and New loop from silence (never disabled for want of a loop); Make a
  piece's Loops section, "Other ways" and "Keep the board as this loop" are gone (retired
  words); the hand fade is on the Timing tab; Help and the cheat sheet say so. Two bugs found
  by the e2e pass and fixed: Enter in Rename toggled the loop; focus dropped to the page after
  New loop closed.
- **K2 built (5 Nov).** `Storyboard.tsx` under the board and the panel (cards, joins, the dashed
  card, Make my plan, the ruler; the stage scrolls under the board on a short screen);
  `SceneEditor.tsx` in the panel (name in place, loops, Energy, change ▾, Length, Hear from
  here, Jump here now, Duplicate, Delete, Check ›); `PieceSteps.tsx` is the editor-or-Check panel;
  `storyboard.ts` helpers (cards, giveTimes, withLength, moveCard, cardWords); every scene has a
  time (giveTimes on load; Duplicate halves the original); Keep as scene always after the last;
  "Rehearse from here" is "Hear from here". The grid, timeline, energy graph, rows, steps and
  teaching lines are gone.
- **K3 built (5 Nov).** `Scene.wayIn` (sanitised; older scenes read the player's Loop fade on
  load: 0 cut, ½ or 1 fade 1, 2 fade 2); the engine's `LaunchWay` per launch (fade steps and a
  hold for overlap; a hand press in the same pass inherits a pending way); `goScene` passes the
  scene's way; the join chip and the editor's "Into this scene" line; Hear from here starts two
  passes early when a scene comes before.
- **K4 built (5 Nov).** The Counters row on the iPad in place of the Board pad (one pad per
  note-playing colour: numbered swatch, name, job · instrument, Playing/Silent); `colourSound`,
  `silentColours` and `colours` in the protocol (a saved row 'board' reads 'counters'); the laptop
  silences one colour at a time (`silencedColourIds` takes the set; kept for the tab; a leftover
  Board silence cleared); a drum colour brought back brings Drums back; the Board view and
  Show's row say "Red and Green silenced on the iPad" with Bring them back.
- **The e2e pass (5 Nov).** The browser tests follow the storyboard, the way in and the
  Counters row (helpers `pieceStep`, `makePlan`, `sceneCard`, `selectScene`, `keepAsScene`,
  `hearFrom`, `keepAsLoop`, `loopMenu`, `renameLoop`); three new tests (Keep as scene; the way
  in set to Cut, shown on the join, kept after a reload, Hear from here two passes early; a
  colour's pad silencing its counters). Found and fixed: Enter in the rail's Rename toggled
  the loop; focus dropped after New loop closed and after Undo; the A9 names of the cards,
  joins, piece button, Check and change; a card pressed from Check now opens its editor; and
  the Make a piece view redrew every card and the editor on every clock tick, which made the
  band's bass late (the storyboard, the editor and the loop list are memoised now). Two
  timing tests retimed: the harmony test's Build at 1:00 (four beats before Tim's chord, as
  it was at 0:12); none loosened. A scene arriving within a beat of a chord counter's beat
  drops that chord until the pass: an old edge, noted, not fixed.
- **The review (5 Nov, a fresh reviewer on the whole change):** nothing critical; six important
  findings, all fixed: a typed length could push a later scene past the end (now capped, each
  later scene keeps a pass); new scenes had no way in, so the join said "fade 1" while the sound
  used the hand fade (every new scene is fade 1 from the start); Make my plan replaced scenes
  without asking (the confirm is back); deleting the first scene left no opening scene (the
  earliest moves to 0:00, on delete and on load); a scene with no time had no card (it has a
  dashed one and can be deleted); the storyboard row was four tab stops (one now). Minors
  taken: the overlap hold stops at the next scene; cards say "no loops" or "Tim alone"; and
  the old "in Scenes / step 2" wording in the check, Help and the panel. Deferred: Duplicate's
  rounding can leave the original under a pass; a refused length stays in the field until the
  next change; the first scene's way in has no effect at Show's start; Hear from here's two
  passes use the player's speed; the iPad swatch number's contrast on yellow in light mode.
- Unit tests green (233 files); not yet committed.
