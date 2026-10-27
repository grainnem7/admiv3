# Every ADMI sound has its own sound in Ableton: design

*2026-10-27. Follows stage 4 of docs/superpowers/specs/2026-10-26-board-setup-and-sounds-design.md
(eight more sampled instruments) and changes Phase 2 of docs/ableton-integration-plan.md
(sections 5.2 and 5.6: the chain list and the template).*

## Why

When a sound is chosen for a colour in ADMI, Ableton must play that sound: Flute plays a
flute, not the nearest thing in the rack. Today Ableton's racks have 16 chains, chosen with
CC 30 in steps of 8, which uses the whole 0–127 range. Several ADMI sounds already share a
chain (tuba plays French horn, violin plays cello, upright bass plays electric bass, the
seven synth sounds share three chains), and stage 4 adds eight instruments with no chain at
all. The owner wants every sound to be itself, using the best of what Ableton Live 12
Suite offers.

## Goals

- One chain per ADMI sound, named as ADMI names it (33 chains, below).
- The same chain list, in the same order, on every track that switches sound, so ADMI sends
  the same number for a sound on any track (the owner chose this: "option 2").
- A track only loads real instruments in the slots it can reach. Every other slot holds a
  very light **placeholder instrument**, so a mistake gives a plain sound, never silence
  (the owner's addition). ADMI still never sends a track to a placeholder slot.
- Each track's list of filled slots is **generated from the code**: the sounds its job can
  choose in the colour table, plus every sound Evolve can switch that job to, plus the
  World chains and the "My picks" defaults. A test proves every reachable sound is filled
  on its track. The same generated list is the set-up checklist (the owner's addition).
- The Melody track is built and measured first (memory, load time, CPU over a full run)
  before the other racks are built (the owner's plan).

## Non-goals

- Per-colour tracks in the performance. The owner plays with the usual Melody, Chords and
  Bass tracks. Per-colour mode keeps working: its tracks are simply filled in every slot.
- Changing the drum rack. Drums keep their four kit chains and today's zones (0–7, 8–15,
  16–23, 24–31).
- Moving any musical decision into Ableton.

## Anti-goals

- A colour going silent because its sound isn't in a track's rack.
- A set so heavy it is slow to open or stutters during the 7-minute piece.
- A checklist that drifts from what ADMI actually sends.

## The chain list (decided here)

The first 16 keep their places, so an existing rack only needs renaming of four chains and
17 chains added at the end. Changes from today in *italics*.

| # | Chain | ADMI keys |
|---|---|---|
| 0–3 | World: Warm, Lo-fi, Ambient, Electronic | the World's sound for that part |
| 4 | Piano | piano |
| 5 | Electric piano | electricPiano |
| 6 | Harp | harp |
| 7 | Organ | organ |
| 8 | Clarinet | clarinet |
| 9 | French horn | frenchHorn *(tuba moves to 18)* |
| 10 | *Cello* (was Strings / cello) | cello *(violin moves to 16)* |
| 11 | Nylon guitar | guitarNylon |
| 12 | Electric bass | bassElectric *(contrabass moves to 17)* |
| 13 | *Choir pad* (was Pad) | pad, padChoir |
| 14 | *Electric piano chords* (was Chord stab) | chord |
| 15 | *Bells* (was Bell / pluck) | synth:bell |
| 16 | *Violin* | violin |
| 17 | *Upright bass* | contrabass |
| 18 | *Tuba* | tuba |
| 19 | *Flute* | flute |
| 20 | *Saxophone* | saxophone |
| 21 | *Trumpet* | trumpet |
| 22 | *Trombone* | trombone |
| 23 | *Bassoon* | bassoon |
| 24 | *Xylophone* | xylophone |
| 25 | *Acoustic guitar* | guitarAcoustic |
| 26 | *Electric guitar* | guitarElectric |
| 27 | *Synth pluck* | synth:pluck |
| 28 | *Synth keys* | synth:keys |
| 29 | *Soft synth pad* | synth:pad |
| 30 | *Wide synth chords* | synth:supersaw |
| 31 | *Sub bass* | synth:sub |
| 32 | *Synth bass* | synth:sawBass |

Evolve's voices map by sample first, then by synth layer, as today, but now to their own
chains: Choir → 13, Bell → 15, Soft pluck → 27, Soft keys → 28, Supersaw lead → 30,
Sub bass → 31, and so on.

## How ADMI picks a chain (decided here)

- The rack's chain selector covers 0–127, and the zones are made with Ableton's
  **Distribute Ranges Equally** (one click with every chain selected). ADMI sends the
  **middle** of chain *i*'s share: `floor((i + 0.5) × 128 / 33)`. Each share is about four
  values wide, so the middle lands inside it however Ableton rounds the edges. The
  checklist shows each chain's expected range so it can be compared by eye.
- The drum channel (10) keeps `index × 8`.
- Adding a sound later means one more chain at the end and Distribute Ranges Equally again.
  ADMI's numbers follow from the length of the list.

## Which slots each track fills (generated)

A pure function in the code gives, for a channel, the set of chains that must hold a real
instrument:

- **Melody (1), Chords (2), Bass (3):** World 0–3; every sound `soundsFor(job)` offers; every
  Evolve voice for that job in every World, mapped to its chain; the "My picks" default
  (Electric piano for melody and chords, Electric bass for bass).
- **Band (11, 12), Extra notes (13), Loops (4–9):** World 0–3 only.
- **Per-colour channels:** all 33.

The function takes the channel mode (and whether loops have their own channels) as input. In
per-colour mode every colour channel, 1–3 included, needs all 33. The performance Set is built
for the usual mode; if per-colour mode is used with it, a pick outside a track's list falls
back to the World chain as below, and the checklist says per-colour mode needs fully filled
racks. *(Builder's call; the owner plays the show in the usual mode.)*

**ADMI never sends a track to a slot outside its list.** If the rule for a colour would
choose one, ADMI sends that track's World chain instead (the World's sound for the part).
The ADMI screen shows the colour's own pick as usual, so this is a safety net, not a
feature.

**Tests:**
- For every job, every sound in `soundsFor(job)` and every Evolve voice for that job has
  its chain in the job's track list.
- `chainFor` never returns a chain outside the channel's list.
- The in-app checklist renders from the same function.
- The chain names in `docs/ableton-setup-guide.html`'s chain table match `ABLETON_CHAINS`,
  in order. *(Builder's call, to stop the guide drifting.)*

## The checklist (in ADMI and in the guide)

- **ADMI, Connections tab (Template checklist):** the 33 chains with their expected ranges.
  Then, per track (Melody, Chords, Bass, Band, Extra notes, Loops), the slots to fill with a
  real instrument; every other slot gets the placeholder. Generated, never typed by hand.
- **The guide (`docs/ableton-setup-guide.html`, section 5a):** the step-by-step for building
  one full rack, copying it, then swapping each track's unused slots to the placeholder. It
  points to ADMI's checklist for "which slots on which track", rather than repeating it.
  The order:
  0. **Convert first, so the Set never plays wrong sounds.** The new numbering doesn't match a
     16-chain rack, so before ADMI's new version is used in Ableton mode, every existing rack is
     converted. On each track:
     - rename the four changed chains;
     - add the 17 new chains, each holding the placeholder;
     - select every chain and Distribute Ranges Equally.

     A few minutes per track, and every track plays correctly again (new sounds as
     placeholders) while the real instruments go in one by one. ADMI's checklist says this at
     the top. *(Builder's call: no "old/new numbering" switch in ADMI.)*
  1. Fill Melody's rack with real instruments in **all 33** slots, because the same rack is
     copied to Chords and Bass, which need sounds Melody never uses.
  2. Check it (next section). This is the worst case for one track.
  3. Copy it to Chords and Bass.
  4. On Melody, Chords and Bass, swap the slots outside each track's list to the placeholder.
  5. Band, Extra notes and Loops keep their converted racks: World chains real, the rest
     placeholders.
  6. A final full run with the whole Set.

## The placeholder instrument

**Operator with its default patch** (a plain sine): the lightest Live instrument, and
clearly "not the real sound" if it is ever heard. Each placeholder slot keeps its chain name.
*(Builder's call.)*

## Making the most of Suite

**Suggested sounds per chain, the builder's starting point.** The builder checks which
packs are installed on the show laptop (Ableton's Packs folder) before naming presets in
the guide; names that aren't on the laptop go.

- **Woodwind and brass:** Orchestral Woodwinds (flute, clarinet, bassoon) and Orchestral
  Brass (trumpet, French horn, trombone, tuba).
- **Strings:** Orchestral Strings (violin, cello, upright bass/contrabass).
- **Xylophone:** Orchestral Mallets.
- **Guitars and electric bass:** the Guitar and Bass pack where installed.
- **Synth sounds:** Drift, Meld, Wavetable or Operator presets.
- **Choir pad:** Meld or a Suite choir.

**Where Suite has no good match (saxophone is the likely one):** a **Sampler** loaded with
ADMI's own bundled samples for that instrument (public/samples/instruments/<folder>), so the
sound is at least as good as ADMI's own.

**Light versions.** One plain playing style per instrument, not the multi-articulation
presets that load several at once.

**No effects inside chains.** Space is the shared reverb on a return track (Send A, as today).
A reverb in each of 33 chains would keep running even when silent.

**Expression for wind, brass and strings:** in those chains, macro 1 (Loud, CC 24) is mapped
to the instrument's dynamics or expression control as well as its volume, so Loud makes a
flute or trumpet play harder, not only louder. This is done in Ableton when building the
rack; ADMI already sends CC 24. *(Builder's call, from the conversation's "make the most of
Ableton"; the owner hasn't confirmed it.)*

## The Melody check (before building the rest)

The guide says how to read, with the Melody rack built and the Set saved:

- **Load time:** reopen the Set, timed.
- **Memory:** Task Manager → Ableton Live, before and after the rack is added.
- **CPU:** Ableton's CPU meter during a full 7-minute run with the camera and ADMI running.

The guide suggests a line to stay under: CPU below 60% and no dropouts. One full Melody rack
is the worst case for one track. If it passes, the trimmed Set (three partly filled racks plus
placeholder racks) should be lighter than three full ones, and the final full run (step 6
above) is what clears the Set for a show. If the run is too heavy, the fallback is lighter
presets in the heaviest slots, not fewer sounds.

## Constraints

- The owner is buying Live 12 Suite (2026-10-27; the show laptop ran a trial until then) and
  installing its packs: Orchestral Woodwinds, Brass, Strings and Mallets, Guitar and Bass,
  Grand Piano, Electric Keyboards. The guide names presets from those packs.
- Everything in docs/ableton-integration-plan.md section 0 and CLAUDE.md: never silent
  because of Ableton, latency under 20 ms, ADMI's own sound one press away, plain language.
- Works the same on Windows (loopMIDI) and macOS (IAC Driver). Only the guide's MIDI-port
  steps differ.

## Order of work

1. Stage 4 of the sounds design (ADMI's eight new instruments). Its plan's mapping of new
   keys to the "nearest" chains is dropped; until step 2, a new instrument in Ableton mode
   follows the World's chain.
2. This design: the 33-chain list, the generated fill lists and their tests, the in-app
   checklist, the guide.
3. The owner builds and checks the Melody rack; then the rest.

## Left to the builder

- The exact presets per chain, after checking the installed packs.
- Wording of the checklist and guide (plain language).
- How the in-app checklist lays out per-track fills (one table with a column per track, or
  one list per track).
