# The instrument look: the Board Sequencer as professional music software

3 Nov 2026. Built on `ux-journey`, on the branch `instrument-look`. The owner found the look
after U9 "very basic and infantile" and asked for "a complete overhaul to look like a
professional ADMI in line with other music software". Three mocks were drawn on a design
canvas; the owner chose the third ("yes that's better") after turning down a softer one
("twee and childlike") and a hard-edged, square one ("clumsy, and I don't like the squares
instead of circles").

## The look, in one idea
The counters are circles, so the whole interface takes its cue from them: circles, dots and
lines on a near-black ground, with nothing boxed. Colour appears only where it is data: the
counters, and the warnings. The chrome is monochrome.

- **Ground.** Near black (#0e0f11) in dark; near white (#f4f4f5) in light. Dark is the default
  on stage. Surfaces differ by a step of grey, never by a card with an edge and a shadow.
- **No boxes.** No bordered chips, no filled choice groups, no cards, no shadows. Sections are
  parted by one hairline (`--bs-border`) and a small tracked caption. A choice is a row of
  words: the chosen one in the text colour with a thin underline, the rest in grey.
- **Controls echo the counters.** A slider is a 2 px line with a round handle. Play is a filled
  pill in the text colour; Stop the same (it is the one filled button while playing); the
  secondary buttons a pill with a hairline edge; the quiet ones plain words. Icon buttons are
  circles. The keeping-time meter is a row of dots.
- **Type.** Inter. Captions 14 px, semibold, uppercase, tracked 0.1 em, in the third text
  colour. Body 14 and 16 px. Readouts (the speed, the step, the clock) 20 px light, tabular.
  Show's clock and scene name are display sizes (22 px and up). Nothing under 14 px (A10).
- **The board.** Flat round counters, no gloss, no rings unless a counter would vanish against
  the ground (black on dark, white on light). Empty positions are small dots in the control
  edge colour (3:1 on the ground, A4). The sounding column is tinted one step up, with its step
  number lit; the step playing now is marked by a line across the column's top edge, 3:1 and
  at least 2 px (B9). A sounding counter wears a thin ring in the text colour, with a gap of
  ground between it and the counter. The board sits on the page, not in a well.

## What stays
- Every rule of the audit spec: 44 px targets everywhere (`--bs-target`), 14 px minimum text
  (A10), 3:1 for every edge that marks a boundary (A4, B11), the 4.5:1 text contract
  (`boardTokens.test.ts`), never colour alone, one main action a view, fixed places for the
  notices (A3). A choice's state is weight and an underline as well as `aria-checked`.
- Every word. No label changes: Help, the e2e names and the word list are untouched.
- The layout of the screen: the board on one side, the panel of 400 to 480 px on the other,
  the header one row, Show full screen and always dark.

## Batches
- **L1 Theme and primitives.** Tokens (both modes), the stylesheet, Button, SegmentedControl,
  Tabs, Switch, LabeledSlider, StepRow, StepIndicator, HeaderMore, Disclosure, the caption
  style (`ui/text.ts`). The panel loses its card.
- **L2 Header and transport.** The ADMI wordmark, the view switch as words, round icon
  buttons, the Player as a name; the transport's status as a readout.
- **L3 The board.** Flat counters, dots for empty squares, the column marker, the step
  numbers above the board, the colour row above the board as words with a dot.
- **L4 The side panel.** Sound and the other tabs in hairline sections with tracked captions;
  the helper folds without their cards; the Details line.
- **L5 Make a piece.** The three steps as words, the loop rows without boxes, the timeline
  as a line with dots.
- **L6 Show.** The clock and the scene name as display type, the piece as a line with dots,
  the big buttons as pills.
- **L7 Welcome, Help and the record.** Welcome in the same look; Help's words checked; this
  spec's status; screenshots before and after.

Each batch: tests first, `npm run lint`, `npm run test:run`, the e2e for the screens it
changes, the keeping-time meter no worse.

## Status
**L1, as built:** the tokens for both modes (dark #0e0f11, light #f4f4f5; the accent is the text
colour; the surfaces a step of grey apart), `--bs-shadow: none`, no card for the panel, pills
for buttons (filled, hairline, words), choices and tabs as rows of words with the chosen one
underlined under its words (`data-words`), the Switch and the sliders in the text colour, the
caption style in `ui/text.ts`, and `instrumentLook.test.ts` keeping the stylesheet to it.

**L2 and L3, as built:** the ADMI wordmark and the screen's name in the quiet colour; the
views (Board, Make a piece, Show) and Camera / Laptop as words; round icon buttons; the
transport's status a readout on the page with the same words the tests read (the header no
longer says Stopped / Playing as well, so it stays one row at 1024 px). The board: empty
squares as dots of 3:1 (A4), flat counters ringed only when they would vanish, the column
playing now tinted with a marker along its top (B9) and its number lit, a thin ring on a
sounding counter, step numbers above the board (`data-board-steps`), no well
(`data-board-stage`). The colours above the board are words with a numbered dot.

**L4 to L6, as built:** helper folds, New loop's steps, the Cap tab's sections and the iPad
group parted by hairlines; captions tracked; the helper's own button a hairline pill. Make a
piece: the three steps as words, loop and scene rows under hairlines (the scene on now with
a stripe in the text colour, B10), the timeline as marks on a line, the loop thumbnails and
the energy graph on the page, the ending choices as rows. The Now / Next strip and Show's
start line on the page under a hairline, the clock light and tabular. The Ready step's
colours as words with a dot.

**L7, as built:** Welcome follows the tokens (a filled pill in the text colour for the main way
in). Help needed no change: no label changed. The e2e tests that pinned the old look (the
mint, the card, the well, the chip fills, the joined groups) now pin this one.

**Left for later (my call):** Show's clock and scene name at display sizes larger than today's
(the mock's 56 and 72 px), and the loop list's name field as an underlined field.

## The producer's walk (3 Nov 2026, after the look)
A walk through the whole journey as a producer would, from Welcome to the end of a piece,
found thirteen things. The owner said "Ok" to building them; 1 to 3 change what the players
have learnt and wait for an explicit yes on each.

1. Six screens before the first sound (waiting).
2. Capturing a loop stops the music; Keep as loop as one press (waiting).
3. One piece per player; named pieces with Duplicate (waiting).
4. **Built.** The speed in the transport: the readout is a button (`SpeedControl`), arrow keys
   change it by one (five with Shift), a press opens a slider and Tap (`songs/tapTempo.ts`).
5. **Built.** Undo and redo of the edits: Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y (`editHistory.ts`): the
   laptop board, the loops, the scenes, the piece's length and ending, when colours come in.
   Each counter is a step of its own; typing and sliders merge within 0.6 s. Live sound
   settings are not undone this way.
6. **Built.** The letter keys M, N, E and 1 2 3 (`letterKeys.ts`), off with "Letter keys" in
   Advanced, Pressing.
7. **Built.** Every scene says how long it lasts; Duplicate beside Delete; a scene's mark on the
   timeline drags (snapped to 5 s, never over a neighbour; `sceneTools.ts`).
8. **Built.** Count in, a switch in Ending & check: ▶ Start the piece waits for the top of the
   next pass, the board playing on, the strip counting the steps down; pressed again it starts
   at once; Stop calls it off.
9. **Built.** Hear it with is a row of words.
10. **Built.** The loop row stays one line: a round ▶, a narrower name field.
11. **Built.** When each colour comes in is folded until there are scenes.
12. Already so: the development-server warning only shows on the development server.
13. Left: the Sound tab's colour table and Set up's Colours step both stay; they do different
    jobs (sounds while playing; jobs before).
