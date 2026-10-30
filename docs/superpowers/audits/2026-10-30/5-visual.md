# 5-visual: visual design (saved by the controller from the reviewer's hand-back)

**Coverage**
- Every screen, in light and dark.
- Sizes: 1440x900, 1366x768, 1920x1080, iPad landscape (1180x820) and iPad portrait (820x1180), plus left-handed.
- The audience screen, checked against its spec.
- The iPad page.
- Contrast worked out from theme/boardTokens.ts.
- 81 screenshots.

## Findings

### Major, before the gig

**Scene colours are the counter colours.**
- PieceSteps.tsx:150 uses hues 210/32/318/145, and the counter colours (BoardSequencerScreen.tsx:4844-4851) are 215/28/325/135. So Arrival is counter-blue, Build orange, Open pink and Home green.
- The white labels fail contrast: Home 2.27:1, Build 3.27:1; a yellow scene would be 2.05:1 and a cyan one 2.71:1.
- Fix: a neutral or accent colour with numbers, and dark text.
- Screenshots: 23, 24, 40-piece-1366.

**An orange outline leaks onto pressed buttons.**
- base.css:407 puts #f97316 !important on every `[aria-pressed=true]`.
- It shows on Play/Make a piece, Laptop/Camera and Aa.
- Against the orange counter (#ea7a1f) it is 1.03:1, so it reads as a counter colour.
- Fix: reset it in boardTheme.css.
- Screenshots: 08, 10, 20, 70.

**Grey paragraph text from the rest of the app.**
- base.css:104 makes every p #a1a1aa: 2.1:1 on light cards.
- Fix: add p to boardTheme's rule.
- Screenshots: 24, 27.

**The playhead and tune bands are hidden under the squares.**
- BoardView.tsx:140-163 draws them before the squares (:172-176), so they only show in the gaps.
- The playhead is 1.43:1 in dark and 1.15:1 in light.
- Fix: draw them after the squares.
- Screenshots: 10, 11, 31, 32, 64, 81.

**Too many buttons look like the main one.**
- Selected options use the same filled mint as Play/Stop.
- There are 8 filled-mint "Save the board here" buttons.
- With New loop open, Start the piece, End and Stop are all mint at once.
- Fix: ● and a tint for selected options; filled mint for one action per view.
- Screenshots: 10, 12-p6, 21, 28.

### Major, after the gig

**The board is small and Play wastes space.**
- At 1440 wide the board is about 430 px, about 15% of the screen. At 1920 there is a gap before the 320 px panel.
- The Sound tab is about 7 screens of scrolling, and sound names are cut short.
- Fix: a 400-480 px panel and a bigger board.
- Screenshots: 10, 12-p1…p6, 41.

**The header breaks at small widths.**
- 1366x768: the header wraps and the page is 856 px tall; the board's bottom row is below the fold in Make a piece.
- iPad portrait: each button gets its own row, the board is about 240 px, and the page is 4560 px tall.
- Fix: a "More" menu below about 1400 px.
- Screenshots: 40, 42, 43.

### Minor, before the gig

**Two "Play" buttons, and three kinds of stop.**
- The view button "Play" and the transport "▶ Play".
- "▶ Show" carries a play sign but plays nothing.
- ■ Stop, ⏹ End and the iPad's ■ End piece.
- In Show, End is filled mint at the top right and Stop is outlined at the bottom right.
- Fix: rename the view button "Board", take ▶ off Show, and give End its own sign.
- Screenshots: 08, 31, 51.

**The warning colour is yellow, a counter colour.**
- --bs-warn #e9cf8f is used for warnings and for the Variation ring next to yellow counters (BoardView.tsx:271).
- The camera notices are hard-coded #ffb74d (BoardSequencerScreen.tsx:5546-5547), 1.52:1 in light.
- Fix: always add "!", and use var(--bs-warn).
- Screenshots: 13, 52, 74.

**Help opens scrolled to the bottom.**
- Focus goes to Close inside the scrolling area (scrollTop 3477 of 4091).
- The text is a 13 px wall.
- Screenshot: 71.

### Minor, after the gig

**The squares barely stand out.**
- 1.11:1 in dark and 1.14:1 in light; borders 1.26:1. This fails 1.4.11.
- Fix: outline them with borderControl.
- Screenshots: 05, 06, 11.

**Text fields have no inner padding** (loop names, Length, scene Name and Comes in at).
- Fix: `.bs-root input { padding: 0 10px }`.
- Screenshots: 21, 25, 27.

**The layout jumps.**
- The drag notice adds about 40 px.
- The Now/Next strip moves the board.
- The board moves and resizes between Play and Make a piece, and "Clear the board" moves with it.
- Screenshots: 20, 28, 37, 52.

**The type scale is small and uneven.**
- Make a piece uses 5 sizes (9/12/13/14/18 px), about 40% of the text at 12-13 px.
- The ADMI/Ableton/Both buttons are bigger than every other choice.
- Fix: 14/16/20, with a 14 px minimum.
- Screenshots: 15, 20.

**The iPad page has its own colours and no light mode** (IPadRemoteScreen.tsx:24, 380-740).
- Its strip colours overlap the counter colours.
- The Extra notes strip at Off is an empty box.
- The 👆 is at opacity 0.15.
- Fix: use the board's tokens; draw a track with the value.
- Screenshot: 51.

**Colour order and swatch style change between screens.**
- The Colours step lists Red 1, Yellow 3, Blue 2; elsewhere the order is 1-2-3-4.
- The swatches under "When each colour comes in" are 16 px with a thin border (PieceSteps.tsx:544), not the two-tone ring.
- Emoji differ by system, and 🧢 is a blue cap for a red hat.
- Screenshots: 04, 06, 52.

### Polish, after the gig

**The audience screen matches its spec** (33, 36, 38), with three small points:
- The white wash on a bloom (AudienceScreen.tsx:275) turns red to salmon and green to mint.
- A black counter would vanish (about 1.1:1, no ring).
- Counters are 0.34 of a square.
- Fix: brighten without washing to white; add a ring for dark counters.

**The Player button sits higher than ☀/Aa/?** (BoardHeader.tsx:55-64).
- In Show, the light/dark toggle is hidden.

## Questions for Tim and Chris
- From his seat, can Tim follow the playhead and the mint ring that marks a sounding counter?
- Does he recognise his counters when they bloom paler on the audience screen?
- On the iPad, can he find the Extra notes strip and his level in it, drawn as an empty box?
- Is the board and iPad easier to read in dark or in light?

## What works well
- The tokens have a contrast check, and focus outlines are consistent.
- Switched-off buttons say why.
- Counters have a two-tone ring.
- Each board state has its own shape: ghost ↺, dotted unsettled ring, clock on waiting counters, loop counter with a centre dot (62).
- Show is calm, with a big clock and Now/Next.
- The ending choices use ●/○, not only colour.
- In the left-handed layout, the panel and transport move left and the board is not mirrored (80).
- The audience screen is restrained and true to its spec.
