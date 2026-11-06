# "Rising Light", version 2: light first, the band you asked for, a big ending

Builds on `2026-11-06-demo-composition-design.md` (version 1, now in the code as
`src/songs/demo/demoPiece.ts`). The plan: `docs/superpowers/plans/2026-11-06-demo-composition-v2-plan.md`.

## The owner's notes on version 1 (2026-11-06)

- It gets better as it goes on. Keep the ambient sound.
- The opening should be **pentatonic and major-ish**, but **atmospheric, not twee**.
- **Open with just drums, then brass pads, then a realistic guitar, then wind pads.**
- More **development** and **drama**; it is still **samey**: the loops don't develop as
  they repeat, and Magenta doesn't develop either.
- The **live counters** must **blend**: really pad-like sounds, sitting in the mix.
- It need not be minor all through; never cheesy or twee; atmospheric and dramatic.
- A **build up to a big, dramatic ending**.

## Why it was samey, and what changes

1. **A loop had two versions** (plain and decorated, alternating) and a scene lasted up to
   eight passes (44 s): the same two bars heard eight times. Now a loop **grows over four
   passes**: notes can be written for the 1st, 2nd, 3rd or 4th pass of every four, so a
   phrase builds (sparse, then fuller, then its peak) and starts again only when the scene
   moves on. And **a scene lasts four passes (22 s)**: sixteen scenes, every one changing
   something.
2. **Magenta made one idea a scene.** Now it makes **a new idea every four passes**, each
   kept and frozen, so the AI's part keeps developing through each scene and the piece.
3. **Tim's counters took over a part's track in Ableton**, interrupting the loop that was
   playing there. Now all of Tim's counters sound on **their own track, "Tim's glow"** (MIDI
   channel 14): one lush, soft pad with a gentle bell at its start, in the same space as
   the band. Whatever he places floats on top and never stops anything.

## The pitch world: one set of five notes, three centres

All the loops and all of Tim's counters use the pentatonic scale of the scene's key. Every
note sounds well over every chord of its section, so nothing Tim places can clash.

- **Light** (the opening): **A major pentatonic** (A, B, C#, E, F#), centred on A.
  Major-ish, open, warm. Atmospheric because it sits on a held A (a pedal) and its chords
  carry colour notes (ninths, sevenths), move slowly (four bars each) and never resolve
  like a song.
- **Shadow** (the middle): **F sharp minor pentatonic**: the same five notes, centred on F#.
  The loops are written in steps of the scale, so the same theme now sounds a third lower,
  darker. The drama turns without a single new note.
- **Summit** (the finale): **B major pentatonic**, a tone above the Light: brighter, higher,
  the lift that makes the ending big.

## Harmony (four bars a chord unless "moving", two bars)

- **Glow** (new): A add9, then D maj7, over the band's bass holding A (a pedal). The plagal
  shimmer of ambient music (I, then IV over the I): warm, never a pop progression.
- **Lift**: A sus2, then B minor add9: the floating lift.
- **Float**: A add9, then F sharp minor add9: light clouding over (the hinge to the Shadow).
- **Tide** (Shadow): F#m add9, D maj7, B m9, F#m add9.
- **Rise** (Shadow climbing): D maj7, E sus4, F#m add9.
- **Lift in B** (Summit): B sus2, then C sharp minor add9; moving in the last scene.

## The band, in your order

| Voice | Job, ADMI sound | Ableton track and chain | Character |
|---|---|---|---|
| Percussion | drums, one kit piece per counter | Drums (10) | soft, the heartbeat; grows to the summit kit |
| Brass pads | bass job, Trombone, over the bass | Bass (2), Trombone ("Soft Brass + Pad") | open fifths held a pass, swelling; the chord's third added on later passes |
| Guitar | chord job, Acoustic guitar, follows the pads' chord, fingerpicked roll | Chords (3), Acoustic guitar | every chord rolled slowly string by string, like fingers, not a strum |
| Wind pads | melody, Clarinet (now a woodwind ensemble) | Melody (1), Clarinet | the theme in long breaths |
| Bells | melody, Bells, an octave up | Melody (1), Bells | sparkle in the rebuild |
| Pads, sub | the band's wide pads and bass | Band chords (11), Band bass (12) | under everything from the brass on |
| AI | Magenta, a new idea every four passes, frozen | Extra notes (13) | glassy answers, more and higher as it builds |
| Tim | his counters, all of them | Tim's glow (14), new | one lush pad with a soft bell start |

## The theme

The same four notes as version 1, C#, B, A, then up to E, written in A major pentatonic
(degrees from the bottom row: 0 = A4, 1 = B4, 2 = C#5, 3 = E5, 4 = F#5, 5 = A5, 6 = B5,
7 = C#6). It now grows over four passes:

| Pass of four | Step 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| 1st | C# (2) | | | B (1) | A (0) | | E (3) | |
| 2nd | as 1st, plus | | | | | B (1) | | F#' (4) |
| 3rd | as 2nd, plus | | E (3) | | | | | |
| 4th | as 3rd, plus | A' (5) high | | | | | | the high A rings over the turn |

In the Shadow (F sharp minor) the same degrees sing B, A, F#, C#: the theme a third lower.
In the Summit (B major) D#, C#, B, F#: a tone higher than the Light.

## The form: sixteen scenes, four passes each (eight for the last two)

| Pass | Time | Scene | What arrives or changes | Key | Chords | Energy | Way in |
|---|---|---|---|---|---|---|---|
| 0 | 0:00 | Drums | the heartbeat alone, softly, out of silence | A | Glow | 2 | cut |
| 4 | 0:22 | Brass | brass pads swell in on A and E; the band's pads under them | A | Glow | 2 | fade 1 |
| 8 | 0:44 | Brass bloom | the brass adds the third; the pads open to full | A | Glow | 2 | cut |
| 12 | 1:06 | Guitar | the guitar rolls in, a chord every pass | A | Glow | 3 | fade 1 |
| 16 | 1:28 | Guitar picking | the guitar rolls every beat, the shaker joins; the chords lift | A | Lift | 3 | cut |
| 20 | 1:50 | Winds | the wind pads breathe the theme, growing over the four passes | A | Lift | 3 | fade 1 |
| 24 | 2:12 | Winds answer | Magenta's first ideas answer the winds | A | Float | 3 | cut |
| 28 | 2:34 | Shadow | the centre drops to F#: the theme a third lower, the brass on F# | F#m | Tide | 3 | cut |
| 32 | 2:56 | Heartbeat | the percussion builds; the guitar picks every beat | F#m | Tide | 4 | cut, lead in: rising |
| 36 | 3:18 | Hush | everything falls away but the pads and the winds (and Tim) | F#m | Tide | 1 | cut |
| 40 | 3:40 | Rebuild | bells and the heartbeat return; the guitar | F#m | Rise | 3 | cut, lead in: drum fill |
| 44 | 4:02 | Climb | the chords move every two bars; brass, winds an octave up, Magenta busier | F#m | Rise moving | 4 | cut |
| 48 | 4:24 | Light breaks | back to A, everything at once, the guitar driving | A | Glow moving | 4 | cut, lead in: drum fill |
| 52 | 4:46 | Gathering | the summit kit begins, Magenta at its busiest, the pads widest | A | Lift moving | 5 | cut |
| 56 | 5:08 | Summit | up a tone to B: winds high, brass, guitar, the full kit | B | Lift in B | 5 | cut, lead in: drum fill |
| 64 | 5:52 | Final ascent | the same, everything climbing, the cymbal swells | B | Lift in B moving | 5 | cut |
| 72 | 6:37 | **Big finish** | it builds over two passes, the drums roll, the band broadens into one huge B major chord across every instrument, and rings out by 7:00 | | | | |

The shape: light and space for two minutes, the band gathering one voice at a time; a
cloud passes (the Shadow); the hush at 3:18; the long climb back, light breaking at 4:24, a
tone higher at 5:08, and the Big finish.

## Tim

- **The cap**: up and down, Tone (the whole band brightens); left and right, Extra notes
  (how much Magenta adds), or Speed in a narrow range if the owner prefers.
- **His counters**: anywhere on the board, any colour, they sound on Tim's glow, in the
  scene's key, as long soft notes; the pads and the band carry on underneath.
- **The iPad**: New idea, End piece.
