# Vocal Harmonizer — runtime design

**Date:** 2026-05-13
**Author:** Grainne (with Claude)
**Status:** Draft — data layer done; runtime implementation deferred until parallel song-preset work lands

---

## Goal

Add a **chord-aware vocal harmoniser** to Song Preset mode that plays a synthesized harmony voice alongside the recording's vocal melody, with the user shaping the harmony interval in real time via gesture.

Modelled on TC-Helicon-style hardware harmonisers (Voicelive, etc.): the vocalist is free to sing whatever, every harmony pitch is pre-computed to fit the active chord, and the user controls *which* harmony to play (3rd / 5th / 6th / 3rd-below) and *whether* to play it at all — but cannot produce a wrong note.

## Non-goals

- Real-time DSP pitch-shifting of the playback vocals (different problem; needs a phase-vocoder in the audio graph)
- Harmonising the user's own voice (would need a microphone input and live pitch tracking)
- Generating harmony that's not chord-tone-snapped (free intervallic harmony — out of scope, would produce clashes)

## Data layer (done)

`public/songs/<id>/analysis.json` contains a new optional field, produced by [scripts/build_harmony.py](../../../scripts/build_harmony.py):

```ts
interface HarmonyEntry {
  time: number;          // start, seconds (matches a beat in beats[])
  duration: number;      // length, seconds (taken from the source vocal note)
  vocalMidi: number;     // singer's MIDI note (from pYIN melody[])
  vocalLabel: string;    // e.g. "F#4"
  chord: string;         // active chord label, e.g. "D" or "F#m"
  harmonies: {
    thirdUp: { midi: number; label: string; semitonesFromVocal: number };
    fifthUp: { midi: number; label: string; semitonesFromVocal: number };
    sixthUp: { midi: number; label: string; semitonesFromVocal: number };
    thirdDn: { midi: number; label: string; semitonesFromVocal: number };
  };
}

// Added to SongAnalysis:
harmony?: HarmonyEntry[];
```

Each `harmonies[interval].midi` is the **nearest chord-tone** to the nominal interval target. So `thirdUp` from a vocal F# over an A-major chord might resolve to A4 (chord root) rather than literally A#4 (the strict major-3rd-above), because A is in the A-major triad and A# isn't.

Pipeline that produces this:

1. `analyse_song.py <id>` — beats, downbeats, key (librosa)
2. `import_chordino_csv.py <id>` — chord segments + auto-lag-shift (Sonic Visualiser → Chordino on `other.mp3`)
3. `import_pyin_csv.py <id>` — melody notes (SV → pYIN: Notes on `vocals.mp3`)
4. `build_harmony.py <id>` — combine the two into `harmony[]`

All four scripts are reproducible CLIs; no runtime code reads them.

## Runtime integration

### Integration point: green Melody Notes baton, new "Harmonizer" mode

The parallel song-preset work has already added a per-baton mode system (commit `4449996` *songPreset: per-baton mode (parameter | instrument) with persistence*). The harmoniser slots in as a new mode for the green baton:

| Green mode | Behaviour today | Behaviour after |
|---|---|---|
| `pentatonic` (default) | D-major pentatonic, gesture-triggered notes | unchanged |
| `harmonizer` (new) | — | reads `harmony[]`, plays the harmony note matching the current playback time and gesture-selected interval |

No new colour role required. No change to the `SongConfig` schema. Just one new mode-enum value and one new voice implementation behind it.

### Voice implementation

A new class — recommend `HarmonyVoice` extending `VoiceBase`, sibling of `MelodicVoice` etc. — that:

1. **At song load**: receives `analysis.harmony` if present; builds a binary-searchable index by `time` (same pattern as `getChordAtTime` in [chordLookup.ts](../../../src/songs/voices/chordLookup.ts))
2. **Per frame** while song is playing:
   - Find the harmony entry active at `Tone.Transport.seconds` (binary search)
   - Read the gesture-controlled interval choice (`thirdUp` / `fifthUp` / etc.) from a Zustand store value or directly from the green-baton mapping node's output
   - Resolve `harmony.harmonies[interval].midi`, convert to Hz via `noteToFrequency`
   - Schedule a synth note (use existing `SynthPlayer` infrastructure — same Tone.PolySynth wrapping pattern as the other voices)
3. **On chord change**: glide / release / re-attack according to standard voice behaviour
4. **When `harmony[]` is absent**: behave as a no-op; never throw

### Gesture mapping

Configurable, but a sensible default that fits the ADMI's "tolerance over precision" principle:

| Axis | Mapped to |
|---|---|
| Green object hand-height (Y) | interval choice: split into 4 vertical zones — bottom → `thirdDn`, low-mid → `thirdUp`, high-mid → `fifthUp`, top → `sixthUp` |
| Green object presence | harmony on / off (intentional engagement; same as other voices) |
| Optional: hand-width or other-hand-position | harmony voice volume relative to the vocal stem |

The 4-zone Y-axis split means the user has *expressive choice* among the four harmonies but cannot produce a non-chord-tone — every zone is musically safe. This matches the existing `ZoneMappingNode` pattern used elsewhere in the codebase.

Alternative simpler default for facilitator setup: a single fixed interval (e.g. always `sixthUp`) with hand-height controlling volume only. Configurable per song or per session via the song-preset facilitator UI.

### Audio routing

Reuses existing infrastructure:

- Harmony voice uses the same `SynthPlayer` + Tone.PolySynth pattern as `MelodicVoice` and `BassSynthVoice`
- Preset selection: a new entry in `src/songs/voices/presets/` — recommend a vocal-like preset (sine + sawtooth blend, formant filter if available) so the harmony sits *under* the vocal rather than competing
- Routed through the same `EffectChainManager` mix bus as the other generated voices, so global FX / volume still apply

## Accessibility considerations

(per [CLAUDE.md](../../../CLAUDE.md) research-context guidance)

1. **Tolerance over precision** — every gesture position produces a musically valid harmony; there are no "wrong" positions. The 4 vertical zones can be wide and forgiving.
2. **Musical agency** — the user's hand height genuinely shapes the harmony interval moment-to-moment. The harmony pitch *changes* in response to gesture, not just volume.
3. **Latency** — no new latency; harmony pitch lookup is a precomputed binary search, runs in microseconds.
4. **Visual feedback** — the chord-following voices already cycle through chords visibly; the harmony pitch can be drawn alongside the chord display (e.g. a single bright note line per frame). For Deaf/HoH users, the harmony note's pitch can also be rendered as a colour or position on screen.
5. **Calibrable thresholds** — the Y-axis zone boundaries should be tunable in the calibration session (same as existing zone-based mappings). For users with restricted vertical range, reducing to 2 zones (low harmony vs high harmony) or even 1 zone (fixed interval, volume only) should be a facilitator setting.

## Edge cases

| Case | Behaviour |
|---|---|
| `analysis.harmony` is missing | Mode picker still allows selecting "Harmonizer" but the voice is silent. No error. |
| Playback time has no active harmony entry (gap between vocal phrases) | No note scheduled; voice rests until next harmony entry |
| Chord changes mid-harmony-note | Harmony note re-triggers on the next vocal-note boundary, not mid-note (avoid mid-syllable pitch jumps) |
| User switches green baton mode mid-song | Pentatonic notes release; harmony voice takes over from the next harmony entry boundary |
| Two harmony entries with same `time` (shouldn't happen but defensive) | First one wins |

## Open questions for the implementing agent

1. **Single-pitch vs stacked harmony.** Does the voice ever play *two* harmony pitches at once (e.g. 3rd + 5th stacked = chord), or always one? Single is simpler and matches the typical Voicelive default. Stacked could be a separate "stacked harmony" mode.
2. **Preset choice.** Which synth preset best supports the harmony role — sits under the lead vocal, doesn't fight for frequency space. Probably a soft pad-like preset, not the bright pluck used for pentatonic mode.
3. **Should the harmony voice also play during gaps in `vocalMidi`** (instrumental sections of the song)? Default: no — silent during instrumental breaks. Alternative: continue with the last harmony pitch sustained.
4. **Volume relative to the vocal stem.** Auto-balance, or always at unity gain and let the user shape it via gesture? Probably the latter — gives the user agency.

## Implementation rough sizing

Single new file `src/songs/voices/HarmonyVoice.ts` of ~150–200 lines (mirroring `MelodicVoice.ts` structure), plus:

- One new entry in `src/songs/voices/presets/` (~30 lines)
- A new mode-enum value + dropdown option in the per-baton mode UI (touches the parallel agent's in-flight files; coordinate)
- A few lines in `SongPresetEngine.ts` to instantiate `HarmonyVoice` when green mode = harmonizer (also parallel agent's territory)
- Optionally a `src/__tests__/HarmonyVoice.test.ts` with vi.mock for Tone.js

Probably half a day of focused work for someone who's been close to the song-preset code recently.

## What's done

- [x] All scripts in `scripts/` to produce `harmony[]` from stems
- [x] SATF: full pipeline run; 186 harmony entries; data committed
- [x] This design doc

## What's deferred (waiting for parallel work to land)

- [ ] `HarmonyVoice.ts` implementation
- [ ] New mode value + mode-picker integration
- [ ] Gesture mapping configuration
- [ ] Facilitator-UI options for tuning zone count and default interval
- [ ] ENS and SCK: stems + plugin runs + harmony build (same recipe as SATF; mechanical)
