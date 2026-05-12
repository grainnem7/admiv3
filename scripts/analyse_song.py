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
