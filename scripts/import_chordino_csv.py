"""Convert a Chordino CSV export into a runtime-compatible chord array.

Workflow:
1. In Sonic Visualiser, run Transform -> Chordino: Chord Estimate on the
   song's mix audio.
2. Export Annotation Layer -> CSV. The default two-column format is
   `start_seconds,chord_label` and that is what this script expects.
3. Save the CSV either as <repo>/public/songs/<id>/chordino.csv or as
   C:/Users/Public/songs/<id>/chordino.csv (or use --csv to pass any path).
4. Run: python scripts/import_chordino_csv.py <song-id>

The script:
  - reads the beat grid from the existing analysis.json (run
    analyse_song.py first if you don't have one)
  - for every beat, finds the Chordino chord active at that time
  - normalises Chordino labels (e.g. Dmaj7, Dm6, E/B) to the runtime
    vocabulary [A-G][#b]?(m|7|m7|maj7|dim|aug)?
  - smooths runs shorter than --min-chord-beats (default 2)
  - merges adjacent identical labels into chord segments
  - rewrites the chord array in analysis.json (timestamped backup made)
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

# Reuse smooth_labels / build_segments / validate_label from analyse_song
SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "analyse_song", SCRIPT_DIR / "analyse_song.py"
)
analyse_song = importlib.util.module_from_spec(spec)
sys.modules["analyse_song"] = analyse_song
spec.loader.exec_module(analyse_song)


def normalise_label(raw: str) -> str | None:
    """Map Chordino label -> runtime vocabulary, or None if unmappable."""
    raw = raw.strip().strip('"')
    if raw in ("", "N", "X"):
        return "N"
    # Drop slash bass: "X/Y" -> "X"
    if "/" in raw:
        raw = raw.split("/", 1)[0]
    m = re.match(r"^([A-G][#b]?)(.*)$", raw)
    if not m:
        return None
    root = m.group(1)
    suffix = m.group(2).strip()
    if suffix in ("", "maj", "M"):
        out_suffix = ""
    elif suffix in ("m", "min", "-"):
        out_suffix = "m"
    elif suffix in ("7", "dom7"):
        out_suffix = "7"
    elif suffix in ("m7", "min7", "-7"):
        out_suffix = "m7"
    elif suffix in ("maj7", "M7", "ma7"):
        out_suffix = "maj7"
    elif suffix in ("dim", "o", "dim7", "o7", "hdim7", "m7b5", "ø"):
        out_suffix = "dim"
    elif suffix in ("aug", "+"):
        out_suffix = "aug"
    elif suffix in ("6", "maj6", "M6"):
        out_suffix = ""  # drop the 6th, keep triad
    elif suffix in ("m6", "min6", "-6"):
        out_suffix = "m"
    elif suffix in ("9", "11", "13", "7sus4", "7b9", "7#9"):
        out_suffix = "7"
    elif suffix in ("m9", "min9", "m11", "min11", "m13"):
        out_suffix = "m7"
    elif suffix in ("maj9", "M9", "maj11", "maj13"):
        out_suffix = "maj7"
    elif suffix in ("sus", "sus2", "sus4"):
        out_suffix = ""  # drop sus, treat as plain triad
    else:
        return None
    out = root + out_suffix
    return out if analyse_song.validate_label(out) else None


def parse_csv(path: Path) -> list[tuple[float, str]]:
    """Parse Chordino CSV: [(start_seconds, raw_label), ...] sorted by time."""
    rows: list[tuple[float, str]] = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            try:
                t = float(row[0])
            except ValueError:
                continue
            rows.append((t, row[1]))
    rows.sort(key=lambda r: r[0])
    return rows


def chord_at_time(segments: list[tuple[float, str]], t: float) -> str:
    """Find the chord active at time `t`. Walks in order (linear; fine for ~hundreds of segments)."""
    active = "N"
    for seg_t, label in segments:
        if seg_t <= t:
            active = label
        else:
            break
    return active


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument(
        "--csv",
        default=None,
        help="CSV path (defaults to <repo>/public/songs/<id>/chordino.csv "
        "or C:/Users/Public/songs/<id>/chordino.csv if that exists)",
    )
    parser.add_argument("--min-chord-beats", type=int, default=2)
    args = parser.parse_args(argv)

    repo_root = SCRIPT_DIR.parent
    song_dir = repo_root / "public" / "songs" / args.song_id
    analysis_path = song_dir / "analysis.json"

    if not analysis_path.exists():
        print(
            f"error: {analysis_path} not found. Run analyse_song.py first.",
            file=sys.stderr,
        )
        return 2

    if args.csv:
        csv_path = Path(args.csv)
    else:
        candidates = [
            song_dir / "chordino.csv",
            Path("C:/Users/Public/songs") / args.song_id / "chordino.csv",
        ]
        csv_path = next((p for p in candidates if p.exists()), None)
        if csv_path is None:
            print(
                "error: chordino.csv not found in any of:\n  "
                + "\n  ".join(str(c) for c in candidates),
                file=sys.stderr,
            )
            return 2

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    beats = data["beats"]
    if len(beats) < 2:
        print("error: analysis.json has fewer than 2 beats.", file=sys.stderr)
        return 2
    median_ibi = float(np.median(np.diff(beats)))
    audio_duration = float(beats[-1]) + median_ibi

    chord_segments = parse_csv(csv_path)
    if not chord_segments:
        print(f"error: no parseable rows in {csv_path}", file=sys.stderr)
        return 2

    raw_labels: list[str] = []
    unmapped: dict[str, int] = {}
    for beat_time in beats:
        chord_raw = chord_at_time(chord_segments, float(beat_time))
        normalised = normalise_label(chord_raw)
        if normalised is None:
            unmapped[chord_raw] = unmapped.get(chord_raw, 0) + 1
            raw_labels.append("N")
        else:
            raw_labels.append(normalised)

    smoothed = analyse_song.smooth_labels(raw_labels, args.min_chord_beats)
    new_segments = analyse_song.build_segments(
        smoothed, np.array(beats), audio_duration
    )

    # Pre-write validation
    beats_set = set(float(b) for b in beats)
    for seg in new_segments:
        if float(seg["time"]) not in beats_set:
            print(f"error: segment time {seg['time']} not in beats grid.", file=sys.stderr)
            return 2
        if not analyse_song.validate_label(seg["label"]):
            print(f"error: bad label {seg['label']!r}", file=sys.stderr)
            return 2

    # Backup + write
    backup = analysis_path.with_suffix(f".{int(time.time())}.bak.json")
    backup.write_text(analysis_path.read_text(encoding="utf-8"), encoding="utf-8")

    data["chords"] = new_segments
    analysis_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    # Audit summary
    label_counts: dict[str, int] = {}
    for seg in new_segments:
        label_counts[seg["label"]] = label_counts.get(seg["label"], 0) + 1
    print(f"Imported: {csv_path}")
    print(
        f"  {len(chord_segments)} CSV segments -> "
        f"{len(new_segments)} merged chord runs "
        f"(min-chord-beats={args.min_chord_beats})"
    )
    print("Top labels:")
    for label, count in sorted(label_counts.items(), key=lambda kv: -kv[1])[:10]:
        frac = count / max(1, len(new_segments))
        print(f"  {label:6} {count:3} ({frac:.0%})")
    if unmapped:
        print(f"Unmapped labels (treated as N — review if surprising):")
        for label, count in sorted(unmapped.items(), key=lambda kv: -kv[1])[:10]:
            print(f"  {label!r}: {count}")
    print(f"Wrote:  {analysis_path}")
    print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
