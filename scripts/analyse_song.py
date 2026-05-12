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


# ============================================================================
# Audit summary
# ============================================================================

def print_summary(
    *,
    song_id: str,
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
    print()

    if existing_analysis is not None:
        existing_chords = existing_analysis.get("chords", [])
        beats_set = set(float(b) for b in beats)
        existing_off_grid = sum(
            1 for c in existing_chords if c["time"] not in beats_set
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
    """Compare segments against CANT_HELP_CHORDS from chordLookup.ts.

    Hand-authored progression starts at audio time 0; actual stems have
    ~beats[0] of pre-roll. Subtract that to align."""
    if len(beats) == 0:
        return
    offset = float(beats[0])
    hand_chords = _CANT_HELP_HAND_AUTHORED
    matches_on_root = 0
    matches_on_label = 0
    mismatches: list[str] = []
    for hc in hand_chords:
        target_time = hc["time"] + offset
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
        else:
            mismatches.append(
                f"  @ {hc['time']:6.2f}s (hand: {hc['name']:5}) -> script: {active['label']}"
            )
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
    if mismatches:
        print(f"  Mismatches ({len(mismatches)}):")
        for m in mismatches[:20]:
            print(m)
        if len(mismatches) > 20:
            print(f"  ... and {len(mismatches) - 20} more")


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


def _quick_detect_bpm(y: np.ndarray, sr: int) -> float:
    librosa = _load_librosa()
    bpm_arr, _ = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    return float(np.atleast_1d(bpm_arr)[0])


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

    beat_y, chord_y, sr, audio_duration = load_audio(
        song_dir, beat_stem=args.beat_stem, chord_stem=args.chord_stem
    )
    beats, bpm_used = track_beats(beat_y, sr, bpm_hint=args.bpm)
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
        song_id=args.song_id,
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

    if existing_path.exists() and not args.no_backup:
        backup_path = song_dir / "analysis.legacy.json"
        backup_path.write_text(
            existing_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
        print(f"Backup: {backup_path}")

    existing_path.write_text(
        json.dumps(analysis, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote: {existing_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
