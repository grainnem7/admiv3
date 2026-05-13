"""Check whether librosa's beat grid agrees with Chordino's chord change times.

For each chord change in the Chordino CSV, find the nearest beat in the
analysis.json's beat grid, and report the offset. If the two analyses
agree on where harmonic content changes (mean offset ~ 0, small stdev),
the beat grid is probably well-aligned to the recording.

Usage:
    python scripts/check_beat_alignment.py <song-id> [--csv PATH]

Outputs a one-screen report:
  - mean / median / stdev offset (ms)
  - 90th-percentile abs offset
  - linear drift check (offset vs time correlation)
  - count of chord changes that land mid-beat (>50% of inter-beat interval)

Interpretation:
  - mean ~0 +/- 30 ms, stdev < 50 ms -> beats well aligned, trust them
  - mean ~0 but high stdev -> chord changes happen mid-beat; this is normal
    for music that genuinely changes on offbeats, but suspicious otherwise
  - non-zero mean (consistent +X or -X ms) -> systematic offset; could be
    a beat-tracker phase error
  - drift correlation high -> BPM is wrong (offset grows over the song);
    re-run analyse_song.py with a corrected --bpm
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent


def load_chordino_csv(path: Path) -> list[float]:
    """Return the chord-change start times (seconds), excluding the first
    'N' row at t=0 if present."""
    times: list[float] = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            try:
                t = float(row[0])
            except ValueError:
                continue
            label = row[1].strip().strip('"')
            # Skip the leading no-chord region; we only want real changes
            if t == 0.0 and label.upper() in ("N", ""):
                continue
            times.append(t)
    return sorted(times)


def find_csv(song_id: str, override: str | None) -> Path | None:
    if override:
        return Path(override)
    repo_root = SCRIPT_DIR.parent
    candidates = [
        repo_root / "public" / "songs" / song_id / "chordino.csv",
        Path("C:/Users/Public/songs") / song_id / "chordino.csv",
        # User's "everybody-needs-somebody" shorthand
        Path("C:/Users/Public/songs") / song_id.replace("-to-love", "") / "chordino.csv",
    ]
    return next((p for p in candidates if p.exists()), None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument("--csv", default=None)
    args = parser.parse_args(argv)

    repo_root = SCRIPT_DIR.parent
    analysis_path = repo_root / "public" / "songs" / args.song_id / "analysis.json"
    if not analysis_path.exists():
        print(f"error: {analysis_path} not found.", file=sys.stderr)
        return 2

    csv_path = find_csv(args.song_id, args.csv)
    if csv_path is None or not csv_path.exists():
        print(f"error: chordino.csv not found for {args.song_id}", file=sys.stderr)
        return 2

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    beats = np.asarray(data["beats"], dtype=float)
    if len(beats) < 2:
        print("error: analysis.json has fewer than 2 beats.", file=sys.stderr)
        return 2
    median_ibi = float(np.median(np.diff(beats)))

    chord_change_times = load_chordino_csv(csv_path)
    if not chord_change_times:
        print("error: no chord changes found in CSV.", file=sys.stderr)
        return 2

    # For each chord change, find the nearest beat and the signed offset
    offsets_ms: list[float] = []
    for t in chord_change_times:
        idx = int(np.argmin(np.abs(beats - t)))
        offsets_ms.append((t - float(beats[idx])) * 1000.0)
    offsets = np.asarray(offsets_ms)
    abs_offsets = np.abs(offsets)

    # Drift check: linear correlation of signed offset vs time.
    # If non-zero, BPM is wrong: offset grows monotonically.
    times_arr = np.asarray(chord_change_times)
    if len(times_arr) >= 3:
        drift_corr = float(np.corrcoef(times_arr, offsets)[0, 1])
        # Slope (ms per second) tells us by how much beats drift relative to truth.
        slope_ms_per_s, intercept = np.polyfit(times_arr, offsets, 1)
    else:
        drift_corr = 0.0
        slope_ms_per_s = 0.0
        intercept = 0.0

    # How many chord changes land "mid-beat" (>50% of inter-beat interval)
    half_ibi_ms = median_ibi * 1000.0 / 2.0
    mid_beat_count = int(np.sum(abs_offsets > half_ibi_ms))

    # If beats are well aligned, the histogram should peak near 0
    # Group offsets into ten-percent-of-IBI bins
    bin_edges_ms = np.linspace(-half_ibi_ms, half_ibi_ms, 11)
    hist, _ = np.histogram(offsets, bins=bin_edges_ms)

    print(f"=== Beat-vs-chordino alignment: {args.song_id} ===")
    print(f"CSV: {csv_path}")
    print(
        f"Beats: {len(beats)} (median IBI {median_ibi*1000:.1f} ms; "
        f"BPM = {60.0/median_ibi:.1f})"
    )
    print(f"Chord-change events: {len(chord_change_times)}")
    print()
    print("Offset of chord-change times relative to nearest beat (ms):")
    print(f"  mean:    {float(np.mean(offsets)):+7.1f}")
    print(f"  median:  {float(np.median(offsets)):+7.1f}")
    print(f"  stdev:   {float(np.std(offsets)):7.1f}")
    print(f"  90th-%ile abs: {float(np.percentile(abs_offsets, 90)):7.1f}")
    print(f"  max abs: {float(np.max(abs_offsets)):7.1f}")
    print()
    print("Histogram (each bin = ~10% of one inter-beat interval):")
    bin_centers = (bin_edges_ms[:-1] + bin_edges_ms[1:]) / 2
    max_count = max(1, int(np.max(hist)))
    for c, h in zip(bin_centers, hist):
        bar = "#" * int(40 * h / max_count)
        print(f"  {c:+6.0f} ms | {bar}{' ' * (40 - len(bar))} {h}")
    print()
    print(f"Mid-beat chord changes (>{half_ibi_ms:.0f} ms from nearest beat): "
          f"{mid_beat_count}/{len(chord_change_times)}")
    print()
    print("Drift check:")
    print(f"  slope:       {slope_ms_per_s:+.3f} ms per second of audio")
    print(f"  correlation: {drift_corr:+.3f}")
    if abs(drift_corr) > 0.5 and abs(slope_ms_per_s) > 0.5:
        # Total drift across the song
        total_drift_ms = slope_ms_per_s * float(beats[-1])
        # Suggested BPM correction
        # If beats drift by D seconds across N total beats, then the true
        # IBI was median_ibi - D/N. So true BPM = 60 / (median_ibi - D/N).
        n_beats = len(beats)
        true_ibi = median_ibi - (total_drift_ms / 1000.0) / n_beats
        if true_ibi > 0:
            true_bpm = 60.0 / true_ibi
            current_bpm = data.get("bpm", 60.0 / median_ibi)
            print(
                f"  -> beat grid drifts by {total_drift_ms:+.0f} ms over "
                f"{float(beats[-1]):.0f}s of audio."
            )
            print(
                f"  -> current bpm in analysis.json: {current_bpm:.2f}; "
                f"corrected estimate: {true_bpm:.2f}"
            )
            print(
                "     (re-run: analyse_song.py "
                f"{args.song_id} --bpm {true_bpm:.1f} --min-chord-beats 2,"
                " then re-import the chordino CSV)"
            )
    else:
        print("  (no significant drift detected)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
