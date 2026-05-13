import { describe, it, expect } from 'vitest';
import { resolveStemMixerView } from '../ui/screens/songPreset/stemMixerView';
import type { SongConfig } from '../songs/songLibrary';
import type { SongPresetStatus } from '../songs/SongPresetEngine';

const trueStemSong: SongConfig = {
  id: 't', title: 't', artist: 't', key: 'C', bpm: 100, timeSignature: '4/4',
  stems: { vocals: 'a/vocals.wav', drums: 'a/drums.wav', bass: 'a/bass.wav', other: 'a/other.wav' },
  stemMixer: {
    label: 'Stem Mixer',
    leftZone:   { vocals: 1, drums: 0, bass: 0, other: 0 },
    centerZone: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
    rightZone:  { vocals: 1, drums: 1, bass: 1, other: 1 },
    zoneLabels: { left: 'Vocals only', center: 'Mid', right: 'Full' },
  },
};

const mixOnlySong: SongConfig = {
  id: 'm', title: 'm', artist: 'm', key: 'C', bpm: 100, timeSignature: '4/4',
  stems: { vocals: 'b/mix.mp3', drums: 'b/mix.mp3', bass: 'b/mix.mp3', other: 'b/mix.mp3' },
  stemMixer: {
    label: 'Volume',
    leftZone:   { vocals: 0, drums: 0, bass: 0, other: 0 },
    centerZone: { vocals: 0.5, drums: 0.5, bass: 0.5, other: 0.5 },
    rightZone:  { vocals: 1, drums: 1, bass: 1, other: 1 },
    zoneLabels: { left: 'Silent', center: 'Half', right: 'Full' },
  },
};

const baseStatus = (partial: Partial<SongPresetStatus> = {}): SongPresetStatus => ({
  isPlaying: false, isPaused: false, currentTime: 0, duration: 0,
  loopEnabled: false, loopStart: 0, loopEnd: 0,
  stemsLoaded: 4, stemsTotal: 4, loadingComplete: true,
  stemVolumes: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
  filterHz: 8000, reverbWet: 0, distance: 0,
  stemMixerZone: 'center', activeColors: [], currentChordName: null,
  accompVolume: 1, stemVolume: 1, chordOffset: 0, bpmAdjust: 0,
  effectiveBpm: 100, currentBeatIndex: -1, totalBeats: 0, hasAnalysis: false,
  continuousBackingEnabled: true, continuousBackingLevel: 0.4,
  voicePresets: {}, batonModes: {}, batonInstruments: {}, beatSnap: false, currentChordRoot: null,
  ...partial,
});

describe('resolveStemMixerView', () => {
  it('returns multi-stem layout for a song with distinct stem paths', () => {
    const view = resolveStemMixerView(trueStemSong, baseStatus(), true);
    expect(view.layout).toBe('multi-stem');
    expect(view.stems).toHaveLength(4);
    expect(view.stems.map((s) => s.id)).toEqual(['vocals', 'drums', 'bass', 'other']);
  });

  it('returns mix-only layout when all four stem paths are identical', () => {
    const view = resolveStemMixerView(mixOnlySong, baseStatus(), true);
    expect(view.layout).toBe('mix-only');
    expect(view.stems).toHaveLength(1);
    expect(view.stems[0].id).toBe('volume');
  });

  it('reads the zone label from the song mapping for the current zone', () => {
    const view = resolveStemMixerView(trueStemSong, baseStatus({ stemMixerZone: 'left' }), true);
    expect(view.zoneLabel).toBe('Vocals only');
  });

  it('falls back to a generic label when no zone is active', () => {
    const view = resolveStemMixerView(trueStemSong, baseStatus({ stemMixerZone: null }), false);
    expect(view.zoneLabel).toBe('—');
  });

  it('falls back to default zone names when the mapping has no zoneLabels', () => {
    const songNoLabels: SongConfig = {
      ...trueStemSong,
      stemMixer: { ...trueStemSong.stemMixer, zoneLabels: undefined },
    };
    const view = resolveStemMixerView(songNoLabels, baseStatus({ stemMixerZone: 'left' }), true);
    expect(view.zoneLabel).toBe('Left');
  });

  it('maps filterHz to a 0-100 percent against FILTER_MIN/MAX log range', () => {
    const high = resolveStemMixerView(trueStemSong, baseStatus({ filterHz: 8000 }), true);
    expect(high.filterPercent).toBeGreaterThanOrEqual(99);
    const low = resolveStemMixerView(trueStemSong, baseStatus({ filterHz: 200 }), true);
    expect(low.filterPercent).toBeLessThanOrEqual(1);
    const mid = resolveStemMixerView(trueStemSong, baseStatus({ filterHz: 1264.9 }), true);
    expect(mid.filterPercent).toBeGreaterThan(45);
    expect(mid.filterPercent).toBeLessThan(55);
  });

  it('marks the strip as dimmed when active=false', () => {
    expect(resolveStemMixerView(trueStemSong, baseStatus(), false).dimmed).toBe(true);
    expect(resolveStemMixerView(trueStemSong, baseStatus(), true).dimmed).toBe(false);
  });

  it('mix-only single bar level averages the four stem volumes', () => {
    const view = resolveStemMixerView(
      mixOnlySong,
      baseStatus({ stemVolumes: { vocals: 1, drums: 1, bass: 0, other: 0 } }),
      true,
    );
    expect(view.stems[0].level).toBeCloseTo(0.5);
  });
});
