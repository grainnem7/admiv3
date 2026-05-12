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

    84 entries: 12 roots x 7 qualities.
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


# ============================================================================
# Audio loading
# ============================================================================

# Names of stems that might exist in a song directory, in priority order
# when no specific stem is requested and we need to build a sum-mix.
KNOWN_STEMS = ("drums.wav", "bass.wav", "other.wav", "vocals.wav")
FALLBACK_MIX_NAMES = ("mix.wav", "full.wav")


def _load_librosa():
    """Lazy librosa import so `--help` stays fast (librosa import is ~1s)."""
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
            stacked[: len(s)] += s
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


# ============================================================================
# Beat tracking
# ============================================================================

def track_beats(
    y: np.ndarray, sr: int, bpm_hint: float | None = None
) -> tuple[np.ndarray, float]:
    """Detect beats in `y`. If `bpm_hint` is given, use it as start_bpm
    and return it verbatim as the bpm. Otherwise call librosa with no hint.

    For non-4/4 meters (notably 12/8 ballads), librosa's auto-detection is
    unreliable — it tends to lock onto eighth-note or quarter-note
    subdivisions instead of the felt pulse. The documented remedy is the
    --bpm CLI override; we don't try to second-guess librosa here.

    Returns: (beats_in_seconds, bpm_used).
    """
    librosa = _load_librosa()
    if bpm_hint is not None:
        bpm_arr, beat_frames = librosa.beat.beat_track(
            y=y, sr=sr, start_bpm=bpm_hint, tightness=100, units="frames"
        )
        beats = librosa.frames_to_time(beat_frames, sr=sr)
        return beats, float(bpm_hint)

    bpm_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    bpm_detected = float(np.atleast_1d(bpm_arr)[0])
    beats = librosa.frames_to_time(beat_frames, sr=sr)
    return beats, bpm_detected


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
        major = np.roll(_KS_MAJOR, tonic)
        minor = np.roll(_KS_MINOR, tonic)
        for profile, mode in ((major, "Major"), (minor, "Minor")):
            score = float(np.corrcoef(mean, profile)[0, 1])
            if score > best_score:
                best_score = score
                best_label = f"{_TONIC_NAMES[tonic]} {mode}"
    return best_label


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
    # N beat frames (pre-roll + N-1 inter-beat + post-roll). Drop pre-roll.
    synced = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
    return synced[:, 1:]


# ============================================================================
# Template matching
# ============================================================================

# Major and minor triads get the triad bias multiplier; 7-chords/dim/aug do not.
_TRIAD_QUALITIES = {"", "m"}


def label_beats(
    beat_chroma: np.ndarray,
    templates: dict[str, np.ndarray],
    verbose: bool = False,
) -> list[str]:
    """Match each column of `beat_chroma` against `templates`. Returns one
    label per beat. Beats below the silence threshold or below MIN_CONFIDENCE
    get labelled 'N'."""
    n_beats = beat_chroma.shape[1]
    if n_beats == 0:
        return []

    magnitudes = np.linalg.norm(beat_chroma, axis=0)
    mean_magnitude = float(magnitudes.mean()) if magnitudes.size > 0 else 0.0
    silence_floor = SILENCE_THRESHOLD * mean_magnitude

    template_labels = list(templates.keys())
    template_matrix = np.stack([templates[l] for l in template_labels], axis=0)
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
        sims = template_matrix @ normalised
        biased = sims * bias
        best_idx = int(np.argmax(biased))
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
        out.append(template_labels[best_idx])
    return out


def _label_quality(label: str) -> str:
    """Return the quality suffix of a chord label, e.g. 'C#m7' -> 'm7'."""
    m = LABEL_REGEX.fullmatch(label)
    if not m:
        return ""
    return m.group(2) or ""


# ============================================================================
# Smoothing
# ============================================================================

def smooth_labels(labels: list[str], min_chord_beats: int) -> list[str]:
    """Replace runs shorter than `min_chord_beats` with the label of their
    longest neighbour. On each pass, the short run with the LONGEST dominant
    neighbour is processed first — this lets obvious merges happen before
    ambiguous ones. Repeats until stable. min_chord_beats=1 is a no-op."""
    if min_chord_beats <= 1 or len(labels) == 0:
        return list(labels)
    current = list(labels)
    while True:
        runs = _runs_of(current)
        # Find all short runs with their best (longest) neighbour
        short_runs = []
        for run in runs:
            if run["length"] >= min_chord_beats:
                continue
            left = _neighbour(runs, run, direction=-1)
            right = _neighbour(runs, run, direction=+1)
            if left is None and right is None:
                continue  # single run, nowhere to absorb
            best_neighbour_len = max(
                (left["length"] if left else -1),
                (right["length"] if right else -1),
            )
            short_runs.append((run, left, right, best_neighbour_len))
        if not short_runs:
            return current
        # Pick the short run with the longest dominant neighbour. Tie-break
        # by smallest run length, then by leftmost position.
        short_runs.sort(
            key=lambda t: (-t[3], t[0]["length"], t[0]["start"])
        )
        run, left, right, _ = short_runs[0]
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
        for i in range(run["start"], run["start"] + run["length"]):
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
    """Return the adjacent run in the given direction (-1=left, +1=right),
    or None at the boundary."""
    idx = runs.index(run)
    target = idx + direction
    if target < 0 or target >= len(runs):
        return None
    return runs[target]
