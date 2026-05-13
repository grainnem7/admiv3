"""Replace analysis.json's beat grid with beats from a Sonic Visualiser CSV.

Use this to cross-validate librosa's beat tracking with a second tracker
(e.g. the QM Bar and Beat Tracker Vamp plugin). The SV CSV format is
typically `time_seconds, value_or_label` with one row per beat — we
just read the first column.

After running this you'll usually want to re-run import_chordino_csv.py
on the same song so the chord array gets re-mapped onto the new beat
grid. Then run check_beat_alignment.py to confirm the phase offset is
gone.

Usage:
    python scripts/import_sv_beats.py <song-id> [--csv PATH] [--beats-per-bar N]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent


def load_sv_beats_csv(path: Path) -> list[float]:
    """Read SV-exported annotation layer CSV. First column = beat time."""
    times: list[float] = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if not row:
                continue
            try:
                times.append(float(row[0]))
            except (ValueError, IndexError):
                continue
    return sorted(set(times))


def find_csv(song_id: str, override: str | None) -> Path | None:
    if override:
        return Path(override)
    repo_root = SCRIPT_DIR.parent
    short_id = song_id.replace("-to-love", "")
    candidates = [
        repo_root / "public" / "songs" / song_id / "beats.csv",
        repo_root / "public" / "songs" / song_id / "beatbar.csv",
        Path("C:/Users/Public/songs") / song_id / "beats.csv",
        Path("C:/Users/Public/songs") / song_id / "beatbar.csv",
        Path("C:/Users/Public/songs") / short_id / "beats.csv",
        Path("C:/Users/Public/songs") / short_id / "beatbar.csv",
    ]
    return next((p for p in candidates if p.exists()), None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument("--csv", default=None)
    parser.add_argument("--beats-per-bar", type=int, default=4)
    args = parser.parse_args(argv)

    repo_root = SCRIPT_DIR.parent
    analysis_path = repo_root / "public" / "songs" / args.song_id / "analysis.json"
    if not analysis_path.exists():
        print(f"error: {analysis_path} not found.", file=sys.stderr)
        return 2

    csv_path = find_csv(args.song_id, args.csv)
    if csv_path is None:
        print(f"error: beats CSV not found for {args.song_id}", file=sys.stderr)
        return 2

    new_beats = load_sv_beats_csv(csv_path)
    if len(new_beats) < 4:
        print(
            f"error: only {len(new_beats)} beats found in {csv_path}", file=sys.stderr
        )
        return 2

    new_beats_arr = np.asarray(new_beats, dtype=float)
    median_ibi = float(np.median(np.diff(new_beats_arr)))
    new_bpm = 60.0 / median_ibi

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    old_bpm = float(data.get("bpm", 0.0))
    old_beats = data.get("beats", [])

    # Write new beats + downbeats + bpm. Chord array stays for now (will be
    # rebuilt by re-running import_chordino_csv.py).
    data["beats"] = [float(b) for b in new_beats]
    data["downbeats"] = [float(b) for b in new_beats[:: args.beats_per_bar]]
    data["bpm"] = new_bpm

    backup = analysis_path.with_suffix(f".{int(time.time())}.bak.json")
    backup.write_text(analysis_path.read_text(encoding="utf-8"), encoding="utf-8")
    analysis_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    print(f"Imported: {csv_path}")
    print(f"  beats:    {len(old_beats)} (old) -> {len(new_beats)} (new)")
    print(f"  bpm:      {old_bpm:.2f} -> {new_bpm:.2f}")
    print(
        f"  median IBI {median_ibi*1000:.1f} ms; first beat {new_beats[0]:.3f}s, "
        f"last beat {new_beats[-1]:.3f}s"
    )
    print(f"  downbeats: {len(data['downbeats'])} (every {args.beats_per_bar}th)")
    print()
    print(f"Wrote:  {analysis_path}")
    print(f"Backup: {backup}")
    print()
    print(
        "Next: re-run import_chordino_csv.py on this song to remap the chord "
        "array onto the new beat grid, then check_beat_alignment.py to "
        "verify the offset distribution."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
