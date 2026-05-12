# scripts/

Offline preprocessing tools for the ADMI song library.

## analyse_song.py

Produces `public/songs/<song-id>/analysis.json` from a song's stems. Output is
consumed at runtime by [src/songs/analysisLoader.ts](../src/songs/analysisLoader.ts).

This is an **automatic-transcription-with-human-review** tool. Run it, audit
the summary, hand-correct edge cases, and commit the result.

### Setup

Tested on Python 3.11, 3.12, and 3.13. From the repo root:

```bash
python -m venv .venv
.venv\Scripts\activate         # Windows PowerShell
# or: source .venv/bin/activate  # macOS/Linux

pip install -r scripts/requirements.txt
```

Install pulls librosa, numpy, scipy, soundfile, and pytest. Total ~80 MB,
1-2 min. No Java, no Vamp, no TensorFlow.

### Run

```bash
# Auto-detect everything (may get meter wrong on non-4/4 songs)
python scripts/analyse_song.py cant-help-falling-in-love

# Recommended invocation for the Elvis song (forces 12/8)
python scripts/analyse_song.py cant-help-falling-in-love \
    --time-signature 12/8 --beats-per-bar 4 --bpm 67 --min-chord-beats 2

# Print resulting JSON to stdout, don't overwrite the file
python scripts/analyse_song.py cant-help-falling-in-love --dry-run

# Log every per-beat similarity score
python scripts/analyse_song.py cant-help-falling-in-love --verbose
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `<song-id>` | required | Directory name under `public/songs/` |
| `--title` | preserved from existing JSON, else derived from song-id | Song title written to JSON |
| `--artist` | preserved from existing, else "Unknown Artist" | Artist name |
| `--key` | preserved from existing, else auto-detected | Key string, e.g. "D Major" |
| `--time-signature` | preserved from existing, else "4/4" | Informational only; does NOT influence beat tracking |
| `--bpm` | auto-detected | Override start_bpm for beat tracking AND the bpm field in the JSON |
| `--beats-per-bar` | 4 | Stride for downbeat derivation (use 4 for 12/8 with dotted-quarter pulse) |
| `--min-chord-beats` | 1 (no-op) | Min chord duration in beats; raise to suppress flicker |
| `--chord-stem` | other.wav | Audio file used for chord recognition (falls back to sum-mix) |
| `--beat-stem` | drums.wav | Audio file used for beat tracking (falls back to sum-mix) |
| `--dry-run` | off | Print resulting JSON to stdout; don't write |
| `--no-backup` | off | Skip writing analysis.legacy.json before overwriting |
| `--verbose` | off | Log every per-beat label decision with top-3 similarity scores |

### Output

- `public/songs/<song-id>/analysis.json` — the new beat-quantised analysis
- `public/songs/<song-id>/analysis.legacy.json` — backup of the previous file (unless `--no-backup`)

### Tests

Unit tests cover the pure-function components (templates, smoothing,
validation, JSON construction, audio-loading fallback):

```bash
python -m pytest scripts/tests/ -v
```

The integration test is running the script on the Elvis song and inspecting
the audit summary.

### Known limitations

1. **12/8 ballads at ~67 BPM.** Librosa's default tracker often locks onto
   the eighth-note or quarter-note subdivision rather than the dotted-quarter
   pulse, reporting double or 3/2x the intended BPM. Use `--bpm` and
   `--beats-per-bar` to override. For "Can't Help Falling in Love":
   `--time-signature 12/8 --beats-per-bar 4 --bpm 67`.

2. **Template matching is naive about voice-leading and inversions.** A
   clearly-voiced C/E will likely match Em or C7 depending on which chord
   tone dominates. Hand-correct after running.

3. **Triad bias (TRIAD_BIAS=1.05).** Suppresses some real dom7 chords —
   e.g. the bridge's C#7 in the Elvis song often comes back as plain C#.
   Edit the constant at the top of `analyse_song.py` if you want a different
   trade-off.

4. **Vocabulary.** The runtime parser accepts only:
   `[A-G][#b]?(m|7|m7|maj7|dim|aug)?`. Sus chords, 6th chords, slash chords,
   and extended harmony aren't in the template bank; hand-correct after
   running if your song needs them.

5. **No source separation.** Bring your own stems. If you only have a full
   mix, place it at `public/songs/<song-id>/mix.wav` and the script will use
   it as the fallback for both beat and chord analysis.

### Design rationale

See [docs/superpowers/specs/2026-05-12-chord-beat-analysis-pipeline-design.md](../docs/superpowers/specs/2026-05-12-chord-beat-analysis-pipeline-design.md)
for the why behind the library stack choice (pure librosa + template matching
over CNN-based ACR) and the pipeline structure.

## verify-sample-cdn.mjs

Unrelated Node script — verifies sample CDN URLs in the song library. See
inline comments for usage.
