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
