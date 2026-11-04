# The Simple iPad page

4 Nov 2026, on the branch `instrument-look`. The owner asked for the iPad page "much simpler,
with every button obviously different". The design below was approved as drawn; the choices
after it were left to the builder and are marked **(my call)**.

## The approved page (upright iPad, top to bottom)

```
┌─────────────────────────────────────┐
│ Connected · playing          2:41   │  the existing status line
├─────────────────────────────────────┤
│              ✨  NEW IDEA            │  one wide button (solid blue)
├────────┬────────┬────────┬──────────┤
│   🥁   │   🎸   │   🎹   │   🎺     │  PARTS: in or out
│ Drums  │  Bass  │ Chords │ Melody   │  in = lit, with "IN"
│   IN   │  OUT   │   IN   │   IN     │  out = dark outline, "OUT"
├────────┴────────┴────────┴──────────┤
│ MELODY PLAYS:                       │  INSTRUMENT: pick one
│  🎹 Piano  🪈 Flute  🎺 Trumpet  🎷 Sax │  the chosen one lit, with ✓
├─────────────────┬───────────────────┤
│ 🥁 Beat    ON   │ 🎹 Bed      OFF   │  LOOPS: on or off, up to 4
│ 🎸 Walk    ON   │ 🎺 Tune     OFF   │  picture = what the loop mostly plays
└─────────────────┴───────────────────┘
```

1. **New idea**: the existing `newIdea` trigger, unchanged (refused while the laptop is
   stopped, 0.7 s repeat guard). New sound is not on this page.
2. **Parts**: one square per job on the player's board (drums, bass, chords, melody, in that
   order, only the jobs some colour has). A press takes the part out: its counters stay on the
   board but are silent. Another press brings it back in. Works stopped or playing.
3. **Melody plays**: four round buttons (Piano, Flute, Trumpet, Sax: catalogue keys `piano`,
   `flute`, `trumpet`, `saxophone`). A press sets the instrument of the first melody colour, by
   the same call as the Sound tab's sound list (`setChannelSound(id, { instrument })`), so it
   works with Ableton as well. The chosen one is lit with ✓; none is lit if the melody colour
   plays something else; no row if there is no melody colour.
4. **Loops**: up to four, one per kept loop in loop order, appearing as loops are kept. Each
   toggles its loop with the existing `loop` message (refused while stopped, as now). Each
   shows the picture of the job most of its notes play (drums 🥁, bass 🎸, chords 🎹, melody
   the picture of its instrument if one of the four, else 🎵), its name or "Loop N", ON / OFF,
   and a dashed edge while starting or stopping.
5. **Nothing else**: no strips, no End piece, Stop, Capture, Next scene or Mute, no second page.
   Speed is set by the hat alone.
6. **Obviously different, never by colour alone**: New idea wide with a solid blue fill;
   parts square, IN filled in the text colour, OUT a dark outline; instruments round, the
   chosen one filled teal with ✓; loops wide rectangles with ● ON / ○ OFF. Every press flashes.
   Every touch guard of the full page is kept (palm, act on lift, bounce guard, `padProps`,
   the touch mark, greying while not live or learning, the connection words).
7. **Who gets it**: new players. Saved players keep what they had until the facilitator
   presses **Use the simple layout** (it was "Use the safe show layout") in the iPad settings.

## Choices

- **The layout is a stored field (my call).** `remoteLayoutKind: 'simple' | 'custom'` on the
  player. New players get `'simple'`; anything else, including a player saved before this
  field, loads as `'custom'` with exactly the strips, pads and pages they had. The full
  layout's own fields stay as they were and still start, for a new player, as the old safe
  show layout, so ticking one box from Simple gives the old show page plus that box.
- **Switching.** "Use the simple layout" sets `'simple'`. While simple, the panel says so, offers
  "Use the full layout instead", and ticking any of the full layout's boxes also switches to the
  full layout (with that box changed): a box ticked must never seem to do nothing.
- **The Ready check** warns "…'s iPad is not in the simple layout" with the button "Use the
  simple layout" (it said "safe show layout"). It stays a warning: fine if chosen on purpose.
- **The protocol.** The state gains `layout: 'simple'` (missing = the full page, as every
  laptop before it), `parts` (each job on the board and whether it is out), `melody` (the four
  sounds' chosen key, or null; missing = no melody colour) and each loop's `picture`. The iPad
  sends `{ type: 'part', role, out }` (the state it wants, not a toggle, so a repeated message
  cannot flip it back) and `{ type: 'melodySound', sound }`. Every field is checked on the way
  in, as before. The relay lets the two new messages through from the iPad.
- **Silencing reuses "Comes in at" (my call on how).** `cellsSoundingAt` takes the colours
  that are out as well as the ones still waiting for their time, so the same filter, before
  the engine, keeps them silent: the sound, Ableton, the band and the log only hear what is
  in. Taking a part out while playing also cuts what it had ringing (`silenceColours`), as
  the piece's start does for a waiting colour. Kept loops play as they always do, also a loop
  made with an out colour: a loop has its own button.
- **A part out stays out after Stop and after a reload, until it is brought back (my call).**
  It is the player's choice, so ▶ Play does not undo it, and Carry on after a reload
  mid-piece must sound as before. It lives in the browser tab only (sessionStorage), never
  saved with the player: closing ADMI, or a new day, starts with every part in.
- **The laptop shows it (rule 5).** The out colours' counters are drawn faded, as a colour
  waiting for its time is. Under the board: "Taken out on the iPad: Drums, Bass" with one
  button per part ("Bring Drums back in"). In Show, the status row says the same as a note,
  with "Bring them back in".
- **Load.** The parts, the melody choice and the loop pictures are small (at most 4 + 1 + 8
  short fields) and are worked out only when the colours, the loops or the parts change, not
  on each beat's state message. The engine hears one more set lookup per counter per frame,
  and only while a part is out.

## Tests

`simplePage.test.ts` (which parts, the loop picture, the melody choice, the loops shown, the
stored layout), `remote.test.ts` (the new messages and fields sanitised), `colourEntries`
(an out colour is silent), the iPad page in jsdom (each button sends its message; nothing
else on the page), the tokens' contrast (the blue and teal fills, both modes), the config
(new players simple, old players custom), Help, the check, and `e2e/ipadSimple.e2e.ts` (a
touch iPad at 810x1080 presses each kind of button and the laptop changes).

## Refinements after the owner tried it (4 Nov 2026)

The owner's words: "I don't think it's obvious if the things are 'on' or if we need to switch to
turn them on. It's not obvious what the word displayed refers to. Do the drums/bass/chords/melody
in/out buttons turn those on and off for the loops too?" Her decisions, and how they were built:

1. **On = lit up.** A part, a loop or the Board that is playing is a lit tile: a strong fill
   (`--bs-lit`, lime on dark, deep green on light) with a soft glow round it (`--bs-lit-glow`).
   A silent one is the page's own ground with a grey outline, dim words and a faded picture.
   The words say what is happening now: **Playing** or **Silent** (they were IN / OUT and
   ON / OFF), each with a drawn ● or ○. A loop on its way in or out has a dashed edge between the
   two and says **Coming in**, **Fading out** (or **Stopping** without a fade), or **Starts with
   Play** while the laptop is stopped. The glow is still, never pulsing (my call: a static glow
   is enough, and nothing moves for reduced motion). The token test checks the lit fill (words
   4.5:1, edge 3:1 on every surface, both modes) and that it is its own colour. The chosen melody
   sound stays teal with ✓: it is a choice, not something playing.
2. **A part taken out is silent everywhere.** One button, one meaning: Drums silent means no
   drums from the board's counters, from any loop (each loop note is a part by the job it was
   kept with, or its colour's job for an older loop), and **from the band's drums too (my
   call)**. The band was left alone first, but the e2e test showed why it cannot be: with the
   player's drums silent the band hears no drums and steps in with its own, so "Drums: Silent"
   still played drums. The band goes through the same engine and its notes carry their job, so
   the check is one line (`playBandEvent`). Extra notes are not touched (off for new players;
   they add around what is heard). The board is filtered before the engine as before; the
   loops and the band in the engine (`setSilentParts`), so ADMI's sound, Ableton and the log
   agree. A loop's own button is unchanged: a loop on still plays its other parts.
3. **Board**: one wide button under New idea, with a drawn board of counters as its picture.
   Lit = the counters on the board play; dark = silenced (the loops, the band and Extra notes
   carry on; a control colour such as Speed still works). Same filter as the parts, the same
   persistence (kept for the browser tab, through Stop and a reload, never with the player).
   The laptop draws the counters faded and says "Board counters silenced on the iPad" with
   "Bring them back", under the board and in Show's row. Show's button for the parts is now
   "Bring the parts back in", so the two are told apart.
4. **The rows are chosen** on the laptop while the simple layout is in use ("What the simple
   layout shows": New idea, Board, Parts, Melody instrument, Loops), all ticked by default and
   for players saved before (`remoteSimpleRows`, made safe on load and in the message). These
   ticks never switch to the full layout. The rows left share the page; with one or two rows
   everything in them is drawn 1.4 times bigger. With none, the iPad says where to choose.

## Keep per instrument and Calm/Busy (4 Nov 2026, approved after the owner talked it through musically)

**Why.** New idea (a fresh seed for the Extra notes) "doesn't really do enough". Tim works on one
instrument at a time on the board. The musical model is a loop station: make a layer, keep it,
then bring layers in and out to shape the piece, plus one control for how much is played.

**The page, top to bottom** (this replaces the page above; the full layout is unchanged):

1. **⏺ Keep what I'm playing**: one wide button, solid blue. It keeps the counters on the board
   as loops, one loop per instrument job (Drums, Bass, Chords, Melody), sorted by each counter's
   job; colours with any other job (Speed, the controls) are not kept. Drums and bass down
   together update both loops. Keeping drums again replaces the Drums loop; the laptop's Undo
   (Ctrl+Z) brings the old one back, together with the counters (one step: the loops, their
   names and the laptop board). A kept loop starts at once and plays on after the counters
   are lifted; on the laptop board they are lifted for the player, as Keep as loop clears the
   board (control counters stay).
2. **🌊 Calm / 🔥 Busy**: two halves for the whole piece. Neither lit is Normal, the start
   **(my call: a third state is needed, or Busy could never be undone without making it
   Calm)**; pressing the lit half goes back to Normal. Calm: the loops play only their notes on
   the main beats (steps 1 and 3 of each bar, the harmony code's `isStrongBeat`) and no Extra
   notes; the player's own counters are untouched. Busy: Extra notes round everything, at least
   at 0.5 (where New idea starts them), or the player's own amount if higher. Simplify was looked
   at: it drops whole layers (the band, Extra notes, all loops but the bed), which is not thinning,
   so only its idea of a live engine state was reused (`setFeel`, beside `setSimplify`). Calm and
   Busy work in the engine and never change the player's saved Extra notes.
3. **The instruments**: four tiles, Drums, Bass, Chords, Melody, always all four in that order
   **(my call: fixed places are easier to find without looking, which matters for Tim)**. Each
   switches its own kept loop on and off by the loop message the loop pads use, refused while
   the laptop is stopped as they are. Lit + glow + ● Playing; dark + ○ Silent; a dashed edge with
   Coming in / Fading out (Stopping without a fade, Starts with Play while stopped); greyed with a
   dotted edge and "Nothing kept yet" when nothing is kept for it (pressing it says "Nothing kept
   for Chords yet" and sends nothing). The melody tile shows the melody's instrument.
4. **Melody plays** (Piano, Flute, Trumpet, Sax): unchanged.
5. **Board**: unchanged (silences the counters so only the loops play).

**How an instrument's loop is found again (my call): by its name.** Each instrument loop lives in
an ordinary loop place named "Drums", "Bass", "Chords" or "Melody" (any case), so it shows in the
loop rail and in Make a piece as an ordinary loop scenes can use, and the laptop shows plainly
which it is. Loops kept on the laptop have other names and are never touched. A loop renamed on
the laptop stops being the instrument's; the next Keep makes a new one. An instrument kept for the
first time takes the next free place, never one a scene uses (as Keep as loop), and never another
instrument's emptied place. With every place full, what fits is kept and the laptop says which
instrument had no room ("Every loop is full: clear one first").

**Refusals.** Keep works while the board plays (as New idea did): while stopped the iPad says
"Press Play on the laptop first" (stopped, nothing is being played to keep). Not during the piece
(decision F2, as Keep as loop): "Keep works when the piece is not running" **(a question for the
owner: dropping this is one line if Tim should build layers during the piece itself)**. Nothing of
the four jobs on the board: "Put counters on the board first" (the laptop sends `boardEmpty`).
The repeat guard (0.7 s) and every touch guard are kept.

**Live states.** Calm / Busy is kept like the Board button: through Stop and a reload, for the
browser tab only, never with the player. The laptop says "Calm (from the iPad): the loops play
only their main beats, and no Extra notes" or "Busy (from the iPad): Extra notes round
everything" under the board and in Show's row, with "Back to normal".

**Rows.** The laptop's ticks become Keep, Calm / Busy, Instruments, Melody instrument, Board, all
ticked by default. A choice saved with the first page's rows maps: New idea → Keep, Parts or Loops
→ Instruments, Melody and Board as they were; Calm / Busy, being new, is shown.

**Removed** (no longer reachable): New idea, the Parts row and the Loops row on the Simple page;
the parts-silencing path (the iPad's `part` message, the engine's `setSilentParts` and the band
check, the laptop's "Taken out on the iPad" line and its buttons, Show's parts item, the parts
kept for the tab); the loop pictures in the state (`picture`, `loopPicture`, `simpleLoops`). The
Board button keeps the colour filter (`cellsSoundingAt`'s set of silenced colours), renamed
`silencedRef` in the runtime.

## Live only: Drums, Calm/Busy, Melody, Board (4 Nov 2026, the owner's simplification)

**Why.** The owner: "we don't want to make new loops while playing live, and the iPad is only for
playing live", so Keep goes. The "Nothing kept yet" tiles were confusing, and the instrument
(loop) tiles are not wanted on the iPad at all: loops are prepared and switched on the laptop.
But "we should definitely have a drums on and off button".

**The page, top to bottom** (this replaces "Keep per instrument and Calm/Busy" above; the full
layout is unchanged; the laptop's own Keep as loop and New loop are untouched):

1. **🥁 Drums**: one big wide toggle with the lit / dark look (lit + glow + ● Playing; dark +
   ○ Silent). Silent means **no drums anywhere**: the drum counters on the board (by the same
   filter as the Board button and "Comes in at", before the engine), the drum notes in every
   loop (each loop note by the job it was kept with, or its colour's job for an older loop) and
   the band's drums (the engine's `setSilentParts`, brought back; general inside, only drums
   offered). Everything else plays on, Extra notes included. It works playing or stopped and is
   kept like Board and Calm / Busy (through Stop and a reload, for the tab, never saved). The
   laptop draws the drum counters faded, its screen-reader text says "silenced on the iPad", and
   it says "Drums silenced on the iPad" with "Bring the drums back" under the board and in
   Show's row.
2. **🌊 Calm / 🔥 Busy**: as built, with Normal when neither is lit.
3. **Melody plays** (Piano, Flute, Trumpet, Sax): as built.
4. **Board**: as built.

**Rows.** The laptop's ticks are Drums, Calm / Busy, Melody instrument, Board, all ticked by
default. A choice saved with an earlier page (it names New idea, Parts, Loops, Keep or
Instruments) keeps its Melody and Board ticks and shows Drums and Calm / Busy **(my call: the one
big button of every earlier page becomes the one big button now, and Calm / Busy was new to the
first page)**. A choice made with today's rows is kept as it is.

**Removed** (nothing reaches it any more): Keep what I'm playing (the `keepPlaying` message, the
keep plan, finding an instrument's loop by its name, its refusal words, its laptop notes), the
instrument tiles and "Nothing kept yet", the state's `instruments` and `boardEmpty`, the dashed
"Coming in / Fading out" and dotted "Nothing kept" looks of the page. Loops a player kept with
the earlier Keep, named Drums, Bass, Chords or Melody, stay as ordinary loops on the laptop.

**Looks (my call, from the screenshots).** Both lit, Drums and Board were alike but for their picture
and word, so Drums has round corners (32 px) and Board square ones (4 px); "lit = playing" keeps one
colour for both, as the owner asked.
