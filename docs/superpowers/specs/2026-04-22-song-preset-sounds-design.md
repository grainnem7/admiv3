# Song Preset Sounds — Quality & Variety Upgrade

**Status:** design approved, ready for implementation plan
**Date:** 2026-04-22

## Problem

The accompaniment voices in Song Preset mode sound dated and limited:

- **Quality.** Most non-piano instruments are served from the FluidR3_GM soundfont CDN — a General-MIDI-era library that sounds thin and artificial. The Salamander-backed piano and "bell" are the only genuinely good-sounding presets today.
- **Variety.** Each of the four colored voices (Red Chord Pad, Green Melody, Yellow Arpeggio, Orange Bass) offers only 4 presets. Several of those (Slap Bass, Stab Pad) feel wrong for the current song catalogue.
- **Song fit.** The library's single song — *Can't Help Falling in Love* (slow Elvis ballad, D Major, 67 BPM, 12/8) — is poorly served by abrasive options like Slap Bass and FluidR3 strings. A universal bank of well-chosen presets would serve future songs too.

User priority: quality first, then variety and fit. All three matter.

## Goal

Replace the existing preset catalogue with **27 higher-quality, musically well-chosen presets** across the four voices — using a mix of better free sample libraries and well-designed Tone.js synthesis — and reorganise the code so that adding, tuning, or retiring a sound is a single-file edit.

## Non-goals

- **No new voice roles.** The 4-colored-voice architecture (Red/Green/Yellow/Orange) stays exactly as it is. Yellow remains a fixed 8th-note arpeggio pattern — pattern flexibility is a future concern.
- **No new songs.** The library stays at one song; this work is about sound quality, not content.
- **No self-hosted sample packs.** All samples remain CDN-served. No large binaries added to the repo.
- **No UI redesign.** The existing preset dropdowns continue to work; they will simply show more entries.

## Approach — why this shape

Two alternatives were considered and rejected:

- **Approach A (chosen):** Quality pass + variety expansion, roles unchanged. Fixes the stated pain directly. ~1 week of work.
- **Approach B (rejected):** Also rethink Yellow into a flexible "Comp/Texture" voice with multiple pattern types. Serves a future-songs problem that doesn't exist yet. YAGNI; can be added later as a local change to one voice thanks to the catalog extraction done here.

## Audio source strategy

All free, all CDN-hosted, no self-hosted samples.

| Source | Role | Notes |
|---|---|---|
| **Salamander Grand Piano** (`https://tonejs.github.io/audio/salamander/`) | Keep. Used for Piano (Yellow). | Already in use. Excellent. |
| **nbrosowsky/tonejs-instruments** (`https://nbrosowsky.github.io/tonejs-instruments/samples/<instrument>/`) | Replaces all FluidR3_GM usage. | Significantly better than FluidR3. Instruments consumed: `violin`, `cello`, `clarinet`, `french-horn`, `harp`, `guitar-nylon`, `contrabass`, `organ`, `tuba`. |
| **Tone.js native synthesis** | New — no samples. | `Tone.PolySynth`, `Tone.FMSynth`, `Tone.MonoSynth`, `Tone.AMSynth`. Provides modern/polished sounds where sampling is a poor fit (pads, leads, sub bass, bells). |

Dropped: FluidR3_GM in its entirety. VSCO Community Edition 2 considered and dropped — not needed given the above three sources cover everything.

**Pre-merge CDN smoke check:** a small script that fetches one representative sample URL per nbrosowsky instrument we reference and asserts HTTP 200. Prevents a broken CDN path from shipping silently.

## Architecture changes

### `SynthPlayer` — new class, parallel to `SamplerPlayer`

Lives at `src/songs/voices/SynthPlayer.ts`. Co-located with a shared `Player` interface that both players implement.

```ts
interface Player {
  isReady(): boolean;
  triggerAttack(midi: number, velocity?: number): void;
  triggerAttackRelease(midi: number, duration: number, time?: number, velocity?: number): void;
  releaseAll(): void;
  dispose(): void;
}

interface SynthConfig {
  kind: 'poly' | 'fm' | 'am' | 'mono' | 'duo';
  polyphony?: number;                              // default 8, only used for 'poly'
  options?: RecursivePartial<Tone.SynthOptions>;   // forwarded to the Tone constructor
  chorusDepth?: number;                            // optional 0-1 insert Tone.Chorus (default 0)
}

class SynthPlayer implements Player {
  constructor(config: SynthConfig, destination: AudioNode);
  // ...Player methods
}
```

- `kind: 'poly'` wraps `Tone.PolySynth` with the chosen inner voice (Synth, FMSynth, AMSynth).
- `kind: 'fm' | 'am' | 'mono' | 'duo'` wraps the corresponding monophonic synth directly.
- `chorusDepth > 0` inserts a `Tone.Chorus` between the synth and destination. This single effect accounts for most of the "polish" gap between bare synthesis and modern pad/EP sounds.
- `isReady()` returns `true` immediately — synths have no load phase.

`SamplerPlayer` is updated to implement the same `Player` interface (trivial — it already has matching method shapes).

### Inline oscillator fallbacks are deleted

Each of the four voice files today contains ~20–30 lines of "if sampler not ready, build `OscillatorNode` manually" code (e.g. [ChordPadVoice.ts:189-234](../../../src/songs/voices/ChordPadVoice.ts#L189-L234)). With `SynthPlayer` always ready, synth presets simply *are* the synth — no fallback path. Net deletion of ~100 lines across the four voices.

### Preset catalogs extracted

```
src/songs/voices/presets/
├── chordPadPresets.ts      # PAD_PRESETS, PAD_PRESET_LIST, PadPreset type
├── melodyPresets.ts        # MELODY_PRESETS, MELODY_PRESET_LIST, MelodyPreset type
├── arpeggioPresets.ts      # ARP_PRESETS, ARP_PRESET_LIST, ArpeggioPreset type
└── bassPresets.ts          # BASS_PRESETS, BASS_PRESET_LIST, BassPreset type
```

Each preset is a discriminated union by `kind`:

```ts
// Example shape — chordPadPresets.ts
type PadPreset =
  | { kind: 'sampled'; name: string; sampleKey: SampleConfigKey;
      sustained: boolean; decayTC: number; gainPerNote: number; }
  | { kind: 'synth'; name: string; synthConfig: SynthConfig;
      sustained: boolean; decayTC: number; gainPerNote: number; };
```

Fields before the discriminator split describe the **sound source** (sample vs. synth); fields after describe **how the voice plays the note** (voice-specific playback params, unchanged in behaviour from today).

Exports keep their existing shape — `PAD_PRESET_LIST: { key: string; name: string }[]` etc. — so nothing in the UI or engine needs to change.

### Voice files become thinner

Each voice replaces its inline `PRESETS` record with an import and swaps between players in `setPreset`:

```ts
import { PAD_PRESETS, PAD_PRESET_LIST } from './presets/chordPadPresets';
export { PAD_PRESET_LIST };

// inside class:
setPreset(key: string): void {
  const preset = PAD_PRESETS[key];
  if (!preset) return;
  this.currentPreset = preset;
  this.player?.dispose();
  this.player = preset.kind === 'sampled'
    ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
    : new SynthPlayer(preset.synthConfig, this.filterNode);
}
```

## The preset catalogue

Each entry: `Preset Name` — source (brief character). ★ = new preset.

### 🔴 Red — Chord Pad (7, was 4)
1. **Warm Pad** — synth (PolySynth, detuned saw, slow attack, chorus, lowpass)
2. **Rhodes EP** — synth (FMSynth, classic DX7-style electric piano, chorus) ★
3. **Strings** — synth (PolySynth saw, ensemble detune, very slow attack, subtle chorus)
4. **Choir** — synth (AMSynth voice via PolySynth, gentle vibrato) ★
5. **Glass Pad** — synth (FMSynth high-harmonic sustained bell-pad) ★
6. **Organ** — sampled (nbrosowsky `organ`) ★
7. **Stab** — synth (PolySynth saw, short env)

### 🟢 Green — Melody (7, was 4)
1. **Celesta** — synth (FMSynth bell-like with vibrato) — *replaces generic "Bell"*
2. **Violin** — sampled (nbrosowsky `violin`) — *upgraded from FluidR3*
3. **Cello** — sampled (nbrosowsky `cello`) ★
4. **Clarinet** — sampled (nbrosowsky `clarinet`) ★
5. **French Horn** — sampled (nbrosowsky `french-horn`) ★
6. **Nylon Pluck** — sampled (nbrosowsky `guitar-nylon`) — *replaces FluidR3 pizzicato*
7. **Music Box** — synth (FMSynth fragile bell with vibrato) ★

### 🟡 Yellow — Arpeggio (7, was 4)
1. **Piano** — sampled (Salamander)
2. **Harp** — sampled (nbrosowsky `harp`) — *upgraded*
3. **Nylon Guitar** — sampled (nbrosowsky `guitar-nylon`) — *upgraded*
4. **Vibes** — synth (FMSynth long decay + chorus — better than FluidR3 vibraphone)
5. **Marimba** — synth (FMSynth short decay, wooden) ★
6. **Music Box** — synth (FMSynth fragile) ★
7. **Plucked Synth** — synth (AMSynth pluck, modern) ★

### 🟠 Orange — Bass (6, was 4)
1. **Upright Bass** — sampled (nbrosowsky `contrabass`) — *upgraded from FluidR3 acoustic-bass*
2. **Electric Bass** — synth (MonoSynth triangle + lowpass, fingered-Fender character) — *was sampled*
3. **Sub Bass** — synth (MonoSynth sine/triangle, deep lowpass) ★
4. **FM Bass** — synth (FMSynth punchy attack) ★
5. **Moog** — synth (MonoSynth saw + filter envelope) ★
6. **Tuba** — sampled (nbrosowsky `tuba`) ★

**Total: 27 presets, 11 sampled + 16 synth.** Slap Bass and Pick Bass are retired.

### Default presets on song load

Updated in [SongPresetEngine.ts:192-197](../../../src/songs/SongPresetEngine.ts#L192-L197):

| Voice | Default (new) | Was |
|---|---|---|
| Red | **Rhodes EP** | Warm Pad |
| Green | **Clarinet** | Bell |
| Yellow | **Nylon Guitar** | Sparkle/Harp |
| Orange | **Upright Bass** | Sub |

Rationale: the new defaults are universally-pleasing and ballad-appropriate out of the box. Users can change any of them in one dropdown click.

## Migration, files touched, and cleanup

**New files (6):**
- `src/songs/voices/SynthPlayer.ts` — new class + shared `Player` interface
- `src/songs/voices/presets/chordPadPresets.ts`
- `src/songs/voices/presets/melodyPresets.ts`
- `src/songs/voices/presets/arpeggioPresets.ts`
- `src/songs/voices/presets/bassPresets.ts`

**Modified files (6):**
- [SamplerPlayer.ts](../../../src/songs/voices/SamplerPlayer.ts) — delete `fluidR3Base`, replace FluidR3-based `SAMPLE_CONFIGS` entries with nbrosowsky URLs, implement `Player`
- [ChordPadVoice.ts](../../../src/songs/voices/ChordPadVoice.ts) — delete inline `PRESETS`, delete oscillator fallback, unify on `Player` interface
- [MelodicVoice.ts](../../../src/songs/voices/MelodicVoice.ts) — same pattern
- [ArpeggioVoice.ts](../../../src/songs/voices/ArpeggioVoice.ts) — same pattern
- [BassSynthVoice.ts](../../../src/songs/voices/BassSynthVoice.ts) — same pattern
- [SongPresetEngine.ts:192-197](../../../src/songs/SongPresetEngine.ts#L192-L197) — update default preset keys

**Net line count:** roughly −200 lines (oscillator fallbacks + FluidR3 configs) and +~350 lines (synth configs + new sample configs + catalog scaffolding). Voice classes themselves shrink.

**UI impact: none.** [SongPresetScreen.tsx](../../../src/ui/screens/SongPresetScreen.tsx) continues to read `MELODY_PRESET_LIST`-style exports and `engine.getStatus().voicePresets` with unchanged shapes. Dropdowns will show the new entries automatically.

**State persistence:** user preset choices live only in the engine's in-memory `voicePresets` Map — confirmed not persisted to profiles or localStorage. No migration needed. If implementation discovers persistence, add a fallback to default preset on unknown key.

## Verification

- **Build & type-check:** `npm run lint` (= `tsc --noEmit`) passes.
- **Tests:** `npm run test:run` passes. Add:
  - Unit tests for `SynthPlayer` — construct all five `kind` values, trigger/release, dispose without leaks.
  - Parametric test per voice catalog — every preset key in each `_PRESETS` record can be applied via `voice.setPreset(key)` without throwing.
- **CDN smoke check:** pre-merge script fetches one representative URL per nbrosowsky instrument referenced, asserts HTTP 200. Catches a dead or renamed instrument immediately.
- **Manual listening pass** (required, cannot be automated): load song, cycle each voice through every preset, confirm each is distinct and musical. The research context explicitly values musical quality, which only human ears validate. Must be in the implementation plan as a required step.

## Shipping shape

**Single PR.** A partial merge leaves voices calling removed preset keys — there is no intermediate state that works. All files ship together.
