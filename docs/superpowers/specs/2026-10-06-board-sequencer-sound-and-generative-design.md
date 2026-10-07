# Board Sequencer — Sound worlds, phrases, band and fill

- **Date:** 2026-10-06
- **Status:** Design — awaiting review. No code yet. Branch `feat/board-sequencer-mode`.
- **Author:** Grainne + Claude
- **From:** "I want to vastly improve the sound on offer and perhaps add in some ai/generative
  element but giving the user the creative control. I want it to be instantly more satisfying to
  make music with because at the moment it requires a lot of precision and counters to make
  anything that sounds satisfying. Also the sounds are too basic and poor quality."

## Decisions (2026-10-06)

| Question | Answer |
|---|---|
| Where to start | **This written design first**, then build in the slice order below |
| Generative approach | **Rule-based now, ML later** — a generator interface an ML model can plug into |
| How much it plays by itself | **Fills around the player**, shown as ghost notes, with **Keep** / **New idea** and an adjustable amount |
| Styles | **All four**: Warm / acoustic, Lo-fi / hip-hop, Ambient / dreamy, Electronic / pop |
| Silence | **Nothing sounds until a player puts a counter on the board.** The band and fill only ever respond to counters; an empty board is silent |
| Chord role | **Claude's call**: no new role. In One note mode Chord stays a stab; in Phrase mode a chord counter sets the harmony from its column on (B2) |
| Download budget | **~15 MB per world is fine** |
| Lo-fi texture | **Use with caution, but it must be funky.** Crackle and hiss are off by default and quiet when on; the funk comes from the groove (swing, syncopation, ghost notes), not the noise |

## Problem

What the board does today, read from `BoardSequencerEngine.ts`:

1. **One counter is one short note.** The grid is an 8-step loop at one step per beat, so two
   counters are two plinks and six beats of silence. How good it sounds rises with the number of
   counters and how carefully they sit. That is backwards for players with cerebral palsy, ABI or
   sensory impairments (principle 1: *tolerance over precision*).
2. **One counter gives so little back.** An empty board being silent is right: the player starts
   the music. But the first counter gets one note and nothing around it.
3. **The sounds are thin.**
   - Instruments are 4–12 MP3 samples each at a single velocity (`tonejs-instruments`, Salamander subset).
   - The drum kit is 808-flavoured with one hi-hat and one crash sample.
   - Notes are short (`noteLengthBeats`) and mostly dry.
4. **The board missed the June audio overhaul.**
   - Song and Remix run through `MasterChain` (EQ → glue compressor → saturation → limiter) and `SpaceReverb`.
   - The board builds its own `Tone.Limiter(-2)` and one algorithmic `Tone.Reverb`. It has no
     compression, no EQ, no stereo placement and no ducking.
5. **Nothing makes the sounds belong together.** Each colour picks an instrument from a long list
   on its own. It is easy to build a set of sounds that clash or crowd the same register.

Problem 1 matters most. Better samples on their own will not make three counters sound like music.

## Principles this design holds to

- **The player's counters are always the foreground.**
  - Anything the instrument adds (band, fill) is quieter than what was placed.
  - It is shown differently on screen.
  - It never sounds on top of a placed note.
  - It steps aside when the player takes over a part.
- **Nothing the instrument adds is invisible.** Every generated note is drawn when it sounds
  (principle 5), and is drawn in a way that does not rely on colour alone.
- **The player starts the music.** Nothing sounds until the first counter goes down. Lifting the
  last counter lets the current pass finish, then everything stops, band and fill included.
- **Changes land on the next loop pass, never mid-phrase.** Players need to predict the next sound.
- **Every amount is the player's to set.** That covers band level, fill amount and phrase busyness.
  Each one is in the per-player profile and can be set by a counter where it makes sense
  (principle 4).
- **Latency is unchanged.** Scheduling stays on the existing look-ahead clock. Generation happens
  off that path, once per board change, and is scheduled ahead, so the 20 ms budget is not touched.
- **Repeatable.** The same board with the same seed gives the same music. A session can be
  reproduced and analysed.

## Overview — four parts

| Part | What the player gets | Behaviour change? |
|---|---|---|
| **A. Sound worlds + mix** | One choice ("Lo-fi") sets instruments, drums and space that suit each other; everything sounds fuller and more polished | None — same notes, better sound |
| **B. Phrases** | Each counter plays a musical idea (groove, bassline, motif, chord change) instead of one note | Yes, per channel, opt-in for existing players |
| **C. Band** | Once the first counter is down, a bed (pad, groove, bass) joins in around it, following the chords the counters set | Yes, off for existing players |
| **D. Fill** | In-key additions around what the player placed — ghost notes, Keep / New idea | Yes, off until turned up |

---

## A. Sound worlds and the mix

### A1. Put the board on the shared mix chain

- Route the board's mix bus into `MasterChain` and `SpaceReverb`, the same way `RemixEngine` and
  `SongPresetEngine` do. Delete the board's private limiter and reverb.
- The board's reverb and delay buses, the per-channel sends and the control-counter routing
  (`setControlValues`) keep working as they do now. They just feed the new chain.
- **Stereo placement per role:**
  - Bass and kick stay in the centre.
  - Chords sit slightly wide.
  - Melody is placed slightly off-centre.
  - Hats are spread across the stereo field.
- **Kick ducking (sidechain):** pad, chord and bass dip a few dB on each kick. Each world sets
  how much, and it can be 0. This is the "pump" in Electronic and the "breathing" in Lo-fi.
- **Notes ring:** a melody or bass note releases into the next note in its channel instead of
  stopping dead after `noteLengthBeats`. Each world sets this (*legato* on or off). It is the
  single biggest cause of the "plinky" sound.

### A2. Sound worlds

A **sound world** is one curated bundle:

```ts
// src/audio/worlds/soundWorld.ts
export interface SoundWorld {
  id: 'warm' | 'lofi' | 'ambient' | 'electronic';
  name: string;                 // "Warm", "Lo-fi", ...
  description: string;          // one plain sentence for the picker
  defaults: { bpm: number; swing: number; scale: string; rootMidi: number };
  voices: Record<'melody' | 'chord' | 'bass' | 'pad', LayeredVoiceSpec>;
  drums: DrumKitId;
  space: { reverb: SpaceReverbPreset; delayNote: '8n' | '8n.' | '4n'; delayFeedback: number };
  colour: { saturation: number; lowpassHz?: number; wobble?: number /* tape wow, Lo-fi */ };
  duck: number;                 // kick → pad/chord/bass ducking depth, 0 = none
  legato: boolean;
  phrases: PhraseStyleId;       // which pattern bank part B draws on
}

export interface LayeredVoiceSpec {
  sample?: SampleKey;           // a SAMPLE_CONFIGS key
  synth?: SynthLayerSpec;       // a Tone synth layer: sub, pad, pluck...
  mix: { sample: number; synth: number };
  octave: number;
  pan: number;
}
```

The four worlds, one per chosen style:

| World | Melody | Chord | Bass | Pad | Drums | Space / colour |
|---|---|---|---|---|---|---|
| **Warm** | Piano | Piano + soft strings | Upright (contrabass) + sine sub | Strings | Acoustic / brushed kit | Room reverb, gentle saturation |
| **Lo-fi** | Electric piano | Electric piano | Round sub bass (synth) | Dusty pad | Swung boom-bap kit, ghost snares, syncopated kick | Lowpass ~6 kHz, tape wobble, short plate. Crackle/hiss: **off by default**, a quiet switch when on |
| **Ambient** | Harp / bell | Choir pad | Soft sine | Long choir + synth pad | Soft pulse kit (felt kick, shaker) | Long hall, dotted-8th delay |
| **Electronic** | Synth pluck | Saw stab | Saw / square bass | Supersaw pad | Punchy electronic kit | Short room, strong duck |

**How a world relates to what exists:**

- The world fills in each channel's sound **when the channel has no instrument of its own**. A
  channel set to "Use world sound" (the new default) follows the world. A channel with an explicit
  instrument (today's picker) keeps it, so nobody loses a choice they made.
- Changing world swaps the voices on the next loop pass, crossfading over about 200 ms. The
  pattern carries on.
- **Picker:** in **Play → Sound** and in **Setup → Sounds**. It shows four large cards, each with a
  name, a one-line description and a **Preview** button that plays a 4-bar demo. The demo is a fixed
  board played through the world, so the player hears it before choosing.
- The existing `EffectChainManager` presets (Warm, LoFi, Dream, …) stay where they are for the other
  modes. The board stops depending on them.

### A3. Better samples

Synth layers do much of the work for bass, pads and plucks at zero download cost. Samples are still
needed for the acoustic sounds:

- **Piano:** more Salamander notes plus 2–3 velocity layers. The licence (CC-BY 3.0) is already
  attributed.
- **Drums:** at least three new kits (acoustic/brushed, boom-bap, electronic). Each needs 2–4 round
  robins per piece and more than one hat. `RoundRobinDrumKit` already supports this.
- **Strings / bell / shaker:** fill the gaps in the table above.

**Rules:**

- **Licensing:** CC0 or CC-BY only, recorded in `ATTRIBUTION.md`, committed so deployed builds
  work. The git-ignored `drums/default/` folder stays local-only, as now.
- **Format:** MP3 or AAC. No FLAC for new material, because it is silent on Safari before 16.4.
- **Loading:**
  - **Lazy per world:** only the selected world downloads.
  - **Budget:** about 15 MB per world.
  - **Load order:** synth layers play immediately while the samples arrive, then the sample layer
    fades in. No silence while loading.
- **Sourcing is a task of its own.** It needs listening and licence checks before anything is
  committed, and is listed as slice 3.

---

## B. Phrases — each counter plays a musical idea

### B1. Play mode per channel

A new channel setting, **Plays: One note | A phrase**.

- **One note** is today's behaviour, unchanged.
- **A phrase** works as follows:
  - A counter starts a musical idea on its column.
  - The idea runs until the next counter of the same colour, or to the loop end (wrapping).
  - So **one counter fills the whole loop**, and a second counter divides the loop between them.

This is what makes the board tolerant: a counter one square off still makes a full phrase, it just
starts a beat later or a step higher.

### B2. What each role's phrase is

| Role | The counter's **column** | The counter's **row** | What sounds |
|---|---|---|---|
| **Chord** | Where the chord changes | Which chord (scale degree, bottom = I) | The chord, comped in the world's rhythm. **Sets the harmony that bass, melody, band and fill follow.** |
| **Bass** | Where the line starts | Root degree | A bassline from the world's bank (root-fifth, octave bounce, walking), landing on the current chord |
| **Drums** | Where the groove starts | Busyness (bottom = sparse, top = busy) | A full groove from the world's kit — kick, snare, hats together |
| **Melody** | Where the motif starts | Starting pitch | A short motif (2–6 notes) from the world's bank. Chord tones on the strong beats, scale tones between |

- **Chord counters write the progression.**
  - Two chord counters give a two-chord loop; four give a four-chord one.
  - With no chord counter, the harmony is the world's default: the tonic, or a gentle I–vi–IV–V
    when the band is on.
  - When the board is locked to a song, the song's chords win, and chord counters set only the comp
    rhythm.
- **Variation, box detail and loops still apply:**
  - An off-centre counter makes its phrase a variation (B-lap only).
  - Box-detail velocity scales the whole phrase.
  - A captured loop stores the counters and replays as phrases.

### B3. Timing resolution

- Columns stay **beats**, so the playhead, pages, ping-pong and polyrhythm loops do not change.
- Phrases place notes on **sub-steps** (8ths and 16ths) inside those beats.
- The scheduler gains a sub-step pass: `fireStep` still runs per beat, and expands each phrase's
  notes for that beat with offsets in seconds. The swing and humanise rules apply to sub-steps too.

### B4. Seeing it

- **The stretch a phrase counter governs** is drawn as a soft band from the counter to the next one.
  The player sees "this counter owns these beats".
- **Each phrase note pops when it sounds**, as notes do today, along the counter's row. A deaf
  player sees a groove as a groove, not one flash per beat.
- **The "Now:" line names the phrase:** "Bass: octave bounce on II".

---

## C. The band

- **Band: Off | Gentle | Full**
  - Settable in **Play → Sound**.
  - Optionally a fader role `band`, so a counter can set it.
  - A per-player default.
- **Parts:**
  - A pad holding the current chord.
  - A groove (Gentle is mostly hats and soft kick; Full is the whole kit).
  - A bass root on each chord change.
- **The band waits for the player.** It is silent on an empty board. It comes in on the pass after
  the first sequenced counter goes down, and stops when the last one is lifted. With one melody
  counter, for example, the player hears their motif with a pad and a soft groove under it.
- **The band makes room.** As soon as the player has a counter of a role on the board, the band's
  part for that role drops out on the next pass. It comes back when the counter is lifted.
  Placing a bass counter is therefore always *taking over the bass*, never adding a second one.
- **It follows the player's chords** (part B), so moving a chord counter changes what the band plays.
- **Seen, not just heard:**
  - The legend shows "Band: pad · groove" with the parts that are playing.
  - A soft pulse runs along the board edge on each band beat.
  - Band notes are never drawn as counters.
- **Defaults:** see "Who gets what by default" below.

---

## D. Fill — generative, with the player in charge

### D1. What it adds

Rules over the current board and harmony. **Never** notes outside the scale, and **never** on a
step a placed counter already uses.

| Part | Rules |
|---|---|
| **Melody** | Passing tones between consecutive placed notes. Neighbour-note turns. **Echo / answer:** the player's motif repeated in the gaps, moved to the next chord. |
| **Drums** | Ghost snares, hats between hits, a fill on the last beat of every 4th pass |
| **Bass** | Approach notes into each chord change |

- **Amount** (0–1, per player, also a fader role `fill`) sets how many candidates survive.
  - At 0.2: a few echoes.
  - At 0.8: a busy, decorated loop.
  - There is a hard cap on density per beat.
- **Level:** −6 dB under placed notes by default (adjustable).

### D2. Keep / New idea

- **New idea**
  - Picks a new seed, so the same board gets different decoration.
  - Takes effect on the next pass.
  - The previous idea is remembered once, so **Back** undoes it.
- **Keep**
  - Freezes the current fill: its seed and the board it was made for.
  - Moving counters no longer changes a kept fill.
  - It is saved in the profile, and alongside a loop when that loop is captured.
- **Clear** removes it.
- **Reaching these without precision.** For players who cannot dwell-hold or shake quickly:
  - Each action is a large button.
  - It is mapped to the existing switch / keyboard access.
  - It can optionally be a **counter action**: putting a counter of an "idea" colour down triggers
    New idea once. It is a toggle role, not a held gesture.

### D3. Ghost notes

- Fill notes are drawn as **hollow rings** on their cell, where placed notes are solid. They light
  when they sound, like any note.
- The legend says "Fill: 6 notes · kept" or "Fill: 6 notes · New idea ready".
- The difference is **shape**, not just colour, so it reads for colour-blind players and on a low-contrast projector.

### D4. The generator interface (the ML slot)

```ts
// src/songs/generative/generator.ts
export interface GenerationContext {
  board: ActiveCell[];                 // what the player placed (after phrase expansion)
  harmony: ChordSpan[];                // from chord counters / world default / song
  scale: { rootMidi: number; semitones: number[] };
  cols: number; rows: number; stepsPerBeat: number;
  world: SoundWorld['id'];
  amount: number;                      // 0..1
  seed: number;
}

export interface GeneratedNote {
  role: 'melody' | 'bass' | 'drums';
  beat: number; subStep: number;       // when
  midi?: number; drum?: KitDrum;       // what
  velocity: number;
  /** For drawing: the cell the ghost ring sits on. */
  cell: { row: number; col: number };
  /** Why it exists, for the session log. */
  rule: 'passing' | 'neighbour' | 'echo' | 'approach' | 'ghost' | 'hat' | 'fill';
}

export interface FillGenerator {
  readonly id: string;                 // 'rules-v1', later 'magenta-musicrnn'
  generate(ctx: GenerationContext): GeneratedNote[] | Promise<GeneratedNote[]>;
}
```

- **Rule-based now:** `rules-v1` is pure and synchronous, with a seeded PRNG.
- **When it runs:** on board change (debounced to the frame cadence the board already uses) and on
  New idea. Measured budget: under 2 ms.
- **ML later:** a `magenta-musicrnn` (melody continuation) or `drumify` generator can implement the
  same interface.
  - It runs asynchronously.
  - The **post-filter** that enforces the principles is shared by every generator and applies to
    ML output too: in key, never on a placed step, density cap, level.
  - The engine keeps playing the last result until a new one arrives.
  - ML adds a model download (Drumify's checkpoint is about 50 MB) and is less repeatable. A seed
    does not guarantee the same output. Both points go to the facilitator when ML is chosen.

### D5. Research logging

`FiredNote` gains **`origin: 'placed' | 'phrase' | 'band' | 'fill'`** (and `rule` for fill). The
session log can then separate what the player made from what the instrument added. That is the
evidence a musical-agency claim needs, and it is cheap to add now and impossible to recover later.

---

## Architecture

```text
src/audio/worlds/
  soundWorld.ts          types + the four world definitions
  LayeredVoice.ts        sample layer + Tone synth layer, pan, legato; replaces BoardSequencerVoice's internals
  worldLoader.ts         lazy per-world sample loading, synth-first
src/songs/phrases/
  harmony.ts             chord counters → ChordSpan[] (pure)
  phraseBanks.ts         per-world pattern banks (data)
  expandPhrases.ts       counters + harmony → timed notes for a pass (pure)
src/songs/generative/
  generator.ts           interfaces
  rulesFill.ts           rules-v1 (pure, seeded)
  fillFilter.ts          shared post-filter (in key, no collisions, density, level)
  band.ts                band parts from harmony + "who has taken over" (pure)
src/songs/BoardSequencerEngine.ts
  - MasterChain + SpaceReverb, stereo, duck
  - sub-step scheduling; plays expanded phrases + band + fill
  - FiredNote.origin
src/profiles/BoardSequencerConfig.ts
  soundWorld, channel.plays ('note' | 'phrase'), bandLevel, fillAmount, fillSeed, fillKept
  (all sanitised; existing profiles: plays 'note', band 'off', fill 0)
src/ui/screens/boardSequencer/
  Sound panel (world cards + preview, band, fill amount, Keep / New idea / Back / Clear),
  phrase bands + ghost rings on the board view, legend lines
```

The pure modules (`harmony`, `expandPhrases`, `rulesFill`, `fillFilter`, `band`) carry the musical
logic and are tested without audio. The engine only schedules what they return.

## Slices

| # | Slice | Done when |
|---|---|---|
| 1 | **Mix**: board on MasterChain + SpaceReverb, stereo, duck, legato release | Same notes as today, A/B'd on the rig and judged fuller. All existing engine tests pass |
| 2 | **Sound worlds** on current samples + synth layers, picker with preview | Four worlds selectable, channels default to "Use world sound", explicit picks preserved |
| 3 | **Samples**: source, licence-check, encode, lazy-load | Each world's sample set under budget, ATTRIBUTION complete, synth-first load verified with throttled network |
| 4 | **Phrases**: harmony from chord counters, phrase banks, sub-steps, phrase bands + note pops | One counter per role gives a full loop; existing profiles unchanged |
| 5 | **Band** with wait and make-room rules | Empty board is silent; one counter brings the band in next pass; placing a role's counter replaces the band's part; lifting the last counter stops everything |
| 6 | **Fill** rules-v1, ghost rings, Keep / New idea / Back / Clear, `origin` logging | Same board + seed reproduces exactly; no fill note collides with a placed one; all actions reachable by switch |
| 7 | **ML generator** behind the interface | Later; separate design once 6 has been used with players |

Slices 1–2 alone answer "the sounds are too basic". Slice 4 answers "it needs too many counters".

## Testing

- **Pure logic, seeded**, in `src/__tests__/` with Vitest:
  - Chord counters → spans, including wrap and two counters in one column.
  - Phrase expansion per role.
  - Fill rules never leave the scale and never hit a placed step.
  - Density cap.
  - Same seed gives an identical result.
  - The band drops a part when a counter of that role appears.
- **Engine** (Tone mocked, as now): scheduled notes carry the right `origin`; Off channels still
  play nothing; a world switch does not drop a pass.
- **Listening on the rig:**
  - Each world with one counter per role, then with one counter only.
  - Then Fill at 0.2 / 0.5 / 0.8.
  - Each pass checked against "is it satisfying with three counters?"

## Out of scope

- **Tracking, colour detection, calibration thresholds and gesture mapping.** None of this touches them.
- **Other modes' sound** (Song, Remix, Performance). They already have MasterChain. Worlds could be
  offered there later.
- **The ML generator itself** (slice 7 gets its own design).

## Who gets what by default

Players already in the study have saved settings, and their board should not suddenly behave
differently in a session. So:

| | Plays | Band | Fill | Sound world |
|---|---|---|---|---|
| **A player already set up** | One note (as now) | Off | 0 | None — their instrument picks, on the new mix |
| **A new player** | A phrase | Gentle | 0 | Warm |

- Either player can change any of these in **Play → Sound** at any time.
- In both cases **nothing sounds until a counter is down**.
- Fill starts at 0 for everyone: the instrument adding notes is something a player turns on, never
  a surprise.

## Resolved questions (2026-10-06)

1. **Silence:** no sound without a counter (see Principles and C). The defaults table above
   replaces the original question about existing profiles.
2. **Chord role:** no new role. Chord stays a stab in One note mode and sets the harmony in Phrase
   mode. Players learn one colour per job, and the meaning grows with the mode they chose.
3. **Download:** about 15 MB per world is acceptable.
4. **Lo-fi texture:** crackle and hiss are off by default, and quiet when switched on. Lo-fi gets its
   character from a swung, syncopated groove with ghost notes.

## Built so far (2026-10-06)

- **Slice 1 (mix):** done. The "Studio mix" switch on Play → Sound turns it on and off,
  for A/B listening.
- **Slices 2 + 4 (worlds and phrases), first version.** Built together at the user's
  request. Where it differs from the design:
  - **"Each counter plays: A phrase / One note" is one setting per player, not per
    channel.** It's simpler to learn and to switch while comparing. Per-channel can come
    later if a player needs mixed modes.
  - **Worlds use the existing samples plus synth layers.** No new samples have been sourced
    yet (slice 3). Every world uses the same CC0 drum kit, coloured differently per world
    (low-pass and level).
  - **Lo-fi has no tape wobble or crackle yet.** Its character comes from the low-pass on
    the mix, a sub bass, and the swung, syncopated groove.
  - **Not built yet:**
    - The world Preview button.
    - The soft band showing which beats each counter owns.
    - The "Now:" line naming the phrase.
  - **Phrase notes light the counter that started them**, so every note is still seen.
    They are logged with `origin: 'phrase'`.
- **Slice 6 (fill), rules-v1:** built.
  - `src/songs/generative/rulesFill.ts` is pure and seeded.
  - **Controls (Play → Sound):** a Fill amount control (0 = off, the default), plus
    **New idea**, **Back**, **Keep** and **Clear**.
  - **On the board:** fill notes are small dotted rings that fill in as they sound.
  - **Logging:** fill notes are logged with `origin: 'fill'` and play at about −6 dB.
  - **Where it differs from the design:**
    - It fits the live page only when there are several pages.
    - With ping-pong it assumes a forward sweep.
    - There is no `fill` fader role yet.
    - Generators run synchronously, with no `FillGenerator` interface object yet (the
      rules are a function).
- **Not started:** slice 3 (samples), slice 5 (band), slice 7 (ML).

## Direction change (2026-10-06): use existing AI, ADMI is the controller

The user's steer: *"we should use something pre-existing. we don't need to build an
instrument from scratch – we are just building a controller."* Decision: **Magenta.js in
the app now; MIDI out later.**

- **Slice 7 brought forward.**
  - **Models:** Magenta's pre-trained `melody_rnn` and `drum_kit_rnn`, used as they are
    (`src/songs/generative/magentaFill.ts`).
  - **Loading:** downloaded on first use from Magenta's public storage, through a dynamic
    import, so they are a separate chunk and never part of start-up.
  - **What they do:** each continues what the player placed. Every suggestion passes
    through `fitFill` (`fillFilter.ts`): never on the player's notes, in key, at most 2 per
    beat, scaled by the Fill amount.
  - **When they run:** only after the board has been still for 0.6 s, and never on the
    sound path.
  - **Fallbacks:** Bass keeps the rule-based approach notes, because Magenta has no bass
    model. The simple rules play while the models load and whenever they can't (offline).
  - **Repeatability:** results are cached by board and idea, so Back and an unchanged
    board return the same notes. A *new* idea isn't reproducible the way the rules are,
    because the model samples randomly.
- **Setting:** "Ideas from: Magenta AI / Simple rules" (Play → Sound → Fill), with a status
  line showing loading, thinking, AI, or offline.
- **Dependency risk:** `@magenta/music@1.23.1` is the last release and brings old
  dependencies (TensorFlow.js 2.7, protobufjs 6, Tone 14 as a private copy). `npm audit`
  lists critical advisories in protobufjs and static-eval. They only bite when parsing
  untrusted protobuf data or at build time; we only load Magenta's published models.
  Revisit if the app is ever deployed beyond research sessions.
- **Next:** MIDI out from the board (the existing `src/midi/MIDIOutput.ts` is not yet
  wired to the Board Sequencer), so any instrument or DAW can be the sound.

## Evolve (2026-10-06): the sound keeps moving

User: *"cant we change the sound of the user's counters as it continues playing in a
generative way? otherwise it all gets very samey."* It takes after generative instruments
(Bloom, Endel, Generative.fm), where the notes stay the player's and the sound around them
moves. The code is `src/audio/evolve/evolve.ts` (pure).

- **Drift every loop:** brightness, reverb, echo, stereo place and note length wander,
  gliding between scene anchors so there are no jumps.
- **Scenes every 4, 8 or 16 loops:** another instrument from the world's palette for that
  part, or the melody or chords an octave up or down. Bass never moves octave.
- **A pure function of seed, colour and loop:** "New sound" is a new seed, "Back" is the
  previous one, and "Hold" fixes the loop. All three are exact.
- **What it never changes:** an instrument the player picked is never swapped (it still
  drifts), and nothing is swapped under "My picks".
- **Seen, not just heard:**
  - Each colour's current sound appears in words on the Play screen ("Sounds: Red — Harp,
    bright, spacious").
  - The same appears on the Sound tab.
  - Scene changes are announced.
- **Defaults:** new players get 40%. Existing players get 0 (off).
- **Possible later step:** Magenta's GANSynth and DDSP can make new timbres, but they are
  far too slow to run live. They could pre-render a set of sounds offline for Evolve to
  move between.

## Built on 2026-10-06, second pass ("make it the best AI-ADMI it can be")

- **Slice 5, the band:** built as designed, with the wait-for-the-player clock and the
  make-room rule. Phrases follow the band's progression when the band is on.
- **MIDI out** (brought forward from "later"): every note as MIDI with its part's channel;
  player-only or everything; built-in sound optional; All Notes Off on Stop and Mute.
- **Fill and Evolve as control counters** (fader roles), so a counter on the board can set
  them like volume or tempo — the `fill` fader role the design asked for, plus `evolve`.
- **Session log** with note origins, board changes and attributed setting changes, saved
  as JSON or CSV. This is the evidence base for the musical-agency question.
- **Visuals for what is only heard:** phrase ownership bands (the "soft band" from part
  B), "Band joins / stops" and "New sounds" on the board, and the "Now:" line marking
  phrases and fill.
- **iPad reach calibration** per player (principle 4 applied to the strips).
- **Help and cheat sheet** updated for all of the above; iPad and MIDI live under a
  "Connections" section on the Sound tab.
- **Still not built:** world Preview; slice 3 (new samples); the chord-aware Magenta
  model; naming phrases in the "Now:" line; Lo-fi crackle.

## Performing (2026-10-07)

User: *"improve as much as we can for a live performance and make it easier to presave
loops etc. maybe the ipad would be helpful for this."*

- **Launched loops** (`src/songs/performance/launcher.ts`, engine `setLaunchedLoops`):
  a saved loop plays with nothing on a pad, from the laptop or the iPad, and starts or
  stops **at the next pass** so a tap is never off-beat. Eight launchable slots; the pad
  bank keeps working alongside.
- **Pre-saving:** "Save board here" writes the counters as they are (while stopped too);
  **Draw** opens an on-screen loop editor (no camera); loops have names.
- **Scenes:** loops wanted + sound world, band, phrases, fill, Evolve, tempo. Save from
  now, Go, Next scene (a set list). Stored per player, up to twelve.
- **iPad "Loops & scenes" page:** eight loop pads with state, four scene pads, Next
  scene, Stop all. New messages `loop`, `scene`, trigger `stopAll`; state carries loops
  and scenes.
- **Not done:** fading a loop out; a count-in; keyboard shortcuts for launching on the
  laptop; more than four scene pads on the iPad (the laptop list has them all).

## Fades and the iPad for imprecise fingers (2026-10-07)

- **Launched loops fade** in and out over 0 / 0.5 / 1 / 2 passes (`loopFadePasses`, per
  player; engine `setLaunchFade`). The fade is in each note's loudness, so it works for
  every part alike; a loop wanted again while fading comes straight back to full.
- **iPad, per player:** which strips and pads are shown (fewer = bigger), locked strips,
  strip mode (jump / follow, with the reach as the follow gain), two-tap Stop all, palm
  rejection by touch width, wider gaps and a clear margin at the bottom edge.

## The performance clock, endings, capture and loop colours (2026-10-07)

- **Clock** (`src/songs/performance/clock.ts`): length, cues (60/30/10 s), three endings
  (cue / fade / stop), start with Play or by hand. The engine's `finish(beats)` fades a
  gain after the mix from the next pass boundary and reports when done; `cancelFinish`.
- **Scenes at a time** (`Scene.at`): the clock recalls them. **Capture**: board → first
  free slot, launched. **Loop colours** (`role: 'loop'`, `channel.loopSlot`;
  `performance/loopColours.ts` debounce; the runtime reports presence per slot): a
  counter anywhere on the board plays its loop, hold or toggle.
- The iPad shows the countdown (amber in the last minute, red after), and has End piece
  (two taps) and Capture on the Loops page.

## Endings chosen in advance (2026-10-07)

User: *"Could we choose before the performance how it should end?"* The trigger (at the
time / when End is pressed) and the musical style are now separate, saved settings:
fade, stop, slow down (ritardando to ~55% then stop), thin out (band and fill leave;
the player's notes end it; fade over the last pass), final chord (thin, then a held tonic
chord on the band's pad and bass with a crash for one more pass). Engine
`finish(beats, done, style)`; `cancelFinish` restores tempo and sound. Old saved
`ending: 'fade' | 'stop'` migrate to `auto` + that style.

## Music, sound and AI, second pass (2026-10-07)

- **Harmony engine** (`src/songs/harmony/harmony.ts`): chords are built in real thirds
  from the board scale's seven-note parent (major pentatonic → major, minor pentatonic →
  natural minor, blues → minor, suspended → mixolydian), with each world's colour
  (Lo-fi: sevenths and ninths; Ambient: sus2 on I and IV, add9 elsewhere; Warm: a
  seventh on V; Electronic: triads), voiced near a register centre or voice-led from the
  previous voicing. Every chord has a symbol Magenta parses, checked against tonal in a
  test over every key, scale and world. Used by: chord counters (phrases and one-note
  stabs), the band's progression and pad (voice-led, with the pad's last voicing kept
  in the engine), the bass (chord thirds and fifths), the final chord.
- **Phrases:** six motifs per world (was three); a drum fill in the last bar of every
  fourth pass; bass lines use the chord's third.
- **Sound:** synth layers rebuilt — plucks and basses on MonoSynth with a filter
  envelope, pad and supersaw through a slow chorus, a sub with a soft click; the shared
  reverb's length and pre-delay follow the world (Lo-fi 1.4 s plate, Ambient 6.5 s hall)
  and are regenerated on a world change.
- **AI:** Magenta's chord-conditioned `chord_pitches_improv` is used whenever the chords
  are known (the progression spelt per beat over seed and continuation); three tries at
  different temperatures, a small critic keeps the best (chord tones on the beat,
  stepwise motion, no wild leaps, not far busier than the player); `mel_2bar_small`
  (MusicVAE) loads in the background and every other New idea is a *variation* on the
  player's tune rather than a continuation.
- **Still open:** new samples (slice 3); GrooVAE humanisation of the drums; a preview
  per world.
