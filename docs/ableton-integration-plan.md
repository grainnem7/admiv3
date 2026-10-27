# Ableton Live as ADMI's sound engine: implementation plan

*For the Claude session that will build it. Read all of it before writing code. Repo:
`C:\Users\Dell Precision\Repos\ADMIv3`, branch `feat/board-sequencer-mode`, starting from
commit 27f48b3 or later.*

## 0. How to work

- Read `CLAUDE.md` first and follow it: TypeScript strict with no `any`, Tone.js only
  through the engine, every user-facing amount calibratable, visual feedback for every
  sound.
- Build **one phase at a time**. At the end of each phase:
  1. Run `npm run lint`, `npm run test:run`, `npm run test:e2e` and `npm run build`.
  2. Show the user what changed and what to try.
  3. **Ask before committing and before starting the next phase.**
- Before Phase 1, give the user a short file-by-file plan, then wait for "go".
- Test servers:
  - Always set `ADMI_DATA_DIR` to a temporary folder.
  - Never use port 3001, which is the user's own running server.
  - Never touch `.admi-data`.
- Subagents, if you use any: Opus or Sonnet only, never Haiku.
- Never commit `.claude/settings.local.json` or `public/rootCA.pem`.
- Plain language in everything the user sees. They are a researcher and performer, not a
  programmer. The player, Tim, has cerebral palsy, and the instrument is used in a live
  7-minute performance.

## 1. Goal and principles

**Ableton Live 12 Suite becomes the sound engine. ADMI stays the brain.** These all stay
exactly where they are in ADMI:
- the board and camera;
- loops, scenes and the piece clock;
- Magenta and the rule-based generation;
- the iPad;
- all visual feedback.

Ableton receives MIDI and makes the sound. Nothing generative moves into Ableton.

Non-negotiables:

1. **A show can never go silent because of Ableton.** If the MIDI port vanishes, ADMI's
   own sound comes back by itself, and the screen says so.
2. **The piece never runs over its length** (7:00), in Ableton mode too. Silence by the
   end time includes Ableton.
3. **Latency:** counter → sound stays under 20 ms of added processing. Ableton's audio
   buffer must be small (128 samples). Measure it; don't assume it.
4. **Visual feedback is untouched.** ADMI still draws every note it sends.
5. **ADMI's own sound is one press away at all times** (Sound from → ADMI).

## 2. What already exists (read these)

**MIDI out:** `src/midi/boardMidi.ts`
- Every fired note is converted to MIDI and timestamped ahead: audio time is turned into
  a `performance.now()` time by `audioTimeToPerformanceMs`.
- Channels: melody 1, bass 2, chords 3, drums 10.
- Drum notes use General MIDI (`src/midi/gmDrums.ts`): kick 36, rim 37, snare 38, clap
  39, hat 42, tom 45, crash 49.
- What's sent depends on `sentBy(origin, sends)`. With `'player'`, only `placed` and
  `phrase` notes go out. **Band, fill (Extra notes) and the ending's final chord are not
  sent.**
- `allNotesOffEvents` sends CC 123 only.

**Ports:** `src/midi/MIDIManager.ts` (Web MIDI) and `MIDIOutput.ts`.
- `getSelectedOutput()` returns the port **even when it has disconnected**, so notes
  silently vanish.

**Engine:** `src/songs/BoardSequencerEngine.ts`
- `recordFired()` calls `this.midi?.send(n, this.muted, this.midiOpts)` for every note.
- `setMidiOut`, `setInternalSound`.
- `LOOKAHEAD_SEC = 0.1`: notes are scheduled 0–100 ms ahead.
- **Mute** (`setMuted`) just stops sending new MIDI. Notes already sent keep sounding.
- **Endings** fade ADMI's own audio with `endGain`, which MIDI never sees.
  - The Thin ending drops notes, which does work over MIDI.
  - The Final chord is sent as a band note, so today it is not sent at all.

**Settings:**
- `useBoardRuntime.ts` → `applyEngineSettings()` passes settings to the engine.
- Config fields: `midiEnabled`, `midiDeviceId`, `midiSends` ('player'|'all'),
  `midiKeepSound` (`src/profiles/BoardSequencerConfig.ts`).
- Rig vs player split: `RIG_FIELDS` in `src/profiles/BoardProfiles.ts`.

**UI:**
- `src/ui/screens/boardSequencer/components/BoardMidiPanel.tsx`, on the **Connections**
  tab. Its comment wrongly says the Sound tab; fix it.
- `play/SoundTab.tsx`: the colour cards and Overall feel.
- The Ready check is `readyItems()` in `BoardSequencerScreen.tsx`, shown by
  `play/ReadyCheck.tsx`.

**Tests:** `src/__tests__/boardMidi.test.ts` (mock patterns), `e2e/*.e2e.ts` (Playwright;
helpers in `e2e/app.ts`).

**Chrome facts:**
- `MIDIOutput.clear()` is not implemented, so notes already queued with a future
  timestamp cannot be cancelled.
- Ableton instruments don't reliably honour CC 123 (All Notes Off). Release notes with
  explicit Note Offs.

**Ableton facts:**
- Ableton's own instruments (Wavetable, Drift, Meld, Operator, Sampler, Drum Rack) **do
  not respond to CC 7 or CC 11 unless the CC is MIDI-mapped**.
- Program Change cannot be MIDI-mapped to an Instrument Rack's chain selector; a CC can.
- Track input is chosen per track: MIDI From = "ADMI", channel N, Monitor = In.
- A port's **Track** switch must be on to play tracks; **Remote** must be on for MIDI
  mapping. **Sync** on is for clock (Phase 3).

## 3. Decisions already made (don't re-ask)

1. **"Sound from: ADMI / Ableton / Both"** is stored as the existing two flags:
   - ADMI: `midiEnabled=false`;
   - Ableton: `midiEnabled=true`, `midiKeepSound=false`;
   - Both: `true`, `true`.
2. **Port returns mid-piece:** stay on ADMI's own sound, and show a button "Ableton is
   back — switch to it". The sound must never jump twice in a show.
3. **Per-colour channels are fixed per colour**, never by board order. A stored
   `midiChannel` on each rig channel, auto-assigned the first time per-colour mode is used
   (lowest free of 1–9 and 14–16; 10 is drums and 11–13 are the band and Extra notes, see
   4.3), and editable on the Connections tab. More sounding colours than free channels:
   say so plainly and let extra colours share. Moving or adding colours must never change
   existing routing.
4. Per-colour mode and the "send early" amount are **rig** settings: the Ableton Set
   belongs to the laptop.
5. **MIDIManager is shared, so add, don't change.** `getSelectedOutput()` is also used by
   `MIDIOutput.ts` and `MIDIMonitor.tsx`, so it stays as it is. Add
   `getConnectedSelectedOutput()` (null unless the port's state is 'connected') and
   `isSelectedConnected()` beside it, and use them only from `boardMidi.ts`. Subscribe
   through MIDIManager's existing `onstatechange` handler (MIDIManager.ts:56); don't add a
   second listener. Nothing outside the Board Sequencer changes behaviour.
6. **The Volume control counter is in Phase 1:** CC 7 on **channel 16** (a dedicated
   "whole instrument" channel), sent on change only, mapped once in the template to
   Ableton's Master volume. CC 11 stays for fades and Mute. The Tone, Reverb and Delay
   counters are Phase 2 (with the other CCs), and the Tempo counter is Phase 3. Until then,
   in Ableton mode, they say "Sound set in Ableton". Fill and Evolve counters already work,
   because they change the notes.
7. **Check the scale between ADMI and Ableton.** Ableton 12 has a global scale feature.
   ADMI sends plain pitches, so leave Ableton's scale off. The guide must say so: a
   global scale in Ableton would bend ADMI's notes.

## 4. Phase 1: Ableton plays everything ADMI plays

### 4.1 Sound from, and the fallback
- On the Connections tab, at the top: **"Sound from: ADMI / Ableton / Both"** as a large
  SegmentedControl. It works while playing.
- Pure helpers in `boardMidi.ts`:
  - `soundFromToConfig(choice)` and `configToSoundFrom(cfg)`.
  - `effectiveSound(cfg, portConnected)`: if Ableton or Both is chosen but the port isn't
    connected, ADMI's own sound plays. This reaches the engine through
    `applyEngineSettings`, so it works even while the camera has stalled.
- `MIDIManager`:
  - `isSelectedConnected()`;
  - `getSelectedOutput()` returns null for a port whose `state !== 'connected'`;
  - listens for `statechange`.
- Losing the port mid-piece:
  - banner "Ableton's port has gone, so ADMI is playing its own sound.", until dismissed;
  - a session-log entry;
  - when the port returns, the "Ableton is back — switch to it" button.

### 4.2 Releasing notes properly (no stuck notes)
- `BoardMidiSender` keeps a list of notes **sent whose Note Off is still in the future**
  (channel, pitch, off time).
- `releaseAll()` sends an explicit Note Off for each now, then CC 123 and CC 120 on every
  channel in use, then repeats everything once ~120 ms later. The repeat catches notes
  that were queued ahead and landed after the first release.
- Call it on Stop, the end of a piece, Mute, a Sound from switch, a channel-mode switch,
  and a port change.
- **Panic** button (the same, louder in intent) on the Connections tab and in Show.

### 4.3 What is sent in Ableton / Both modes
**Everything the board plays**, not just the player's notes. Otherwise the band, the
Extra notes and the final chord are silent in Ableton-only mode. Default channels:

| Part | Channel |
|---|---|
| Melody | 1 |
| Bass | 2 |
| Chords | 3 |
| Drums (the player's, loops', band's) | 10 (GM notes) |
| Band chords / pad | 11 |
| Band bass | 12 |
| Extra notes (Magenta/rules fill), melodic | 13 |
| Extra notes, drum hits | 10 (velocity already lower) |

- The final chord of the "Final chord" ending goes on 11/12 like the band, plus a crash
  on 10.
- In per-colour mode: each colour on its fixed channel. Band, fill and drums as in the
  table.
- Keep `midiSends` for the "ADMI makes the sound, MIDI is extra" case (Both). In Ableton
  mode, treat it as `'all'`.

### 4.4 Endings, Mute and volume over MIDI
ADMI fades its own audio, so mirror that over MIDI:
- **Velocity:** during an ending fade (and a loop's fade in/out, already done by
  velocity), scale velocities by the same factor. This works on every instrument with no
  setup.
- **Expression:** also send **CC 11** on every channel in use, ramped in ~50 ms steps:
  - fade → down to 0 by the end;
  - Mute → 0 at once, then release the notes;
  - Play and Cancel the ending → 127.
  The template maps CC 11 per track to a **Utility** device's Gain (section 4.8 says how).
  Without the mapping, velocity still does most of the work.
- **The piece must still be silent by its length in Ableton mode.** The hard-stop
  backstop (`decideClockTick().hardStop`) must call `releaseAll()` as well as ADMI's
  fade.

### 4.5 Honest controls
In Ableton mode:
- Controls that only change ADMI's own sound show "Sound set in Ableton" instead of
  silently doing nothing. That covers colour-card sound pickers, Loud, Bright and Space,
  World, Overall feel's Space, Studio mix and the Advanced mix.
- Energy still applies (it changes velocity), and so do Groove, Extra notes, Band and
  Sounds change, because they change the notes.
- Colour cards show "MIDI ch N".

### 4.6 Timing
- **"Send early by"**, 0–40 ms, default 0. Notes are scheduled at most 100 ms ahead, and
  checked every few tens of milliseconds, so more isn't reliable.
  - Implement it as `out.send(data, Math.max(now, atMs - lead))`.
  - Clamp it, and say what it is for: in Both mode, so ADMI and Ableton land together.
- **"Play test note"** sends one MIDI note and plays ADMI's click at the same scheduled
  moment, and flashes on screen. Written steps alongside:
  1. Set Ableton's buffer to 128 samples.
  2. In Both mode, listen for a double hit (a flam).
  3. Nudge the slider until the two land together.
  4. Then switch to Ableton.

### 4.7 Ready check and help
Ready check:
- ok "MIDI port ADMI connected"
- warn "A port is chosen but Sound from is ADMI"
- **problem** "Sound from is Ableton and the port is missing", with the fix "Open loopMIDI,
  check the ADMI port is there, then choose it on the Connections tab."

The Ready check cannot know that Ableton is receiving, because MIDI is one-way. Say
"port connected", and point to the test note.

Also update `docs/board-sequencer-cheat-sheet.md` (keep it to one page) and
`src/ui/components/board/BoardHelp.tsx`.

### 4.8 `docs/ableton-setup-guide.html`
For a facilitator, not a programmer. loopMIDI is already installed. Cover:
1. **loopMIDI:** open it, make or check a port called **ADMI**, tick "start with
   Windows". Start loopMIDI **before** Chrome.
2. **Ableton → Preferences:**
   - Audio: buffer **128 samples**, and the right audio device.
   - Link/Tempo/MIDI: ADMI port, Input **Track On**, **Remote On** (for mapping). Sync
     stays off until Phase 3.
3. **The template Set**, saved as "ADMI template":
   - MIDI tracks for channels 1, 2, 3, 10, 11, 12, 13, each with MIDI From = ADMI, its
     channel, Monitor = In.
   - Suggested Suite sounds for each ADMI world (Warm, Lo-fi, Ambient, Electronic), and a
     **Drum Rack** on 10, whose default pads match General MIDI (C1 = 36 kick…).
   - A **Utility** device at the end of each track, its Gain MIDI-mapped to CC 11 on that
     track's channel: press Ctrl+M, click Gain, send a test fade from ADMI.
   - The Master track's volume MIDI-mapped to CC 7 on channel 16 (move the Volume counter,
     or use the test control on the Connections tab, while in Ctrl+M).
   - Leave Ableton's global scale **off**.
4. Per-colour channels: how to add a track per colour.
5. The latency check (section 4.6).
6. A show-day checklist, and **"if Ableton freezes or crashes: press ADMI under Sound
   from"** (ADMI also switches by itself if the port goes).

### 4.9 Phase 1 tests
**Unit** (follow `boardMidi.test.ts`):
- Sound-from mapping both ways, and the fallback rule.
- Channel assignment:
  - per part;
  - per colour, fixed and auto-assigned, skipping 10–13 and never reassigned when colours
    change;
  - band, fill and final chord channels.
- Ableton mode sends band and fill notes; 'player' in Both still filters.
- `releaseAll()`: a Note Off for every sounding note, nothing twice, the repeat after
  120 ms, CC 123 and CC 120.
- Endings: velocity scaled through a fade, and the CC 11 ramp hits 0 by the end and
  returns to 127 on Play and Cancel.
- Mute releases notes and sends CC 11 = 0.
- The Volume counter sends CC 7 on channel 16, on change only.
- MIDIManager: the new connected-only methods return null for a disconnected port, and
  `getSelectedOutput()` behaves exactly as before.
- Send-early shifts timestamps and is clamped.
- The engine releases notes on a mode switch mid-play.
- Config sanitiser defaults; rig/player split of the new fields.

**Browser** (`e2e/`):
- A fake `navigator.requestMIDIAccess` with an "ADMI" output, injected by
  `page.addInitScript`, recording what was sent.
- Switching Ableton → ADMI → Both while playing sends releases.
- Removing the fake port shows the banner and the Ready check problem.
- **A 40-second piece in Ableton mode is silent by 0:40**: every Note On has its Note
  Off, and CC 11 reaches 0.

**Done when:** all of the above pass, plus lint and build, and the user has heard ADMI
play through Ableton on their laptop with the test note in time.

## 5. Phase 2: ADMI's sound choices carry over to Ableton

*Do this straight after Phase 1 is approved. The user asked for it: "Can we not improve it
to connect better and carry over choice?" In Ableton mode today the sound pickers vanish
and Ableton plays whatever is on each track.*

### 5.1 The idea
Each Ableton track (one per channel) holds an **Instrument Rack** whose chains are ADMI's
sounds, played by Suite's better instruments. ADMI picks the chain with a MIDI CC, so:
- a colour card's sound picker;
- the World;
- a scene's World (and Evolve's instrument changes)

all switch Ableton's sound too. Every chain is already loaded, so switching is instant
and safe mid-performance. It is all plain MIDI: no new software in Ableton.

(Loading Ableton presets by name through a remote script was considered and rejected for
now. Loading takes a moment and can click or drop out mid-show. It may come back for
rehearsal preparation with Phase 4.)

### 5.2 The chain list (fixed: the same on every track)
*Changed 2026-10-27 by docs/superpowers/specs/2026-10-27-ableton-every-sound-design.md: 33 chains, one per ADMI sound; CC 30 is the middle of each chain’s equal share (drums keep × 8); each track fills only the chains it can reach, the rest hold a placeholder.*

**CC 30 on the track's channel chooses the chain**: value = chain index × 8. Each chain's
zone in the Rack's chain selector is `index*8 … index*8+7`.

| Index | CC 30 value | Chain | What ADMI means by it |
|---|---|---|---|
| 0 | 0 | World: Warm | this part's sound in the Warm world |
| 1 | 8 | World: Lo-fi | … Lo-fi |
| 2 | 16 | World: Ambient | … Ambient |
| 3 | 24 | World: Electronic | … Electronic |
| 4 | 32 | Piano | instrument key `piano` |
| 5 | 40 | Electric piano | `electricPiano` (also the "My picks" melody/chords default) |
| 6 | 48 | Harp | `harp` |
| 7 | 56 | Organ | `organ` |
| 8 | 64 | Clarinet | `clarinet` |
| 9 | 72 | French horn | `frenchHorn` |
| 10 | 80 | Strings / cello | `cello` |
| 11 | 88 | Nylon guitar | `guitarNylon` |
| 12 | 96 | Electric bass | `bassElectric` (also the "My picks" bass default) |
| 13 | 104 | Pad | `pad` |
| 14 | 112 | Chord stab | `chord` |
| 15 | 120 | Bell / pluck | synth-only sounds Evolve reaches for (bell, pluck, soft keys) |

- Put the list in one exported constant, `ABLETON_CHAINS`, in a new
  `src/midi/abletonSounds.ts`. Pure functions:
  - `chainFor(channel, cfg)` → index;
  - `chainForVoice(name or spec)` for Evolve.
- **The rule for a channel:**
  1. the colour's own instrument (`ch.instrument`) if it has one;
  2. else the World's chain (0–3) for that part;
  3. with World "My picks" and no instrument: Electric piano (5), or Electric bass (12)
     for bass.
- **Band channels 11 and 12, and Extra notes 13**, always follow the World (0–3).
- **Drums (ch 10):** CC 30 picks a kit chain by World (0–3) only. The Drum Rack chains are
  kits; the per-colour drum piece is already in the notes ADMI sends.
- **Evolve ("Sounds change")** swaps a colour's instrument at scene changes. Map each
  Evolve voice to the nearest chain:
  - by its sample key first: piano → 4, electricPiano → 5, harp → 6, organ → 7,
    cello → 10, guitarNylon → 11, bassElectric or contrabass → 12, padChoir → 13;
  - then by its synth layer: pad → 13; bell, pluck, keys → 15; sub, sawBass → 12;
    supersaw → 3.
  - Send CC 30 when Evolve swaps the voice, and the world chain again when it returns.

### 5.3 When CC 30 is sent
On a channel only when its chain changes, and in full (every channel in use) on:
- Play;
- switching Sound from to Ableton or Both;
- a port (re)connection;
- a channel-mode change;
- a **"Send sound choices to Ableton"** button on the Connections tab, for after Ableton
  is restarted.

Never every frame.

**Per-part mode** (several colours share channel 1): use the first colour of that part
(board order), and say so plainly on the card: "Shares channel 1 with Cyan: Ableton plays
one sound for both. Choose One per colour on the Connections tab to give each its own."
In per-colour mode every colour is independent.

### 5.4 The sound shaping (macros), sent on change only
| CC | Channel | From ADMI | Map in Ableton to |
|---|---|---|---|
| 24 | colour's | Loud (card) | Rack macro 1: Volume |
| 25 | colour's | Bright (card) | Rack macro 2: Brightness (a filter) |
| 26 | colour's | Space (card) | Rack macro 3: Space (reverb amount) |
| 21 | 16 | Energy | optional macro (ADMI's velocity already does most of it) |
| 22 | 16 | Space (overall) | Return A (reverb) level |
| 23 | 16 | Groove step | optional |

- Values are the card's step scaled to 0–127, with the same steps as ADMI's.
- The Tone, Reverb and Delay **control counters** send CC 25 / CC 26, and CC 27 for echo,
  on all sounding channels, so they work in Ableton too.
- A Rack's macros keep the same numbers on every chain, so switching chains keeps the
  shaping.

### 5.5 What the user sees
- **In Ableton mode the sound pickers come back** on the colour cards, as "Ableton sound:
  Harp (chain 7)". Loud, Bright and Space come back too, marked "→ Ableton macro".
- **World** works again in Ableton mode, and says it switches Ableton's chains.
- The colour chips under the board show "MIDI ch N · Harp" (the Ableton sound), not
  ADMI's own names. (Also fix the Phase 1 chips: they still show ADMI's names in Ableton
  mode.)
- **Connections tab:**
  - a "Sounds in Ableton" table: each channel, the chain it is on now, the last CC sent;
  - the "Send sound choices to Ableton" button;
  - a **template checklist**: every chain with its CC 30 zone, so the user can check
    their racks.

### 5.6 The template (`docs/ableton-setup-guide.html`, new section)
*Changed 2026-10-27 by docs/superpowers/specs/2026-10-27-ableton-every-sound-design.md: 33 chains, one per ADMI sound; CC 30 is the middle of each chain’s equal share (drums keep × 8); each track fills only the chains it can reach, the rest hold a placeholder.*

Step by step, for a facilitator:
1. On each track (1, 2, 3, 11, 12, 13, and each per-colour channel), replace the
   instrument with an **Instrument Rack**. Add the 16 chains in the order of 5.2, named
   exactly.
2. Suggested Suite instruments per chain:
   - Piano → Grand Piano;
   - Electric piano → an Electric (EP) preset;
   - Harp → a Sampler harp from the Orchestral packs, or Collision;
   - Organ → Electric organ;
   - Clarinet and French horn → Orchestral Woodwinds and Brass;
   - Strings / cello → Orchestral Strings;
   - Nylon guitar → a guitar from the Guitar & Bass pack, or Sampler;
   - Electric bass → Electric bass;
   - Pad → a Meld or Wavetable pad;
   - Chord stab → a Drift or Wavetable stab;
   - Bell / pluck → an Operator bell, or a Wavetable pluck;
   - World chains → the per-world suggestions already in the guide.
3. Show the **Chain** list and the Zone editor (the Chain select ruler). Give chain *i* the
   zone *i×8 … i×8+7*, then set the chain selector's range to 0–127.
4. MIDI-map the **Chain selector** to CC 30: Ctrl+M, click the Chain selector, then press
   "Send" in ADMI for that channel (the same Map-in-Ableton helper as Phase 1).
5. Map macros 1–3 to each chain's volume, a filter and a reverb send or amount. Then map
   CC 24/25/26 to macros 1–3 with the same helper.
6. Drums (ch 10): a Drum Rack per world (four chains) inside an Instrument Rack, with the
   chain selector on CC 30, zones 0–31.
7. Save as **ADMI template**. This is long but done once. Say so, and say it can be done
   one track at a time: a track without a rack simply ignores CC 30.

### 5.7 Phase 2 tests
**Unit:**
- `chainFor` for each rule: own instrument, world, My picks, band and fill follow the
  world, drums by world.
- `chainForVoice` for every Evolve voice name in `src/audio/evolve/evolve.ts`: each maps
  to a chain, and none is undefined.
- CC 30 is sent only on change, and in full on the listed events.
- Per-part sharing picks the first colour and reports the share.
- Macro CCs from card steps.
- Control counters send CC 25/26/27 in Ableton mode.

**Browser:** with the fake MIDI port:
- picking Harp on Cyan's card sends CC 30 = 48 on Cyan's channel;
- changing World sends the world chain on every channel without its own instrument;
- a scene with another World switches them at its time.

### 5.8 Done when
All the above pass, plus lint and build. On the user's laptop: picking a sound on a card
in ADMI changes the sound in Ableton within a beat, and a scene change switches the
World's sounds in Ableton.

## 6. Phase 3: one tempo
- Optional **MIDI clock** out (24 per quarter note), plus Start (0xFA) and Stop (0xFC),
  so Ableton follows ADMI's tempo: scene tempo changes, and the Slow-down ending.
- Schedule the clock ticks from the **audio clock** with the same timestamp conversion
  as notes, never `setInterval` timing.
- Off by default. The guide says: Sync On for the ADMI port, Ableton's tempo "Ext", and
  "MIDI Clock Sync Delay" to line up.
- Tests: tick spacing for a tempo, a tempo change, Start/Stop with Play/Stop and the end
  of the piece.

## 7. Phase 4 (only if the user asks): AbletonOSC
- The free **AbletonOSC** remote script (OSC on UDP 11000/11001). Browsers can't send UDP,
  so add a small relay to ADMI's server, beside the existing `/admi-store` and the iPad
  relay. It must work under both `npm run dev` and `npm run show`.
- Uses:
  - ADMI scenes launch Ableton scenes (stems, textures);
  - arm and stop Arrangement recording with the piece clock;
  - read back Ableton's tempo and playing state for the Ready check.
- Its own plan and tests when the time comes.

## 8. Risks to keep in front of the user
- Another thing that can fail on the night: loopMIDI not started, Ableton frozen, the
  wrong port. Mitigated by:
  - the automatic fallback;
  - Panic;
  - the Ready check;
  - the guide's checklist.
- Laptop CPU: camera tracking, a browser and Ableton with heavy Suite instruments. **Do a
  full 7-minute run on the performance laptop** with the real Set before relying on it.
- Windows loopMIDI quirks. If notes stop after sleep or resume, restart loopMIDI, then
  reload ADMI.
