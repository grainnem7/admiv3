# Making loops, scenes and a piece: how to make it obvious

4 Nov 2026. An investigation, not yet a build. The owner, after trying the instrument look
and the producer flow fixes: "I still think it is unintuitive how to make the loops and build
a piece from a user perspective." This document says why, what the best tools do, what ADMI
must keep, three ways to redesign it, and the one I recommend, with a build plan.

Sources inside the repository: the walk through the journey (23 screenshots, 3 Nov), the
brief and flow design of 27 Oct (`2026-10-27-loops-and-piece-brief.md`,
`2026-10-27-loops-and-piece-flow-design.md`), the loop bank design of 30 June, the code's
own rules (F1 one way to make a loop, F2 the piece and a new loop never together, B13, B17,
R2-T1-01, T4-09 and the rest), and the owner's decisions of 27 Oct and 2 Nov. Outside: the
manuals of Ableton Live's Session View and Logic's Live Loops, reviews of Novation's Circuit
Tracks, loop pedal conventions, and the Drake Music and Queen's University Belfast work on
accessible instruments, which says the facilitator and the musician together are the
instrument, not the device alone.

## 1. Who does this, and when

| Who | Where | Before the show | On the day |
|---|---|---|---|
| Tim (cerebral palsy, left-handed, no dwell, no fast shakes) | the board, the iPad | composes each loop with counters, listens, decides by ear, voice or a big pad | plays over the piece; never presses Next (owner, 27 Oct) |
| The owner (researcher, performer, not a programmer) | the laptop | keeps the loops, builds the piece, rehearses | runs Show; Stop, Mute, Simplify |

So the flow has two halves: a **making** half, where the two of them work together at the
board, and a **playing** half, which is locked. Everything below is about the making half.

## 2. What is hard today, and why

The parts all exist. They are laid out as steps and lists, and a musician does not think in
steps. The walk found five causes.

1. **Four layers, four places.** Counters on the board make a loop; loops live in Make a
   piece step 1; scenes in step 2; the piece's length and ending in step 3; the piece plays
   from Show. Nothing on the Board view shows the loops you have made. Nothing in Scenes shows
   the board. Each layer is read in words ("Loop 1 · Energy: Steady · 1:30 long") instead of
   seen.
2. **No single picture of the piece.** Which loops play in which scene is spread across four
   open scene rows and a timeline of names. A producer expects one grid or one lane view.
3. **The three steps promise an order the app does not use.** 1 Loops, 2 Scenes, 3 Ending &
   check reads like a wizard, but you can start anywhere, Make my plan fills the scenes with
   whatever loops exist, and a scene without loops is silent. The numbering adds a question
   ("am I allowed to be here yet?") without answering one.
4. **Making a loop is a mode.** New loop silences everything and waits for a clear board,
   which the owner asked for on 27 Oct (silence first). Keep as loop, added on 3 Nov, is the
   one press producers expect. Having both, with New loop's three states (silent, not kept,
   kept) and its own Hear it with and name chips, is the busiest part of the panel.
5. **Words carry what pictures should.** Keep, New loop, Make my plan, Rehearse from here,
   Jump here now, Hear it with, On its own, How scenes work, Other ways to make a loop. Each is
   plain, and each needs a sentence under it. Taken together they are a manual.

Counted on the walk: from a board with counters to a kept loop takes 3 presses in two
places (Make a piece, New loop, Keep) or 1 press (Keep as loop); from no scenes to a playable
four-scene piece takes 4 presses in three places; seeing what scene 3 plays takes 2 presses.

## 3. What the best tools do

| Tool | The one picture | How a loop is made | How a piece is built | What to borrow |
|---|---|---|---|---|
| Ableton Live, Session View | a grid: tracks as columns, scenes as rows, one clip per cell; a scene launches its whole row; launches land on the next bar | record into a cell while the others play | arrange by firing scenes; record the result to the Arrangement | the grid as the one picture; the row as the scene; quantised launch (ADMI already lands on the next pass) |
| Logic, Live Loops | the same grid, tracks as rows, scenes as columns; starter grids to learn from; a count in before recording into a cell | one press records into a cell | copy cells to the Tracks timeline | starter content (Make my plan is ours); count in (built 3 Nov) |
| Novation Circuit Tracks | no screen: pads are patterns, Scenes are pads that recall a set of patterns and mutes; chained Scenes are the song | play, press a pad | chain scenes | "power on and a groove in minutes": one gesture per idea, nothing to read |
| Loop pedals (and the repo's own loop bank design of June) | a row of slots | one gesture: play, press, it loops; press again, it stops | layer | capture where you play, not on another screen |
| GarageBand | the grid, with templates | record into a cell with a count in | drag cells to the timeline | templates that teach |

Four things are common to all of them:

- **One picture.** Ideas are objects (clips, patterns) in a grid you can see at once. State is
  shown on the object (lit, playing, empty), never in a sentence beside it.
- **Capture where you play.** The loop is made with one gesture, on the same screen as the
  playing, and the music does not stop for it.
- **Direct manipulation.** Tap a cell to turn it on. Press a row to play the scene. Nothing is
  "set" in a form that then has to be found again.
- **Progressive disclosure.** The grid holds the structure; the settings of a scene or a
  clip open to the side when that one is selected.

And from the accessibility research (Drake Music's DMLab co-design, the Belfast studies of
Drake Music NI): the thing that works is the pairing, the musician who decides by ear and the
facilitator who carries it out. So the design must make the owner's clicks few and visible to
Tim, and give Tim a way to say yes or no without the laptop.

## 4. Principles for ADMI (what the design must keep)

1. **The board is the instrument.** Loops are made from it and shown beside it.
2. **One picture of the piece.** The loops you have and the scenes you have, and which plays
   in which, on one screen with no prose.
3. **Direct.** A press on the thing changes the thing. No step numbers, no "go to" sentences.
4. **State is seen.** Playing, kept, empty, on now, waiting: on the object, by shape and word,
   never by colour alone. Counter hues stay for counters.
5. **Nothing hidden behind a step.** Every control is one press from the picture; the fine
   settings open beside it (the inspector), never on another step.
6. **Keep the words that are learnt.** Loop, scene, piece, Keep, Show, Make my plan, Rehearse
   from here, Next scene, End piece. Help and the e2e names hold.
7. **Keep the rules.** F1 one way to make a loop; F2 the piece and a new loop never together;
   B13 ▶ Play never starts the piece; the day is locked; 44 px targets; 14 px minimum;
   switch and keyboard access; A3 nothing moves the board.
8. **Keep the decisions.** Silence first is still available (owner, 27 Oct), but as the second
   way. No Keep pad on the iPad (27 Oct). Tim cannot press Next. Named pieces (3 Nov).

## 5. Three ways to redesign it

**A. The grid.** Loops as a rail beside the board (made and played there). The piece as a
grid: loops as rows, scenes as columns in time order, a dot where a loop plays in a scene.
A side inspector for the selected scene. Check under the grid. Two tabs: Piece, Check.

**B. The running order.** The 27 Oct design: a column of section cards in order, with a
change chip (Fade, Overlap, Cut) between each pair, loops as tiles on the card, lengths not
times. No grid.

**C. The wizard, done properly.** Keep the three steps but enforce them: Loops locks Scenes
until two loops exist; Scenes locks Check until every scene has a loop; a progress bar; each
step one screen with one big button.

| Criterion | A grid | B running order | C wizard |
|---|---|---|---|
| Presses to the first loop (from a playing board) | 1 (press an empty place in the rail) | 1 (Keep as loop) | 3 |
| Presses to a four-scene piece with loops in each | 1 (Make my plan) then 0 to read it | 1, then scroll | 4 |
| Can you see the whole piece at once? | yes, one grid | no, a scrolling column | no |
| Can you see your loops while playing the board? | yes, the rail | no | no |
| Changing which loop plays in scene 3 | 1 press on a cell | open the card, press a tile | open step 2, open the row, press a toggle |
| Tim's part (decide by ear) | owner presses a cell while it plays; Tim hears the scene | the same, plus Hear this change | the same |
| Transitions (Fade, Overlap, Cut) | a chip under each column boundary, later | first class, built in | as now |
| Keyboard and switch | grid: arrows move, Enter toggles (one tab stop, as the laptop board) | list: Tab through cards | as now |
| Reads the same on the iPad | a grid shrinks well | a list scrolls well | no |
| Fits F1, F2, B13, A3 | yes | yes | yes |
| Effort | 5 batches | 5 batches | 2 batches |
| Risk | the grid needs care at 320 px | sections with lengths change the clock model | low, and solves little |

**Recommendation: A, the grid**, with B's change chips as a later batch under the grid, and
C's one idea, the teaching lines on an empty piece, as the empty state.

## 6. The recommended design

### 6.1 The Board view: loops beside the board

A **loop rail** on the board's side (the panel's side, so the board stays where it is, A3):
eight places, each a small picture of its counters on the dot grid, numbered. The rail is the
laptop bar's row and the Loops list in one.

| Press | What happens | What you see and hear |
|---|---|---|
| an **empty** place | the counters on the board are kept there as that loop, named "Loop N" | the picture appears; "Kept as Loop 3" said once; the music plays on |
| a **kept** place | that loop plays (from the next pass), or stops if it was playing | the place's edge lights while it plays; the loop's notes show on the board as rings, as now |
| **…** on a place (or right click, or Shift+Enter) | Rename, Replace with the board, Edit notes, Clear | a small menu beside the place |
| **New loop** (one word button under the rail) | the second way, from silence, exactly as today | the rail greys until Keep or Leave |

Rules: a press on an empty place does nothing with an empty board ("Put counters down
first" in the tooltip and said once). During the piece the whole rail is greyed with "Stop the
piece to change the loops" (F2). Inside New loop, Keep is New loop's own (F1). Keep as loop under
the board goes: the rail is Keep as loop.

Keyboard and switch: the rail is one tab stop, a listbox; arrows move, Enter presses, Shift+Enter
opens the menu. The iPad's Loops page already shows the same eight places and starts and stops
them; it stays as it is (no Keep pad, owner 27 Oct).

### 6.2 Make a piece: the grid

Make a piece has two tabs, **Piece** and **Check**, and the piece fold at the top as built on
3 Nov. The three numbered steps go.

```
PIECE  Opening set ▾                                    7:00 · fade over 2 passes · count in
 ─────────────────────────────────────────────────────────────────────────────────────────
             0:00         1:30         3:30         6:00     │ end
 ┌──────────┬────────────┬────────────┬────────────┬─────────┤
 │          │ Arrival    │ Build      │ Open       │ Home    │   ← scene names, draggable marks
 │          │ Steady     │ Lively     │ Big        │ Steady  │   ← energy, a word
 ├──────────┼────────────┼────────────┼────────────┼─────────┤
 │ 1 Bed    │     ●      │     ●      │     ●      │    ●    │   ← a loop: its picture and name
 │ 2 Pulse  │            │     ●      │     ●      │         │
 │ 3 Beat   │            │            │     ●      │         │
 │ 4 Shine  │            │            │            │    ●    │
 │ 5 · · ·  │            │            │            │         │   ← an empty place
 └──────────┴────────────┴────────────┴────────────┴─────────┘
   ▶ Rehearse from here (under the selected column)         + Scene   Make my plan
```

- **Rows are the loops** (the same eight places as the rail, same pictures). **Columns are the
  scenes** in time order, as wide as their share of the piece, the same proportions as the
  timeline today. A **dot** in a cell means the loop plays in that scene. Press a cell to add
  or remove it. Press a row's name to hear that loop. Press a column's name to select the scene.
- **While the piece plays** the live column is lit, exactly as the board's step is, and the
  playhead runs along the time ruler. Jump here now is pressing a column's name while it
  plays (same words in its tooltip and Help).
- **The inspector** for the selected scene sits to the right of the grid (under it when the
  panel is narrow): name, time, energy, then More (world, band, parts, extra notes, sounds
  change, speed, lead in, ideas), Duplicate, Delete. It is today's scene row, opened, nothing
  more. One scene open at a time, never a stack of rows.
- **Scene marks drag** on the ruler (built 3 Nov). **+ Scene** adds a column after the selected
  one with no time yet, as Duplicate does. **Make my plan** stays as the one big button when the
  grid has no scenes, and as a small one after.
- **Under the grid:** length, how it ends, count in, as in today's Ending & check, in one row of
  words; the full Ready check moves to the **Check** tab.
- **Empty piece, teaching lines** (the one idea from C): with no loops and no scenes, the grid
  area shows three lines with ticks, each ticked as it is done: "Play something and press an
  empty place in the loop rail. Do it two or three times." · "Press Make my plan." · "Go to Show
  and press Start the piece." These are the whole Help for a first piece.

Keyboard and switch: the grid is one tab stop, a real `grid` (as the laptop board is): arrows
move between cells, Enter toggles, Home and End reach a row's ends; the column headings and
row names are in the same grid. Each cell is 44 px. At 320 px the grid scrolls sideways in its
own box with the row names fixed, the one place sideways scrolling is allowed.

### 6.3 What changes, what stays

| Today | Proposed |
|---|---|
| Laptop bar's colour words above the board | stay |
| Keep as loop under the board | becomes the rail's empty place; the button goes |
| Make a piece: 1 Loops, 2 Scenes, 3 Ending & check | Piece and Check |
| Loops list with name fields, ▶, ✕, Other ways | the rail (board) and the grid's rows (piece); Other ways under the rail's … menu |
| New loop panel | stays, as the second way; opens from the rail's New loop |
| Timeline chips, energy graph, scene rows | the grid's ruler, the energy word in the column heading, the inspector |
| Scene row's loop toggles | the cells |
| How scenes work, the paragraphs | the teaching lines on an empty piece; one sentence in Help |
| Show, the iPad, the audience screen | unchanged |

Transitions between scenes (Fade, Overlap, Cut per boundary, the 27 Oct design's change
chips) are not in this design's first build. The grid leaves room for a chip on each column
boundary under the ruler, so they can come as their own batch once the model exists in the
engine.

### 6.4 How it reads for the two of them

Tim plays. The owner presses a place in the rail: "That's Loop 1." Tim plays something else;
the owner presses the next place. Three loops in three presses, no screen change, the music
never stopping. Make a piece: one press on Make my plan, and the grid shows four columns with
the three loops spread across them. Tim listens to Rehearse from here; the owner moves dots
while it plays and Tim says yes or no. Show, Start the piece. That is the whole journey, and
every state of it is on one of two pictures.

## 7. Build plan

Each batch tests first (unit for the pure parts, e2e for the screens), `npm run lint`,
`npm run test:run`, the e2e suites it touches, the keeping-time meter no worse, Help and the
spec updated, nothing moving the board (A3).

- **G1 The loop rail.** `LoopRail.tsx` (listbox of eight places, pictures from `LoopThumb`,
  pressed states, the … menu), wired to the existing keep, toggle, rename, clear and edit
  handlers; Keep as loop button retired; `laptopBar` and the rail share the panel's top on the
  Board view. Tests: rail keyboard model; e2e: make three loops in three presses while playing.
- **G2 The grid.** `PieceGrid.tsx` (pure layout from scenes, loops and the length; a `grid`
  role with one tab stop; cells toggle through `onEditScene`; ruler with the existing drag;
  column select). `pieceGrid.ts` pure helpers (column widths, which cells are on, keyboard
  moves). Tests: helpers; e2e: toggle a cell and hear the change on the next pass.
- **G3 The inspector and the tabs.** `SceneInspector.tsx` from today's `SceneRow` open state;
  Piece and Check tabs replace the three steps; length, ending and count in under the grid;
  teaching lines on an empty piece. Tests: the inspector shows the selected scene only; the
  three teaching lines tick off.
- **G4 Show and the live column.** The live column lit while the piece plays; Jump here now on
  a column name; Rehearse from here under the selected column. e2e: route A and the jump.
- **G5 Words, Help, the iPad.** Help's Make a piece section rewritten to the picture; the iPad's
  Loops page checked against the rail's numbering; the spec's status.

Measures to take in the next session with Tim and the owner, before and after: seconds from a
playing board to the first kept loop; presses to a four-scene piece; how often the owner opens
Help; the owner's and Tim's own words after a run.

## 8. Open questions for the owner

1. **Where the rail sits.** Beside the board on the panel's side (the board keeps its place,
   A3) or along the board's bottom edge (where the June loop bank was, nearer Tim's reach, but
   it takes a row from the board). I recommend the panel's side.
2. **Loop names.** Named at once in the rail (press … then Rename) or asked for on every keep
   as New loop does. I recommend named at once, with "Loop N" until renamed.
3. **Transitions.** Build the Fade, Overlap and Cut chips as batch G6 after the grid, or leave
   the one fade setting as it is.

## Status
- **G1, built (4 Nov).** `play/LoopRail.tsx`: the eight places beside the board (a row each:
  picture, name), kept ones a step up from the page, the playing one edged in the text colour,
  empty ones a dashed hairline. Press, play or stop, the … menu (Rename, Replace with the board,
  Edit notes, Clear), New loop from silence. One tab stop. In Board and Make a piece alike, on the
  side away from the panel (A3); a row under the board when stacked. The Keep as loop button
  under the board went. The owner's answers assumed: the rail on the panel's side, loops named
  "Loop N" until renamed, transitions later.
- **G2, built (4 Nov).** `play/PieceGrid.tsx` and `performance/pieceGrid.ts`: under the
  timeline's ruler, a row for each kept loop and a cell per timed scene, a dot where the loop
  plays; a press turns it on or off (`onEditScene`); the row's name plays the loop; the column
  on now is lit while the piece plays; one tab stop with arrows, Home and End. With no loops it
  says where to keep one. The scene rows stay under it for now as the editor of the selected
  scene (G3 makes them the inspector).
- **G3, built (4 Nov).** Two tabs, Piece and Check, in place of the three numbered steps
  (the step ids stay underneath: Loops and Scenes both open Piece; the e2e helper maps them).
  Piece holds, in order: the piece fold, the three teaching lines while there are no scenes
  (`FirstPiece`, each ticked as it is done), Scenes (the ruler, the grid, the energy line, the
  scene rows as the editor of the one open), then Loops (Keep as loop, New loop from silence,
  the list with names and Other ways). Check is the former Ending & check: the length, how it
  ends, Count in and the ready check. The headings lost their numbers; "Next: Check" and
  "← Piece" are the footers. Kept for now against the design: length, ending and count in stay
  on Check rather than under the grid, and the scene rows stay as the inspector, so the tests
  of both hold; the energy line stays under the grid.
- **G4, in G2.** The column on now is lit while the piece plays; Rehearse from here and Jump
  here now stay on the scene rows (the inspector), where their words and tests are.
- **G5, built (4 Nov).** Help's Make a piece section describes the rail, the grid and the two
  tabs; the iPad's Loops page numbers the same eight places as the rail, unchanged. Every
  learnt word stays. The e2e helpers open Piece for the old Loops and Scenes steps.
- **Walked end to end (4 Nov), in a real browser on the laptop board.** Counters down, the
  board kept in place 1, the board cleared, place 1 pressed: the loop sounds alone (notes in
  the session log, sound at the speakers). A second loop kept, renamed through the … menu,
  place 1 stopped and started. Make my plan, a cell pressed on and off, the row agreeing.
  The piece started from Show: Now and next right, the lit column on the Piece tab, the
  scene's loops sounding with the board empty, both places "playing" in the rail; after a
  reload both loops and the four scenes are back. Two faults found and fixed:
  - Keep on the playing laptop board read the engine's settled cells, which lag a click, so
    a counter put down just before Keep was left out of the loop (the rail said "1 note"
    for two counters). Keep now takes what is placed on the laptop board, playing or not.
    An e2e test keeps straight after the second counter.
  - With Details open, the row holding the board and the rail was squeezed below the rail's
    height and the Details block covered Loop 8, the … button and New loop. The row is now
    never shorter than the rail (`RAIL_MIN_HEIGHT`); the page scrolls instead.
  Still to be seen in use: the camera board (Keep reads the settled cells there, as it must),
  and a player's own hands on the rail and the grid.
- **G6 Keep hands over (4 Nov).** The second press is gone. On the laptop board, Keep in the
  rail keeps the board as the loop, starts it and clears the board in the same press, so
  the music never stops; the notice offers Undo, which puts the counters back and stops
  the loop. On the camera board, where counters can't vanish, the loop starts by itself
  when the counters are lifted within a minute of Keep, so nothing doubles up meanwhile.
  The first time counters are down with nothing kept, one line says where loops come from.
  Help says so. e2e: the handover and Undo; P2 reads the new notice. The old way (Keep the
  board as this loop under Other ways) is unchanged.
- **G7 Scenes from what plays, and the rail counts down (4 Nov).** "Add a scene from what's
  playing" made a scene with no time, which the timeline and the grid could not show until
  one was typed, from a button under the whole list. Now "Keep what plays now as a scene"
  sits right under the grid, and as "Keep what plays now as scene 1" beside Make my plan
  for a first scene, and the scene lands at a time of its own (`nextSceneTime`): now while
  the piece runs, else after the last scene by the same gap as before (a minute after the
  first), never past the end, nudged clear of another scene's time. The place of a loop
  that is starting or stopping shows "in N", the steps to the next pass, and says so to a
  screen reader. The name box went: a scene is named in its row.
