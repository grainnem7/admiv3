"""Compute a vocal-harmony track from melody[] + chords[] in analysis.json.

For each vocal note (from pYIN: Notes), find the chord active at that
moment, then compute several candidate harmony pitches:

  - thirdUp:  diatonic 3rd above the vocal, snapped to a chord tone
  - fifthUp:  diatonic 5th above
  - sixthUp:  diatonic 6th above (often the most pleasing harmony)
  - thirdDn:  3rd below the vocal (low harmony)

Each harmony pitch is the nearest pitch within +/- 6 semitones of the
nominal interval that is also a tone of the active chord. This is
what TC-Helicon-style "smart" harmonisers do: the singer is free to
sing whatever, and the harmony pitches always fit the chord.

Output: a new `harmony[]` field in analysis.json with one entry per
vocal note, each entry containing all candidate intervals. The runtime
chooses which interval to play based on gesture (e.g. hand height
selects between thirdUp / fifthUp / sixthUp).

Usage:
    python scripts/build_harmony.py <song-id>

Requires both `melody[]` and `chords[]` in analysis.json — run
import_pyin_csv.py and import_chordino_csv.py first.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
PITCH_CLASS = {
    "C": 0, "C#": 1, "Db": 1,
    "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "F": 5, "F#": 6, "Gb": 6,
    "G": 7, "G#": 8, "Ab": 8,
    "A": 9, "A#": 10, "Bb": 10,
    "B": 11,
}

# Intervals (in semitones) above the chord root for each quality.
# Match the runtime's parseChordLabel in analysisLoader.ts.
CHORD_TONES_FROM_ROOT = {
    "":     (0, 4, 7),       # major
    "m":    (0, 3, 7),       # minor
    "7":    (0, 4, 7, 10),   # dominant 7
    "m7":   (0, 3, 7, 10),   # minor 7
    "maj7": (0, 4, 7, 11),   # major 7
    "dim":  (0, 3, 6),       # diminished triad
    "aug":  (0, 4, 8),       # augmented triad
}

LABEL_REGEX = re.compile(r"^([A-G][#b]?)(m|7|m7|maj7|dim|aug)?$")


def midi_to_label(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{(midi // 12) - 1}"


def chord_to_pitch_classes(chord_label: str) -> set[int] | None:
    """Return the pitch classes (0-11) that belong to this chord, or None
    if the label doesn't parse."""
    m = LABEL_REGEX.fullmatch(chord_label)
    if not m:
        return None
    root_name = m.group(1)
    quality = m.group(2) or ""
    root_pc = PITCH_CLASS.get(root_name)
    if root_pc is None:
        return None
    intervals = CHORD_TONES_FROM_ROOT.get(quality, (0, 4, 7))
    return {(root_pc + i) % 12 for i in intervals}


def chord_at(time_s: float, chord_segments: list[dict]) -> dict | None:
    """Find the chord segment active at `time_s`."""
    active = None
    for seg in chord_segments:
        if seg["time"] <= time_s:
            active = seg
        else:
            break
    if active is None:
        return None
    if active["time"] + active["duration"] < time_s:
        return None  # past the end
    return active


def snap_to_chord_tone(
    target_midi: int, chord_pcs: set[int], max_distance: int = 6
) -> int:
    """Return the pitch closest to `target_midi` (within `max_distance`
    semitones) that belongs to `chord_pcs`. Ties prefer the higher pitch."""
    best = target_midi
    best_dist = max_distance + 1
    for offset in range(-max_distance, max_distance + 1):
        candidate = target_midi + offset
        if candidate % 12 in chord_pcs:
            dist = abs(offset)
            if dist < best_dist or (dist == best_dist and offset > 0):
                best = candidate
                best_dist = dist
    return best


# Nominal target intervals from the vocal pitch (in semitones).
# These are the "diatonic" defaults; snap_to_chord_tone will adjust each
# to land on a chord tone.
INTERVAL_TARGETS = {
    "thirdUp": +4,   # major 3rd above (snapped down to minor 3rd if chord is minor)
    "fifthUp": +7,   # perfect 5th above
    "sixthUp": +9,   # major 6th above (a sweet pop harmony)
    "thirdDn": -3,   # minor 3rd below
}


def build_harmony_entry(
    vocal_note: dict, chord: dict | None
) -> dict | None:
    """Compute one harmony entry for a vocal note. Returns None if the
    chord at this moment doesn't parse (no harmony possible)."""
    if chord is None:
        return None
    chord_pcs = chord_to_pitch_classes(chord["label"])
    if not chord_pcs:
        return None
    vocal_midi = int(vocal_note["midi"])
    harmonies = {}
    for name, offset in INTERVAL_TARGETS.items():
        target = vocal_midi + offset
        snapped = snap_to_chord_tone(target, chord_pcs)
        harmonies[name] = {
            "midi": snapped,
            "label": midi_to_label(snapped),
            "semitonesFromVocal": snapped - vocal_midi,
        }
    return {
        "time": vocal_note["time"],
        "duration": vocal_note["duration"],
        "vocalMidi": vocal_midi,
        "vocalLabel": midi_to_label(vocal_midi),
        "chord": chord["label"],
        "harmonies": harmonies,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    args = parser.parse_args(argv)

    repo_root = SCRIPT_DIR.parent
    path = repo_root / "public" / "songs" / args.song_id / "analysis.json"
    if not path.exists():
        print(f"error: {path} not found.", file=sys.stderr)
        return 2

    data = json.loads(path.read_text(encoding="utf-8"))
    melody = data.get("melody", [])
    chords = data.get("chords", [])
    if not melody:
        print(
            "error: analysis.json has no melody[]. Run import_pyin_csv.py first.",
            file=sys.stderr,
        )
        return 2
    if not chords:
        print(
            "error: analysis.json has no chords[]. Run import_chordino_csv.py first.",
            file=sys.stderr,
        )
        return 2

    harmony: list[dict] = []
    no_chord = 0
    bad_chord = 0
    for note in melody:
        chord = chord_at(float(note["time"]), chords)
        if chord is None:
            no_chord += 1
            continue
        entry = build_harmony_entry(note, chord)
        if entry is None:
            bad_chord += 1
            continue
        harmony.append(entry)

    backup = path.with_suffix(f".{int(time.time())}.bak.json")
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    data["harmony"] = harmony
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    print(f"Built harmony for: {args.song_id}")
    print(f"  vocal notes:    {len(melody)}")
    print(f"  -> harmony entries: {len(harmony)}")
    if no_chord:
        print(f"  notes with no chord at that moment: {no_chord}")
    if bad_chord:
        print(f"  notes whose chord label didn't parse: {bad_chord}")
    # A quick taster: print first 5 entries
    if harmony:
        print("\nFirst 5 harmony entries:")
        for h in harmony[:5]:
            print(
                f"  t={h['time']:5.2f}s  vocal={h['vocalLabel']}  chord={h['chord']:5}  "
                f"3rd={h['harmonies']['thirdUp']['label']}  "
                f"5th={h['harmonies']['fifthUp']['label']}  "
                f"6th={h['harmonies']['sixthUp']['label']}"
            )
    print(f"\nWrote:  {path}")
    print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
