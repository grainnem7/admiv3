"""Import an onset CSV from Sonic Visualiser into analysis.json as `onsets[]`.

Accepts either of two SV export formats:

  - "Note Onsets" output: sparse list of onset timestamps (one row per onset).
    Format: `time, label` (or `time, value, ...`).

  - "Onset Detection Function" output: dense continuous curve at the
    plugin's internal sample rate.
    Format: `time, value` (one row every ~10 ms).

The script auto-detects which format you have and peak-picks the
detection function if needed. Picked peaks must exceed
--peak-threshold (a fraction of the function's median absolute deviation
from zero) and be separated by at least --min-separation seconds.

Usage:
    python scripts/import_onsets_csv.py <song-id> [--csv PATH] \\
        [--peak-threshold 0.15] [--min-separation 0.08]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import numpy as np
from scipy.signal import find_peaks

SCRIPT_DIR = Path(__file__).resolve().parent


def parse_csv(path: Path) -> list[tuple[float, float]]:
    """Parse CSV as (time, value). Skips header-like rows."""
    rows: list[tuple[float, float]] = []
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.reader(f):
            if len(r) < 2:
                continue
            try:
                t = float(r[0])
                v = float(r[1])
            except ValueError:
                continue
            rows.append((t, v))
    return rows


def find_csv(song_id: str, override: str | None) -> Path | None:
    if override:
        return Path(override)
    repo_root = SCRIPT_DIR.parent
    short_id = song_id.replace("-to-love", "")
    candidates = [
        repo_root / "public" / "songs" / song_id / "onsets.csv",
        repo_root / "public" / "songs" / song_id / "onset.csv",
        Path("C:/Users/Public/songs") / song_id / "onsets.csv",
        Path("C:/Users/Public/songs") / song_id / "onset.csv",
        Path("C:/Users/Public/songs") / short_id / "onsets.csv",
        Path("C:/Users/Public/songs") / short_id / "onset.csv",
    ]
    return next((p for p in candidates if p.exists()), None)


def looks_like_detection_function(rows: list[tuple[float, float]]) -> bool:
    """Heuristic: detection function has dense, near-uniform sampling.
    Note-onset events have sparse, irregular timestamps."""
    if len(rows) < 50:
        return False
    diffs = np.diff([r[0] for r in rows])
    median_dt = float(np.median(diffs))
    # Detection functions typically sample at 5-15 ms intervals
    return median_dt < 0.05


def extract_peaks(
    rows: list[tuple[float, float]],
    peak_threshold_frac: float,
    min_separation_s: float,
) -> list[float]:
    """Peak-pick a detection function. Returns a list of onset times."""
    times = np.array([r[0] for r in rows])
    values = np.array([r[1] for r in rows])
    # Threshold = peak_threshold_frac * (peak-to-mean ratio of the signal)
    mad = float(np.median(np.abs(values - np.median(values))))
    threshold = peak_threshold_frac * (np.max(values) - mad) + mad
    median_dt = float(np.median(np.diff(times)))
    min_distance_samples = max(1, int(min_separation_s / max(median_dt, 1e-6)))
    peak_idx, _ = find_peaks(
        values, height=threshold, distance=min_distance_samples
    )
    return [float(times[i]) for i in peak_idx]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument("--csv", default=None)
    parser.add_argument(
        "--peak-threshold",
        type=float,
        default=0.15,
        help="Fraction of (max - MAD) for peak height (only used if "
        "input is a detection function). Default 0.15.",
    )
    parser.add_argument(
        "--min-separation",
        type=float,
        default=0.08,
        help="Min seconds between detected onsets. Default 80 ms (~ a "
        "32nd note at 120 BPM).",
    )
    args = parser.parse_args(argv)

    repo_root = SCRIPT_DIR.parent
    analysis_path = repo_root / "public" / "songs" / args.song_id / "analysis.json"
    if not analysis_path.exists():
        print(f"error: {analysis_path} not found.", file=sys.stderr)
        return 2

    csv_path = find_csv(args.song_id, args.csv)
    if csv_path is None:
        print(f"error: onset CSV not found for {args.song_id}", file=sys.stderr)
        return 2

    rows = parse_csv(csv_path)
    if not rows:
        print(f"error: no parseable rows in {csv_path}", file=sys.stderr)
        return 2

    if looks_like_detection_function(rows):
        onsets = extract_peaks(rows, args.peak_threshold, args.min_separation)
        source = (
            f"detection function ({len(rows)} samples; peak-picked at "
            f"threshold {args.peak_threshold}, min-separation "
            f"{args.min_separation*1000:.0f} ms)"
        )
    else:
        onsets = sorted({r[0] for r in rows})
        source = f"discrete events ({len(onsets)} unique timestamps)"

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    backup = analysis_path.with_suffix(f".{int(time.time())}.bak.json")
    backup.write_text(analysis_path.read_text(encoding="utf-8"), encoding="utf-8")
    data["onsets"] = [round(t, 4) for t in onsets]
    analysis_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    duration = max(onsets) - min(onsets) if onsets else 0.0
    density = len(onsets) / duration if duration > 0 else 0.0

    print(f"Imported: {csv_path}")
    print(f"  source:   {source}")
    print(f"  kept:     {len(onsets)} onsets")
    print(f"  span:     {min(onsets):.2f}s - {max(onsets):.2f}s")
    print(f"  density:  {density:.2f} onsets/sec "
          f"(= {density * 60:.0f} per minute)")
    print(f"Wrote:  {analysis_path}")
    print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
