# Chord/Beat Analysis Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/analyse_song.py`, a reproducible Python preprocessing tool that takes a song's stems and emits an `analysis.json` matching the schema consumed by the ADMI runtime, with chord changes quantised to the detected beat grid.

**Architecture:** Single-file Python CLI built around librosa. Beat tracking on `drums.wav`, chroma extraction on `other.wav`, per-beat template matching against a 84-template chord bank (7 qualities × 12 roots). Min-duration smoothing + adjacent-merge to suppress flicker. All chord times guaranteed to lie on the beat grid before the JSON is written.

**Tech Stack:** Python 3.11+, librosa 0.10.2.post1, numpy, soundfile, pytest (dev only).

**Reference spec:** [docs/superpowers/specs/2026-05-12-chord-beat-analysis-pipeline-design.md](../specs/2026-05-12-chord-beat-analysis-pipeline-design.md)

**Naming note:** The spec showed `scripts/analyse-song.py` (with a dash). The plan uses `scripts/analyse_song.py` (underscore) so the module is importable from tests without `importlib` gymnastics. The CLI invocation only changes by one character; the README documents the underscore name.

---

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/analyse_song.py` | Single-file CLI. All pipeline stages as module-level functions; orchestration in `main()`. |
| `scripts/requirements.txt` | Pinned runtime + dev deps. |
| `scripts/README.md` | Install, run, all flags, the 12/8 caveat, known limitations. |
| `scripts/tests/__init__.py` | Empty — marks tests as a package. |
| `scripts/tests/test_analyse_song.py` | Unit tests for pure functions (templates, normalization, smoothing, JSON validation). |
| `public/songs/cant-help-falling-in-love/analysis.json` | Overwritten with new beat-quantised output (Task 14). |
| `public/songs/cant-help-falling-in-love/analysis.legacy.json` | Backup of pre-existing file (Task 14). |

Public functions in `analyse_song.py`:

```python
build_chord_templates() -> dict[str, np.ndarray]
validate_label(label: str) -> bool
load_audio(song_dir: Path, beat_stem: str, chord_stem: str) -> tuple[np.ndarray, np.ndarray, int, float]
track_beats(y: np.ndarray, sr: int, bpm_hint: float | None) -> tuple[np.ndarray, float]
derive_downbeats(beats: np.ndarray, beats_per_bar: int) -> np.ndarray
detect_key(chroma: np.ndarray) -> str
extract_beat_chroma(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> np.ndarray
label_beats(beat_chroma: np.ndarray, templates: dict, verbose: bool) -> list[str]
smooth_labels(labels: list[str], min_chord_beats: int) -> list[str]
build_segments(labels: list[str], beats: np.ndarray, audio_duration: float) -> list[dict]
build_analysis_json(...) -> dict
main(argv: list[str] | None = None) -> int
```

---

## Task 1: Scaffolding (scripts/ dir + requirements + empty test package)

**Files:**
- Create: `scripts/requirements.txt`
- Create: `scripts/tests/__init__.py` (empty)
- Create: `scripts/analyse_song.py` (header + module docstring only)

- [ ] **Step 1: Verify scripts/ dir does not already exist**

Run: `ls scripts 2>&1 | head -1`
Expected: no such file or directory, OR "scripts" already exists as a folder (check first). If it exists with content, abort and ask the user.

- [ ] **Step 2: Create `scripts/requirements.txt` with pinned deps**

```text
# Runtime deps for analyse_song.py
librosa==0.10.2.post1
numpy>=1.24,<2.0
soundfile>=0.12.1

# Dev deps (testing only)
pytest>=7.4
```

- [ ] **Step 3: Create empty `scripts/tests/__init__.py`**

Empty file, single newline only.

- [ ] **Step 4: Create `scripts/analyse_song.py` header**

```python
"""Reproducible chord/beat analysis pipeline for the ADMI.

Takes a song's stems from public/songs/<song-id>/ and emits an
analysis.json file consumed by src/songs/analysisLoader.ts.

See docs/superpowers/specs/2026-05-12-chord-beat-analysis-pipeline-design.md
for the design rationale, and scripts/README.md for usage.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

# Constant: tunable bias toward triads over 7-chords to suppress
# sympathetic-resonance false positives on the b7 chroma bin.
TRIAD_BIAS = 1.05

# Constant: minimum cosine similarity to call a label "confident".
# Beats below this become N (no-chord) and may be absorbed by smoothing.
MIN_CONFIDENCE = 0.6

# Constant: silence detection threshold. Beats whose chroma magnitude
# is less than this fraction of the mean across the song are labelled N.
SILENCE_THRESHOLD = 0.05
```

- [ ] **Step 5: Commit scaffolding**

```bash
git add scripts/
git commit -m "scripts: scaffold analyse_song with pinned deps + test package"
```

---

## Task 2: Chord templates + label-vocab regex validation

**Files:**
- Modify: `scripts/analyse_song.py` (append `build_chord_templates`, `validate_label`)
- Test: `scripts/tests/test_analyse_song.py` (create)

- [ ] **Step 1: Write the failing tests**

```python
# scripts/tests/test_analyse_song.py
"""Unit tests for the pure-function components of analyse_song."""

import importlib.util
import sys
from pathlib import Path

import numpy as np

SCRIPT = Path(__file__).resolve().parent.parent / "analyse_song.py"
spec = importlib.util.spec_from_file_location("analyse_song", SCRIPT)
analyse_song = importlib.util.module_from_spec(spec)
sys.modules["analyse_song"] = analyse_song
spec.loader.exec_module(analyse_song)


def test_chord_templates_has_84_chord_templates():
    templates = analyse_song.build_chord_templates()
    # 7 qualities × 12 roots
    assert len(templates) == 84


def test_chord_template_C_major_has_root_third_fifth():
    templates = analyse_song.build_chord_templates()
    c_major = templates["C"]
    # C=0, E=4, G=7; other bins should be zero
    assert c_major[0] > 0
    assert c_major[4] > 0
    assert c_major[7] > 0
    assert c_major[1] == 0
    assert c_major[2] == 0


def test_chord_template_D_minor_has_minor_third():
    templates = analyse_song.build_chord_templates()
    d_minor = templates["Dm"]
    # D=2, F=5 (minor 3rd), A=9
    assert d_minor[2] > 0
    assert d_minor[5] > 0
    assert d_minor[9] > 0
    # Should NOT have the major third F# (bin 6)
    assert d_minor[6] == 0


def test_chord_template_G7_has_minor_seventh():
    templates = analyse_song.build_chord_templates()
    g7 = templates["G7"]
    # G=7, B=11, D=2, F=5 (minor 7)
    for pc in [7, 11, 2, 5]:
        assert g7[pc] > 0, f"expected energy at pc {pc} for G7"


def test_chord_template_is_l2_normalised():
    templates = analyse_song.build_chord_templates()
    for label, vec in templates.items():
        norm = np.linalg.norm(vec)
        assert abs(norm - 1.0) < 1e-6, f"{label} not normalised (norm={norm})"


def test_validate_label_accepts_supported():
    for label in ["C", "C#", "Db", "Em", "F#m", "G7", "Am7", "Dmaj7", "Bdim", "Caug"]:
        assert analyse_song.validate_label(label), f"{label} should validate"


def test_validate_label_rejects_unsupported():
    for label in ["C#sus4", "D/F#", "G9", "Bm6", "N", "", "Csus2", "Asus4", "x"]:
        assert not analyse_song.validate_label(label), f"{label} should not validate"
```

- [ ] **Step 2: Run tests to verify they fail**

Run from repo root: `python -m pytest scripts/tests/test_analyse_song.py -v`
Expected: 7 failures (functions don't exist yet).

- [ ] **Step 3: Implement `build_chord_templates` and `validate_label`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Chord vocabulary + template bank
# ============================================================================

PITCH_CLASS = {
    "C": 0, "C#": 1, "Db": 1,
    "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "F": 5, "F#": 6, "Gb": 6,
    "G": 7, "G#": 8, "Ab": 8,
    "A": 9, "A#": 10, "Bb": 10,
    "B": 11,
}

# Roots in spelling that the runtime regex accepts. Pick the spelling
# most commonly used in pop music; the runtime is enharmonic-equivalent.
ROOT_SPELLINGS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

QUALITY_INTERVALS = {
    "":     (0, 4, 7),       # major
    "m":    (0, 3, 7),       # minor
    "7":    (0, 4, 7, 10),   # dominant 7
    "m7":   (0, 3, 7, 10),   # minor 7
    "maj7": (0, 4, 7, 11),   # major 7
    "dim":  (0, 3, 6),       # diminished triad
    "aug":  (0, 4, 8),       # augmented triad
}

LABEL_REGEX = re.compile(r"^([A-G][#b]?)(m|7|m7|maj7|dim|aug)?$")


def build_chord_templates() -> dict[str, np.ndarray]:
    """Return {label: 12-bin L2-normalised binary template}.

    84 entries: 12 roots × 7 qualities.
    """
    templates: dict[str, np.ndarray] = {}
    for root in ROOT_SPELLINGS:
        root_pc = PITCH_CLASS[root]
        for suffix, intervals in QUALITY_INTERVALS.items():
            label = root + suffix
            vec = np.zeros(12, dtype=np.float64)
            for interval in intervals:
                vec[(root_pc + interval) % 12] = 1.0
            vec /= np.linalg.norm(vec)
            templates[label] = vec
    return templates


def validate_label(label: str) -> bool:
    """Return True iff `label` matches the runtime parser's accepted vocabulary."""
    return bool(LABEL_REGEX.fullmatch(label))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): add chord template bank + label validator"
```

---

## Task 3: Audio loading with stem fallback

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
import tempfile
import soundfile as sf


def _write_silent_wav(path: Path, duration: float = 1.0, sr: int = 22050):
    """Write a silent WAV at the given path."""
    sf.write(str(path), np.zeros(int(duration * sr)), sr)


def test_load_audio_prefers_named_stems(tmp_path):
    _write_silent_wav(tmp_path / "drums.wav", duration=0.5)
    _write_silent_wav(tmp_path / "other.wav", duration=0.5)
    beat_y, chord_y, sr, dur = analyse_song.load_audio(
        tmp_path, beat_stem="drums.wav", chord_stem="other.wav"
    )
    assert sr == 22050
    assert beat_y.ndim == 1
    assert chord_y.ndim == 1
    assert 0.4 < dur < 0.6


def test_load_audio_falls_back_to_sum_when_beat_stem_missing(tmp_path):
    # Only chord stem exists; beat stem must fall back to a sum of available stems
    _write_silent_wav(tmp_path / "other.wav", duration=0.5)
    _write_silent_wav(tmp_path / "bass.wav", duration=0.5)
    beat_y, chord_y, sr, dur = analyse_song.load_audio(
        tmp_path, beat_stem="drums.wav", chord_stem="other.wav"
    )
    # Should not raise; should return non-empty arrays of equal length
    assert beat_y.shape == chord_y.shape


def test_load_audio_raises_when_no_audio_at_all(tmp_path):
    import pytest
    with pytest.raises(FileNotFoundError):
        analyse_song.load_audio(
            tmp_path, beat_stem="drums.wav", chord_stem="other.wav"
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k load_audio`
Expected: 3 failures (function doesn't exist).

- [ ] **Step 3: Implement `load_audio`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Audio loading
# ============================================================================

# Names of stems that might exist in a song directory, in priority order
# when no specific stem is requested and we need to build a sum-mix.
KNOWN_STEMS = ("drums.wav", "bass.wav", "other.wav", "vocals.wav")
FALLBACK_MIX_NAMES = ("mix.wav", "full.wav")

# Imported here (not at module top) because librosa import is slow (~1s).
def _load_librosa():
    import librosa
    return librosa


def _resolve_signal(song_dir: Path, preferred_stem: str, sr: int) -> np.ndarray:
    """Return mono audio at `sr`. Prefer `preferred_stem`; else sum-mix; else
    a fallback mix.wav/full.wav. Raises FileNotFoundError if nothing usable."""
    librosa = _load_librosa()
    preferred = song_dir / preferred_stem
    if preferred.exists():
        y, _ = librosa.load(str(preferred), sr=sr, mono=True)
        return y
    # Sum-mix from available KNOWN_STEMS
    available = [song_dir / s for s in KNOWN_STEMS if (song_dir / s).exists()]
    if available:
        sigs = [librosa.load(str(p), sr=sr, mono=True)[0] for p in available]
        max_len = max(len(s) for s in sigs)
        stacked = np.zeros(max_len, dtype=np.float32)
        for s in sigs:
            stacked[:len(s)] += s
        return stacked / len(sigs)
    # Final fallback: a single mixed file
    for name in FALLBACK_MIX_NAMES:
        candidate = song_dir / name
        if candidate.exists():
            y, _ = librosa.load(str(candidate), sr=sr, mono=True)
            return y
    raise FileNotFoundError(
        f"No usable audio in {song_dir}. Looked for: {preferred_stem}, "
        f"{', '.join(KNOWN_STEMS)}, {', '.join(FALLBACK_MIX_NAMES)}"
    )


def load_audio(
    song_dir: Path,
    beat_stem: str = "drums.wav",
    chord_stem: str = "other.wav",
    sr: int = 22050,
) -> tuple[np.ndarray, np.ndarray, int, float]:
    """Load beat-tracking and chord-recognition signals from a song directory.

    Returns: (beat_signal, chord_signal, sample_rate, chord_duration_seconds).
    """
    beat_y = _resolve_signal(song_dir, beat_stem, sr)
    chord_y = _resolve_signal(song_dir, chord_stem, sr)
    duration = len(chord_y) / sr
    return beat_y, chord_y, sr, duration
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k load_audio`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): add audio loading with stem fallback chain"
```

---

## Task 4: Beat tracking with meter sanity check

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
def _generate_click_track(bpm: float, duration: float = 8.0, sr: int = 22050) -> np.ndarray:
    """Generate a metronome click track at the given BPM."""
    samples = int(duration * sr)
    y = np.zeros(samples, dtype=np.float32)
    interval_s = 60.0 / bpm
    click_samples = int(0.02 * sr)
    t = 0.0
    while t * sr + click_samples < samples:
        start = int(t * sr)
        y[start:start + click_samples] += np.random.RandomState(0).randn(click_samples) * 0.5
        t += interval_s
    return y


def test_track_beats_finds_clicks_at_120_bpm():
    sr = 22050
    y = _generate_click_track(bpm=120.0, duration=8.0, sr=sr)
    beats, bpm = analyse_song.track_beats(y, sr, bpm_hint=None)
    assert 110 < bpm < 130, f"detected bpm {bpm} outside expected range"
    assert len(beats) >= 12  # 8 seconds at 120 bpm = 16 beats, librosa may drop a few
    # Inter-beat interval should be ~0.5s
    median_ibi = np.median(np.diff(beats))
    assert 0.45 < median_ibi < 0.55


def test_track_beats_respects_bpm_hint():
    sr = 22050
    y = _generate_click_track(bpm=120.0, duration=8.0, sr=sr)
    # Override to a wrong bpm and ensure the hint sticks
    beats, bpm = analyse_song.track_beats(y, sr, bpm_hint=67.0)
    # When given a hint, return that as the bpm field
    assert bpm == 67.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k track_beats`
Expected: 2 failures.

- [ ] **Step 3: Implement `track_beats`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Beat tracking
# ============================================================================

def track_beats(
    y: np.ndarray, sr: int, bpm_hint: float | None = None
) -> tuple[np.ndarray, float]:
    """Detect beats in `y`. If `bpm_hint` is given, use it as start_bpm
    and return it verbatim as the bpm. Otherwise auto-detect with a meter
    sanity check (see _sanity_check_tempo).

    Returns: (beats_in_seconds, bpm_used).
    """
    librosa = _load_librosa()
    if bpm_hint is not None:
        bpm_arr, beat_frames = librosa.beat.beat_track(
            y=y, sr=sr, start_bpm=bpm_hint, tightness=100, units="frames"
        )
        beats = librosa.frames_to_time(beat_frames, sr=sr)
        return beats, float(bpm_hint)

    # Auto-detect: get initial estimate
    bpm_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    bpm_initial = float(np.atleast_1d(bpm_arr)[0])

    # Score each candidate
    candidates = [bpm_initial, bpm_initial / 2.0, bpm_initial * 2.0 / 3.0]
    best_bpm = bpm_initial
    best_beats = beat_frames
    best_score = _onset_alignment_score(y, sr, beat_frames)

    for cand in candidates[1:]:
        cand_bpm_arr, cand_frames = librosa.beat.beat_track(
            y=y, sr=sr, start_bpm=cand, tightness=100, units="frames"
        )
        score = _onset_alignment_score(y, sr, cand_frames)
        if score > best_score * 1.10:
            best_score = score
            best_bpm = cand
            best_beats = cand_frames

    beats = librosa.frames_to_time(best_beats, sr=sr)
    return beats, best_bpm


def _onset_alignment_score(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> float:
    """Return mean onset-envelope value at the predicted beat frames.
    Higher = the candidate tempo aligns better with actual onsets."""
    librosa = _load_librosa()
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    if len(beat_frames) == 0:
        return 0.0
    clipped = beat_frames[beat_frames < len(onset_env)]
    if len(clipped) == 0:
        return 0.0
    return float(np.mean(onset_env[clipped]))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k track_beats`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): beat tracking with bpm hint + meter sanity check"
```

---

## Task 5: Downbeat derivation + key detection

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
def test_derive_downbeats_every_4th_beat():
    beats = np.array([1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0])
    downbeats = analyse_song.derive_downbeats(beats, beats_per_bar=4)
    np.testing.assert_array_equal(downbeats, np.array([1.0, 3.0, 5.0]))


def test_derive_downbeats_for_12_8_with_4_per_bar():
    beats = np.array([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5])
    downbeats = analyse_song.derive_downbeats(beats, beats_per_bar=4)
    np.testing.assert_array_equal(downbeats, np.array([0.5, 2.5, 4.5]))


def test_derive_downbeats_handles_fewer_beats_than_one_bar():
    beats = np.array([1.0, 1.5])
    downbeats = analyse_song.derive_downbeats(beats, beats_per_bar=4)
    np.testing.assert_array_equal(downbeats, np.array([1.0]))


def test_detect_key_recognises_c_major_chord_chroma():
    # Build a chroma matrix biased toward C major (C, E, G strong)
    chroma = np.zeros((12, 100), dtype=np.float64)
    chroma[0, :] = 1.0  # C
    chroma[4, :] = 1.0  # E
    chroma[7, :] = 1.0  # G
    key = analyse_song.detect_key(chroma)
    assert key == "C Major"


def test_detect_key_recognises_a_minor_chord_chroma():
    chroma = np.zeros((12, 100), dtype=np.float64)
    chroma[9, :] = 1.0   # A
    chroma[0, :] = 1.0   # C
    chroma[4, :] = 1.0   # E
    key = analyse_song.detect_key(chroma)
    # A minor and C major share the same notes — Krumhansl correlation will
    # pick one. We accept either as "correct" since they're enharmonic in this
    # input. But ensure the output format is right.
    assert key in ("A Minor", "C Major")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k "downbeats or detect_key"`
Expected: 5 failures.

- [ ] **Step 3: Implement `derive_downbeats` and `detect_key`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Downbeats
# ============================================================================

def derive_downbeats(beats: np.ndarray, beats_per_bar: int) -> np.ndarray:
    """Take every Nth beat starting from beats[0] as the downbeat.

    Predictable and matches the user's --beats-per-bar override exactly.
    """
    if len(beats) == 0:
        return np.array([], dtype=beats.dtype)
    return beats[::beats_per_bar]


# ============================================================================
# Key detection (Krumhansl-Schmuckler)
# ============================================================================

# Krumhansl-Schmuckler tonal hierarchy profiles, normalised
_KS_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_KS_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)
_TONIC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def detect_key(chroma: np.ndarray) -> str:
    """Correlate the mean chroma against Krumhansl major/minor profiles
    rotated to all 12 tonics. Return '<tonic> Major' or '<tonic> Minor'."""
    if chroma.size == 0:
        return "C Major"
    mean = chroma.mean(axis=1)
    if mean.sum() == 0:
        return "C Major"
    mean = mean / mean.sum()

    best_score = -np.inf
    best_label = "C Major"
    for tonic in range(12):
        # Rotate the profile so its tonic sits at chroma bin `tonic`
        major = np.roll(_KS_MAJOR, tonic)
        minor = np.roll(_KS_MINOR, tonic)
        for profile, mode in ((major, "Major"), (minor, "Minor")):
            score = float(np.corrcoef(mean, profile)[0, 1])
            if score > best_score:
                best_score = score
                best_label = f"{_TONIC_NAMES[tonic]} {mode}"
    return best_label
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k "downbeats or detect_key"`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): downbeat stride + Krumhansl key detection"
```

---

## Task 6: Beat-synchronous chroma extraction

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/test_analyse_song.py`:

```python
def test_extract_beat_chroma_shape():
    sr = 22050
    # 4 seconds of pink-ish noise
    y = np.random.RandomState(0).randn(4 * sr).astype(np.float32) * 0.1
    # Five beat frames spread across the audio
    librosa_mod = importlib.import_module("librosa")
    beat_frames = librosa_mod.time_to_frames(
        np.array([0.5, 1.5, 2.0, 2.5, 3.5]), sr=sr
    )
    beat_chroma = analyse_song.extract_beat_chroma(y, sr, beat_frames)
    # One 12-vector per beat boundary segment. We expect at minimum one per beat.
    assert beat_chroma.shape[0] == 12
    assert beat_chroma.shape[1] >= len(beat_frames) - 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k extract_beat_chroma`
Expected: 1 failure.

- [ ] **Step 3: Implement `extract_beat_chroma`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Beat-synchronous chroma
# ============================================================================

def extract_beat_chroma(
    y: np.ndarray, sr: int, beat_frames: np.ndarray
) -> np.ndarray:
    """Compute CQT chroma frame-by-frame, then aggregate to one vector per
    beat using the median over each beat segment.

    Returns: array of shape (12, n_beats). beat i covers
    [beat_frames[i], beat_frames[i+1]); the final beat covers
    [beat_frames[-1], end). Pre-roll (before beat_frames[0]) is dropped.
    """
    librosa = _load_librosa()
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    # librosa.util.sync with `aggregate=np.median` produces N+1 segments for
    # N beat frames (pre-roll + N-1 inter-beat + post-roll). We slice off the
    # pre-roll to align segment 0 with beat 0.
    synced = librosa.util.sync(
        chroma, beat_frames, aggregate=np.median
    )
    # synced shape: (12, N+1). Drop pre-roll → keep cols 1..end.
    return synced[:, 1:]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k extract_beat_chroma`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): beat-synchronous CQT chroma extraction"
```

---

## Task 7: Per-beat template matching → labels

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
def test_label_beats_picks_perfect_match():
    templates = analyse_song.build_chord_templates()
    # Construct beat-chroma as exact copies of three template vectors
    cols = np.stack(
        [templates["C"], templates["F"], templates["G7"]], axis=1
    )
    labels = analyse_song.label_beats(cols, templates, verbose=False)
    assert labels == ["C", "F", "G7"]


def test_label_beats_returns_N_on_silent_column():
    templates = analyse_song.build_chord_templates()
    # One bright beat + one silent beat. Silent beat should be N.
    cols = np.stack([templates["A"], np.zeros(12)], axis=1)
    labels = analyse_song.label_beats(cols, templates, verbose=False)
    assert labels[0] == "A"
    assert labels[1] == "N"


def test_label_beats_triad_bias_keeps_simple_triads():
    templates = analyse_song.build_chord_templates()
    # Chroma is exactly a C major triad. With or without bias the answer
    # should be C, not C7 (since b7 bin is zero anyway).
    cols = templates["C"].reshape(12, 1)
    labels = analyse_song.label_beats(cols, templates, verbose=False)
    assert labels == ["C"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k label_beats`
Expected: 3 failures.

- [ ] **Step 3: Implement `label_beats`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Template matching
# ============================================================================

# Quality suffix mapping for the triad bias. Major and minor get the boost.
_TRIAD_QUALITIES = {"", "m"}


def label_beats(
    beat_chroma: np.ndarray,
    templates: dict[str, np.ndarray],
    verbose: bool = False,
) -> list[str]:
    """Match each column of `beat_chroma` against `templates`, return one
    label per beat. Beats below the silence threshold or below MIN_CONFIDENCE
    get labelled 'N'."""
    n_beats = beat_chroma.shape[1]
    if n_beats == 0:
        return []

    # Magnitudes used for silence detection
    magnitudes = np.linalg.norm(beat_chroma, axis=0)
    mean_magnitude = float(magnitudes.mean()) if magnitudes.size > 0 else 0.0
    silence_floor = SILENCE_THRESHOLD * mean_magnitude

    # Stack templates into one matrix (84, 12) for vectorised matching
    template_labels = list(templates.keys())
    template_matrix = np.stack([templates[l] for l in template_labels], axis=0)
    # Pre-compute triad bias vector aligned with template order
    bias = np.array(
        [
            TRIAD_BIAS if _label_quality(l) in _TRIAD_QUALITIES else 1.0
            for l in template_labels
        ]
    )

    out: list[str] = []
    for i in range(n_beats):
        col = beat_chroma[:, i]
        col_norm = np.linalg.norm(col)
        if col_norm < silence_floor or col_norm == 0:
            out.append("N")
            continue
        normalised = col / col_norm
        # Cosine similarities = dot products since both are L2-normalised
        sims = template_matrix @ normalised
        biased = sims * bias
        best_idx = int(np.argmax(biased))
        best_label = template_labels[best_idx]
        if biased[best_idx] < MIN_CONFIDENCE:
            out.append("N")
            continue
        if verbose:
            top3 = np.argsort(biased)[-3:][::-1]
            print(
                f"[label_beats] beat {i}: "
                + ", ".join(
                    f"{template_labels[k]}={biased[k]:.3f}" for k in top3
                ),
                file=sys.stderr,
            )
        out.append(best_label)
    return out


def _label_quality(label: str) -> str:
    """Return the quality suffix of a chord label, e.g. 'C#m7' -> 'm7'."""
    m = LABEL_REGEX.fullmatch(label)
    if not m:
        return ""
    return m.group(2) or ""
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k label_beats`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): per-beat template matching with triad bias"
```

---

## Task 8: Min-duration smoothing filter

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
def test_smooth_labels_min_1_is_noop():
    labels = ["C", "G", "C", "F", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=1) == labels


def test_smooth_labels_min_2_absorbs_1beat_run_into_left_neighbour():
    # G in position 2 is a 1-beat run between two longer C runs
    labels = ["C", "C", "G", "C", "C"]
    expected = ["C", "C", "C", "C", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_min_2_absorbs_into_longer_neighbour():
    # G is 1-beat; left neighbour C is 1 beat, right neighbour F is 3 beats
    labels = ["C", "G", "F", "F", "F"]
    expected = ["F", "F", "F", "F", "F"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_handles_leading_short_run():
    # G is at the start, 1 beat, only one neighbour (C)
    labels = ["G", "C", "C", "C"]
    expected = ["C", "C", "C", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_handles_trailing_short_run():
    labels = ["C", "C", "C", "G"]
    expected = ["C", "C", "C", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_repeated_passes():
    # After one pass, F becomes G; after another, G/C still need merging.
    # Test that the loop converges.
    labels = ["C", "C", "F", "G", "G", "G", "G"]
    expected = ["G", "G", "G", "G", "G", "G", "G"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=3) == expected
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k smooth_labels`
Expected: 6 failures.

- [ ] **Step 3: Implement `smooth_labels`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Smoothing
# ============================================================================

def smooth_labels(labels: list[str], min_chord_beats: int) -> list[str]:
    """Replace runs shorter than `min_chord_beats` with their longer-neighbour
    label. Repeats until stable. min_chord_beats=1 is a no-op."""
    if min_chord_beats <= 1 or len(labels) == 0:
        return list(labels)
    current = list(labels)
    while True:
        runs = _runs_of(current)
        # Find the shortest run that is too short, biased to the earliest
        # in case of a tie. Skip runs that are at min_chord_beats already.
        candidate = None
        for run in runs:
            if run["length"] < min_chord_beats:
                candidate = run
                break
        if candidate is None:
            return current
        # Determine neighbour labels (longer wins; tie → left)
        left = _neighbour(runs, candidate, direction=-1)
        right = _neighbour(runs, candidate, direction=+1)
        if left is None and right is None:
            return current  # Single run; can't absorb anywhere
        if left is None:
            chosen_label = right["label"]
        elif right is None:
            chosen_label = left["label"]
        else:
            chosen_label = (
                left["label"]
                if left["length"] >= right["length"]
                else right["label"]
            )
        # Rewrite the candidate run in `current` with chosen_label
        for i in range(candidate["start"], candidate["start"] + candidate["length"]):
            current[i] = chosen_label


def _runs_of(labels: list[str]) -> list[dict]:
    """Compute run-length encoding: [{label, start, length}, ...]."""
    runs: list[dict] = []
    if not labels:
        return runs
    start = 0
    for i in range(1, len(labels)):
        if labels[i] != labels[start]:
            runs.append({"label": labels[start], "start": start, "length": i - start})
            start = i
    runs.append(
        {"label": labels[start], "start": start, "length": len(labels) - start}
    )
    return runs


def _neighbour(runs: list[dict], run: dict, direction: int) -> dict | None:
    """Return the adjacent run in the given direction (-1=left, +1=right)
    that has a different label, or None at the boundary."""
    idx = runs.index(run)
    target = idx + direction
    if target < 0 or target >= len(runs):
        return None
    return runs[target]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k smooth_labels`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): min-duration smoothing filter (anti-flicker)"
```

---

## Task 9: Build chord segments (merge identical runs + compute durations)

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
def test_build_segments_merges_runs_and_drops_N():
    labels = ["C", "C", "G", "G", "G", "N", "F"]
    beats = np.array([0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0])
    audio_duration = 3.5
    segments = analyse_song.build_segments(labels, beats, audio_duration)
    # Expect: C run [0, 1), G run [1, 2.5), F run [3.0, 3.5). N dropped.
    assert segments == [
        {"time": 0.0, "duration": 1.0, "label": "C"},
        {"time": 1.0, "duration": 1.5, "label": "G"},
        {"time": 3.0, "duration": 0.5, "label": "F"},
    ]


def test_build_segments_handles_all_N():
    labels = ["N", "N", "N"]
    beats = np.array([0.0, 1.0, 2.0])
    assert analyse_song.build_segments(labels, beats, 3.0) == []


def test_build_segments_final_run_extends_to_audio_duration():
    labels = ["C", "C"]
    beats = np.array([1.0, 2.0])
    segments = analyse_song.build_segments(labels, beats, audio_duration=5.0)
    # Final run's duration extends from beat[0]=1.0 to audio_duration=5.0
    assert segments == [{"time": 1.0, "duration": 4.0, "label": "C"}]


def test_build_segments_time_always_in_beats():
    labels = ["D", "D", "Bm", "G"]
    beats = np.array([1.649, 2.508, 3.297, 4.087])
    segments = analyse_song.build_segments(labels, beats, audio_duration=5.0)
    for seg in segments:
        assert seg["time"] in beats.tolist(), (
            f"chord time {seg['time']} not in beats grid"
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k build_segments`
Expected: 4 failures.

- [ ] **Step 3: Implement `build_segments`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Segment building
# ============================================================================

def build_segments(
    labels: list[str], beats: np.ndarray, audio_duration: float
) -> list[dict]:
    """Merge adjacent identical labels into chord segments with time +
    duration. Drop 'N' runs entirely. Final non-N run's duration extends
    to `audio_duration`."""
    if len(labels) == 0:
        return []
    runs = _runs_of(labels)
    segments: list[dict] = []
    for r in runs:
        if r["label"] == "N":
            continue
        start_time = float(beats[r["start"]])
        end_idx = r["start"] + r["length"]
        if end_idx < len(beats):
            end_time = float(beats[end_idx])
        else:
            end_time = float(audio_duration)
        segments.append(
            {
                "time": start_time,
                "duration": end_time - start_time,
                "label": r["label"],
            }
        )
    return segments
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k build_segments`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): merge label runs into beat-aligned chord segments"
```

---

## Task 10: Build analysis JSON object + pre-write validation

**Files:**
- Modify: `scripts/analyse_song.py`
- Modify: `scripts/tests/test_analyse_song.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_analyse_song.py`:

```python
def test_build_analysis_json_shape():
    obj = analyse_song.build_analysis_json(
        title="Test", artist="Artist", bpm=120.0,
        time_signature="4/4", key="C Major",
        beats=np.array([0.0, 0.5, 1.0]),
        downbeats=np.array([0.0]),
        segments=[{"time": 0.0, "duration": 1.5, "label": "C"}],
    )
    assert obj["title"] == "Test"
    assert obj["artist"] == "Artist"
    assert obj["bpm"] == 120.0
    assert obj["timeSignature"] == "4/4"
    assert obj["key"] == "C Major"
    assert obj["beats"] == [0.0, 0.5, 1.0]
    assert obj["downbeats"] == [0.0]
    assert obj["chords"] == [{"time": 0.0, "duration": 1.5, "label": "C"}]


def test_build_analysis_json_rejects_bad_label():
    import pytest
    with pytest.raises(ValueError, match="invalid chord label"):
        analyse_song.build_analysis_json(
            title="T", artist="A", bpm=120.0, time_signature="4/4",
            key="C Major",
            beats=np.array([0.0]),
            downbeats=np.array([0.0]),
            segments=[{"time": 0.0, "duration": 1.0, "label": "Csus4"}],
        )


def test_build_analysis_json_rejects_off_grid_chord_time():
    import pytest
    with pytest.raises(ValueError, match="not in beats grid"):
        analyse_song.build_analysis_json(
            title="T", artist="A", bpm=120.0, time_signature="4/4",
            key="C Major",
            beats=np.array([0.0, 0.5]),
            downbeats=np.array([0.0]),
            segments=[{"time": 0.3, "duration": 0.2, "label": "C"}],
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k build_analysis_json`
Expected: 3 failures.

- [ ] **Step 3: Implement `build_analysis_json`**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# JSON construction + validation
# ============================================================================

def build_analysis_json(
    *,
    title: str,
    artist: str,
    bpm: float,
    time_signature: str,
    key: str,
    beats: np.ndarray,
    downbeats: np.ndarray,
    segments: list[dict],
) -> dict:
    """Construct the final JSON-serialisable analysis dict.

    Pre-write validation:
      - every chord label must match LABEL_REGEX
      - every chord time must be a value in `beats`
    Raises ValueError on either failure.
    """
    beats_list = [float(b) for b in beats]
    beats_set = set(beats_list)
    for seg in segments:
        if not validate_label(seg["label"]):
            raise ValueError(
                f"invalid chord label '{seg['label']}': fails runtime regex"
            )
        if float(seg["time"]) not in beats_set:
            raise ValueError(
                f"chord time {seg['time']} not in beats grid"
            )
    return {
        "title": title,
        "artist": artist,
        "bpm": float(bpm),
        "timeSignature": time_signature,
        "key": key,
        "beats": beats_list,
        "downbeats": [float(b) for b in downbeats],
        "chords": [
            {
                "time": float(s["time"]),
                "duration": float(s["duration"]),
                "label": s["label"],
            }
            for s in segments
        ],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/tests/test_analyse_song.py -v -k build_analysis_json`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyse_song.py scripts/tests/test_analyse_song.py
git commit -m "scripts(analyse): JSON builder with pre-write schema + grid validation"
```

---

## Task 11: CLI + main() + audit summary

**Files:**
- Modify: `scripts/analyse_song.py`

No new unit tests — this is the integration layer. The integration test is the Elvis run in Task 13.

- [ ] **Step 1: Implement `main()` and helpers**

Append to `scripts/analyse_song.py`:

```python
# ============================================================================
# Audit summary
# ============================================================================

def print_summary(
    *,
    song_id: str,
    song_dir: Path,
    beat_stem: str,
    chord_stem: str,
    audio_duration: float,
    detected_bpm: float,
    bpm_used: float,
    time_signature: str,
    beats_per_bar: int,
    key: str,
    beats: np.ndarray,
    downbeats: np.ndarray,
    raw_labels: list[str],
    smoothed_labels: list[str],
    segments: list[dict],
    existing_analysis: dict | None,
    min_chord_beats: int,
) -> None:
    """Print the human-readable audit summary to stdout."""
    label_counts: dict[str, int] = {}
    for s in segments:
        label_counts[s["label"]] = label_counts.get(s["label"], 0) + 1
    top_labels = sorted(label_counts.items(), key=lambda kv: -kv[1])

    n_count = sum(1 for l in smoothed_labels if l == "N")
    n_beats_total = len(smoothed_labels)
    weak_count = sum(1 for l in raw_labels if l == "N") - n_count

    print(f"=== Analysis summary for {song_id} ===")
    print(
        f"Audio:       {beat_stem} (beats), {chord_stem} (chords); "
        f"duration {audio_duration:.1f}s"
    )
    print(
        f"Beat track:  detected {detected_bpm:.1f} BPM; "
        f"using {bpm_used:.1f} BPM"
    )
    print(f"Meter:       {time_signature} (--beats-per-bar {beats_per_bar})")
    print(f"Key:         {key}")
    print(f"Beats:       {len(beats)}")
    print(f"Downbeats:   {len(downbeats)} (every {beats_per_bar}th beat)")
    print()
    print("Chord pipeline:")
    print(f"  raw per-beat labels:           {len(raw_labels)}")
    print(
        f"  after min-duration filter ({min_chord_beats}): "
        f"{len(_runs_of(smoothed_labels))} distinct runs"
    )
    print(f"  merged chord segments:         {len(segments)}")
    print()
    print("Top labels (count, fraction):")
    for label, count in top_labels[:10]:
        frac = count / max(1, len(segments))
        print(f"  {label:6} {count:3} ({frac:.0%})")
    print()
    print(f"N (no-chord) beats: {n_count}")
    if weak_count > 0:
        print(f"Beats below confidence {MIN_CONFIDENCE}: {weak_count}")
    print()

    if existing_analysis is not None:
        existing_chords = existing_analysis.get("chords", [])
        existing_off_grid = sum(
            1 for c in existing_chords if c["time"] not in set(beats.tolist())
        )
        print("Diff vs existing analysis.json:")
        print(
            f"  Existing:    {len(existing_chords)} chord changes, "
            f"{existing_analysis.get('timeSignature')} @ "
            f"{existing_analysis.get('bpm')} BPM, "
            f"{existing_off_grid} chord times not on new beat grid"
        )
        print(
            f"  New:         {len(segments)} chord changes, "
            f"{time_signature} @ {bpm_used:.1f} BPM, "
            "all on beat grid"
        )

    if song_id == "cant-help-falling-in-love":
        _print_hand_authored_diff(segments, beats)


def _print_hand_authored_diff(segments: list[dict], beats: np.ndarray) -> None:
    """Compare segments against the hand-authored CANT_HELP_CHORDS from
    src/songs/voices/chordLookup.ts (parsed inline since we only need
    name + time for the diff)."""
    # The hand-authored progression starts at audio time 0; the actual song
    # has ~beats[0] seconds of pre-roll. Subtract that to align.
    if len(beats) == 0:
        return
    offset = float(beats[0])
    hand_chords = _CANT_HELP_HAND_AUTHORED
    matches_on_root = 0
    matches_on_label = 0
    for hc in hand_chords:
        target_time = hc["time"] + offset
        # Find the script-emitted chord active at target_time
        active = None
        for seg in segments:
            if seg["time"] <= target_time < seg["time"] + seg["duration"]:
                active = seg
                break
        if active is None:
            continue
        if _root_of(active["label"]) == _root_of(hc["name"]):
            matches_on_root += 1
        if active["label"] == hc["name"]:
            matches_on_label += 1
    print()
    print(
        f"Diff vs CANT_HELP_CHORDS (hand-authored, {len(hand_chords)} entries):"
    )
    print(
        f"  Root-match:  {matches_on_root}/{len(hand_chords)} "
        f"({matches_on_root / len(hand_chords):.0%})"
    )
    print(
        f"  Label-match: {matches_on_label}/{len(hand_chords)} "
        f"({matches_on_label / len(hand_chords):.0%})"
    )


def _root_of(label: str) -> str:
    m = LABEL_REGEX.fullmatch(label)
    return m.group(1) if m else ""


# Hand-authored chord names + start times (seconds) from
# src/songs/voices/chordLookup.ts CANT_HELP_CHORDS. Used only for the
# diff summary on the Elvis song. Keep in sync by hand if that file
# changes; this is an audit aid, not a runtime contract.
_CANT_HELP_HAND_AUTHORED = [
    {"time": 0.0, "name": "D"}, {"time": 3.58, "name": "A"},
    {"time": 7.16, "name": "D"}, {"time": 10.74, "name": "F#m"},
    {"time": 14.33, "name": "Bm"}, {"time": 17.91, "name": "G"},
    {"time": 21.49, "name": "D"}, {"time": 25.07, "name": "A"},
    {"time": 28.66, "name": "G"}, {"time": 32.24, "name": "A"},
    {"time": 35.82, "name": "Bm"}, {"time": 39.40, "name": "Em"},
    {"time": 42.99, "name": "D"}, {"time": 45.28, "name": "A"},
    {"time": 46.57, "name": "D"}, {"time": 50.15, "name": "D"},
    {"time": 53.73, "name": "F#m"}, {"time": 57.31, "name": "Bm"},
    {"time": 60.90, "name": "G"}, {"time": 64.48, "name": "D"},
    {"time": 68.06, "name": "A"}, {"time": 71.64, "name": "G"},
    {"time": 75.22, "name": "A"}, {"time": 78.81, "name": "Bm"},
    {"time": 82.39, "name": "Em"}, {"time": 85.97, "name": "D"},
    {"time": 88.26, "name": "A"}, {"time": 89.55, "name": "D"},
    {"time": 93.13, "name": "F#m"}, {"time": 96.72, "name": "C#7"},
    {"time": 100.30, "name": "F#m"}, {"time": 103.88, "name": "C#7"},
    {"time": 107.46, "name": "F#m"}, {"time": 111.04, "name": "C#7"},
    {"time": 114.63, "name": "F#m"}, {"time": 118.21, "name": "B7"},
    {"time": 121.79, "name": "Em"}, {"time": 125.37, "name": "A7"},
    {"time": 128.96, "name": "D"}, {"time": 132.54, "name": "F#m"},
    {"time": 136.12, "name": "Bm"}, {"time": 139.70, "name": "G"},
    {"time": 143.28, "name": "D"}, {"time": 146.87, "name": "A"},
    {"time": 150.45, "name": "G"}, {"time": 154.03, "name": "A"},
    {"time": 157.61, "name": "Bm"}, {"time": 161.19, "name": "Em"},
    {"time": 164.78, "name": "D"}, {"time": 167.07, "name": "A"},
    {"time": 168.36, "name": "D"},
]


# ============================================================================
# Main / CLI
# ============================================================================

def _id_to_title(song_id: str) -> str:
    return " ".join(w.capitalize() for w in song_id.replace("-", " ").split())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Reproducible beat + chord analysis for the ADMI song library."
    )
    parser.add_argument("song_id", help="Directory name under public/songs/")
    parser.add_argument("--title", default=None)
    parser.add_argument("--artist", default=None)
    parser.add_argument("--key", default=None)
    parser.add_argument("--time-signature", default=None)
    parser.add_argument("--bpm", type=float, default=None)
    parser.add_argument("--beats-per-bar", type=int, default=4)
    parser.add_argument("--min-chord-beats", type=int, default=1)
    parser.add_argument("--chord-stem", default="other.wav")
    parser.add_argument("--beat-stem", default="drums.wav")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    song_dir = repo_root / "public" / "songs" / args.song_id
    if not song_dir.exists():
        print(f"error: song dir does not exist: {song_dir}", file=sys.stderr)
        return 2

    # Load existing analysis.json for metadata preservation
    existing_path = song_dir / "analysis.json"
    existing: dict | None = None
    if existing_path.exists():
        try:
            existing = json.loads(existing_path.read_text(encoding="utf-8"))
        except Exception:
            existing = None

    title = args.title or (existing or {}).get("title") or _id_to_title(args.song_id)
    artist = args.artist or (existing or {}).get("artist") or "Unknown Artist"
    if (not args.title) and (not existing):
        print(f"[warn] No --title given; defaulting to '{title}'", file=sys.stderr)
    if (not args.artist) and (not existing):
        print(f"[warn] No --artist given; defaulting to '{artist}'", file=sys.stderr)
    time_signature = args.time_signature or (existing or {}).get("timeSignature") or "4/4"

    # Pipeline
    beat_y, chord_y, sr, audio_duration = load_audio(
        song_dir, beat_stem=args.beat_stem, chord_stem=args.chord_stem
    )
    beats, bpm_used = track_beats(beat_y, sr, bpm_hint=args.bpm)
    # Pull the auto-detected bpm separately for the summary if no hint
    detected_bpm = bpm_used if args.bpm is None else _quick_detect_bpm(beat_y, sr)
    downbeats = derive_downbeats(beats, args.beats_per_bar)

    librosa = _load_librosa()
    chroma_for_key = librosa.feature.chroma_cqt(y=chord_y, sr=sr)
    key = args.key or (existing or {}).get("key") or detect_key(chroma_for_key)

    beat_frames = librosa.time_to_frames(beats, sr=sr)
    beat_chroma = extract_beat_chroma(chord_y, sr, beat_frames)
    templates = build_chord_templates()
    raw_labels = label_beats(beat_chroma, templates, verbose=args.verbose)
    smoothed = smooth_labels(raw_labels, args.min_chord_beats)
    segments = build_segments(smoothed, beats, audio_duration)

    analysis = build_analysis_json(
        title=title,
        artist=artist,
        bpm=bpm_used,
        time_signature=time_signature,
        key=key,
        beats=beats,
        downbeats=downbeats,
        segments=segments,
    )

    print_summary(
        song_id=args.song_id, song_dir=song_dir,
        beat_stem=args.beat_stem, chord_stem=args.chord_stem,
        audio_duration=audio_duration,
        detected_bpm=detected_bpm, bpm_used=bpm_used,
        time_signature=time_signature, beats_per_bar=args.beats_per_bar,
        key=key, beats=beats, downbeats=downbeats,
        raw_labels=raw_labels, smoothed_labels=smoothed,
        segments=segments, existing_analysis=existing,
        min_chord_beats=args.min_chord_beats,
    )

    if args.dry_run:
        print()
        print(json.dumps(analysis, indent=2))
        return 0

    # Backup existing
    if existing_path.exists() and not args.no_backup:
        backup_path = song_dir / "analysis.legacy.json"
        backup_path.write_text(existing_path.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Backup: {backup_path}")

    existing_path.write_text(
        json.dumps(analysis, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote: {existing_path}")
    return 0


def _quick_detect_bpm(y: np.ndarray, sr: int) -> float:
    librosa = _load_librosa()
    bpm_arr, _ = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    return float(np.atleast_1d(bpm_arr)[0])


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Smoke-run with --help to verify argparse**

Run from repo root: `python scripts/analyse_song.py --help`
Expected: usage info printed, exit code 0. No tracebacks.

- [ ] **Step 3: Commit**

```bash
git add scripts/analyse_song.py
git commit -m "scripts(analyse): wire CLI + main orchestrator + audit summary"
```

---

## Task 12: scripts/README.md

**Files:**
- Create: `scripts/README.md`

- [ ] **Step 1: Write the README**

```markdown
# scripts/

Offline preprocessing tools for the ADMI song library.

## analyse_song.py

Produces `public/songs/<song-id>/analysis.json` from a song's stems. Output is
consumed at runtime by `src/songs/analysisLoader.ts`.

This is an **automatic-transcription-with-human-review** tool. Run it, audit
the summary, and hand-correct edge cases before committing the result.

### Setup

Tested on Python 3.11 and 3.12. From the repo root:

\`\`\`bash
python -m venv .venv
.venv\Scripts\activate     # Windows PowerShell
# or: source .venv/bin/activate  # macOS/Linux

pip install -r scripts/requirements.txt
\`\`\`

### Run

\`\`\`bash
# Auto-detect everything (may get meter wrong on 12/8 ballads)
python scripts/analyse_song.py cant-help-falling-in-love

# Recommended invocation for the Elvis song (forces 12/8)
python scripts/analyse_song.py cant-help-falling-in-love \\
    --time-signature 12/8 --beats-per-bar 4 --bpm 67 --min-chord-beats 2

# Print resulting JSON to stdout, don't overwrite the file
python scripts/analyse_song.py cant-help-falling-in-love --dry-run

# Log every per-beat similarity score
python scripts/analyse_song.py cant-help-falling-in-love --verbose
\`\`\`

### Flags

| Flag | Default | Description |
|---|---|---|
| `<song-id>` | required | Directory name under `public/songs/` |
| `--title` | preserved from existing, else derived | Song title written to JSON |
| `--artist` | preserved from existing, else "Unknown Artist" | Artist name |
| `--key` | auto-detected (Krumhansl) | Key string, e.g. "D Major" |
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
validation, JSON construction):

\`\`\`bash
python -m pytest scripts/tests/ -v
\`\`\`

The integration test is re-running the script on the Elvis song and
inspecting the audit summary.

### Known limitations

1. **12/8 ballads at ~67 BPM.** Librosa's default tracker often locks
   onto the eighth-note subdivision or quarter-note subdivision rather
   than the dotted-quarter pulse. Use `--bpm` and `--beats-per-bar` to
   override. For "Can't Help Falling in Love" specifically:
   `--time-signature 12/8 --beats-per-bar 4 --bpm 67`.

2. **Template matching is naive about voice-leading and inversions.**
   A clearly-voiced C/E will likely match Em or C7 depending on which
   chord tone dominates. Hand-correct after running.

3. **Triad bias (TRIAD_BIAS=1.05).** Suppresses some real dom7 chords —
   e.g. the bridge's C#7 in the Elvis song often comes back as plain
   C#. Edit the constant at the top of `analyse_song.py` if you want a
   different trade-off.

4. **Vocabulary.** The runtime parser accepts only:
   `[A-G][#b]?(m|7|m7|maj7|dim|aug)?`. Sus chords, 6th chords, slash
   chords, and extended harmony are not in the template bank; if your
   song needs them you'll need to hand-correct after running.

5. **No source separation.** Bring your own stems. If you only have a
   full mix, place it at `public/songs/<song-id>/mix.wav` and the script
   will use it as the fallback for both beat and chord analysis.
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add scripts/README.md
git commit -m "scripts: README for analyse_song with usage + known limitations"
```

---

## Task 13: Install dependencies + run on Elvis song

**Files:**
- (None new) — installs deps into a venv and runs the script.

This task touches the user's machine for the first time. The pip install will probably hit a permission prompt; that's expected. Surface progress to the user clearly.

- [ ] **Step 1: Create venv at repo root**

Run: `python -m venv .venv`
Expected: `.venv/` directory created with `.venv/Scripts/python.exe`.

- [ ] **Step 2: Install deps into the venv**

Run: `.venv\Scripts\python.exe -m pip install -r scripts/requirements.txt`
Expected: librosa, numpy, soundfile, pytest installed. Takes 1-3 minutes. The librosa install pulls numpy, scipy, audioread, etc — all pip-available wheels for Python 3.11/3.12 on Windows.

If pip fails for any package, surface the full error to the user and stop. Do not silently swap to a different version.

- [ ] **Step 3: Run unit tests in the venv**

Run: `.venv\Scripts\python.exe -m pytest scripts/tests/ -v`
Expected: all unit tests pass (the count should match what was written across Tasks 2-10; roughly 30 tests).

If any test fails, do not proceed — fix the code or the test and re-run.

- [ ] **Step 4: Dry-run with auto-detect on the Elvis song**

Run: `.venv\Scripts\python.exe scripts/analyse_song.py cant-help-falling-in-love --dry-run`
Expected: audit summary printed, JSON printed to stdout. Note the auto-detected BPM and time signature (will probably be wrong — likely 4/4 at ~136 BPM or ~68 BPM). Do not commit yet.

- [ ] **Step 5: Dry-run with recommended overrides**

Run:
```
.venv\Scripts\python.exe scripts/analyse_song.py cant-help-falling-in-love --time-signature 12/8 --beats-per-bar 4 --bpm 67 --min-chord-beats 2 --dry-run
```
Expected: audit summary shows 12/8 @ 67 BPM, beats spaced ~0.9s apart (or ~1.1s if --bpm 67 is interpreted as dotted-quarter pulse), chord segments around 40-60, top labels dominated by D / F#m / Bm / G / A, plus some C# or C#7 in the bridge.

The diff against `CANT_HELP_CHORDS` should show >70% root-match. If it's much lower than that, the meter is still confused — check the BPM and try other --bpm values (134, 200) to see if a different subdivision aligns better.

- [ ] **Step 6: Report results to the user**

After step 5, write a concise summary in user-facing text:
- detected BPM, time signature, key
- chord count before/after smoothing
- top labels and frequencies
- root-match % against CANT_HELP_CHORDS
- a list of bars where the script disagrees with the hand-authored progression (for the user to hand-review)

Then ask the user if they want to:
1. Commit the dry-run output as the new `analysis.json` (Task 14)
2. Try different flags first
3. Stop and hand-correct first

---

## Task 14: Write final analysis.json + browser smoke test

**Files:**
- Modify: `public/songs/cant-help-falling-in-love/analysis.json`
- Create: `public/songs/cant-help-falling-in-love/analysis.legacy.json`

- [ ] **Step 1: Run the script for real (writes files)**

Use whatever flag set the user approved in Task 13 step 6. For example:
```
.venv\Scripts\python.exe scripts/analyse_song.py cant-help-falling-in-love --time-signature 12/8 --beats-per-bar 4 --bpm 67 --min-chord-beats 2
```

Expected: same audit summary as the dry-run. Two files written:
- `public/songs/cant-help-falling-in-love/analysis.json` (new)
- `public/songs/cant-help-falling-in-love/analysis.legacy.json` (backup of the previous version)

- [ ] **Step 2: Sanity-check the written JSON**

Read the new `public/songs/cant-help-falling-in-love/analysis.json`. Verify:
- `timeSignature` is `"12/8"`
- `bpm` is `67`
- Every `chord.time` appears in `beats[]`
- No chord labels are bare lone letters with unexpected suffixes; spot-check 5 labels

- [ ] **Step 3: Browser smoke test**

Start the dev server: `npm run dev`
Open the ADMI in the browser, load the Elvis song, confirm:
- The song plays without console errors
- The chord-following voices (Red Pad, Yellow Arpeggio, Orange Bass) cycle through chords aligned with the audio
- The chord changes feel synchronised, not drifting

If the chord-following voices feel off, the most likely issue is the dotted-quarter vs quarter-note BPM mismatch. Try regenerating with `--bpm 134` (quarter-note pulse) and see if that feels more aligned.

- [ ] **Step 4: Commit the new analysis.json + backup**

```bash
git add public/songs/cant-help-falling-in-love/analysis.json public/songs/cant-help-falling-in-love/analysis.legacy.json
git commit -m "songs(elvis): regenerate analysis.json via reproducible pipeline (12/8 @ 67)"
```

- [ ] **Step 5: Log the change via log_admi_change MCP tool**

Per the original task brief, log the change. Summary should mention:
- Resolves the issue of `analysis.json` being non-reproducible
- Methodological framing: automatic-transcription-with-human-review pipeline (not runtime chord detection)
- Files added: `scripts/analyse_song.py`, `scripts/requirements.txt`, `scripts/README.md`, `scripts/tests/`
- Files modified: `public/songs/cant-help-falling-in-love/analysis.json` (regenerated, beat-aligned 12/8 @ 67 BPM)
- Backup retained: `analysis.legacy.json`

- [ ] **Step 6: Report hand-correction candidates to the user**

After the script run, identify and report:
- Bars in the bridge where the script emitted `C#` and the hand-authored uses `C#7` — these are candidates for manual addition of the `7` suffix
- Any bars where the script's root disagrees with the hand-authored root by more than a semitone — these are likely template-matching errors worth eyeballing
- The B7 and A7 chords in the bridge ending (around bars 33-36 of the hand-authored progression) — likely simplified to B and A by the script

---

## Self-review

**Spec coverage:**
- ✅ Output schema: Task 10 builds the dict; pre-write validation enforces shape
- ✅ Vocabulary regex: Task 2 implements `validate_label`; Task 10 enforces it
- ✅ Beat-grid quantisation: Task 9 (`build_segments`) emits times from `beats[]`; Task 10 set-membership check enforces
- ✅ Adjacent identical chords merged: Task 9 via `_runs_of`
- ✅ Final chord duration extends to song end: Task 9 test `test_build_segments_final_run_extends_to_audio_duration`
- ✅ Reproducible, self-contained: pinned `scripts/requirements.txt` in Task 1
- ✅ librosa + chord templates: Task 2 templates, Task 7 matching
- ✅ Chord recognition on `other.wav`, beat on `drums.wav` with fallback: Task 3
- ✅ Meter sanity check + override flags: Task 4 (sanity check), Task 11 (CLI flags)
- ✅ Min chord duration filter: Task 8
- ✅ CLI surface matches spec: Task 11
- ✅ scripts/README.md with install + known limitations: Task 12
- ✅ Re-run on Elvis + side-by-side comparison: Tasks 13-14
- ✅ Backup as analysis.legacy.json: Task 11 (in `main`)
- ✅ No runtime TypeScript change: enforced by file list

**Placeholder scan:** No TBDs, no "implement later", no naked "add validation". Code in every step.

**Type consistency:** Function signatures listed in File Structure match the implementations in Tasks 2-10. `build_segments` returns `list[dict]` in Task 9 and `build_analysis_json` consumes `list[dict]` in Task 10 — consistent.

**One nit I'll accept:** I refer to `_load_librosa()` as a deferred-import helper to keep `python scripts/analyse_song.py --help` fast (librosa imports take ~1s otherwise). This is a small idiom rather than a clean abstraction and is not separately tested, but it's mechanical enough not to need a dedicated task.
