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
