"""Unit tests for the pure-function components of analyse_song."""

import importlib.util
import sys
from pathlib import Path

import numpy as np

SCRIPT = Path(__file__).resolve().parent.parent / "analyse_song.py"
spec = importlib.util.spec_from_file_location("analyse_song", SCRIPT)
analyse_song = importlib.util.module_from_spec(spec)
sys.modules["analyse_song"] = analyse_song
spec.loader.exec_module(analyse_song)


def test_chord_templates_has_84_chord_templates():
    templates = analyse_song.build_chord_templates()
    # 7 qualities x 12 roots
    assert len(templates) == 84


def test_chord_template_C_major_has_root_third_fifth():
    templates = analyse_song.build_chord_templates()
    c_major = templates["C"]
    # C=0, E=4, G=7; other bins should be zero
    assert c_major[0] > 0
    assert c_major[4] > 0
    assert c_major[7] > 0
    assert c_major[1] == 0
    assert c_major[2] == 0


def test_chord_template_D_minor_has_minor_third():
    templates = analyse_song.build_chord_templates()
    d_minor = templates["Dm"]
    # D=2, F=5 (minor 3rd), A=9
    assert d_minor[2] > 0
    assert d_minor[5] > 0
    assert d_minor[9] > 0
    # Should NOT have the major third F# (bin 6)
    assert d_minor[6] == 0


def test_chord_template_G7_has_minor_seventh():
    templates = analyse_song.build_chord_templates()
    g7 = templates["G7"]
    # G=7, B=11, D=2, F=5 (minor 7)
    for pc in [7, 11, 2, 5]:
        assert g7[pc] > 0, f"expected energy at pc {pc} for G7"


def test_chord_template_is_l2_normalised():
    templates = analyse_song.build_chord_templates()
    for label, vec in templates.items():
        norm = np.linalg.norm(vec)
        assert abs(norm - 1.0) < 1e-6, f"{label} not normalised (norm={norm})"


def test_validate_label_accepts_supported():
    for label in ["C", "C#", "Db", "Em", "F#m", "G7", "Am7", "Dmaj7", "Bdim", "Caug"]:
        assert analyse_song.validate_label(label), f"{label} should validate"


def test_validate_label_rejects_unsupported():
    for label in ["C#sus4", "D/F#", "G9", "Bm6", "N", "", "Csus2", "Asus4", "x"]:
        assert not analyse_song.validate_label(label), f"{label} should not validate"


# ============================================================================
# Audio loading
# ============================================================================

import soundfile as sf


def _write_silent_wav(path: Path, duration: float = 1.0, sr: int = 22050):
    """Write a silent WAV at the given path."""
    sf.write(str(path), np.zeros(int(duration * sr)), sr)


def test_load_audio_prefers_named_stems(tmp_path):
    _write_silent_wav(tmp_path / "drums.wav", duration=0.5)
    _write_silent_wav(tmp_path / "other.wav", duration=0.5)
    beat_y, chord_y, sr, dur = analyse_song.load_audio(
        tmp_path, beat_stem="drums.wav", chord_stem="other.wav"
    )
    assert sr == 22050
    assert beat_y.ndim == 1
    assert chord_y.ndim == 1
    assert 0.4 < dur < 0.6


def test_load_audio_falls_back_to_sum_when_beat_stem_missing(tmp_path):
    # Only chord stem exists; beat stem must fall back to a sum of available stems
    _write_silent_wav(tmp_path / "other.wav", duration=0.5)
    _write_silent_wav(tmp_path / "bass.wav", duration=0.5)
    beat_y, chord_y, sr, dur = analyse_song.load_audio(
        tmp_path, beat_stem="drums.wav", chord_stem="other.wav"
    )
    # Should not raise; should return non-empty arrays of equal length
    assert beat_y.shape == chord_y.shape


def test_load_audio_raises_when_no_audio_at_all(tmp_path):
    import pytest
    with pytest.raises(FileNotFoundError):
        analyse_song.load_audio(
            tmp_path, beat_stem="drums.wav", chord_stem="other.wav"
        )
