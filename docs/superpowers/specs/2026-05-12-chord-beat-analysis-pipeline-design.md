# Reproducible chord/beat analysis pipeline for the ADMI

**Date:** 2026-05-12
**Author:** Grainne (with Claude)
**Status:** Draft — awaiting review

---

## Problem

The ADMI runtime consumes `analysis.json` files via [src/songs/analysisLoader.ts](../../../src/songs/analysisLoader.ts) and [src/songs/songLibrary.ts](../../../src/songs/songLibrary.ts), but the existing `public/songs/cant-help-falling-in-love/analysis.json` was produced ad-hoc. There is no script in the repo that reproduces it, so when the audio or pipeline changes the file cannot be regenerated.

The current file also has internal disagreements:

- Declares `timeSignature: "4/4"` and `bpm: 68`
- The song is actually 12/8 at ~67 BPM (see hand-authored [CANT_HELP_CHORDS](../../../src/songs/voices/chordLookup.ts))
- The "4/4 @ 68 BPM" beat grid is the quarter-note subdivision of 12/8 — the tracker has not locked onto the dotted-quarter pulse the music is felt in
- Chord `time` and `duration` values do not align to the `beats[]` grid (e.g. duration `1.648` mid-beat)
- Some labels (e.g. `C#`) appear bare where the hand-authored progression uses `C#7` — extension information was lost before it was written

## Goal

A reproducible, offline Python preprocessing script — `scripts/analyse-song.py` — that takes a song's stems and produces a beat-quantised `analysis.json` in the exact shape the runtime already consumes. No TypeScript runtime changes. No cloud dependency. No browser-side Python.

Framing: this is an **automatic transcription with human review** pipeline. The researcher runs the script, inspects the audit output, hand-corrects edge cases (e.g. the bridge's `C#` vs `C#7`), and commits the result.

## Non-goals

- End-user-facing "drag-and-drop a new song" feature (that needs stem separation, a Python backend, and a song-library UI — a separate project)
- Modifying [src/songs/analysisLoader.ts](../../../src/songs/analysisLoader.ts), [src/songs/songLibrary.ts](../../../src/songs/songLibrary.ts), or [src/songs/voices/chordLookup.ts](../../../src/songs/voices/chordLookup.ts)
- Cloud-based or neural-network chord recognition
- Real-time / runtime chord detection in the browser
- Source separation (Demucs etc.) — bring your own stems

## Output schema (hard contract)

Must exactly match the `SongAnalysis` interface at [analysisLoader.ts:21-30](../../../src/songs/analysisLoader.ts#L21-L30):

```ts
{
  title: string;
  artist: string;
  bpm: number;
  timeSignature: string;
  key: string;
  beats: number[];
  downbeats: number[];
  chords: { time: number; duration: number; label: string }[];
}
```

Chord labels must match the regex at [analysisLoader.ts:52](../../../src/songs/analysisLoader.ts#L52):

```
^([A-G][#b]?)(m|7|m7|maj7|dim|aug)?$
```

Anything that doesn't match is silently dropped by the runtime — the script must normalise to this vocabulary before writing. The script also runs every label through the same regex as a pre-flight check and aborts on mismatch.

The runtime collapses `m7→minor`, `maj7→major`, `dim/aug→major` for voicing purposes, but the on-disk vocabulary keeps the full set because (a) it's audit-friendly for the researcher and (b) the loader passes the original `label` string through as the chord's display `name`.

## Library stack

User-approved (2026-05-12) — **Option A: pure librosa with chord template matching**.

- **librosa 0.10.2.post1** — beat tracking, BPM, chroma features (CQT-based), key detection
- **numpy** — chroma maths, template correlation
- **soundfile** — audio IO (already a librosa transitive dependency)

All pip-installable in a Python 3.11 or 3.12 venv on Windows. No Java, no Vamp, no Sonic Annotator, no TensorFlow, no model checkpoints. Total install footprint ~80 MB.

Trade-off accepted: lower raw chord-recognition accuracy than a CNN-based ACR. Mitigated because:
1. The runtime's vocabulary collapses every chord into one of {major, minor, dom7}; a CNN's edge on extended harmony is wasted
2. Researcher hand-review of audit output is part of the workflow
3. Template matching gives transparent per-beat similarity scores that the researcher can audit when a label seems wrong

## Pipeline (8 stages)

### 1. Locate & load audio

- Resolve `public/songs/<song-id>/` from the CLI arg
- Load `drums.wav` for beat tracking and `other.wav` for chord recognition if both exist
- If a stem is missing, fall back to a sum-mix of whatever stems do exist; if no stems at all, fall back to `mix.wav` or `full.wav`
- Sample rate: librosa default `22050 Hz` (sufficient for both beat and chord analysis at this scale)
- Record `audio_duration` from the chord-recognition stem (used to compute the last chord's `duration`)

### 2. Beat tracking

- `librosa.beat.beat_track(y=beat_signal, sr=sr, start_bpm=...)` returns BPM + beat frame indices
- Convert frames to seconds with `librosa.frames_to_time`
- Output: `beats: number[]` and detected `bpm: number`
- `--bpm` flag overrides `start_bpm` (researcher hint when the song is in unusual meter)

**Meter sanity check** (when no `--bpm` is given):
- Compute median inter-beat interval
- Compute three candidate tempos: detected, detected/2, detected×2/3 (the dotted-quarter ↔ quarter relationship in 12/8 vs 4/4)
- For each candidate, re-run `beat_track` with that as `start_bpm` and `tightness=100`
- Score each by mean onset-envelope value at predicted beat times
- Pick the highest-scoring candidate, but only if score advantage over the original is >10%; otherwise keep the original detection (avoid thrashing on close calls)
- The check is purely advisory — `--bpm` always wins

### 3. Downbeat derivation

- Every Nth beat from `beats[0]`, where N = `--beats-per-bar` (default 4)
- Rationale: librosa's downbeat detector (`librosa.beat.plp` family) is unreliable for slow ballads. A fixed-N stride is predictable, matches the researcher's meter override exactly, and is auditable.
- For 12/8 ballads with `--beats-per-bar 4`, this gives four dotted-quarter pulses per bar — correct downbeat grid

### 4. Key detection

- Compute mean chroma vector over the harmonic-content stem using `librosa.feature.chroma_cqt`
- Correlate against Krumhansl-Schmuckler major and minor key profiles for all 24 keys
- Pick the highest correlation; output as `"<Tonic> Major"` or `"<Tonic> Minor"`
- `--key` flag overrides

### 5. Beat-synchronous chroma

- Compute frame-level `chroma_cqt` on the chord stem
- Aggregate to beat-synchronous chroma using `librosa.util.sync(chroma, beat_frames, aggregate=np.median)`
- Median (not mean) is more robust to onset transients leaking into chroma bins
- Result: one 12-vector per beat, plus one for the audio span before `beats[0]` (the pre-roll, dropped — chord recognition only emits labels for actual beats)

### 6. Template matching (chord recognition)

**Template bank** — 7 chord qualities × 12 roots = 84 templates plus one "no-chord" (N) silence template (all-zero magnitude, used to detect very quiet sections).

| Quality | Intervals (semitones from root) | On-disk suffix |
|---|---|---|
| Major | 0, 4, 7 | `''` |
| Minor | 0, 3, 7 | `m` |
| Dominant 7 | 0, 4, 7, 10 | `7` |
| Minor 7 | 0, 3, 7, 10 | `m7` |
| Major 7 | 0, 4, 7, 11 | `maj7` |
| Diminished | 0, 3, 6 | `dim` |
| Augmented | 0, 4, 8 | `aug` |

Each template is a 12-vector with `1.0` at the chord tones and `0.0` elsewhere, then L2-normalised.

**Matching for each beat:**
1. L2-normalise the beat's chroma vector
2. If its un-normalised magnitude is below a silence threshold (`< 0.05` of mean magnitude across all beats), emit `N`
3. Otherwise, compute cosine similarity against all 84 templates
4. Apply triad bias: multiply major/minor similarities by `1.05` to suppress over-eager 7-chord detection caused by sympathetic resonance on the b7 bin (e.g. a clean D triad has detectable energy at C from drum cymbal harmonics, falsely boosting D7)
5. Pick argmax; if max similarity < `0.6`, emit `N`
6. In `--verbose` mode, log the top-3 candidates with their similarity scores for that beat

Output of stage 6: a list of `(beat_time, raw_label)` pairs, one per beat, where `raw_label` is already in the supported vocabulary (e.g. `"D"`, `"F#m"`, `"C#7"`).

### 7. Smoothing (min-duration filter, anti-flicker)

- Walk the per-beat label sequence; identify runs of identical adjacent labels
- A run is "short" if it spans fewer than `--min-chord-beats` beats (default 1, which is a no-op; raise to suppress oscillation)
- Short runs are replaced label-wise with whichever neighbour has the greater total beat-count. Ties go to the left neighbour. If the run is at the very start/end, use the only available neighbour.
- Repeat until stable (typically 1–2 passes)
- `N` (no-chord) runs are treated identically: short `N` runs get absorbed by neighbours; long `N` runs are preserved and emitted as silence gaps

### 8. Emit beat-aligned chord list

- Merge adjacent identical labels into runs
- For each merged run: `time = beats[start_idx]`, `duration = beats[start_idx + length] - beats[start_idx]` if there's a next chord, else `audio_duration - time` for the final chord
- Drop any `N` segments — they become implicit silence gaps (the runtime treats absence of a chord as no chord)
- Every emitted `time` is guaranteed to be an exact value in `beats[]` (the script asserts this before writing)

## CLI

```
python scripts/analyse-song.py <song-id> [options]

Required:
  <song-id>                  Directory name under public/songs/
                             (e.g. cant-help-falling-in-love)

Metadata (preserved from existing analysis.json if present, else flag-or-default):
  --title TEXT               Song title (default: song-id with dashes-to-spaces, title-cased)
  --artist TEXT              Artist name (default: "Unknown Artist")
  --key TEXT                 Key override (default: auto-detect)
  --time-signature STR       Time-signature string written to JSON.
                             Informational only — does NOT influence beat tracking.
                             Use --beats-per-bar to change actual grouping. (default: "4/4")

Pipeline tuning:
  --bpm FLOAT                BPM override (default: auto-detect with sanity check)
  --beats-per-bar N          Beats per bar for downbeat derivation (default: 4)
  --min-chord-beats N        Min chord duration in beats (default: 1 = no-op smoothing)
  --chord-stem FILENAME      Override chord-recognition input (default: other.wav, fallback mix)
  --beat-stem FILENAME       Override beat-tracking input (default: drums.wav, fallback mix)

Behaviour:
  --dry-run                  Print resulting JSON to stdout, do not write files
  --no-backup                Don't write analysis.legacy.json before overwriting
  --verbose                  Log every per-beat label decision with top-3 similarity scores
```

Examples:

```bash
# Auto-detect everything (will probably get 4/4 wrong for the Elvis song)
python scripts/analyse-song.py cant-help-falling-in-love

# Recommended invocation for this song
python scripts/analyse-song.py cant-help-falling-in-love \
    --time-signature 12/8 --beats-per-bar 4 --bpm 67 --min-chord-beats 2

# Dry run for testing without overwriting
python scripts/analyse-song.py cant-help-falling-in-love --dry-run
```

## Metadata preservation

When `analysis.json` already exists at the target path, the script reads its `title` / `artist` / `key` / `timeSignature` fields and uses them as defaults — explicit CLI flags still override. This preserves curator-supplied metadata across re-runs.

On first runs (no existing file) without `--title` / `--artist`, the script prints a clear stderr warning and uses the defaults.

## Files produced / modified

| Path | Action |
|---|---|
| `scripts/analyse-song.py` | new |
| `scripts/requirements.txt` | new — pinned `librosa==0.10.2.post1`, `numpy`, `soundfile` |
| `scripts/README.md` | new — venv setup, how to run, all flags, the 12/8 caveat, known limitations |
| `public/songs/cant-help-falling-in-love/analysis.legacy.json` | new (backup of existing) |
| `public/songs/cant-help-falling-in-love/analysis.json` | overwritten |

No other files in the repo are touched. No TypeScript changes.

## Audit output

After a successful run, stdout shows a single summary block:

```
=== Analysis summary for cant-help-falling-in-love ===
Audio:       drums.wav (beats), other.wav (chords); duration 163.4s
Beat track:  detected 67.1 BPM; --bpm override 67.0 → using 67.0
Meter:       12/8 (--beats-per-bar 4)
Key:         auto-detected D Major (correlation 0.87)
Beats:       145 detected
Downbeats:   36 (every 4th beat from beat[0])

Chord pipeline:
  raw per-beat labels:           145
  after min-duration filter (2): 51 distinct runs
  after merging:                 51

Top labels (count, fraction):
  D       19 (37%)
  F#m     11 (22%)
  Bm       8 (16%)
  G        5 (10%)
  A        4 (8%)
  C#7      3 (6%)
  Em       1 (2%)

N (no-chord) beats: 0
Beats labelled with similarity < 0.6 (potential weak matches): 7

Diff vs existing analysis.json:
  Existing:    100 chord changes, 4/4 @ 68 BPM, 27 mid-beat chord times
  New:          51 chord changes, 12/8 @ 67 BPM, 0 mid-beat (all on beat grid)

Diff vs CANT_HELP_CHORDS (hand-authored, 50 entries):
  Bar-by-bar agreement: 42/46 bars match on root, 38/46 match on full label.
  Bridge bars 26-29: hand-authored uses C#7; script emitted C# (3) and C#7 (1).

Wrote: public/songs/cant-help-falling-in-love/analysis.json
Backup: public/songs/cant-help-falling-in-love/analysis.legacy.json
```

The bar-by-bar diff against `CANT_HELP_CHORDS` is only printed when the song id is `cant-help-falling-in-love` (the only song with a hand-authored progression). Numbers above are illustrative.

**Alignment for the diff**: `CANT_HELP_CHORDS` uses time values starting at `0.0` (it assumes the music starts at the file's first sample), but the actual audio has a ~1.6 s pre-roll before `beats[0]`. The diff aligns the two progressions by subtracting `beats[0]` from each script-emitted chord time before mapping to a bar index using the 3.58 s/bar assumption from `CANT_HELP_CHORDS`. This is a one-song workaround; future songs will only have the AI-derived progression and won't need it.

## Known limitations (also documented in scripts/README.md)

1. **12/8 ballads at ~67 BPM** — librosa's default beat tracker frequently locks onto the eighth-note subdivision or quarter-note subdivision, reporting double or 3/2× the dotted-quarter pulse. The override flags `--bpm` and `--beats-per-bar` exist for this. For the Elvis song specifically: `--time-signature 12/8 --beats-per-bar 4 --bpm 67`.
2. **Template matching is naive about voice-leading and inversions.** A clearly-voiced C/E will likely be detected as Em or C7 depending on which chord tone dominates. Slash chords and inversions are not recoverable. Hand-correct after running.
3. **Triad bias may mask real 7-chords.** The 5% bias toward triads suppresses some real dominant-7 chords (the bridge's `C#7` in the Elvis song is a known case). When this matters, lower or remove the bias by editing the script constant `TRIAD_BIAS`. Documented in the script as a constant at the top of the file.
4. **Sus and 6th chords are not in the vocabulary.** They get matched against the closest triad/tetrad and lose their character.
5. **No source separation.** Bring your own stems. If you only have a mix, expect noisier chroma (drum and vocal energy leaks into chord recognition).

## Testing approach

This is a one-shot data pipeline, not a feature with multiple branches.

1. **Smoke test on the Elvis song.** Run with `--time-signature 12/8 --beats-per-bar 4 --bpm 67 --min-chord-beats 2`. Verify the audit summary matches expectations: 12/8 @ 67 BPM, chord changes only on beat boundaries, bar-by-bar diff against `CANT_HELP_CHORDS` shows >80% agreement on the verse, and the bridge contains `F#m` alternating with either `C#` or `C#7`.
2. **Schema test.** Pre-write regex check — abort with non-zero exit if any emitted label fails `^([A-G][#b]?)(m|7|m7|maj7|dim|aug)?$`.
3. **Beat-grid invariant.** Pre-write set-membership check — abort if any `chord.time` is not in `beats[]`.
4. **Idempotency.** Re-run with the same flags. The output `analysis.json` should be byte-identical to the previous one (modulo `analysis.legacy.json`, which is the just-replaced previous output).
5. **Browser smoke test.** Reload the ADMI dev server, play the Elvis song, confirm chord-following voices (Red Pad, Yellow Arpeggio, Orange Bass) update on the new beat-aligned grid. No code changes — purely confirming the loader still parses the new file.

## Open decisions

None. All design questions are settled. Implementation proceeds once this spec is approved.
