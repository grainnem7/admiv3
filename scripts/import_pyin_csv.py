"""Import a pYIN: Notes CSV into analysis.json as a `melody[]` field.

pYIN ("probabilistic YIN") is the QM Vamp Plugins' polyphonic-to-monophonic
pitch tracker. Its "Notes" output emits one row per detected note with
columns:

    start_seconds, frequency_Hz, duration_seconds, level

We:
  - convert frequency to MIDI note number
  - filter to a configurable pitch range (default vocal: MIDI 48-84)
  - emit each note as { time, duration, midi, label } into the melody[] field

pYIN on a full mix is noisier than on isolated vocals; expect ~10-30%
of detected notes to be bass guitar or instrumental bleed. The range
filter handles most of that. Hand-correction or further filtering may
still be needed for downstream use.

Usage:
    python scripts/import_pyin_csv.py <song-id> [--csv PATH] \\
        [--midi-min 48] [--midi-max 84]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def hz_to_midi(hz: float) -> float:
    if hz <= 0:
        return -1
    return 69.0 + 12.0 * math.log2(hz / 440.0)


def midi_to_label(midi: int) -> str:
    name = NOTE_NAMES[midi % 12]
    octave = (midi // 12) - 1
    return f"{name}{octave}"


def parse_pyin_csv(path: Path) -> list[dict]:
    """Return list of {time, hz, duration, level} from SV pYIN notes CSV.

    SV's note-layer export columns: time, value (Hz), duration, level.
    """
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.reader(f):
            if len(r) < 3:
                continue
            try:
                t = float(r[0])
                hz = float(r[1])
                dur = float(r[2])
            except ValueError:
                continue
            level = 0.0
            if len(r) >= 4:
                try:
                    level = float(r[3])
                except ValueError:
                    pass
            rows.append({"time": t, "hz": hz, "duration": dur, "level": level})
    return rows


def find_csv(song_id: str, override: str | None) -> Path | None:
    if override:
        return Path(override)
    repo_root = SCRIPT_DIR.parent
    short_id = song_id.replace("-to-love", "")
    candidates = [
        repo_root / "public" / "songs" / song_id / "pyin.csv",
        Path("C:/Users/Public/songs") / song_id / "pyin.csv",
        Path("C:/Users/Public/songs") / short_id / "pyin.csv",
    ]
    return next((p for p in candidates if p.exists()), None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument("--csv", default=None)
    parser.add_argument("--midi-min", type=int, default=48, help="C3 (default)")
    parser.add_argument("--midi-max", type=int, default=84, help="C6 (default)")
    parser.add_argument("--min-duration", type=float, default=0.08,
                        help="Drop notes shorter than this (sec). Default 80 ms.")
    args = parser.parse_args(argv)

    repo_root = SCRIPT_DIR.parent
    analysis_path = repo_root / "public" / "songs" / args.song_id / "analysis.json"
    if not analysis_path.exists():
        print(f"error: {analysis_path} not found.", file=sys.stderr)
        return 2

    csv_path = find_csv(args.song_id, args.csv)
    if csv_path is None:
        print(f"error: pyin.csv not found for {args.song_id}", file=sys.stderr)
        return 2

    raw_notes = parse_pyin_csv(csv_path)
    melody: list[dict] = []
    out_of_range = 0
    too_short = 0
    for n in raw_notes:
        if n["duration"] < args.min_duration:
            too_short += 1
            continue
        midi_float = hz_to_midi(n["hz"])
        midi = int(round(midi_float))
        if midi < args.midi_min or midi > args.midi_max:
            out_of_range += 1
            continue
        melody.append({
            "time": round(n["time"], 4),
            "duration": round(n["duration"], 4),
            "midi": midi,
            "label": midi_to_label(midi),
        })

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    backup = analysis_path.with_suffix(f".{int(time.time())}.bak.json")
    backup.write_text(analysis_path.read_text(encoding="utf-8"), encoding="utf-8")
    data["melody"] = melody
    analysis_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    print(f"Imported: {csv_path}")
    print(f"  raw notes:         {len(raw_notes)}")
    print(f"  out of range:      {out_of_range} (midi < {args.midi_min} or > {args.midi_max})")
    print(f"  too short:         {too_short} (< {args.min_duration*1000:.0f} ms)")
    print(f"  kept:              {len(melody)}")
    if melody:
        # Pitch distribution
        counts: dict[int, int] = {}
        for m in melody:
            counts[m["midi"]] = counts.get(m["midi"], 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:8]
        print(f"  top pitches: " + ", ".join(f"{midi_to_label(m)}({c})" for m, c in top))
        total_dur = sum(m["duration"] for m in melody)
        print(f"  total melody duration: {total_dur:.1f}s")
    print(f"Wrote:  {analysis_path}")
    print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
