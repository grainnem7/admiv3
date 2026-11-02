# Making loops, scenes and the show: an easier journey and a cleaner look

2 Nov 2026. Built on `audit-batch-5b`. Source: a walk through the whole journey on the
laptop board at 1440x900 and 1366x768 (31 screenshots, kept off the repository), as a new
player would: Welcome, Set up, the Board, Make a piece (loops, scenes, ending), the tabs,
Show, and the ending.

The owner asked for a journey that is excellent, intuitive and easy, where it is easy to make
loops and scenes and to perform, and that looks sleek and professional. **Making loops comes
first (owner).** My calls are marked **(my call)**.

## Binding everywhere
- Every rule in the audit spec's "Binding everywhere" still holds: plain words, tests first,
  no extra processing load on the sound, counter hues only for counters, Help and e2e tests
  updated with every renamed label.
- One word list: `src/ui/screens/boardSequencer/words.ts`.
- Nothing that the questions for Tim and Chris left as it is changes here: End piece's place on
  the iPad, the second-tap window, the hat's default, the hat holding when lost.
- Every screen works with the keyboard and a switch, at 320 px and at 1440 px, in light and dark.

## What the walk found

### Making loops (first)
1. **New loop asks you to undo what you just made.** It opens with "Lift the 6 counters, or
   press Clear the board". But a player usually has just played something they like. Keeping
   what is on the board is behind "Start with these", a smaller button below.
2. **The next step looks like plain text.** "Leave", "Done" and "Clear the board" are quiet
   buttons with no edge, so they read as words, not as things to press.
3. **The name is asked for twice.** After Keep, a box asks for the name (an empty field and four
   name chips), and the same loop also appears in the list with its own name field.
4. **The loop list is mostly empty rows.** All 8 slots show, each "empty" with a cut-off
   "name (after Ke…" hint. The ✕ for a kept loop sits under its number, away from the row's
   other buttons.
5. **"Hear it with… Band · Extra notes · No other loop"** doesn't say what it does until you
   press it.

### Making scenes
6. The scene list reads well. But the timeline chips cut names short (the fourth shows only
   "4"), and a five-line paragraph sits between the timeline and the scenes.
7. Every scene shows "Jump here now" as a full button whenever the board plays, so a list of
   four scenes has four large buttons that say the same thing.

### Performing
8. Show is calm and readable. Before the piece, "▶ Start the piece" is small in the top-left
   corner, the one thing to press is the hardest to find.
9. Show's bottom bar is five buttons of the same size in one row: Stop, Mute, Simplify (on two
   lines), Open the audience screen, Leave Show.
10. On the Board view while playing, the header and the transport take two rows, and "Stop
    playing to switch player" sits on top of the row below it.

### The look
11. **The board is small.** At 1440 wide it is about 430 px, centred in its half, with a wide
    empty gap between it and the side panel. At 1366 it is pushed down and its bottom rows are
    below the fold.
12. **Four lines of small status text under the board:** the legend, the "AI: Extra notes off…"
    line, a long line of every colour's sound and count, and Session log.
13. **The header holds up to 13 controls.** Camera, Laptop and Set up are needed once a
    session, but always take room.
14. **Welcome is orange; the board is mint.** They look like two different products.
15. **In Set up the board can't be tried yet:** its squares can't be clicked until Play.

## The design

### Batch U1: making loops (first)
- **New loop always opens on a choice** when counters are already down (owner):
  - "Keep what's on the board" (the main button), and
  - "Start from empty" beside it (lifts nothing, silences the board, as today's New loop does).

  With an empty board there is nothing to choose, so it goes straight to "Put counters down,
  then Keep".
- **Three steps, shown as a small line of three:** Put counters down · Listen · Keep. The step
  you are on is marked, as in Set up.
- **Name it once, in place.** After Keep the name field is right there, filled with "Loop N"
  and selected, so typing replaces it. The name chips sit under it. The loop list shows the name
  as text with a small "Rename" button, not a second field.
- **Done and Leave become real buttons** with an edge (secondary style). "Clear the board" too.
- **The loop list shows only kept loops,** then one line: "6 of 8 places free". Each kept loop
  is one row with its picture, name, number of notes, ▶ Play, and a "⋯" with Rename, Edit
  notes and Clear. **(my call)**
- **"Hear it with…" says what it adds:** "Hear it with: the band", "with Extra notes", and
  "On its own".
- Tests: unit tests for the new choice and the free-places line; e2e for making two loops by
  keyboard only, with focus landing on the next thing to press after each step.

### Batch U2: making scenes
- Timeline chips show the scene's number and as much name as fits, with the full name on
  focus and hover. Nothing cut to a lone number.
- The intro paragraph folds to one line, "How scenes work", opened on request.
- "Jump here now" becomes a smaller button on the row's right, and only on the scene you are
  not already in.

### Batch U3: performing
- **Before the piece, Show centres one large "▶ Start the piece"** under the clock's place. It
  moves to the strip once the piece runs. Focus rules from B3 stay.
- **Show's bottom bar in two groups:**
  - Left: ■ Stop (the danger button) and Mute.
  - Right: Simplify, the audience screen and Leave Show, in a quieter style.

  The Simplify hint goes into its tooltip and Help, so it is one line.
- **Board view while playing:** the transport stays in one row with the header, and "Stop
  playing to switch player" becomes the Player button's tooltip and a line in Help.

### Batch U4: the look
- **The board fills its side:** as big as the space allows (square cells), its top edge in line
  with the panel's. The board keeps its place and size between Board and Make a piece (A3).
- **One status line under the board:** what is sounding now, then "Details" to open the
  legend, the AI line, every colour's sound and count, and Session log.
- **The header:**
  - Exit, title, the view switch (Board · Make a piece · Show), the Player, then ☀ · Aa · ?.
  - Camera / Laptop, Set up and the audience screen move to "More" at every width (owner).
- **Welcome in the board's style (owner):** the same font, colours and buttons as the Board Sequencer,
  mint for the main action. The gesture instrument's own screens are not changed.
- **Set up's board can be tried at once:** click a square to put a counter down, with no
  sound until Play.

## Order and checks
Each batch is built, tested and committed on its own, in the order U1, U2, U3, U4.
- Before each batch: the same walk-through again, with screenshots before and after.
- Every batch:
  - `npm run lint` clean and `npm run test:run` passing;
  - e2e for the screens it changes, plus `focus`, `setupScreens` and `access`;
  - the keeping-time meter no worse.

## Status
**U1, as built:**
- New loop asks first when counters are down: "Keep what's on the board" (the main button) and
  "Start from empty".
- Done, Leave and Clear the board are real buttons.
- Only kept loops are listed, with "N of 8 places free". The empty places show under Other
  ways.
- Hear it with: "The band", "Extra notes", and "On its own".

**Left out of U1, with reasons (my call):**
- The three-step line: the New loop heading already says silent, not kept yet, or kept, so a
  second line would say the same thing twice.
- The ⋯ menu: ✕ already sits at the end of each row, after ▶ Play, so the risky button is
  apart from the others without hiding Rename and Edit notes behind another press.
- The single name field: each loop keeps its own name field in the list. While New loop's
  name box is showing, that loop's row still has its field too. For a later batch if it
  confuses.

**U2, as built:**
- Timeline names shortened with … instead of the bare number.
- How scenes work folded once there are scenes.
- Jump here now only on scenes you are not in.

**U3, as built:**
- ▶ Start the piece is the big button in Show, also while the board is already playing.
- Show's controls in two groups: ■ Stop and Mute on the playing hand's side, and the rest on
  the other.

**Changed in U3 (my call):**
- Simplify keeps its visible hint, because audit fix B23 asked for it.
- "Stop playing to switch player" stays where it is, under the Player button. Keeping it inside
  the header made the header wrap at 1400 px while playing (the B25 test), and where it is now
  it only sits over empty space above ■ Stop.

**U4, as built:**
- The board fills its side: 522 px at 1440x900 (was 436), and the page fits the screen.
- One Details line under the board holds the rest.
- The laptop board's colour bar is one row: just how many counters are down, with how to place
  them in its tooltip.
- The audience screen, Set up and Camera / Laptop are under More at every width.
- Welcome is in the board's look.
- In Set up the laptop board can be tried once there are colours, silent until Play.

**Left for later (my call):**
- The empty strips above the board kept for notices (58 px and 32 px). A3 keeps notices in fixed
  places so the board never moves; merging the two would give the board more room.
- At 1280x720 the page still runs 34 px past the bottom.

### U5: from a second walk through (my calls)
- With scenes made, the Now / Next strip (▶ Start the piece) shows on the Board view whether or
  not the board plays. It used to appear when play started, and the board shrank from 522 to
  about 440 px. Starting from the Board view while warming up (route A, B13) is kept.
- The folds laid out as a row (Details, Session log, Set up's More) show ▸ and ▾ like every
  other fold. Without them they read as plain words.
- A new loop is named in one place: while New loop's name box is open, the loop's row shows the
  name as words. The Name label lines up on the left.

### U6: from a third walk through (my calls)
- "Stop playing to switch player" is the greyed Player button's tooltip, with a description a
  screen reader hears. Drawn as a line under the button it touched the transport row.
- A kept loop's ▶ Play and ✕ share one group at the end of its row, so a narrow panel never
  leaves ✕ alone on a line under the picture. The name field is 100 px.
- Set up's Ready step says "Click squares to put counters down, then press ▶ Play the board to
  hear them", the order it now happens in.
- Clear the board with nothing to clear is greyed, the reason in its tooltip, instead of a
  second line under the bar.

## Decided by the owner (2 Nov 2026)
- New loop with counters down: "Keep what's on the board" is the main choice, and "Start from
  empty" is always offered beside it, so there is a choice every time.
- Camera / Laptop and Set up live under "More" at every width.
- Welcome is restyled in the board's look (Welcome only, not the gesture instrument's screens).
