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


# ============================================================================
# Beat tracking
# ============================================================================

def _generate_click_track(bpm: float, duration: float = 8.0, sr: int = 22050) -> np.ndarray:
    """Generate a metronome click track at the given BPM."""
    samples = int(duration * sr)
    y = np.zeros(samples, dtype=np.float32)
    interval_s = 60.0 / bpm
    click_samples = int(0.02 * sr)
    t = 0.0
    while t * sr + click_samples < samples:
        start = int(t * sr)
        y[start:start + click_samples] += np.random.RandomState(0).randn(click_samples) * 0.5
        t += interval_s
    return y


def test_track_beats_finds_clicks_at_120_bpm():
    sr = 22050
    y = _generate_click_track(bpm=120.0, duration=8.0, sr=sr)
    beats, bpm = analyse_song.track_beats(y, sr, bpm_hint=None)
    assert 110 < bpm < 130, f"detected bpm {bpm} outside expected range"
    assert len(beats) >= 12  # 8 seconds at 120 bpm = 16 beats, librosa may drop a few
    # Inter-beat interval should be ~0.5s
    median_ibi = np.median(np.diff(beats))
    assert 0.45 < median_ibi < 0.55


def test_track_beats_respects_bpm_hint():
    sr = 22050
    y = _generate_click_track(bpm=120.0, duration=8.0, sr=sr)
    # Override to a wrong bpm and ensure the hint sticks
    beats, bpm = analyse_song.track_beats(y, sr, bpm_hint=67.0)
    # When given a hint, return that as the bpm field
    assert bpm == 67.0


# ============================================================================
# Downbeats + key
# ============================================================================

def test_derive_downbeats_every_4th_beat():
    beats = np.array([1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0])
    downbeats = analyse_song.derive_downbeats(beats, beats_per_bar=4)
    np.testing.assert_array_equal(downbeats, np.array([1.0, 3.0, 5.0]))


def test_derive_downbeats_for_12_8_with_4_per_bar():
    beats = np.array([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5])
    downbeats = analyse_song.derive_downbeats(beats, beats_per_bar=4)
    np.testing.assert_array_equal(downbeats, np.array([0.5, 2.5, 4.5]))


def test_derive_downbeats_handles_fewer_beats_than_one_bar():
    beats = np.array([1.0, 1.5])
    downbeats = analyse_song.derive_downbeats(beats, beats_per_bar=4)
    np.testing.assert_array_equal(downbeats, np.array([1.0]))


def test_detect_key_recognises_c_major_chord_chroma():
    # Build a chroma matrix biased toward C major (C, E, G strong)
    chroma = np.zeros((12, 100), dtype=np.float64)
    chroma[0, :] = 1.0  # C
    chroma[4, :] = 1.0  # E
    chroma[7, :] = 1.0  # G
    key = analyse_song.detect_key(chroma)
    assert key == "C Major"


def test_detect_key_recognises_a_minor_chord_chroma():
    chroma = np.zeros((12, 100), dtype=np.float64)
    chroma[9, :] = 1.0   # A
    chroma[0, :] = 1.0   # C
    chroma[4, :] = 1.0   # E
    key = analyse_song.detect_key(chroma)
    # A minor and C major share notes — Krumhansl correlation will pick one
    assert key in ("A Minor", "C Major")


# ============================================================================
# Beat-synchronous chroma
# ============================================================================

def test_extract_beat_chroma_shape():
    import librosa as librosa_mod
    sr = 22050
    # 4 seconds of low-amplitude noise (just need non-silent input)
    y = np.random.RandomState(0).randn(4 * sr).astype(np.float32) * 0.1
    # Five beat times spread across the audio
    beat_frames = librosa_mod.time_to_frames(
        np.array([0.5, 1.5, 2.0, 2.5, 3.5]), sr=sr
    )
    beat_chroma = analyse_song.extract_beat_chroma(y, sr, beat_frames)
    # 12 chroma bins, at least one column per beat boundary
    assert beat_chroma.shape[0] == 12
    assert beat_chroma.shape[1] >= len(beat_frames) - 1


# ============================================================================
# Template matching
# ============================================================================

def test_label_beats_picks_perfect_match():
    templates = analyse_song.build_chord_templates()
    cols = np.stack(
        [templates["C"], templates["F"], templates["G7"]], axis=1
    )
    labels = analyse_song.label_beats(cols, templates, verbose=False)
    assert labels == ["C", "F", "G7"]


def test_label_beats_returns_N_on_silent_column():
    templates = analyse_song.build_chord_templates()
    cols = np.stack([templates["A"], np.zeros(12)], axis=1)
    labels = analyse_song.label_beats(cols, templates, verbose=False)
    assert labels[0] == "A"
    assert labels[1] == "N"


def test_label_beats_triad_bias_keeps_simple_triads():
    templates = analyse_song.build_chord_templates()
    cols = templates["C"].reshape(12, 1)
    labels = analyse_song.label_beats(cols, templates, verbose=False)
    assert labels == ["C"]


# ============================================================================
# Smoothing
# ============================================================================

def test_smooth_labels_min_1_is_noop():
    labels = ["C", "G", "C", "F", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=1) == labels


def test_smooth_labels_min_2_absorbs_1beat_run_into_left_neighbour():
    labels = ["C", "C", "G", "C", "C"]
    expected = ["C", "C", "C", "C", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_min_2_absorbs_into_longer_neighbour():
    # G is 1-beat; left neighbour C is 1 beat, right neighbour F is 3 beats
    labels = ["C", "G", "F", "F", "F"]
    expected = ["F", "F", "F", "F", "F"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_handles_leading_short_run():
    labels = ["G", "C", "C", "C"]
    expected = ["C", "C", "C", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_handles_trailing_short_run():
    labels = ["C", "C", "C", "G"]
    expected = ["C", "C", "C", "C"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=2) == expected


def test_smooth_labels_repeated_passes():
    labels = ["C", "C", "F", "G", "G", "G", "G"]
    expected = ["G", "G", "G", "G", "G", "G", "G"]
    assert analyse_song.smooth_labels(labels, min_chord_beats=3) == expected
