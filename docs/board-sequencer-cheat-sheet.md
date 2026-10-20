# Board Sequencer — Cheat Sheet

*One page to keep by the board. The full guide is `docs/board-sequencer-guide.html`. Everything saves by itself.*

## Show day
1. Close other ADMI windows. Start with **`npm run show`** and open **http://localhost:3001**. Press **Board Sequencer** and pick the player.
2. **Board: 📷 Camera** at the top. **Set up**: camera, board (**Skip, board hasn't moved**), colours.
3. **Connections** tab: tick **iPad controls** and open the link in Safari on the iPad. The 👆 mark lights on touch.
4. **Make a piece → 3 · Ending & check**: look at the Ready check and fix anything marked ✕. **⤓ Back up to a file** and copy it to a USB stick.
5. Sound check: ▶ Play, then ■ Stop twice. Then **▶ Show** → **▶ Start the piece**: it starts in its opening scene.
6. At the 30-second cue: **End piece** on the iPad (two taps) or **⏹ End**. Afterwards: **Save session** and **CSV**.

## Three buttons at the top
**Play** = just play (Sound, Groove, Board, Connections tabs; no loops or scenes needed) · **Make a piece** = steps 1 Loops, 2 Scenes, 3 Ending & check (each optional) · **▶ Show** = the board full screen for the performance.

## Making a piece
- **1 · Loops:** counters down → **Save the board here** on an empty loop → type a name. A saved loop has ▶ Play, **Replace** (press twice), ✎ draw, ✕ clear. Fades are under More.
- **2 · Scenes → ✦ Make my plan:** Arrival 0:00, Build 1:30, Open 3:30, Home 6:00, from your saved loops.
- **Scenes:** tap one to edit it where it is: time, loops, world, band, Fill, Evolve, tempo. **Update from now**, **+ Add a scene from what's playing**, **Go**. Undo a delete for 15 s.
- **3 · Ending & check:** length; how it ends (each described); Fade, Final chord, Slow down, Thin out or Stop; over 1, 2 or 4 passes; *When I press End* or *At the time*.
- **▶ From here** on a scene rehearses from that moment.
- **Scenes leave the player's strips alone** (on): a strip Tim moved on the iPad keeps his setting.

## During the piece (Show)
- **Now / Next strip:** time left, the scene now, the next scene and when, loops playing, **Next ▶** and **⏹ End**. Cues at 1:00, 0:30 and 0:10 show large.
- **Stop needs two presses** while the clock runs. **Cancel the ending** brings the music back.
- **⏺ Capture** saves the board into a free loop and plays it.
- Loops show on the board as outlined counters. Tim's counters add to the loops: his chords set the chord (the loop's chords follow, quieter), his drums play a busier groove on top, and loop melodies play under his.
- When the piece ends or is stopped, Tim's own settings come back.

## The music (Sound tab)
- **Overall feel:** World (Warm, Lo-fi, Ambient, Electronic, My picks) · Energy (Calm → Driving) · Space (Dry → Huge; a reverb or echo counter takes over) · Groove (Straight, Swung, Lazy).
- **Your colours:** one card per colour. ‹ › changes its sound (or drum) while playing · **Adjust** for Loud, Bright and Space · **Each counter plays** one note or a tune. By default the melody plays one note and drums, bass and chords play a groove, a bassline and the chords · **Changes over time** off keeps that colour as it is · **Reset** goes back to the world.
- **Helpers:** Band (Off, Quiet, Full; it answers Tim, not the loops) · Extra notes (Off, A few, Some, Lots) · Sounds change (Off, Slowly, More: one-note counters wander to nearby notes, home every 4th loop; sounds and drum patterns change too). Each has **↻ Try another**, **↶ Previous** and **📌 Freeze**.
- **Loops vary** (Off, A little, More; A little to start): saved loops don't repeat exactly — notes move to neighbours, tunes play another version, drum loops get busier or sparser; back as saved every 4th pass. Tim's own counters are not changed.
- **Loops answer each other:** layered melodies take turns — one leads each pass (Tim's counters always lead), the others answer in its gaps. Extra notes (Magenta) writes around everything playing, loops included.
- **The piece never runs over:** with either ending, if End hasn't been pressed the ending starts by itself to finish by the length (7:00); anything still sounding at 0:00 fades out.
- **On the board:** ● your counters · ▬ a tune carrying on · ◎ a loop · ◌ extra notes · a bar along the bottom = the band.
- **Advanced** (bottom of the tab): key, scale, octave, note length, studio mix, Magenta or simple rules, tunes on/off.

## Loops: edit notes
**✎ Edit notes** shows the board now and the loop as saved, one above the other. **Copy the board into this loop** (press twice if the loop has notes). The board itself is never changed there.

## The iPad (Connections tab, per player)
Strips and pads shown · **Also on the Play page** (End piece, Next scene, Capture, Stop all, loops) · strip *Jumps* or *Follows* · pad acts on *land* or *lift* · second tap 3, 6 or 10 s · 🔒 locked strips · hide Next scene · **Learn reach**. A palm is ignored on every pad, Keep only keeps, and the iPad shows Now / Next and a beat light.

## If something goes wrong
| You see | Do |
|---|---|
| iPad "Link lost — reconnecting…" | Wait; reload the iPad page; check one server, same code |
| Red "The camera has stopped" | The music carries on — check the USB cable, **Try the camera again** |
| A counter isn't heard | Centre it; no hand over it; lower Piece coverage last |
| Knocked counters | Do nothing — ghosts play until they're back |
| Page reloaded mid-piece | **Carry on from m:ss** |
| Loops/scenes missing | `localhost:3001`, right player; **⤒ Restore from a file** or `.admi-data/backups` |
| "Open in another tab" | Close all ADMI tabs but one |
| Sounds awful | **Mute** |

*Board: 💻 Laptop plays with no camera (click squares) — for testing and planning; the Ready check warns if it's on. **+ Add a colour** above the board adds Orange, Purple, Pink, Cyan, White or Black with the job you pick.*
