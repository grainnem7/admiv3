# Design: making loops, building the piece, performing it

*2026-10-27. A user-flow design answering the brief `2026-10-27-loops-and-piece-brief.md`. Not code.
Edit freely. "Check in code" marks things the designer could not confirm.*

## A. Principles

1. **A loop starts from silence.** "New loop" is a deliberate step, and the only sound in it is Tim's counters.
2. **One word for each thing.** *Loop* = something Tim made and you kept. *Section* = one part of the piece.
   *Change* = how one section turns into the next. *Key* = the key. Nothing else is called a loop.
3. **Tim never needs the laptop.** Everything Tim decides, he decides by listening, then by voice, a nod
   or a big pad on the iPad. The owner does the clicking.
4. **The piece is a document.** It holds the loops, the sections, the changes and the ending. Rehearsing or
   performing it never writes into Tim's own settings. When it stops, Tim's settings are as they were.
5. **Loops are the background, Tim is the foreground.** A loop never changes because Tim adds a counter.
6. **Stop means silence.** One Stop on the laptop silences everything, every time. Nothing waits to "start
   with Play".
7. **One way to do each job.** One way to make a loop, one way to start the piece.

**Departures from the mock-up (`ux-redesign-journey.html`):** I keep its Room check, Tim's card, "Keep",
*section*, the locked Perform and the After page. I change three things. (1) Keep happens *inside* a New
loop, not during free play, because silence must come first. (2) The piece is a **running order** of
section cards, not an editable timeline: order and changes are the decisions, and changes live *between*
sections. (3) Sections have **lengths**, not start times, so moving one never breaks the others.

## B. The three stages

There are three places on the laptop: **Loops · Piece · Perform**. Rehearse lives inside Piece.

### Stage 1: Make loops (before the show)

| # | Who, where | What they see | What they hear | How they know it worked |
|---|---|---|---|---|
| 1 | Owner, laptop: **Loops → New loop** | The board fills the screen. Header: "New loop 4 · silent". Band, Extra notes, other loops and Sounds change show as greyed chips: "off while making". | Silence. Everything stops at once (loops, band, Extra notes, the clock). | The header and the iPad both say "New loop: silent". |
| 2 | Tim, board | If counters are still on the board: "Lift the 5 counters to start from silence", with those squares outlined. They do not sound until the board has been seen empty once. The owner can instead press **Start with these**. | Still silence. | The outline goes as each counter lifts; "Ready" when the board is clear. |
| 3 | Tim, board | Each counter lights its square and its sound name ("violin"). | Only Tim's counters, in the sound each colour has today. | Two greens = two violin notes, nothing else. |
| 4 | Owner, laptop (optional): **Hear it with…** | Chips: Band · Extra notes · one other loop (pick). Each turns on with one tap and off again. | Tim's loop with what was picked. | The chip is lit. Nothing is saved yet. |
| 5 | Owner, laptop: **Keep** | A new tile slides into the loop row: a picture of the board, "Loop 4". A name box is focused, with quick names (Bed, Pulse, Beat, Shine) and the keyboard. | No change: Tim's counters keep sounding. | The tile, and "Kept: Loop 4" for 3 s on the laptop and the iPad. |
| 6 | Owner names it, with Tim | Tim says or points; the owner types or taps a quick name. Renaming is always possible later. | — | The tile shows the name. |
| 7 | Repeat from 1, or tap a tile to **hear** a kept loop alone. | A playing tile has a moving pass light. | That loop alone. | Tap again, it fades out over a pass. |

**What Keep keeps:** the counters on the board now (positions, box detail) **plus what each one played**
(job and instrument), not its colour. Today a loop stores colour ids (`StoredLoopCell` in
`src/profiles/BoardSequencerConfig.ts`): that is why loops and Extra notes draw red with fresh colours, and
a loop made with "green = violin" plays whatever green is today. A loop should replay as it was made.

**Keep is disabled** with "Nothing to keep yet" while the board is empty.

**Free play:** outside New loop, Loops is the warm-up place, with Tim's settings and tiles to tap. Nothing
is kept from it.

### Stage 2: Build the piece (before the show)

**Section, not scene.** In Ableton a *scene* is a row of clips you launch; it has no length and no way in.
Ours has a length, a place in an order, and a change into it. A musician calls that a section.

**The Piece screen** is one column of **section cards** in order, with a **change chip between each pair**,
and a thin read-only 7:00 bar on top that shows the proportions and a "fits: 6:40 of 7:00" line.

```
 7:00 [ Arrival | Build      | Open           | Home  |end]   fits: 6:52 of 7:00
 ┌ Arrival · 1:30 · Bed ──────────────────────────┐  ▶ Play from here
 └────────────────────────────────────────────────┘
          ↓  Fade · 1 pass   (Bed carries on)          ▶ Hear this change
 ┌ Build · 2:00 · Bed + Pulse + Beat · Band joins ┐
 └────────────────────────────────────────────────┘
          ↓  Cut · key up a tone
 ...
 ┌ Ending · Final chord · 2 passes ───────────────┐
```

Why a list: it shows order and changes in words, needs no dragging or precise pointing, would read the
same on an iPad, and the 7:00 bar still gives proportions. Reorder with ↑ ↓ on the card.

**A section card holds:** name · length (in m:ss, snapped to whole passes, shown as "1:30 = 17 passes") ·
loops (tap tiles to add; tap ✕ to remove) · and under **More**: Band, Extra notes, Key, Sound world.
Everything under More starts as **"same as before"**, so a section only changes what you change.

**A change (between sections) is one of three:**

| Change | What happens | Owner's words it covers |
|---|---|---|
| **Fade** (1 or 2 passes) | Outgoing loops fade out while incoming loops fade in. | "does the next loop fade in while this one fades out" |
| **Overlap** (1 or 2 passes) | Incoming loops start at full; outgoing loops carry on at full for the passes, then stop. | "do they overlap" |
| **Cut** | Outgoing loops stop at the end of the pass; incoming start on the next beat 1. | "one stops dead and the next starts" |

Three more needs are covered **without new options**:
- **"Drums carry on"**: a loop in both sections simply keeps playing, untouched by the change. The chip says "(Beat carries on)".
- **Band or Extra notes join or leave**: set in the section; they follow the change (fade in with Fade, enter at once with Cut).
- **Key change**: set in the section (Key: same · up a step · down a step · or a key by name, such as D major). It lands on the first beat of the section, for everything at once. During a Fade or Overlap the outgoing loops move key too, so two keys never sound together. **For Tim, in one line: his counters stay where they are and play in the new key from the first beat of the section.** (Check in code: loops are stored as rows, so they should follow the key automatically; confirm Ableton receives the moved notes.)

**How Tim decides, without the laptop:**

| # | Who, where | What happens | What tells them it worked |
|---|---|---|---|
| 1 | Owner, laptop: **Piece → Make my plan** (or New piece, blank) | Four section cards appear, empty of loops. | Cards on screen. |
| 2 | Owner taps a loop tile; Tim listens | Owner: "Is this the start?" Tim answers by voice, nod or pad. Owner adds the loop to a section. | The loop name appears on the card. |
| 3 | Owner: **▶ Hear this change** on a chip | Plays the last 2 passes of the section before, the change, then 2 passes after. Then stops by itself. | iPad shows "Hearing: Arrival → Build", with a beat light. |
| 4 | Owner: **Try both** on the chip | Plays the change as Fade, then as Cut (or any two). The iPad shows two big pads, **A** and **B**, lit in turn as each plays. | Tim taps A or B (on lift, palm-proof). The chip changes to his choice; the iPad shows "Chosen: Fade". |
| 5 | Same for key | "Try both" on Key: same key, then the new key. | As above. |
| 6 | Owner: **▶ Play from here** on any card, or **▶ Run the piece** | Rehearse: the clock runs from that section. **Stay in this section** holds it until Next (rehearsal only). | Now/Next strip on laptop and iPad. Stop returns Tim's own settings. |

The A/B pads are the only new thing on the iPad here, and they appear only while "Try both" is playing.

### Stage 3: Perform (the day)

**The piece runs itself.** Every section has the length that was set in advance, so the sections, their
loops and their changes come in at the planned times without anyone pressing anything. On the day the
owner presses **Start** once, and **End** only if the ending is wanted earlier than planned. **Next** exists
only for when something goes wrong and a section must be left early; it never has to be pressed.

**Laptop (owner): Perform.** Entering it locks editing. On screen: big clock, **Now: Build · Next: Open in
0:42**, the playing loops as chips, and three buttons: **Start**, **Next**, **End** (End and Stop need two
presses). A small menu holds Mute, Panic, "Pause Tim's board", Find board again, Leave. Warnings (camera,
iPad, Ableton) appear here only.

**iPad (Tim):** the section name, a beat light, a bar filling towards the next section, and only the strips
and pads chosen on Tim's card for this piece (for example Extra notes, New sound). **End piece** appears
only in the last section, needs two taps within his second-tap window, and acts on lift.

**Tim cannot, by accident:** stop the piece or the loops, start or skip a section (Next is off by default),
change the key, tempo or sound world, delete or keep over a loop, or leave the page (set iPad Guided Access).
No warnings or errors reach his screen.

**Foreground and background.** Loops play exactly as kept: Tim's counters never re-pitch them, never take
turns with them, and never move them in or out of a phrase. Tim's counters always sound and sit on top, a
little louder than the loops (a per-player "loops sit under Tim by…" setting, default about 3 dB). If Tim
plays the same sound as a part in a loop, that loop part dips while his counter is down, by a calibratable
amount (default: half, as phrase mode does today), and comes back when he lifts it. The band and Extra
notes answer only Tim. On the board, loop notes are outlined rings; Tim's are solid counters, so Tim and the
audience can see what is his.

## C. What to remove or merge

| Today | Proposed |
|---|---|
| Save the board here · Capture · Overwrite · Draw/Edit notes · Loop bank row · "Plays a loop" colour (5 ways to make a loop) | **Keep**, inside New loop. Draw/Edit becomes "Fix a note" in a loop tile's ⋯ menu (owner's repair tool). Loop bank row and "Plays a loop" go (check whether anyone uses them first). |
| Start a loop from laptop row, iPad, scene, loop colour, Capture (5 ways) | **Before the show:** tap a tile in Loops. **In the piece:** sections only. iPad loop pads off by default. |
| Show → Start · Rehearse from here · Start clock · Carry on after reload (4 ways) | **Perform → Start** and **Piece → Play from here**, same runner. "Carry on at 3:12?" stays as an automatic offer after a reload. Start clock goes. |
| Play · Make a piece (Loops · Scenes · Ending & check) · Show | **Loops · Piece · Perform.** Ending is the last card in Piece. Ready check moves to the start of Perform (and the Room check). |
| Scenes with times (`at`) | Sections with lengths; start times are worked out. |
| Loop fade 0/0.5/1/2 passes, one per-player setting | Per change: Fade / Overlap / Cut, 1 or 2 passes. |
| Scene writes into player settings | The piece never writes into Tim's settings. |
| "Stop all loops" under "More: fades, stop all" | Gone: Stop stops everything. |

## D. Edge cases and failure modes

- **Loop made with different colours from today's:** it replays its own sounds (stored per counter). It is
  drawn as rings in today's colour for that sound, or a neutral grey ring if no colour has that sound now.
  Never red.
- **Empty loop:** cannot be kept. An old empty loop shows a dashed tile; Piece and the Ready check flag
  "Arrival: Bed is empty".
- **Section whose loop was deleted:** a loop used in the piece cannot be deleted, only **swapped** ("Bed is in
  Arrival and Home. Swap it for…"). Old data with a missing loop shows an amber chip; the section plays
  without it.
- **Running over 7:00:** Piece will not let lengths plus ending exceed 7:00 ("38 s too long. Shorten Home to
  0:52?"). In Perform the ending starts by itself so the last sound ends by 7:00, even if End was not
  pressed. Next can be early, never later. "Stay in this section" exists only in rehearsal.
- **iPad disconnects:** the music carries on (the laptop runs it). Laptop shows "iPad lost · reconnecting".
  On reconnect the iPad opens on Now. Everything on the iPad is also on the laptop.
- **Tim knocks the board:** what he knocks still sounds; it is his. Loops are unaffected. If the board
  itself moves and reading fails, the owner uses **Pause Tim's board** (his layer fades over a pass; the
  piece carries on), then **Find board again** without stopping (check in code that this works while
  playing).
- **The camera stalls:** loops, sections and the clock carry on. Tim's last board keeps sounding for one pass,
  then fades. Laptop shows "Camera stopped · Try again". The iPad shows nothing alarming.
- **Tim wants to change a loop on the day:** before the show, in Loops, a tile's **Start from this** opens a
  New loop with that loop as rings; Tim adds or the owner removes; Keep saves "Bed 2"; the owner swaps it
  into the sections. During the show, loops do not change; what Tim adds lives on top. The owner can press
  Keep in Perform's menu to save his take for later, never into the running piece.

## E. Decisions (the owner, 2026-10-27)

1. **No Keep pad on the iPad.** The owner keeps loops from the laptop.
2. **Keep both Fade and Overlap.**
3. **Tim cannot press Next on the day.**
4. **One piece per player** for now.
5. **Remove the loop bank row and the "Plays a loop" colour.**
6. **Key changes by step and by name**: both offered ("up a tone" and "D major").
7. **Loops sit about 3 dB under Tim**, set on Tim's card, tried in rehearsal.
8. **Chris has no role in the software.** No third view.

## F. Order of work (each stage usable on its own)

1. **Silence and Keep.** New loop (silent, "lift counters to start"), Keep with name, Hear it with…, Stop
   stops everything, loops store sounds not colours (fixes red). Hide the other four ways to make a loop.
   *Try: make three loops with Tim from silence.*
2. **Loops as background.** Loops never re-pitched by Tim, loop parts dip when Tim plays the same sound,
   rings vs solid counters, loops sit under Tim. *Try: Tim plays over Bed; does it still sound like Bed?*
3. **The piece as a running order.** Section cards with lengths, loops, "same as before" defaults; Fade /
   Overlap / Cut; "carries on"; band and Extra notes join or leave; the piece never writes into Tim's
   settings; Play from here; the 7:00 fit check. *Try: build the four-section piece in under 10 minutes.*
4. **Tim chooses.** Hear this change, Try both with the iPad A/B pads, key change per section. *Try: Tim
   picks every change by ear.*
5. **Perform.** The locked laptop view, Tim's iPad page with End only in the last section, Pause Tim's
   board, Ready check at the door, remove the old start routes. *Try: a full 7:00 dress run.*
