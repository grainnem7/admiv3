# The audience screen

29 Oct 2026. The owner agreed this design in chat, from mockups in the visual companion. Her
choices are marked **(owner)**. Mine are marked **(my call)** and can be overruled.

## Why

Today the projector would show the Show view: the board with its grid, the now/next strip,
banners and the Stop, Mute, Simplify, Panic and Leave Show buttons. That is made for the person
running the laptop. The owner wants a picture "thought of specifically for the audience",
"fun and interesting without too much detail to bog it down" **(owner)**.

What the audience should take away is that **Tim is playing and steering this music**. Tim has
cerebral palsy. All the counters are down before the piece starts, and he steers it live with
the red hat (side to side is Speed, up and down is Brightness). The screen shows both things:
what sounds, and that it is Tim who shapes it.

## Goals

### 1. A second window for the projector (owner)
- **Two screens (owner).** The projector is a second screen, not a copy of the laptop's. The
  laptop keeps the Show view and all its buttons, unchanged. The audience screen is a separate
  window on the projector.
- **Opening it (my call).** A button in the Show view (and on Play) opens it: "Open the
  audience screen".
- **Placing it (owner).** The show laptop runs Chrome or Edge, and a one-time "manage
  windows" permission question is fine. So use the Window Management API: the window goes
  onto the second screen and fills it, with no dragging. Say once, plainly, why the browser
  is asking.
- **Fallback.** If permission is refused, the API is missing, or there is only one screen,
  say plainly: "Drag it to the projector, then click it to fill the screen". Getting it
  full-screen then takes one more click at most.
- **It stays open** through Leave Show, a scene change, Stop and a reload of the laptop page
  (or it reconnects by itself without a click).
- **Not another copy of ADMI.** The audience window never saves and never takes the tab lock.
  It never makes the laptop show "ADMI is open in another tab". It never asks for the camera or
  the microphone.

### 2. What it shows (owner, from mockup A + C, variant 1: "the light shines behind the board")
A dark screen. No grid lines, labels, buttons, banners or numbers.
- **Tim's board, big and simple.** His counters, in their colours, in their places, as large
  as the screen allows.
- **A counter blooms when it sounds.** It swells and brightens, and a ripple spreads from it.
  Loop notes and fill notes (origin 'fill') bloom at their square in the same way **(my
  call)**. Unlike the laptop board, they are not told apart from Tim's counters by shape: for
  the audience, a sound is a sound. Band notes have no square (row/col -1), so they only
  drive the band light along the bottom **(my call)**.
- **The band** is a soft light along the bottom edge that pulses with its beat, as in
  BoardView today.
- **Tim's light.** A big, soft glow behind the counters, following the hat:
  - It moves as the hat moves: left and right with side to side, up and down with up and down.
  - It gets warmer and brighter as he brightens the sound (the hat's Brightness value).
  - It pulses faster as he speeds up (the speed now playing), within the safety limit below.
  - When the hat is out of sight it drifts gently and dims a little. It never vanishes and
    never jumps **(my call; owner did not object)**.
  - With no hat in use (the hat is off, or it's the laptop board), it drifts gently on its own.
  - **Only the real hat moves the light (my call).** When the laptop moves Speed or
    Brightness with the mouse (the hat's mouse mode), or the hat is paused (hands on the
    board, learning the room), the light behaves as "out of sight": it holds and dims. That
    way the screen never credits Tim with a change the laptop made. The music still follows
    the mouse as today.
- **Scene name.** Small, in a corner **(my call; owner did not object)**.
- **Each sound world tints the light (owner).** For example, soft blue for Ambient, amber for
  Warm. Suggested: Warm amber, Lo-fi dusty rose, Ambient soft blue, Electronic violet, none a
  neutral white-gold. A scene change glides the tint over a few seconds; it never cuts.

### 3. Before and after (owner)
- **Before the piece:** the board sits dimly in the dark, with Tim's light faint. No title
  card **(owner)**. It wakes up with the first note.
- **After the piece**, or after Stop: everything fades slowly (about 8 s, my call) back to the
  same dim board, so it ends as it began.
- **Mute and Simplify** on the laptop show only as the music changes. Nothing sounding means
  nothing blooms. No words appear.

## Anti-goals
- **Nothing from the laptop's job leaks onto the projector:** no buttons, banners, warnings,
  error text, "keeping time" notices or cursor. A broken connection shows the dim board, not
  an error.
- **No flashing.** No large area of the screen may flash more than 3 times a second (WCAG
  2.3.1), so the light's pulse must not follow the beat 1:1 at fast speeds. At Speed 240 the
  beat is 4 a second; the pulse halves (or slows to a breath) above 3 a second **(my call)**.
  Blooms are small and soft.
- **The screen must never slow the music.** The keeping-time meter
  (src/songs/keepingTime.ts) must not get worse with the audience screen open. Drawing must
  stay off the audio path, and it may drop frames before it costs the music anything.
- **Not a second instrument.** It shows what sounds; it never plays or changes anything.

## Non-goals
- Showing the camera picture, Tim himself, or his hand.
- A title card, credits or text beyond the scene name.
- Settings for the look. Any tuning is the builder's: sizes, speeds, glow and tint colours.
- The iPad remote and the laptop board's own picture are unchanged.

## Constraints
- React 19, TypeScript strict, no `any`. Tone.js is never touched from the audience screen.
- It works the same whether the sound comes from ADMI or from Ableton. Blooms come from the
  same fired-note log the board's pops use.
- Every word the owner sees is plain language.
- Tests in the usual places: unit (Vitest) and e2e (Playwright, port 3105, temporary
  ADMI_DATA_DIR, never port 3001).

## Left to the builder
- How the second window gets its data. A same-origin popup rendered from the laptop page (a
  portal) or a message channel are both fine, within Goal 1's limits. The tab-saving channel
  (TABS_CHANNEL, src/storage/tabSaving.ts) must not see the audience window as another tab.
- Drawing: canvas, SVG or DOM, as long as it is smooth on the show laptop with ADMI and
  Ableton running.
- Exact sizes, timings and curves; how the hat's axes map onto the screen. Use the learnt
  range, so a small movement of Tim's still crosses most of the screen.
- Whether the operating system's "reduce motion" setting calms the screen (ripples off, the
  light still moves). Suggested: yes.

## Tests that prove it
- **Unit:** the hat position, Brightness and speed map to the light's place, warmth and pulse.
  The pulse never exceeds 3 a second at any speed up to 240. The world maps to a tint. With
  the hat out of sight, the light stays where it was and dims, and never jumps. Mouse mode
  and the hat's pauses count as "out of sight". Placement chooses the second screen when
  permission is given, and the drag instruction when permission is refused, the API is
  missing or there is only one screen.
- **e2e:**
  - Opening the audience screen shows the board and no buttons or text other than the scene
    name.
  - The laptop shows no "other tab" notice.
  - A note that sounds blooms its square.
  - The scene name follows a scene change.
  - After Stop the screen fades to the dim board, and the window stays open.
  - A reload of the laptop page keeps the window working, or it reconnects.
  - The keeping-time meter reads the same in a run with the window open as without.
