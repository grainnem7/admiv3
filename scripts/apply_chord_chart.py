"""Apply a per-bar chord pattern to a song's beat grid.

Used for the hybrid workflow: take the beat/downbeat grid produced by
analyse_song.py, throw away the auto-detected chord labels (which are
often noisy), and replace them with a hand-recalled chord chart.

The chart is a list of chord labels, one per BAR (not beat). The list
loops if the song has more bars than the chart length. Each entry must
be a label the runtime accepts: [A-G][#b]?(m|7|m7|maj7|dim|aug)?.

Usage (from repo root):

    python scripts/apply_chord_chart.py <song-id> [--start-bar N] \\
        --pattern "Bb,Bb,Bb,Bb,Eb,Eb,Bb,Bb,F7,Eb,Bb,F7"

  --start-bar N : skip the first N downbeats (silence/intro). Chords
                  begin at downbeat N. Default 0.
  --pattern STR : comma-separated chord labels, one per bar, looping.

Backs up the existing analysis.json to analysis.<timestamp>.bak.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

LABEL_REGEX = re.compile(r"^([A-G][#b]?)(m|7|m7|maj7|dim|aug)?$")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument("--pattern", required=True, help="Comma-separated chord labels per bar.")
    parser.add_argument("--start-bar", type=int, default=0, help="Skip first N downbeats (intro silence).")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    path = repo_root / "public" / "songs" / args.song_id / "analysis.json"
    if not path.exists():
        print(f"error: {path} does not exist. Run analyse_song.py first.", file=sys.stderr)
        return 2

    pattern = [p.strip() for p in args.pattern.split(",") if p.strip()]
    for label in pattern:
        if not LABEL_REGEX.fullmatch(label):
            print(f"error: '{label}' is not in the runtime chord vocabulary.", file=sys.stderr)
            return 2

    data = json.loads(path.read_text(encoding="utf-8"))
    beats: list[float] = data["beats"]
    downbeats: list[float] = data["downbeats"]
    if not downbeats:
        print("error: analysis.json has no downbeats.", file=sys.stderr)
        return 2

    # Active bars start at args.start_bar
    active_downbeats = downbeats[args.start_bar:]
    if not active_downbeats:
        print(f"error: --start-bar {args.start_bar} skips past all downbeats.", file=sys.stderr)
        return 2

    # End time = beat after the last downbeat, or song end
    audio_end = max(beats[-1], active_downbeats[-1]) + (
        (beats[-1] - beats[-2]) if len(beats) >= 2 else 1.0
    )

    # Walk the downbeats, assigning each bar a chord from the pattern (looping)
    # Merge consecutive identical chords into single segments.
    segments: list[dict] = []
    for i, db in enumerate(active_downbeats):
        chord = pattern[i % len(pattern)]
        end = active_downbeats[i + 1] if i + 1 < len(active_downbeats) else audio_end
        if segments and segments[-1]["label"] == chord:
            segments[-1]["duration"] = end - segments[-1]["time"]
        else:
            segments.append({"time": float(db), "duration": float(end - db), "label": chord})

    # Pre-write validation: every chord time must be in beats[]
    beats_set = set(float(b) for b in beats)
    for seg in segments:
        if float(seg["time"]) not in beats_set:
            print(
                f"error: segment time {seg['time']} not in beats grid. Bug?",
                file=sys.stderr,
            )
            return 2

    # Backup + write
    backup = path.with_suffix(f".{int(time.time())}.bak.json")
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Backup: {backup}")

    data["chords"] = segments
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote: {path} ({len(segments)} chord segments)")
    print(f"Pattern: {' '.join(pattern)} (looped over {len(active_downbeats)} bars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
